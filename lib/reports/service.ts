import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryId } from "../contracts/categories";
import { ERROR_STATUS, type ApiResult } from "../contracts/errors";
import {
  type Location,
  MAX_IMAGE_BYTES,
  type Photo,
  type Report,
  type ReportList,
  type ReportListQuery,
  type ReportStage,
  type Severity,
  type UUID,
} from "../contracts/reports";
import {
  parseReportJson,
  validatePublicationHeaders,
  validatePublishReportRequest,
  validateReport,
  validateReportList,
  validateReportListQuery,
} from "../contracts/validation";
import {
  claimIdempotencySlot,
  computePayloadHash,
  failIdempotencySlot,
  publishReportSlot,
  ReportRpcError,
} from "./idempotency";
import {
  compensateRemovePhotos,
  getPublicPhotoUrl,
  ReportPhotoError,
  uploadReportPhoto,
} from "./photos";

type CursorFilters = Pick<ReportListQuery, "categoryId" | "status" | "bbox">;
type CursorPayload = { version: 1; createdAt: string; id: string; filters: CursorFilters };

export function encodeCursor(report: { id: string; createdAt: string }, filters: CursorFilters): string {
  const payload: CursorPayload = { version: 1, createdAt: report.createdAt, id: report.id, filters };
  return Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const padded = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64").toString("utf8");
    const parsed = JSON.parse(json);
    if (parsed && parsed.version === 1 && typeof parsed.createdAt === "string" && typeof parsed.id === "string") {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}

type DbReportRow = {
  id: string;
  title: string;
  description: string;
  category_id: string;
  severity: string;
  status: string;
  latitude: number;
  longitude: number;
  street: string;
  street_number: number | null;
  created_at: string;
  updated_at: string;
  corroborated_at?: string | null;
  photo_public_path: string;
  photo_public_mime_type: string;
  photo_public_byte_size: number;
  confirmation_count?: number;
  confirmation_threshold?: number;
};

export function mapRowToReport(
  row: DbReportRow,
  publicUrl: string,
): Report {
  const count = row.confirmation_count ?? 0;
  const threshold = row.confirmation_threshold ?? 3;

  const location: Location = {
    latitude: row.latitude,
    longitude: row.longitude,
    address: {
      street: row.street,
      number: row.street_number,
    },
  };

  const photo: Photo = {
    id: row.id as UUID,
    url: publicUrl,
    // La copia saneada se sirve con getPublicUrl, que no vence.
    expiresAt: null,
    mimeType: row.photo_public_mime_type as Photo["mimeType"],
    byteSize: row.photo_public_byte_size,
  };

  return {
    id: row.id as UUID,
    title: row.title,
    description: row.description,
    categoryId: row.category_id as CategoryId,
    severity: row.severity as Severity,
    photo,
    status: row.status as ReportStage,
    location,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    citizenVerification: {
      confirmationCount: count,
      threshold,
      policyStatus: "approved",
      corroborated: count >= threshold,
    },
    institutionalVerification: {
      availability: "unavailable",
      verifiedAt: null,
    },
    resolvedAt: null,
  };
}

export type PublishServiceResult = {
  httpStatus: number;
  result: ApiResult<Report>;
  retryAfter?: number;
};

function publicationError(
  code: keyof typeof ERROR_STATUS,
  message: string,
  fieldErrors?: Record<string, string[]>,
): PublishServiceResult {
  return {
    httpStatus: ERROR_STATUS[code],
    result: { error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } },
  };
}

function postCommitPublicationError(): PublishServiceResult {
  return publicationError(
    "INTERNAL_ERROR",
    "El reporte quedó publicado, pero no se pudo preparar la respuesta. Reintentá con la misma clave.",
  );
}

class ReportQuotaError extends Error {
  constructor(readonly retryAfter: number) {
    super("Se alcanzó la cuota de publicaciones.");
    this.name = "ReportQuotaError";
  }
}

function publicationQuotaError(retryAfter: number, quota?: "active_claims" | "published_24h"): PublishServiceResult {
  const message = quota === "active_claims"
    ? "Ya tenés el máximo de publicaciones en curso. Reintentá más tarde."
    : "Alcanzaste el máximo de reportes para las últimas 24 horas.";
  return {
    ...publicationError("RATE_LIMITED", message),
    retryAfter: Math.max(1, Math.floor(retryAfter)),
  };
}

function failurePublicationError(error: unknown): PublishServiceResult {
  if (error instanceof ReportPhotoError && error.kind === "validation") {
    const code = error.apiCode ?? "UNSUPPORTED_MEDIA_TYPE";
    return publicationError(code, "La imagen no cumple los requisitos de publicación.");
  }

  if (error instanceof ReportPhotoError && error.kind === "storage") {
    return publicationError(
      "STORAGE_UNAVAILABLE",
      "No se pudo confirmar la carga de la fotografía. Reintentá con la misma clave.",
    );
  }

  return publicationError(
    "INTERNAL_ERROR",
    "No se pudo confirmar la publicación. Reintentá con la misma clave.",
  );
}

/**
 * Publica reportes con idempotencia, carga de fotos y persistencia atómica.
 * `supabase` actúa con la sesión del vecino (claim y publish_report usan auth.uid());
 * `storage` es el cliente del servidor con la clave secreta, el único que puede
 * escribir en los buckets, y solo se usa después de un claim propio.
 */
export async function publishReportService({
  supabase,
  storage,
  userId,
  formData,
  idempotencyKey,
}: {
  supabase: SupabaseClient;
  storage: SupabaseClient;
  userId: string;
  formData: FormData;
  idempotencyKey?: string | null;
}): Promise<PublishServiceResult> {
  const reportPart = formData.get("report");
  const imagePart = formData.get("image");

  const parsedHeaders = validatePublicationHeaders({ "Idempotency-Key": idempotencyKey });
  if (!parsedHeaders.valid) {
    return publicationError(parsedHeaders.error.code, parsedHeaders.error.message, parsedHeaders.error.fieldErrors);
  }

  if (typeof reportPart !== "string") {
    return publicationError("VALIDATION_ERROR", "El campo report debe contener un objeto JSON.", {
      report: ["Ingresá los datos del reporte como JSON."],
    });
  }

  const parsedReport = parseReportJson(reportPart);
  if (!parsedReport.valid) {
    return publicationError(parsedReport.error.code, parsedReport.error.message, parsedReport.error.fieldErrors);
  }

  if (typeof File !== "undefined" && imagePart instanceof File && imagePart.size > MAX_IMAGE_BYTES) {
    return publicationError("PAYLOAD_TOO_LARGE", "La imagen supera el tamaño máximo permitido.");
  }

  const parsedRequest = validatePublishReportRequest({ report: parsedReport.value, image: imagePart });

  if (!parsedRequest.valid) {
    return publicationError(parsedRequest.error.code, parsedRequest.error.message, parsedRequest.error.fieldErrors);
  }

  const { report: fields, image } = parsedRequest.value;
  const imageBuffer = await image.arrayBuffer();
  const imageBytes = new Uint8Array(imageBuffer);

  const payloadHash = computePayloadHash(fields, imageBytes);

  // 1. Reclama la clave o recupera el resultado de una operación anterior.
  let slot: Awaited<ReturnType<typeof claimIdempotencySlot>>;
  try {
    slot = await claimIdempotencySlot(supabase, parsedHeaders.value["Idempotency-Key"], payloadHash);
  } catch (error: unknown) {
    return failurePublicationError(error);
  }

  if (slot.action === "CONFLICT") {
    return {
      httpStatus: 409,
      result: {
        error: {
          code: "IDEMPOTENCY_CONFLICT",
          message: "La clave ya corresponde a otros datos.",
        },
      },
    };
  }

  if (slot.action === "IN_PROGRESS") {
    return {
      httpStatus: 409,
      retryAfter: slot.retryAfter,
      result: {
        error: {
          code: "PUBLICATION_IN_PROGRESS",
          message: "La publicación sigue en curso. Reintentá con la misma clave.",
        },
      },
    };
  }

  if (slot.action === "LIMIT_REACHED") {
    return publicationQuotaError(slot.retryAfter, slot.quota);
  }

  if (slot.action === "COMPLETED") {
    const existing = await getReportDetailService(supabase, slot.reportId);
    if (existing.httpStatus !== 200 || !existing.result.data) return postCommitPublicationError();
    return {
      httpStatus: 200,
      result: existing.result,
    };
  }

  const reportId = slot.reportId;
  let photoUpload: Awaited<ReturnType<typeof uploadReportPhoto>> | null = null;
  let committed = false;

  try {
    photoUpload = await uploadReportPhoto({
      supabase: storage,
      userId,
      reportId,
      fileBytes: imageBytes,
      declaredMimeType: image.type,
    });
    const published = await publishReportSlot(supabase, {
      key: parsedHeaders.value["Idempotency-Key"],
      payloadHash,
      title: fields.title,
      description: fields.description,
      categoryId: fields.categoryId,
      severity: fields.severity,
      latitude: fields.location.latitude,
      longitude: fields.location.longitude,
      street: fields.location.address.street,
      streetNumber: fields.location.address.number,
      storagePath: photoUpload.storagePath,
      photoPublicPath: photoUpload.photoPublicPath,
      mimeType: photoUpload.mimeType,
      byteSize: photoUpload.byteSize,
    });

    if (published && typeof published === "object" && "success" in published && published.success === false) {
      // El SQL ya aplicado marca la cuota con su código interno y `quota`; la respuesta
      // pública la traduce a RATE_LIMITED en publicationQuotaError.
      if (
        "code" in published && published.code === "PUBLICATION_IN_PROGRESS" &&
        "quota" in published && published.quota === "published_24h"
      ) {
        const retryAfter = "retryAfter" in published && typeof published.retryAfter === "number"
          ? published.retryAfter
          : 60;
        throw new ReportQuotaError(retryAfter);
      }
      throw new ReportRpcError("publish_report", { code: "23505", message: "Conflicto de idempotencia." });
    }

    if (!published || typeof published !== "object" || !("success" in published) || published.success !== true) {
      return failurePublicationError(new Error("La respuesta de publish_report no confirma el resultado."));
    }

    committed = true;
    if (!("reportId" in published) || published.reportId !== reportId) return postCommitPublicationError();

    const publishedAction = "action" in published ? published.action : undefined;
    const reportResponse = await getReportDetailService(supabase, reportId);
    if (reportResponse.httpStatus !== 200 || !reportResponse.result.data) return postCommitPublicationError();

    return {
      httpStatus: publishedAction === "COMPLETED" ? 200 : 201,
      result: reportResponse.result,
    };
  } catch (err: unknown) {
    if (committed) return postCommitPublicationError();

    const definitive = err instanceof ReportQuotaError ||
      ((err instanceof ReportRpcError || err instanceof ReportPhotoError) && err.definitive);
    if (definitive) {
      const uploadedObjects = photoUpload?.uploadedObjects ??
        (err instanceof ReportPhotoError ? err.uploadedObjects : []);
      if (uploadedObjects.length > 0) await compensateRemovePhotos(storage, uploadedObjects);
      try {
        await failIdempotencySlot(supabase, parsedHeaders.value["Idempotency-Key"], reportId, payloadHash);
      } catch {
        // El bloqueo vence por sí mismo si la RPC de recuperación tampoco está disponible.
      }
    }
    if (err instanceof ReportQuotaError) return publicationQuotaError(err.retryAfter, "published_24h");
    return failurePublicationError(err);
  }
}

/**
 * Queries report detail by ID from the public_reports view.
 */
export async function getReportDetailService(
  supabase: SupabaseClient,
  reportId: string,
): Promise<{ httpStatus: number; result: ApiResult<Report> }> {
  const { data: row, error } = await supabase
    .from("public_reports")
    .select("*")
    .eq("id", reportId)
    .single();

  if (error || !row) {
    return {
      httpStatus: 404,
      result: {
        error: {
          code: "REPORT_NOT_FOUND",
          message: "No se encontró el reporte.",
        },
      },
    };
  }

  const photoUrl = getPublicPhotoUrl(supabase, row.photo_public_path);
  const reportDto = mapRowToReport(row, photoUrl);

  if (!validateReport(reportDto).valid) {
    return {
      httpStatus: 500,
      result: { error: { code: "INTERNAL_ERROR", message: "No se pudo preparar el reporte público." } },
    };
  }

  return {
    httpStatus: 200,
    result: { data: reportDto },
  };
}

/**
 * Consulta el catálogo con filtros, cursor por clave y URLs públicas de copias saneadas.
 */
export async function listReportsService(
  supabase: SupabaseClient,
  query: ReportListQuery,
): Promise<{ httpStatus: number; result: ApiResult<ReportList> }> {
  const parsed = validateReportListQuery(query);
  if (!parsed.valid) {
    return {
      httpStatus: 400,
      result: { error: parsed.error },
    };
  }

  const { categoryId, status, bbox, limit = 50, cursor } = parsed.value;

  let dbQuery = supabase
    .from("public_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (categoryId) {
    dbQuery = dbQuery.eq("category_id", categoryId);
  }

  if (status) {
    dbQuery = dbQuery.eq("status", status);
  }

  if (bbox) {
    const [west, south, east, north] = bbox.split(",").map(Number);
    dbQuery = dbQuery
      .gte("longitude", west)
      .lte("longitude", east)
      .gte("latitude", south)
      .lte("latitude", north);
  }

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      // Keyset comparison: created_at < cursor.createdAt OR (created_at = cursor.createdAt AND id < cursor.id)
      // La vista expone created_at como texto UTC de ancho fijo; las comillas evitan que
      // PostgREST tome ":" o "." como separadores. El contrato ya validó fecha y UUID.
      dbQuery = dbQuery.or(
        `created_at.lt."${decoded.createdAt}",and(created_at.eq."${decoded.createdAt}",id.lt.${decoded.id})`,
      );
    }
  }

  const { data: rows, error } = await dbQuery;

  if (error || !rows) {
    return {
      httpStatus: 500,
      result: {
        error: {
          code: "INTERNAL_ERROR",
          message: "No se pudo consultar la lista de reportes.",
        },
      },
    };
  }

  const hasMore = rows.length > limit;
  const itemsRows = hasMore ? rows.slice(0, limit) : rows;

  const items = itemsRows.map((row) => mapRowToReport(
    row,
    getPublicPhotoUrl(supabase, row.photo_public_path),
  ));

  const filters: CursorFilters = {
    ...(categoryId ? { categoryId } : {}),
    ...(status ? { status } : {}),
    ...(bbox ? { bbox } : {}),
  };

  const nextCursor = hasMore && items.length > 0 ? encodeCursor(items[items.length - 1], filters) : null;
  const list = { items, nextCursor };

  if (!validateReportList(list).valid) {
    return {
      httpStatus: 500,
      result: { error: { code: "INTERNAL_ERROR", message: "No se pudo preparar la lista pública de reportes." } },
    };
  }

  return {
    httpStatus: 200,
    result: {
      data: {
        ...list,
      },
    },
  };
}

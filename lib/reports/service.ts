import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryId } from "../contracts/categories";
import { ERROR_STATUS, type ApiResult } from "../contracts/errors";
import {
  type Location,
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
  compensateRemovePhoto,
  createBatchSignedUrls,
  DEFAULT_SIGNED_URL_EXPIRES_IN_SECONDS,
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
  resolved_at?: string | null;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  confirmation_count?: number;
  threshold?: number;
};

export function mapRowToReport(
  row: DbReportRow,
  signedUrl: string,
  expiresAt: string,
): Report {
  const count = row.confirmation_count ?? 0;
  const threshold = row.threshold ?? 3;

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
    url: signedUrl,
    expiresAt,
    mimeType: row.mime_type as Photo["mimeType"],
    byteSize: row.byte_size,
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
    resolvedAt: row.resolved_at ?? null,
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

function getPublicPhotoPath(reportId: string, mimeType: Photo["mimeType"]): string {
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp";
  return `${reportId}.${extension}`;
}

/**
 * Publica reportes con idempotencia, carga de fotos y persistencia atómica.
 */
export async function publishReportService({
  supabase,
  userId,
  formData,
  idempotencyKey,
}: {
  supabase: SupabaseClient;
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

  if (slot.action === "COMPLETED") {
    const existing = await getReportDetailService(supabase, slot.reportId);
    if (existing.httpStatus !== 200 || !existing.result.data) return postCommitPublicationError();
    return {
      httpStatus: 200,
      result: existing.result,
    };
  }

  const reportId = slot.reportId;
  let storagePath: string | null = null;
  let photoUploaded = false;
  let committed = false;

  try {
    const uploadRes = await uploadReportPhoto({
      supabase,
      userId,
      reportId,
      fileBytes: imageBytes,
      declaredMimeType: image.type,
    });
    storagePath = uploadRes.storagePath;
    photoUploaded = true;

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
      storagePath: uploadRes.storagePath,
      photoPublicPath: getPublicPhotoPath(reportId, uploadRes.mimeType),
      mimeType: uploadRes.mimeType,
      byteSize: uploadRes.byteSize,
    });

    if (published && typeof published === "object" && "success" in published && published.success === false) {
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

    const definitive = (err instanceof ReportRpcError || err instanceof ReportPhotoError) && err.definitive;
    if (definitive) {
      if (photoUploaded && storagePath) await compensateRemovePhoto(supabase, storagePath);
      try {
        await failIdempotencySlot(supabase, parsedHeaders.value["Idempotency-Key"], reportId, payloadHash);
      } catch {
        // El bloqueo vence por sí mismo si la RPC de recuperación tampoco está disponible.
      }
    }
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

  const urls = await createBatchSignedUrls(supabase, [row.storage_path]);
  const signed = urls.get(row.storage_path);
  const expiresAt = signed?.expiresAt ?? new Date(Date.now() + 3600 * 1000).toISOString();
  const photoUrl = signed?.url ?? "";

  const reportDto = mapRowToReport(row, photoUrl, expiresAt);

  return {
    httpStatus: 200,
    result: { data: reportDto },
  };
}

/**
 * Queries reports list with filtering, bbox, keyset pagination, and batch signed URLs.
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
      dbQuery = dbQuery.or(
        `created_at.lt.${decoded.createdAt},and(created_at.eq.${decoded.createdAt},id.lt.${decoded.id})`,
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
          message: error?.message ?? "Error querying reports",
        },
      },
    };
  }

  const hasMore = rows.length > limit;
  const itemsRows = hasMore ? rows.slice(0, limit) : rows;

  const storagePaths = itemsRows.map((r) => r.storage_path).filter(Boolean);
  const signedUrls = await createBatchSignedUrls(supabase, storagePaths);

  const expiresAt = new Date(Date.now() + DEFAULT_SIGNED_URL_EXPIRES_IN_SECONDS * 1000).toISOString();

  const items = itemsRows.map((row) => {
    const signed = signedUrls.get(row.storage_path);
    return mapRowToReport(row, signed?.url ?? "", signed?.expiresAt ?? expiresAt);
  });

  const filters: CursorFilters = {
    ...(categoryId ? { categoryId } : {}),
    ...(status ? { status } : {}),
    ...(bbox ? { bbox } : {}),
  };

  const nextCursor = hasMore && items.length > 0 ? encodeCursor(items[items.length - 1], filters) : null;

  return {
    httpStatus: 200,
    result: {
      data: {
        items,
        nextCursor,
      },
    },
  };
}

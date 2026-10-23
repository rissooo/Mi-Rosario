import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryId } from "../contracts/categories";
import type { ApiResult } from "../contracts/errors";
import {
  type Location,
  type Photo,
  type Report,
  type ReportFields,
  type ReportList,
  type ReportListQuery,
  type ReportStage,
  type Severity,
  type UUID,
} from "../contracts/reports";
import {
  validatePublishReportRequest,
  validateReportListQuery,
} from "../contracts/validation";
import {
  claimIdempotencySlot,
  completeIdempotencySlot,
  computePayloadHash,
  failIdempotencySlot,
} from "./idempotency";
import {
  compensateRemovePhoto,
  createBatchSignedUrls,
  DEFAULT_SIGNED_URL_EXPIRES_IN_SECONDS,
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
  street?: string | null;
  street_number?: number | null;
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

  // Build Location object supporting address if street is present
  const location: Location = {
    latitude: row.latitude,
    longitude: row.longitude,
    ...(row.street
      ? {
          address: {
            street: row.street,
            number: row.street_number ?? null,
          },
        }
      : {}),
  } as Location;

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

/**
 * Orchestrates report publication with idempotency, storage upload, and atomic database persistence.
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

  if (!idempotencyKey) {
    return {
      httpStatus: 400,
      result: {
        error: {
          code: "VALIDATION_ERROR",
          message: "El encabezado Idempotency-Key es obligatorio.",
        },
      },
    };
  }

  const parsedRequest = validatePublishReportRequest({
    headers: { "Idempotency-Key": idempotencyKey },
    report: reportPart,
    image: imagePart,
  });

  if (!parsedRequest.valid) {
    return {
      httpStatus: 400,
      result: {
        error: parsedRequest.error,
      },
    };
  }

  const { report: fields, image } = parsedRequest.value;
  const imageBuffer = await image.arrayBuffer();
  const imageBytes = new Uint8Array(imageBuffer);

  const payloadHash = computePayloadHash(fields, imageBytes);

  // 1. Claim or inspect idempotency slot
  const slot = await claimIdempotencySlot(supabase, idempotencyKey, payloadHash);

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
    // Replay existing report
    const existing = await getReportDetailService(supabase, slot.reportId);
    return {
      httpStatus: 200,
      result: existing.result,
    };
  }

  // 2. Slot is freshly claimed (action === "CLAIMED")
  const reportId = randomUUID();
  let storagePath: string | null = null;

  try {
    const uploadRes = await uploadReportPhoto({
      supabase,
      userId,
      reportId,
      fileBytes: imageBytes,
      declaredMimeType: image.type,
    });
    storagePath = uploadRes.storagePath;

    // 3. Insert report into database
    const street = (fields.location as { address?: { street: string; number: number | null } })?.address?.street ?? null;
    const streetNumber = (fields.location as { address?: { street: string; number: number | null } })?.address?.number ?? null;

    const { data: inserted, error: insertError } = await supabase
      .from("reports")
      .insert({
        id: reportId,
        user_id: userId,
        title: fields.title,
        description: fields.description,
        category_id: fields.categoryId,
        severity: fields.severity,
        status: "pending",
        latitude: fields.location.latitude,
        longitude: fields.location.longitude,
        street: street ?? "",
        street_number: streetNumber,
        storage_path: uploadRes.storagePath,
        mime_type: uploadRes.mimeType,
        byte_size: uploadRes.byteSize,
      })
      .select()
      .single();

    if (insertError || !inserted) {
      throw new Error(`Database insert failed: ${insertError?.message ?? "unknown error"}`);
    }

    // 4. Mark idempotency slot completed
    await completeIdempotencySlot(supabase, idempotencyKey, reportId);

    // 5. Generate signed URL for presentation
    const urls = await createBatchSignedUrls(supabase, [uploadRes.storagePath]);
    const signed = urls.get(uploadRes.storagePath);
    const expiresAt = signed?.expiresAt ?? new Date(Date.now() + 3600 * 1000).toISOString();
    const photoUrl = signed?.url ?? "";

    const reportDto = mapRowToReport(
      {
        ...inserted,
        confirmation_count: 0,
        threshold: 3,
      },
      photoUrl,
      expiresAt,
    );

    return {
      httpStatus: 201,
      result: { data: reportDto },
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Compensation logic: if image was uploaded but DB failed
    if (storagePath) {
      await compensateRemovePhoto(supabase, storagePath);
    }
    await failIdempotencySlot(supabase, idempotencyKey);

    if (errorMessage.includes("Storage upload failed")) {
      return {
        httpStatus: 503,
        result: {
          error: {
            code: "STORAGE_UNAVAILABLE",
            message: "No se pudo guardar la fotografía. Conservá el borrador y reintentá.",
          },
        },
      };
    }

    return {
      httpStatus: 500,
      result: {
        error: {
          code: "INTERNAL_ERROR",
          message: errorMessage,
        },
      },
    };
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

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportFields } from "../contracts/reports";

export type ClaimSlotResult =
  | { action: "CLAIMED"; status: "in_progress"; reportId: string }
  | { action: "COMPLETED"; status: "completed"; reportId: string }
  | { action: "IN_PROGRESS"; status: "in_progress"; code: "PUBLICATION_IN_PROGRESS"; retryAfter: number }
  | { action: "CONFLICT"; status: string; code: "IDEMPOTENCY_CONFLICT"; message: string };

type RpcErrorDetails = { code?: unknown; status?: unknown; statusCode?: unknown; message?: unknown };

function isDefinitiveRpcRejection(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const details = error as RpcErrorDetails;
  const code = typeof details.code === "string" ? details.code : "";
  const message = typeof details.message === "string" ? details.message.toLowerCase() : "";
  const status = Number(details.statusCode ?? details.status);
  const ambiguousTimeout = code === "57014" || [408, 504, 524].includes(status) ||
    /timeout|timed out|time out|network|fetch failed|connection reset|socket hang up|aborted/.test(message);

  if (ambiguousTimeout) return false;

  return /^[0-9A-Z]{5}$/.test(code) || code.startsWith("PGRST") ||
    (Number.isInteger(status) && status >= 400 && status < 500);
}

export class ReportRpcError extends Error {
  readonly definitive: boolean;

  constructor(operation: string, error: unknown) {
    const message = error && typeof error === "object" && "message" in error &&
      typeof error.message === "string" ? error.message : String(error);
    super(`${operation} RPC failed: ${message}`);
    this.name = "ReportRpcError";
    this.definitive = isDefinitiveRpcRejection(error);
  }
}

export type PublishReportRpcArgs = {
  key: string;
  payloadHash: string;
  title: string;
  description: string;
  categoryId: string;
  severity: string;
  latitude: number;
  longitude: number;
  street: string;
  streetNumber: number | null;
  storagePath: string;
  photoPublicPath: string;
  mimeType: string;
  byteSize: number;
};

/** Ordena recursivamente las claves y recorta las cadenas para obtener una forma canónica. */
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "string") {
      return value.trim();
    }
    if (typeof value === "number") {
      // Normaliza decimales equivalentes como -32.9000 y -32.9.
      return Number(value);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const result: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    result[k] = canonicalize(v);
  }
  return result;
}

export type CanonicalReportInput = ReportFields | (Record<string, unknown>);

/** Produce JSON canónico con claves ordenadas de forma determinista. */
export function canonicalizeReportFields(fields: CanonicalReportInput): string {
  const canonical = canonicalize(fields);
  return JSON.stringify(canonical);
}

/** Combina el hash SHA-256 de los campos canónicos con los bytes de la imagen. */
export function computePayloadHash(fields: CanonicalReportInput, imageBytes: Uint8Array): string {
  const jsonCanonical = canonicalizeReportFields(fields);
  const jsonHash = createHash("sha256").update(jsonCanonical, "utf8").digest("hex");
  const fileHash = createHash("sha256").update(imageBytes).digest("hex");

  return createHash("sha256")
    .update(`${jsonHash}:${fileHash}`, "utf8")
    .digest("hex");
}

/** Reclama una clave de idempotencia mediante la RPC de Supabase. */
export async function claimIdempotencySlot(
  supabase: SupabaseClient,
  key: string,
  payloadHash: string,
): Promise<ClaimSlotResult> {
  const { data, error } = await supabase.rpc("claim_idempotency_key", {
    p_key: key,
    p_payload_hash: payloadHash,
  });

  if (error) {
    throw new ReportRpcError("claim_idempotency_key", error);
  }

  return data as ClaimSlotResult;
}

/** Publica el reporte y completa la clave dentro de la misma transacción. */
export async function publishReportSlot(
  supabase: SupabaseClient,
  args: PublishReportRpcArgs,
): Promise<unknown> {
  const { data, error } = await supabase.rpc("publish_report", {
    p_key: args.key,
    p_payload_hash: args.payloadHash,
    p_title: args.title,
    p_description: args.description,
    p_category_id: args.categoryId,
    p_severity: args.severity,
    p_latitude: args.latitude,
    p_longitude: args.longitude,
    p_street: args.street,
    p_street_number: args.streetNumber,
    p_storage_path: args.storagePath,
    p_photo_public_path: args.photoPublicPath,
    p_photo_public_mime_type: args.mimeType,
    p_photo_public_byte_size: args.byteSize,
  });

  if (error) {
    throw new ReportRpcError("publish_report", error);
  }

  return data;
}

/** Marca como fallida una operación que puede recuperarse en un reintento. */
export async function failIdempotencySlot(
  supabase: SupabaseClient,
  key: string,
  reportId: string,
  payloadHash: string,
): Promise<void> {
  const { error } = await supabase.rpc("fail_idempotency_key", {
    p_key: key,
    p_report_id: reportId,
    p_payload_hash: payloadHash,
  });

  if (error) {
    throw new ReportRpcError("fail_idempotency_key", error);
  }
}

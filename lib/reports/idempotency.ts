import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportFields } from "../contracts/reports";

export type ClaimSlotResult =
  | { action: "CLAIMED"; status: "in_progress"; reportId: null }
  | { action: "COMPLETED"; status: "completed"; reportId: string }
  | { action: "IN_PROGRESS"; status: "in_progress"; code: "PUBLICATION_IN_PROGRESS"; retryAfter: number }
  | { action: "CONFLICT"; status: string; code: "IDEMPOTENCY_CONFLICT"; message: string };

/**
 * Recursively canonicalizes an object by sorting keys and trimming strings.
 */
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "string") {
      return value.trim();
    }
    if (typeof value === "number") {
      // Normalize decimals like -32.9000 -> -32.9
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

/**
 * Computes canonical JSON string of report fields with deterministically sorted keys.
 */
export function canonicalizeReportFields(fields: CanonicalReportInput): string {
  const canonical = canonicalize(fields);
  return JSON.stringify(canonical);
}

/**
 * Computes SHA-256 payload hash combining canonical report fields and image bytes.
 */
export function computePayloadHash(fields: CanonicalReportInput, imageBytes: Uint8Array): string {
  const jsonCanonical = canonicalizeReportFields(fields);
  const jsonHash = createHash("sha256").update(jsonCanonical, "utf8").digest("hex");
  const fileHash = createHash("sha256").update(imageBytes).digest("hex");

  return createHash("sha256")
    .update(`${jsonHash}:${fileHash}`, "utf8")
    .digest("hex");
}

/**
 * Claims an idempotency slot via Supabase RPC.
 */
export async function claimIdempotencySlot(
  supabase: SupabaseClient,
  key: string,
  payloadHash: string,
  lockSeconds = 180,
): Promise<ClaimSlotResult> {
  const { data, error } = await supabase.rpc("claim_idempotency_key", {
    p_key: key,
    p_payload_hash: payloadHash,
    p_operation: "publish_report",
    p_lock_seconds: lockSeconds,
  });

  if (error) {
    throw new Error(`Failed to claim idempotency slot: ${error.message}`);
  }

  return data as ClaimSlotResult;
}

/**
 * Marks an idempotency slot as completed with the committed report ID.
 */
export async function completeIdempotencySlot(
  supabase: SupabaseClient,
  key: string,
  reportId: string,
): Promise<void> {
  const { error } = await supabase.rpc("complete_idempotency_key", {
    p_key: key,
    p_report_id: reportId,
  });

  if (error) {
    throw new Error(`Failed to complete idempotency slot: ${error.message}`);
  }
}

/**
 * Marks an idempotency slot as failed so it can be reclaimed on retry.
 */
export async function failIdempotencySlot(
  supabase: SupabaseClient,
  key: string,
): Promise<void> {
  const { error } = await supabase.rpc("fail_idempotency_key", {
    p_key: key,
  });

  if (error) {
    throw new Error(`Failed to fail idempotency slot: ${error.message}`);
  }
}

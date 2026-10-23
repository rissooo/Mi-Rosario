import "server-only";
import { VisionError } from "./errors";
import type { VisionDiagnostic } from "./diagnostics";

type UserLookup = () => Promise<{ data: { user: { id: string } | null }; error: unknown }>;
const INVALID_SESSION_CODES = new Set([
  "bad_jwt", "no_authorization", "session_not_found", "session_expired",
  "refresh_token_not_found", "refresh_token_already_used", "user_not_found", "user_banned",
]);

function invalidSession(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const failure = error as { status?: unknown; code?: unknown; name?: unknown };
  // La indisponibilidad tiene precedencia incluso ante un código contradictorio.
  if (failure.status === 408 || failure.status === 429 ||
    (typeof failure.status === "number" && failure.status >= 500) || failure.name === "AuthRetryableFetchError") return false;
  return failure.status === 401 || failure.name === "AuthSessionMissingError" ||
    (typeof failure.code === "string" && INVALID_SESSION_CODES.has(failure.code));
}

/** Traduce solo la identidad verificada; nunca propaga diagnósticos de Supabase. */
export async function authenticateVisionUser(lookup: UserLookup, diagnostic?: VisionDiagnostic): Promise<string | null> {
  const report = (error: unknown) => {
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : undefined;
    diagnostic?.event("authentication", "failed", status);
  };
  try {
    const { data, error } = await lookup();
    if (error) {
      report(error);
      if (invalidSession(error)) return null;
      throw new VisionError("ANALYSIS_UNAVAILABLE");
    }
    return data.user?.id ?? null;
  } catch (error) {
    if (!(error instanceof VisionError)) report(error);
    if (invalidSession(error)) return null;
    throw new VisionError("ANALYSIS_UNAVAILABLE");
  }
}

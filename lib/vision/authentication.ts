import "server-only";
import { VisionError } from "./errors";

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
export async function authenticateVisionUser(lookup: UserLookup): Promise<string | null> {
  try {
    const { data, error } = await lookup();
    if (error) {
      if (invalidSession(error)) return null;
      throw new VisionError("ANALYSIS_UNAVAILABLE");
    }
    return data.user?.id ?? null;
  } catch (error) {
    if (invalidSession(error)) return null;
    throw new VisionError("ANALYSIS_UNAVAILABLE");
  }
}

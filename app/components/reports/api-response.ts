/**
 * Lectura de las respuestas de la API de reportes para las fuentes de la interfaz. Las exitosas
 * se validan con el contrato; las de error se respetan si tienen la forma del contrato.
 */
import { ERROR_STATUS, type ApiResult, type ErrorCode } from "../../../lib/contracts/errors";
import { validateApiResult, type ValidationResult } from "../../../lib/contracts/validation";

/** El modo de ejemplo (datos en memoria) solo se usa con NEXT_PUBLIC_REPORTS_SAMPLE_MODE=1. */
export function usingSampleData(): boolean {
  return process.env.NEXT_PUBLIC_REPORTS_SAMPLE_MODE === "1";
}

export type ApiResponse<T> = { status: number; body: ApiResult<T> };

export const UNEXPECTED_RESPONSE = "Recibimos una respuesta inesperada. Probá de nuevo.";

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && Object.hasOwn(ERROR_STATUS, value);
}

function fallbackCode(status: number): ErrorCode {
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 429) return "RATE_LIMITED";
  return "INTERNAL_ERROR";
}

/** Convierte una respuesta HTTP en `{ status, body }`; nunca devuelve datos que no pasan el contrato. */
export async function readApiResponse<T>(
  response: Response,
  validateData: (value: unknown) => ValidationResult<T>,
  fallbackMessage: string,
): Promise<ApiResponse<T>> {
  const json: unknown = await response.json().catch(() => null);

  if (response.ok) {
    const checked = validateApiResult(json, validateData);
    if (checked.valid && checked.value.data !== undefined) return { status: response.status, body: { data: checked.value.data } };
    return { status: 500, body: { error: { code: "INTERNAL_ERROR", message: UNEXPECTED_RESPONSE } } };
  }

  const error = (json as { error?: { code?: unknown; message?: unknown; fieldErrors?: unknown } } | null)?.error;
  if (error && isErrorCode(error.code) && typeof error.message === "string") {
    const fieldErrors = error.fieldErrors && typeof error.fieldErrors === "object"
      ? (error.fieldErrors as Record<string, string[]>)
      : undefined;
    return { status: response.status, body: { error: { code: error.code, message: error.message, ...(fieldErrors ? { fieldErrors } : {}) } } };
  }
  return { status: response.status, body: { error: { code: fallbackCode(response.status), message: fallbackMessage } } };
}

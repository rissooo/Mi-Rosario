import { ERROR_STATUS, type ErrorCode } from "../contracts/errors";

const messages: Partial<Record<ErrorCode, string>> = {
  UNAUTHENTICATED: "Iniciá sesión para analizar una imagen.",
  FORBIDDEN: "El origen de la solicitud no está permitido.",
  PAYLOAD_TOO_LARGE: "La imagen o la solicitud supera el tamaño permitido.",
  UNSUPPORTED_MEDIA_TYPE: "Usá una imagen JPEG, PNG o WebP con formato válido.",
  VALIDATION_ERROR: "Revisá la imagen y los campos enviados.",
  ANALYSIS_FAILED: "No se pudo obtener una sugerencia válida. Podés completar el reporte a mano.",
  ANALYSIS_UNAVAILABLE: "El análisis no está disponible temporalmente.",
  ANALYSIS_TIMEOUT: "El análisis superó el tiempo disponible.",
};

export class VisionError extends Error {
  constructor(public readonly code: ErrorCode, public readonly retryAfter?: number) {
    super(messages[code] ?? "Ocurrió un error interno.");
  }
}

export function errorResponse(error: unknown): Response {
  const failure = error instanceof VisionError ? error : new VisionError("INTERNAL_ERROR");
  return Response.json({ error: { code: failure.code, message: failure.message } }, {
    status: ERROR_STATUS[failure.code],
    headers: { "Cache-Control": "no-store", ...(failure.retryAfter ? { "Retry-After": String(failure.retryAfter) } : {}) },
  });
}

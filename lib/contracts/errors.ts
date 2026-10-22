export const ERROR_STATUS = {
  INVALID_JSON: 400,
  VALIDATION_ERROR: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  REPORT_NOT_FOUND: 404,
  REPORT_RESOLVED: 409,
  AUTHOR_CANNOT_CONFIRM: 403,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  ANALYSIS_FAILED: 502,
  ANALYSIS_UNAVAILABLE: 503,
  ANALYSIS_TIMEOUT: 504,
  PUBLICATION_IN_PROGRESS: 409,
  IDEMPOTENCY_CONFLICT: 409,
  STORAGE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
} as const;
export type ErrorCode = keyof typeof ERROR_STATUS;
export type ApiError = { code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> };
export type ApiResult<T> = { data: T; error?: never } | { error: ApiError; data?: never };

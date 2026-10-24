/**
 * Única fuente de publicación del formulario: POST /api/reports (multipart + Idempotency-Key).
 * Con NEXT_PUBLIC_REPORTS_SAMPLE_MODE=1 publica en memoria con la misma forma de respuesta.
 */
import { ERROR_STATUS, type ApiResult, type ErrorCode } from "../../../lib/contracts/errors";
import { PUBLICATION_CASES } from "../../../lib/contracts/fixtures";
import {
  INITIAL_CONFIRMATION_THRESHOLD, type ImageMimeType, type Report, type ReportFields,
} from "../../../lib/contracts/reports";
import { validatePublicationHeaders, validatePublishReportRequest, validateReport } from "../../../lib/contracts/validation";
import { addPublishedSampleReport } from "../map/report-source";
import { readApiResponse, usingSampleData } from "./api-response";
import { randomUuid } from "./form-helpers";

export type PublishInput = { report: ReportFields; image: File; idempotencyKey: string };
export type PublishResponse = { status: number; body: ApiResult<Report> };

/** Errores que se pueden simular con `?simular=` en el modo de ejemplo. */
export const SIMULATED_FAILURES = ["STORAGE_UNAVAILABLE", "PUBLICATION_IN_PROGRESS", "RATE_LIMITED", "UNAUTHENTICATED"] as const;
export type SimulatedFailure = (typeof SIMULATED_FAILURES)[number];

export function parseSimulatedFailure(value: string | null): SimulatedFailure | null {
  return SIMULATED_FAILURES.find((code) => code === value) ?? null;
}

const caseMessage = (code: ErrorCode) => {
  const response = PUBLICATION_CASES.find((item) => "error" in item.response && item.response.error?.code === code)?.response;
  return response && "error" in response ? response.error?.message : undefined;
};

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  STORAGE_UNAVAILABLE: caseMessage("STORAGE_UNAVAILABLE"),
  PUBLICATION_IN_PROGRESS: caseMessage("PUBLICATION_IN_PROGRESS"),
  RATE_LIMITED: caseMessage("RATE_LIMITED"),
  IDEMPOTENCY_CONFLICT: caseMessage("IDEMPOTENCY_CONFLICT"),
  UNAUTHENTICATED: "Iniciá sesión para publicar un reporte.",
};

function failure(code: ErrorCode, message = MESSAGES[code] ?? "No se pudo publicar el reporte.", fieldErrors?: Record<string, string[]>): PublishResponse {
  return { status: ERROR_STATUS[code], body: { error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } } };
}

// Operaciones ya publicadas por clave, como guardaría el backend para la idempotencia.
const operations = new Map<string, { fingerprint: string; report: Report }>();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function publishReport(
  input: PublishInput,
  options: { simulate?: SimulatedFailure | null; delayMs?: number } = {},
): Promise<PublishResponse> {
  return usingSampleData() ? publishSampleReport(input, options) : publishApiReport(input);
}

/** Si fetch falla (sin conexión), deja que el formulario muestre "Revisá tu conexión y reintentá". */
async function publishApiReport(input: PublishInput): Promise<PublishResponse> {
  const form = new FormData();
  form.set("report", JSON.stringify(input.report));
  form.set("image", input.image);
  // Sin Content-Type: el navegador lo arma con el boundary del multipart.
  const response = await fetch("/api/reports", {
    method: "POST",
    headers: { "Idempotency-Key": input.idempotencyKey },
    body: form,
    cache: "no-store",
  });
  return readApiResponse(response, validateReport, "No se pudo publicar el reporte. Reintentá en un rato.");
}

async function publishSampleReport(
  input: PublishInput,
  options: { simulate?: SimulatedFailure | null; delayMs?: number },
): Promise<PublishResponse> {
  await wait(options.delayMs ?? 800);

  const headers = validatePublicationHeaders({ "Idempotency-Key": input.idempotencyKey });
  if (!headers.valid) return failure("VALIDATION_ERROR", headers.error.message, headers.error.fieldErrors);
  if (options.simulate) return failure(options.simulate);

  const parsed = validatePublishReportRequest({ report: input.report, image: input.image });
  if (!parsed.valid) return failure("VALIDATION_ERROR", parsed.error.message, parsed.error.fieldErrors);

  const fields = parsed.value.report;
  // El backend real usa SHA-256 de la imagen; para simular alcanza con su tipo y tamaño.
  const fingerprint = JSON.stringify([fields, input.image.type, input.image.size]);
  const existing = operations.get(input.idempotencyKey);
  if (existing) {
    return existing.fingerprint === fingerprint ? { status: 200, body: { data: existing.report } } : failure("IDEMPOTENCY_CONFLICT");
  }

  const now = new Date().toISOString();
  const { reviewed: _reviewed, ...publicFields } = fields;
  void _reviewed;
  const report: Report = {
    ...publicFields,
    id: randomUuid(),
    // Photo.url tiene que ser HTTPS: en el modo de ejemplo no hay dónde ver la foto publicada.
    // expiresAt null, como la URL pública que devuelve el backend real.
    photo: { id: randomUuid(), url: "https://example.invalid/foto-publicada.jpg", expiresAt: null, mimeType: input.image.type as ImageMimeType, byteSize: input.image.size },
    status: "pending",
    createdAt: now,
    updatedAt: now,
    // Simula la política inicial del backend; la interfaz muestra el umbral que viene en el reporte.
    citizenVerification: { confirmationCount: 0, threshold: INITIAL_CONFIRMATION_THRESHOLD, policyStatus: "approved", corroborated: false },
    institutionalVerification: { availability: "unavailable", verifiedAt: null },
    resolvedAt: null,
  };
  operations.set(input.idempotencyKey, { fingerprint, report });
  addPublishedSampleReport(report);
  return { status: 201, body: { data: report } };
}

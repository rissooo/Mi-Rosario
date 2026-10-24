/** Solo ejemplos sintéticos del contrato. Sin servicios, base de datos, descarga de imágenes ni llamadas a IA. */
import { INITIAL_CATEGORIES } from "./categories";
import type { ApiResult } from "./errors";
import type { MyConfirmation, Report, ReportFields, ReportList } from "./reports";
import type { AnalyzeImageResponse } from "./vision";

const createdAt = "2026-10-22T12:00:00.000Z";
const updatedAt = "2026-10-22T12:01:00.000Z";
/** Copiá un ejemplo antes de editarlo en un consumidor o en un test. */
export function cloneFixture<T>(example: T): T { return structuredClone(example); }
/** Clona cada ejemplo por separado, incluso si el mismo origen se repite en una colección. */
function independent<T>(examples: T[]): T[] { return examples.map(cloneFixture); }
export const REPORT_FIELDS_FIXTURES: readonly ReportFields[] = INITIAL_CATEGORIES.map((category) => ({
  title: `Ejemplo de ${category.label.toLowerCase()}`,
  description: category.id === "faulty-traffic-light"
    ? "La persona declara que el semáforo no cambia; la fotografía no demuestra su funcionamiento."
    : `Descripción sintética para revisar un reporte de ${category.label.toLowerCase()}.`,
  categoryId: category.id,
  severity: "medium",
  location: { latitude: -32.9468, longitude: -60.6393, address: { street: "Córdoba", number: 1250 } },
  reviewed: true,
}));

export const REPORT_FIXTURES: readonly Report[] = REPORT_FIELDS_FIXTURES.map((fields, index) => {
  const { reviewed: _reviewed, ...publicFields } = cloneFixture(fields);
  void _reviewed;
  return {
    ...publicFields,
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    photo: {
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      url: `https://example.invalid/synthetic-photo-${index + 1}.jpg`,
      // Como el backend real: URL pública de la versión para ver, sin vencimiento.
      expiresAt: null,
      mimeType: "image/jpeg",
      byteSize: 1024,
    },
    status: "pending",
    createdAt,
    updatedAt,
    citizenVerification: { confirmationCount: 0, threshold: 3, policyStatus: "approved", corroborated: false },
    institutionalVerification: { availability: "unavailable", verifiedAt: null },
    resolvedAt: null,
  };
});

/** Las entradas y salidas listadas son ejemplos, no una implementación de las transiciones. */
export const VERIFICATION_FIXTURES: readonly Report[] = independent<Report>([
  { ...REPORT_FIXTURES[0], citizenVerification: { confirmationCount: 2, threshold: 3, policyStatus: "approved", corroborated: false } },
  { ...REPORT_FIXTURES[0], status: "citizen-verification", citizenVerification: { confirmationCount: 3, threshold: 3, policyStatus: "approved", corroborated: true } },
  { ...REPORT_FIXTURES[0], status: "citizen-verification", citizenVerification: { confirmationCount: 5, threshold: 5, policyStatus: "approved", corroborated: true } },
  { ...REPORT_FIXTURES[0], severity: "high" },
]);
export const INSTITUTIONAL_SIMULATIONS = independent((["municipal-verification", "resolved"] as const).map((status) => ({
  simulation: true as const,
  label: "Simulación - sin aval municipal",
  report: {
    ...VERIFICATION_FIXTURES[1], status,
    institutionalVerification: { availability: "enabled" as const, verifiedAt: updatedAt },
    resolvedAt: status === "resolved" ? updatedAt : null,
  } satisfies Report,
})));

export const SUGGESTION_FIXTURES: readonly AnalyzeImageResponse[] = [
  ...REPORT_FIELDS_FIXTURES.map((fields) => ({ suggestion: {
    title: fields.title, description: fields.description, categoryId: fields.categoryId,
    severity: fields.severity, warnings: [],
  } })),
  { suggestion: { title: null, description: null, categoryId: null, severity: null, warnings: ["La imagen no permite determinar la categoría. Seleccionala manualmente."] } },
  { suggestion: { title: null, description: null, categoryId: null, severity: null, warnings: ["La foto no demuestra cómo funciona el semáforo. Seleccioná la categoría y describí lo que observaste."] } },
];
export const EMPTY_LIST_FIXTURE: ReportList = { items: [], nextCursor: null };
export const REPORT_LIST_FIXTURE: ReportList = cloneFixture({ items: [...REPORT_FIXTURES], nextCursor: null });
export const MY_CONFIRMATION_FIXTURES: readonly MyConfirmation[] = independent<MyConfirmation>([
  { reportId: REPORT_FIXTURES[0].id, status: "pending", confirmed: false, confirmedAt: null, canConfirm: true, reason: null, citizenVerification: REPORT_FIXTURES[0].citizenVerification },
  { reportId: REPORT_FIXTURES[0].id, status: "pending", confirmed: false, confirmedAt: null, canConfirm: false, reason: "author", citizenVerification: REPORT_FIXTURES[0].citizenVerification },
  { reportId: REPORT_FIXTURES[0].id, status: "pending", confirmed: true, confirmedAt: updatedAt, canConfirm: false, reason: "already-confirmed", citizenVerification: { confirmationCount: 1, threshold: 3, policyStatus: "approved", corroborated: false } },
  { reportId: REPORT_FIXTURES[0].id, status: "citizen-verification", confirmed: true, confirmedAt: updatedAt, canConfirm: false, reason: "already-confirmed", citizenVerification: VERIFICATION_FIXTURES[1].citizenVerification },
]);

export type ContractCase<T> = { name: string; status: number; response: ApiResult<T>; simulation?: true };
export const PUBLICATION_CASES: readonly ContractCase<Report>[] = independent<ContractCase<Report>>([
  { name: "first completion", status: 201, response: { data: REPORT_FIXTURES[0] } },
  { name: "completed replay, same report ID", status: 200, response: { data: REPORT_FIXTURES[0] } },
  { name: "key reused with changed payload", status: 409, response: { error: { code: "IDEMPOTENCY_CONFLICT", message: "La clave ya corresponde a otros datos." } } },
  { name: "operation in progress; same-key retry", status: 409, response: { error: { code: "PUBLICATION_IN_PROGRESS", message: "La publicación sigue en curso. Reintentá con la misma clave." } } },
  { name: "account quota reached; retry later", status: 429, response: { error: { code: "RATE_LIMITED", message: "Alcanzaste el máximo de reportes para las últimas 24 horas. Conservá el borrador y reintentá más tarde." } } },
  { name: "temporary storage failure", status: 503, response: { error: { code: "STORAGE_UNAVAILABLE", message: "No se pudo guardar la fotografía. Conservá el borrador y reintentá." } } },
]);
export const CONFIRMATION_CASES: readonly ContractCase<MyConfirmation>[] = independent<ContractCase<MyConfirmation>>([
  { name: "first qualifying confirmation", status: 201, response: { data: MY_CONFIRMATION_FIXTURES[2] } },
  { name: "duplicate or concurrent same-account replay", status: 200, response: { data: MY_CONFIRMATION_FIXTURES[2] } },
  { name: "third distinct valid confirmation", status: 201, response: { data: MY_CONFIRMATION_FIXTURES[3] } },
  { name: "author excluded", status: 403, response: { error: { code: "AUTHOR_CANNOT_CONFIRM", message: "No podés confirmar tu propio reporte." } } },
  { name: "anonymous excluded", status: 401, response: { error: { code: "UNAUTHENTICATED", message: "Iniciá sesión para confirmar." } } },
  { name: "Simulación - sin aval municipal: replay after resolution", simulation: true, status: 200, response: { data: { ...MY_CONFIRMATION_FIXTURES[3], status: "resolved", reason: "resolved" } } },
  { name: "Simulación - sin aval municipal: new confirmation after resolution", simulation: true, status: 409, response: { error: { code: "REPORT_RESOLVED", message: "El reporte ya está resuelto." } } },
  { name: "missing report", status: 404, response: { error: { code: "REPORT_NOT_FOUND", message: "No se encontró el reporte." } } },
]);

/** Solo sobres de error: no se llama al proveedor ni se usan temporizadores ni credenciales. */
export const ANALYSIS_ERROR_CASES: readonly ContractCase<AnalyzeImageResponse>[] = independent<ContractCase<AnalyzeImageResponse>>([
  { name: "invalid Gemini output", status: 502, response: { error: { code: "ANALYSIS_FAILED", message: "No se pudo interpretar la sugerencia. Completá los datos manualmente." } } },
  { name: "Gemini unavailable", status: 503, response: { error: { code: "ANALYSIS_UNAVAILABLE", message: "El análisis no está disponible. Conservá la foto y completá los datos manualmente." } } },
  { name: "Gemini deadline exceeded", status: 504, response: { error: { code: "ANALYSIS_TIMEOUT", message: "El análisis tardó demasiado. Podés completar los datos manualmente." } } },
]);

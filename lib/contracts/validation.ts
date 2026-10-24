import { INITIAL_CATEGORIES, isActiveCategory, type CategoryDefinition } from "./categories";
import { ERROR_STATUS, type ApiError, type ApiResult } from "./errors";
import {
  DESCRIPTION_LIMITS, IMAGE_MIME_TYPES, MAX_IMAGE_BYTES, MAX_JSON_BYTES, FUTURE_INSTITUTIONAL_STAGES,
  PROVISIONAL_TITLE_LIMITS, REPORT_STAGES, SEVERITIES, STREET_LIMITS, STREET_NUMBER_LIMITS,
} from "./reports";
import type {
  CitizenVerification, ConfirmationResult, ConfirmReportRequest, MyConfirmation, Photo, PublishReportRequest,
  Report, ReportFields, ReportList, ReportListQuery,
} from "./reports";
import type { AnalyzeImageResponse, ImageSuggestion } from "./vision";

export type ValidationResult<T> = { valid: true; value: T } | { valid: false; error: ApiError };
export type Validator<T> = (value: unknown) => ValidationResult<T>;
export type ValidationOptions = { catalog?: readonly CategoryDefinition[]; allowInstitutionalSimulation?: boolean };
type Obj = Record<string, unknown>;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const pathOf = (parent: string, key: string) => parent ? `${parent}.${key}` : key;

class Check {
  readonly fields: Record<string, string[]> = Object.create(null);
  issue(path: string, message: string) { (this.fields[path || "body"] ??= []).push(message); }
  object(value: unknown, path: string, keys: readonly string[]): Obj {
    if (value === null || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      this.issue(path, "Ingresá un objeto válido.");
      return {};
    }
    const object = value as Obj;
    for (const key of Object.keys(object)) {
      if (!keys.includes(key)) this.issue(pathOf(path, key), "Este campo no está permitido.");
    }
    return object;
  }
  text(value: unknown, path: string, min: number, max: number): string {
    if (typeof value !== "string") { this.issue(path, "Ingresá un texto válido."); return ""; }
    const trimmed = value.trim();
    if ([...trimmed].length < min || [...trimmed].length > max) {
      this.issue(path, `Ingresá entre ${min} y ${max} caracteres.`);
    }
    return trimmed;
  }
  number(value: unknown, path: string, min: number, max: number, integer = false) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) {
      this.issue(path, "Ingresá un número válido dentro del rango permitido.");
    }
  }
  enum(value: unknown, path: string, choices: readonly string[]) {
    if (typeof value !== "string" || !choices.includes(value)) this.issue(path, "Seleccioná una opción válida.");
  }
  boolean(value: unknown, path: string) { if (typeof value !== "boolean") this.issue(path, "Ingresá un valor verdadero o falso."); }
  uuid(value: unknown, path: string) {
    if (typeof value !== "string" || !UUID_PATTERN.test(value)) this.issue(path, "Ingresá un identificador UUID válido.");
  }
  date(value: unknown, path: string) {
    if (typeof value !== "string" || !UTC_PATTERN.test(value) || !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString() !== value.replace(/Z$/, value.includes(".") ? "Z" : ".000Z")) {
      this.issue(path, "Ingresá una fecha UTC válida.");
    }
  }
  result<T>(value: unknown): ValidationResult<T> {
    return Object.keys(this.fields).length
      ? { valid: false, error: { code: "VALIDATION_ERROR", message: "Revisá los datos del reporte.", fieldErrors: this.fields } }
      : { valid: true, value: value as T };
  }
}

function category(c: Check, value: unknown, path: string, options: ValidationOptions) {
  if (!isActiveCategory(value, options.catalog ?? INITIAL_CATEGORIES)) c.issue(path, "Seleccioná una categoría activa.");
}
function location(c: Check, value: unknown, path: string): Obj {
  const o = c.object(value, path, ["latitude", "longitude", "address"]);
  c.number(o.latitude, pathOf(path, "latitude"), -90, 90);
  c.number(o.longitude, pathOf(path, "longitude"), -180, 180);
  const addressPath = pathOf(path, "address");
  const address = c.object(o.address, addressPath, ["street", "number"]);
  const street = c.text(address.street, pathOf(addressPath, "street"), STREET_LIMITS.min, STREET_LIMITS.max);
  if (address.number !== null) c.number(address.number, pathOf(addressPath, "number"), STREET_NUMBER_LIMITS.min, STREET_NUMBER_LIMITS.max, true);
  return { ...o, address: { ...address, street } };
}
function reportFields(c: Check, value: unknown, path: string, options: ValidationOptions): Obj {
  const o = c.object(value, path, ["title", "description", "categoryId", "severity", "location", "reviewed"]);
  const title = c.text(o.title, pathOf(path, "title"), PROVISIONAL_TITLE_LIMITS.min, PROVISIONAL_TITLE_LIMITS.max);
  const description = c.text(o.description, pathOf(path, "description"), DESCRIPTION_LIMITS.min, DESCRIPTION_LIMITS.max);
  category(c, o.categoryId, pathOf(path, "categoryId"), options);
  c.enum(o.severity, pathOf(path, "severity"), SEVERITIES);
  const normalizedLocation = location(c, o.location, pathOf(path, "location"));
  if (o.reviewed !== true) c.issue(pathOf(path, "reviewed"), "Revisá y confirmá los datos antes de publicar.");
  return { ...o, title, description, location: normalizedLocation };
}
function verification(c: Check, value: unknown, path: string): Obj {
  const o = c.object(value, path, ["confirmationCount", "threshold", "policyStatus", "corroborated"]);
  c.number(o.confirmationCount, pathOf(path, "confirmationCount"), 0, Number.MAX_SAFE_INTEGER, true);
  c.number(o.threshold, pathOf(path, "threshold"), 1, Number.MAX_SAFE_INTEGER, true);
  c.enum(o.policyStatus, pathOf(path, "policyStatus"), ["approved"]);
  c.boolean(o.corroborated, pathOf(path, "corroborated"));
  if (typeof o.confirmationCount === "number" && typeof o.threshold === "number" &&
    o.corroborated !== (o.confirmationCount >= o.threshold)) c.issue(path, "La corroboración no coincide con el umbral informado.");
  return o;
}
function stageConsistency(c: Check, status: unknown, facts: Obj, path: string) {
  if ((status === "pending" && facts.corroborated === true) ||
    (status === "citizen-verification" && facts.corroborated === false)) c.issue(path, "El estado no coincide con la corroboración informada.");
}
function photo(c: Check, value: unknown, path: string) {
  const o = c.object(value, path, ["id", "url", "expiresAt", "mimeType", "byteSize"]);
  c.uuid(o.id, pathOf(path, "id"));
  try {
    if (typeof o.url !== "string") throw new Error();
    const url = new URL(o.url);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
  } catch { c.issue(pathOf(path, "url"), "Ingresá una URL HTTPS válida."); }
  if (o.expiresAt !== null) c.date(o.expiresAt, pathOf(path, "expiresAt"));
  c.enum(o.mimeType, pathOf(path, "mimeType"), IMAGE_MIME_TYPES);
  c.number(o.byteSize, pathOf(path, "byteSize"), 1, MAX_IMAGE_BYTES, true);
}
function report(c: Check, value: unknown, path: string, options: ValidationOptions) {
  const o = c.object(value, path, ["id", "title", "description", "categoryId", "severity", "photo", "status", "location", "createdAt", "updatedAt", "citizenVerification", "institutionalVerification", "resolvedAt"]);
  c.uuid(o.id, pathOf(path, "id"));
  c.text(o.title, pathOf(path, "title"), PROVISIONAL_TITLE_LIMITS.min, PROVISIONAL_TITLE_LIMITS.max);
  c.text(o.description, pathOf(path, "description"), DESCRIPTION_LIMITS.min, DESCRIPTION_LIMITS.max);
  category(c, o.categoryId, pathOf(path, "categoryId"), options);
  c.enum(o.severity, pathOf(path, "severity"), SEVERITIES);
  location(c, o.location, pathOf(path, "location"));
  photo(c, o.photo, pathOf(path, "photo"));
  c.enum(o.status, pathOf(path, "status"), REPORT_STAGES);
  c.date(o.createdAt, pathOf(path, "createdAt"));
  c.date(o.updatedAt, pathOf(path, "updatedAt"));
  if (typeof o.createdAt === "string" && typeof o.updatedAt === "string" && Date.parse(o.updatedAt) < Date.parse(o.createdAt)) c.issue(pathOf(path, "updatedAt"), "La actualización debe ser posterior a la creación.");
  const facts = verification(c, o.citizenVerification, pathOf(path, "citizenVerification"));
  stageConsistency(c, o.status, facts, pathOf(path, "status"));
  const institution = c.object(o.institutionalVerification, pathOf(path, "institutionalVerification"), ["availability", "verifiedAt"]);
  c.enum(institution.availability, pathOf(path, "institutionalVerification.availability"), ["unavailable", "enabled"]);
  if (institution.verifiedAt !== null) c.date(institution.verifiedAt, pathOf(path, "institutionalVerification.verifiedAt"));
  if (o.resolvedAt !== null) c.date(o.resolvedAt, pathOf(path, "resolvedAt"));
  if (!options.allowInstitutionalSimulation && (institution.availability !== "unavailable" || institution.verifiedAt !== null ||
    o.resolvedAt !== null || o.status === "municipal-verification" || o.status === "resolved")) {
    c.issue(pathOf(path, "status"), "La operación institucional no está disponible en el MVP.");
  }
  if ((o.status === "resolved") !== (o.resolvedAt !== null)) c.issue(pathOf(path, "resolvedAt"), "La fecha de resolución no coincide con el estado.");
  if ((o.status === "municipal-verification" || o.status === "resolved") && (institution.availability !== "enabled" || institution.verifiedAt === null)) {
    c.issue(pathOf(path, "institutionalVerification"), "Falta evidencia institucional en esta simulación.");
  }
}

export function validateReportFields(value: unknown, options: ValidationOptions = {}): ValidationResult<ReportFields> {
  const c = new Check(); return c.result(reportFields(c, value, "", options));
}
export function validateCitizenVerification(value: unknown): ValidationResult<CitizenVerification> {
  const c = new Check(); verification(c, value, ""); return c.result(value);
}
export function validatePhoto(value: unknown): ValidationResult<Photo> {
  const c = new Check(); photo(c, value, ""); return c.result(value);
}
export function validateReport(value: unknown, options: ValidationOptions = {}): ValidationResult<Report> {
  const c = new Check(); report(c, value, "", options); return c.result(value);
}
export function validateUuid(value: unknown): ValidationResult<string> {
  const c = new Check(); c.uuid(value, "id"); return c.result(value);
}
export function validatePublicationHeaders(value: unknown): ValidationResult<{ "Idempotency-Key": string }> {
  const c = new Check(); const o = c.object(value, "", ["Idempotency-Key"]); c.uuid(o["Idempotency-Key"], "Idempotency-Key"); return c.result(value);
}
/** Solo metadatos del archivo. La decodificación, la firma y los límites del cuerpo corresponden al futuro transporte del servidor. */
export function validatePublishReportRequest(value: unknown, options: ValidationOptions = {}): ValidationResult<PublishReportRequest> {
  const c = new Check(); const o = c.object(value, "", ["report", "image"]);
  const fields = reportFields(c, o.report, "report", options);
  if (typeof File === "undefined" || !(o.image instanceof File)) c.issue("image", "Seleccioná una fotografía original.");
  else {
    c.enum(o.image.type, "image.type", IMAGE_MIME_TYPES);
    c.number(o.image.size, "image.size", 1, MAX_IMAGE_BYTES, true);
  }
  return c.result({ ...o, report: fields });
}
export function validateConfirmReportRequest(value: unknown): ValidationResult<ConfirmReportRequest> {
  const c = new Check(); c.object(value, "", []); return c.result(value);
}
export function validateImageSuggestion(value: unknown, options: ValidationOptions = {}): ValidationResult<ImageSuggestion> {
  const c = new Check(); const o = c.object(value, "", ["title", "description", "categoryId", "severity", "warnings"]);
  const title = o.title === null ? null : c.text(o.title, "title", PROVISIONAL_TITLE_LIMITS.min, PROVISIONAL_TITLE_LIMITS.max);
  const description = o.description === null ? null : c.text(o.description, "description", DESCRIPTION_LIMITS.min, DESCRIPTION_LIMITS.max);
  if (o.categoryId !== null) category(c, o.categoryId, "categoryId", options);
  if (o.severity !== null) c.enum(o.severity, "severity", SEVERITIES);
  if (!Array.isArray(o.warnings) || o.warnings.length > 5) c.issue("warnings", "Ingresá hasta cinco aclaraciones.");
  else o.warnings.forEach((warning, index) => c.text(warning, `warnings.${index}`, 1, 200));
  return c.result({ ...o, title, description });
}
export function validateAnalyzeImageResponse(value: unknown, options: ValidationOptions = {}): ValidationResult<AnalyzeImageResponse> {
  const c = new Check(); const o = c.object(value, "", ["suggestion"]);
  const parsed = validateImageSuggestion(o.suggestion, options);
  if (!parsed.valid) for (const [key, messages] of Object.entries(parsed.error.fieldErrors ?? {})) for (const message of messages) c.issue(`suggestion.${key}`, message);
  return c.result({ suggestion: parsed.valid ? parsed.value : o.suggestion });
}

export function validateMyConfirmation(value: unknown, options: ValidationOptions = {}): ValidationResult<MyConfirmation> {
  const c = new Check(); const o = c.object(value, "", ["reportId", "status", "confirmed", "confirmedAt", "canConfirm", "reason", "citizenVerification"]);
  c.uuid(o.reportId, "reportId"); c.enum(o.status, "status", REPORT_STAGES);
  if (!options.allowInstitutionalSimulation && FUTURE_INSTITUTIONAL_STAGES.some((stage) => stage === o.status)) {
    c.issue("status", "El estado institucional solo está disponible en simulaciones fuera del MVP.");
  }
  c.boolean(o.confirmed, "confirmed"); c.boolean(o.canConfirm, "canConfirm");
  if (o.confirmedAt !== null) c.date(o.confirmedAt, "confirmedAt");
  if (o.reason !== null) c.enum(o.reason, "reason", ["author", "resolved", "already-confirmed"]);
  const facts = verification(c, o.citizenVerification, "citizenVerification");
  stageConsistency(c, o.status, facts, "status");
  if (typeof o.confirmed === "boolean" && o.confirmed !== (o.confirmedAt !== null)) c.issue("confirmedAt", "La fecha no coincide con la confirmación.");
  const expectedReason = o.status === "resolved" ? "resolved" : o.reason === "author" ? "author" : o.confirmed === true ? "already-confirmed" : null;
  if (o.reason !== expectedReason || o.canConfirm !== (expectedReason === null) || (o.reason === "author" && o.confirmed === true)) {
    c.issue("reason", "La elegibilidad no coincide con la confirmación y el estado.");
  }
  if (o.confirmed === true && facts.confirmationCount === 0) c.issue("citizenVerification.confirmationCount", "Falta la confirmación en el total informado.");
  return c.result(value);
}

export function validateConfirmationResult(value: unknown, options: ValidationOptions = {}): ValidationResult<ConfirmationResult> {
  const parsed = validateMyConfirmation(value, options);
  if (!parsed.valid) return parsed;
  if (parsed.value.confirmed !== true) {
    return { valid: false, error: { code: "VALIDATION_ERROR", message: "La respuesta debe contener una confirmación existente." } };
  }
  return { valid: true, value: { ...parsed.value, confirmed: true } };
}

/** Valida los límites geográficos antes de producir su escritura numérica canónica. */
function normalizedBbox(c: Check, value: unknown, path: string): string | undefined {
  const parts = typeof value === "string" ? value.split(",") : [];
  const numbers = parts.map((part) => part.trim() === "" ? NaN : Number(part));
  if (parts.length !== 4 || numbers.some((part) => !Number.isFinite(part)) ||
    numbers[0] < -180 || numbers[2] > 180 || numbers[1] < -90 || numbers[3] > 90 ||
    numbers[0] >= numbers[2] || numbers[1] >= numbers[3]) {
    c.issue(path, "Ingresá oeste,sur,este,norte con límites válidos.");
    return undefined;
  }
  // Sin redondeo: los números equivalentes comparten forma y los límites distintos siguen siendo distintos.
  // String(-0) es "0", así que el cero negativo también tiene una sola representación.
  return numbers.map(String).join(",");
}

/** Forma del cursor opaco con versión; decodificarlo es validar, no confiar ni autorizar. */
function cursor(c: Check, value: unknown, path: string, filters?: Obj, options: ValidationOptions = {}) {
  try {
    if (typeof value !== "string" || value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const decoded: unknown = JSON.parse(atob(padded + "=".repeat((4 - padded.length % 4) % 4)));
    const o = c.object(decoded, path, ["version", "createdAt", "id", "filters"]);
    if (o.version !== 1) c.issue(path, "La versión del cursor no es válida.");
    c.date(o.createdAt, `${path}.createdAt`); c.uuid(o.id, `${path}.id`);
    const bound = c.object(o.filters, `${path}.filters`, ["categoryId", "status", "bbox"]);
    const filterShape = Object.fromEntries(Object.entries(bound).filter(([key]) => ["categoryId", "status", "bbox"].includes(key)));
    const parsedFilters = validateReportListQuery(filterShape, options);
    if (!parsedFilters.valid) c.issue(path, "Los filtros del cursor no son válidos.");
    if (filters && parsedFilters.valid) {
      for (const key of ["categoryId", "status", "bbox"] as const) {
        if (parsedFilters.value[key] !== filters[key]) c.issue(path, "El cursor no corresponde a estos filtros.");
      }
    }
  } catch { c.issue(path, "Ingresá un cursor válido."); }
}
export function validateReportListQuery(value: unknown, options: ValidationOptions = {}): ValidationResult<ReportListQuery> {
  const c = new Check(); const o = c.object(value, "", ["categoryId", "status", "bbox", "limit", "cursor"]);
  if (Object.hasOwn(o, "categoryId")) category(c, o.categoryId, "categoryId", options);
  if (Object.hasOwn(o, "status")) c.enum(o.status, "status", REPORT_STAGES);
  if (Object.hasOwn(o, "limit")) c.number(o.limit, "limit", 1, 100, true);
  const normalized: Obj = { ...o, limit: o.limit ?? 50 };
  if (Object.hasOwn(o, "bbox")) normalized.bbox = normalizedBbox(c, o.bbox, "bbox");
  if (Object.hasOwn(o, "cursor")) cursor(c, o.cursor, "cursor", normalized, options);
  return c.result(normalized);
}
export function parseReportListQuery(params: URLSearchParams): ValidationResult<ReportListQuery> {
  const c = new Check(); const query: Obj = {};
  for (const [key, value] of params) {
    if (Object.hasOwn(query, key)) c.issue(key, "No repitas este parámetro.");
    else Object.defineProperty(query, key, { value: key === "limit" && /^[1-9]\d*$/.test(value) ? Number(value) : value, enumerable: true });
  }
  const parsed = validateReportListQuery(query);
  if (!parsed.valid) for (const [key, messages] of Object.entries(parsed.error.fieldErrors ?? {})) for (const message of messages) c.issue(key, message);
  return c.result(parsed.valid ? parsed.value : query);
}
export function validateReportList(value: unknown, options: ValidationOptions = {}): ValidationResult<ReportList> {
  const c = new Check(); const o = c.object(value, "", ["items", "nextCursor"]);
  if (!Array.isArray(o.items) || o.items.length > 100) c.issue("items", "Ingresá hasta cien reportes.");
  else o.items.forEach((item, index) => report(c, item, `items.${index}`, options));
  if (o.nextCursor !== null) cursor(c, o.nextCursor, "nextCursor", undefined, options);
  return c.result(value);
}
export function validateApiError(value: unknown): ValidationResult<ApiError> {
  const c = new Check(); const o = c.object(value, "", ["code", "message", "fieldErrors"]);
  c.enum(o.code, "code", Object.keys(ERROR_STATUS)); c.text(o.message, "message", 1, 1000);
  if (Object.hasOwn(o, "fieldErrors")) {
    const fields = c.object(o.fieldErrors, "fieldErrors", o.fieldErrors && typeof o.fieldErrors === "object" ? Object.keys(o.fieldErrors) : []);
    for (const [key, messages] of Object.entries(fields)) {
      if (!Array.isArray(messages) || messages.length === 0) c.issue(`fieldErrors.${key}`, "Ingresá una lista de mensajes.");
      else messages.forEach((message) => c.text(message, `fieldErrors.${key}`, 1, 1000));
    }
  }
  return c.result(value);
}
export function validateApiResult<T>(value: unknown, validateData: Validator<T>): ValidationResult<ApiResult<T>> {
  const c = new Check(); const o = c.object(value, "", ["data", "error"]);
  if (Object.hasOwn(o, "data") === Object.hasOwn(o, "error")) c.issue("body", "La respuesta debe contener datos o error, exclusivamente.");
  else {
    const result = Object.hasOwn(o, "error") ? validateApiError(o.error) : validateData(o.data);
    if (!result.valid) c.issue("body", "El contenido de la respuesta no cumple el contrato.");
    else return c.result(Object.hasOwn(o, "error") ? { error: result.value } : { data: result.value });
  }
  return c.result(value);
}
export function parseReportJson(text: string): ValidationResult<ReportFields> {
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) return { valid: false, error: { code: "PAYLOAD_TOO_LARGE", message: "Los datos superan el tamaño permitido." } };
  try { return validateReportFields(JSON.parse(text)); }
  catch { return { valid: false, error: { code: "INVALID_JSON", message: "El JSON no es válido." } }; }
}

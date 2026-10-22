import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_CATEGORIES, isActiveCategory } from "../lib/contracts/categories";
import { ERROR_STATUS } from "../lib/contracts/errors";
import {
  ANALYSIS_ERROR_CASES, cloneFixture, CONFIRMATION_CASES, EMPTY_LIST_FIXTURE, INSTITUTIONAL_SIMULATIONS,
  MY_CONFIRMATION_FIXTURES, PUBLICATION_CASES, REPORT_FIELDS_FIXTURES,
  REPORT_FIXTURES, REPORT_LIST_FIXTURE, SUGGESTION_FIXTURES, VERIFICATION_FIXTURES,
} from "../lib/contracts/fixtures";
import { FUTURE_INSTITUTIONAL_STAGES, MAX_IMAGE_BYTES, MVP_REPORT_STAGES, REPORT_STAGES, SEVERITY_DETAILS } from "../lib/contracts/reports";
import {
  parseReportJson, parseReportListQuery, validateAnalyzeImageResponse, validateApiError,
  validateApiResult, validateCitizenVerification, validateConfirmationResult, validateConfirmReportRequest,
  validateImageSuggestion, validateMyConfirmation, validatePhoto, validatePublicationHeaders,
  validatePublishReportRequest, validateReport, validateReportFields, validateReportList,
  validateReportListQuery, validateUuid,
} from "../lib/contracts/validation";

const fields = REPORT_FIELDS_FIXTURES[0];
const report = REPORT_FIXTURES[0];
// This encodes a test wire value, not a pagination service.
function cursorFor(filters: object = {}, overrides: object = {}) {
  return Buffer.from(JSON.stringify({ version: 1, createdAt: report.createdAt, id: report.id, filters, ...overrides })).toString("base64url");
}

test("el catálogo activo inicial tiene exactamente los cuatro IDs estables y sus etiquetas", () => {
  assert.deepEqual(INITIAL_CATEGORIES.map(({ id }) => id), ["pothole", "missing-light", "damaged-sidewalk", "faulty-traffic-light"]);
  assert.deepEqual(INITIAL_CATEGORIES.map(({ label }) => label), ["Baches", "Falta de luz", "Veredas dañadas", "Semáforos defectuosos"]);
  for (const item of INITIAL_CATEGORIES) {
    assert.match(item.id, /^[a-z]+(?:-[a-z]+)*$/);
    assert.equal(item.active, true); assert.equal(item.scope, "mvp");
    assert.equal(isActiveCategory(item.id), true);
  }
  assert.equal(isActiveCategory("other"), false);
  assert.equal(isActiveCategory("pothole", [{ ...INITIAL_CATEGORIES[0], active: false }]), false);
});

for (const candidate of REPORT_FIELDS_FIXTURES) {
  test(`los campos manuales y el detalle público son válidos para ${candidate.categoryId}`, () => {
    assert.equal(validateReportFields(candidate).valid, true);
    assert.equal(validateReport(REPORT_FIXTURES.find((item) => item.categoryId === candidate.categoryId)).valid, true);
  });
}

test("se revisan todos los campos obligatorios de publicación, incluida la confirmación de revisión", () => {
  for (const key of Object.keys(fields)) {
    const missing: Record<string, unknown> = { ...fields }; delete missing[key];
    assert.equal(validateReportFields(missing).valid, false, key);
  }
  for (const categoryId of [null, "other", "POTHOLE", "damaged_sidewalk"]) {
    assert.equal(validateReportFields({ ...fields, categoryId }).valid, false);
  }
  assert.equal(validateReportFields({ ...fields, reviewed: false }).valid, false);
  assert.equal(validateReportFields({ ...fields, authorId: report.id }).valid, false);
  assert.equal(validateReportFields({ ...fields, status: "resolved" }).valid, false);
  assert.equal(validateReportFields({ ...fields, location: { ...fields.location, accuracy: 1 } }).valid, false);
});

test("los criterios de gravedad de tres niveles son compartidos; se acepta una IA sin certeza, pero publicar exige elegir", () => {
  assert.deepEqual(Object.keys(SEVERITY_DETAILS), ["low", "medium", "high"]);
  assert.equal(SEVERITY_DETAILS.high.description, "Riesgo importante para personas o vehículos.");
  for (const severity of ["low", "medium", "high"]) assert.equal(validateReportFields({ ...fields, severity }).valid, true);
  for (const severity of [null, "unassessed", "critical", 1]) assert.equal(validateReportFields({ ...fields, severity }).valid, false);
  assert.equal(validateReport(VERIFICATION_FIXTURES[3]).valid, true);
  assert.equal(VERIFICATION_FIXTURES[3].status, "pending");
  assert.equal(VERIFICATION_FIXTURES[3].institutionalVerification.verifiedAt, null);
});

test("el texto se recorta respetando Unicode; los límites del título son provisorios", () => {
  const parsed = validateReportFields({ ...fields, title: "  Cinco  ", description: "  Diez letras válidas.  " });
  assert.equal(parsed.valid, true);
  if (parsed.valid) { assert.equal(parsed.value.title, "Cinco"); assert.equal(parsed.value.description, "Diez letras válidas."); }
  for (const length of [5, 120]) assert.equal(validateReportFields({ ...fields, title: "😀".repeat(length) }).valid, true);
  for (const length of [4, 121]) assert.equal(validateReportFields({ ...fields, title: "😀".repeat(length) }).valid, false);
  for (const length of [10, 1000]) assert.equal(validateReportFields({ ...fields, description: "a".repeat(length) }).valid, true);
  for (const length of [9, 1001]) assert.equal(validateReportFields({ ...fields, description: "a".repeat(length) }).valid, false);
});

test("las coordenadas rechazan números no finitos, textos, valores fuera de rango y claves faltantes", () => {
  for (const latitude of [NaN, Infinity, -91, 91, "-32.9", null, undefined]) {
    assert.equal(validateReportFields({ ...fields, location: { latitude, longitude: 0 } }).valid, false);
  }
  for (const longitude of [-181, 181, "0"]) assert.equal(validateReportFields({ ...fields, location: { latitude: 0, longitude } }).valid, false);
  assert.equal(validateReportFields({ ...fields, location: { latitude: -90, longitude: 180 } }).valid, true);
});

test("todos los ejemplos de IA son sugerencias válidas que pueden ser nulas, incluida la evidencia insuficiente de semáforos", () => {
  for (const item of SUGGESTION_FIXTURES) assert.equal(validateAnalyzeImageResponse(item).valid, true);
  const uncertain = SUGGESTION_FIXTURES.at(-1)!;
  assert.equal(uncertain.suggestion.categoryId, null);
  assert.match(uncertain.suggestion.warnings[0], /no demuestra/);
  assert.equal(validateReportFields({ ...fields, categoryId: uncertain.suggestion.categoryId }).valid, false);
  assert.equal(validateReportFields({ ...fields, categoryId: "faulty-traffic-light" }).valid, true);
  assert.equal(validateImageSuggestion({ ...uncertain.suggestion, categoryId: "invented" }).valid, false);
  assert.equal(validateImageSuggestion({ ...uncertain.suggestion, warnings: Array(6).fill("Aclaración") }).valid, false);
  assert.equal(validateImageSuggestion({ ...uncertain.suggestion, status: "municipal-verification" }).valid, false);
  assert.equal(validateImageSuggestion({ ...uncertain.suggestion, warnings: ["a".repeat(201)] }).valid, false);
  for (const key of Object.keys(uncertain.suggestion)) {
    const missing: Record<string, unknown> = { ...uncertain.suggestion }; delete missing[key];
    assert.equal(validateImageSuggestion(missing).valid, false, key);
  }
});

test("editar una sugerencia de IA produce campos manuales válidos sin ejecutar interfaz ni proveedor", () => {
  const suggestion = SUGGESTION_FIXTURES[0].suggestion;
  assert.equal(validateReportFields({ ...fields, title: suggestion.title, severity: "high", reviewed: true }).valid, true);
});

test("la validación de UUID y fechas UTC rechaza valores mal formados y desbordes del calendario", () => {
  assert.equal(validateUuid(report.id).valid, true);
  for (const id of ["report-1", "00000000-0000-0000-0000-000000000000", null, 10]) assert.equal(validateUuid(id).valid, false);
  assert.equal(validateReport({ ...report, createdAt: "2026-02-30T00:00:00.000Z" }).valid, false);
  assert.equal(validateReport({ ...report, createdAt: "2026-10-22T12:00:00+00:00" }).valid, false);
  assert.equal(validateReport({ ...report, updatedAt: "2020-01-01T00:00:00.000Z" }).valid, false);
  assert.equal(validateReport({ ...report, createdAt: "2026-10-22T12:00:00Z", updatedAt: "2026-10-22T12:00:00.001Z" }).valid, true);
});

test("el contrato del header de publicación y los metadatos del original exige un File y campos revisados", () => {
  assert.equal(validatePublicationHeaders({ "Idempotency-Key": report.id }).valid, true);
  assert.equal(validatePublicationHeaders({ "Idempotency-Key": "bad" }).valid, false);
  assert.equal(validatePublicationHeaders({}).valid, false);
  // These bytes are not a JPEG: this test covers metadata, not decoding/signature validation.
  const image = new File(["synthetic metadata sample"], "sample.jpg", { type: "image/jpeg" });
  assert.equal(validatePublishReportRequest({ report: fields, image }).valid, true);
  assert.equal(validatePublishReportRequest({ report: fields }).valid, false);
  assert.equal(validatePublishReportRequest({ report: fields, image: { type: "image/jpeg", size: 100 } }).valid, false);
  assert.equal(validatePublishReportRequest({ report: fields, image: [image, image] }).valid, false);
  assert.equal(validatePublishReportRequest({ report: fields, image: new File([], "empty.jpg", { type: "image/jpeg" }) }).valid, false);
  assert.equal(validatePublishReportRequest({ report: fields, image: new File(["x"], "bad.gif", { type: "image/gif" }) }).valid, false);
  assert.equal(validatePublishReportRequest({ report: fields, image: new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "large.jpg", { type: "image/jpeg" }) }).valid, false);
});

test("el parseo de JSON distingue errores de sintaxis, de tamaño y de campos", () => {
  assert.equal(parseReportJson(JSON.stringify(fields)).valid, true);
  for (const [source, code] of [["{", "INVALID_JSON"], [" ".repeat(16385), "PAYLOAD_TOO_LARGE"], ['{"title":1}', "VALIDATION_ERROR"]]) {
    const parsed = parseReportJson(source); assert.equal(parsed.valid, false);
    if (!parsed.valid) assert.equal(parsed.error.code, code);
  }
});

test("los datos de verificación validan por debajo del umbral, en el umbral y con un umbral de cinco devuelto por el backend", () => {
  for (const item of VERIFICATION_FIXTURES) assert.equal(validateReport(item).valid, true);
  const facts = VERIFICATION_FIXTURES[1].citizenVerification;
  for (const threshold of [null, 0, -1, 1.5, "3"]) assert.equal(validateCitizenVerification({ ...facts, threshold }).valid, false);
  assert.equal(validateCitizenVerification({ ...facts, confirmationCount: 2, corroborated: true }).valid, false);
  assert.equal(validateReport({ ...VERIFICATION_FIXTURES[1], status: "pending" }).valid, false);
  assert.equal(validateReport({ ...report, status: "citizen-verification" }).valid, false);
});

test("los DTO públicos rechazan campos privados y datos institucionales en el MVP", () => {
  for (const key of ["authorId", "email", "objectPath", "publicationState"]) assert.equal(validateReport({ ...report, [key]: "private" }).valid, false);
  assert.equal(validatePhoto({ ...report.photo, objectPath: "private/original.jpg" }).valid, false);
  assert.equal(validatePhoto({ ...report.photo, url: "javascript:alert(1)" }).valid, false);
  for (const item of INSTITUTIONAL_SIMULATIONS) {
    assert.equal(item.simulation, true); assert.match(item.label, /sin aval municipal/);
    assert.equal(validateReport(item.report).valid, false);
    assert.equal(validateReport(item.report, { allowInstitutionalSimulation: true }).valid, true);
  }
  assert.deepEqual(REPORT_STAGES, ["pending", "citizen-verification", "municipal-verification", "resolved"]);
});

test("se revisa cada clave obligatoria del reporte", () => {
  for (const key of Object.keys(report)) {
    const missing: Record<string, unknown> = { ...report }; delete missing[key];
    assert.equal(validateReport(missing).valid, false, key);
  }
});

test("las formas del estado privado de confirmación cubren los casos habilitado, autor y confirmación existente", () => {
  for (const item of MY_CONFIRMATION_FIXTURES) assert.equal(validateMyConfirmation(item).valid, true);
  assert.equal(validateConfirmReportRequest({}).valid, true);
  assert.equal(validateConfirmReportRequest({ userId: report.id }).valid, false);
  assert.equal(validateConfirmReportRequest(null).valid, false);
  assert.equal(validateMyConfirmation({ ...MY_CONFIRMATION_FIXTURES[1], canConfirm: true }).valid, false);
  assert.equal(validateMyConfirmation({ ...MY_CONFIRMATION_FIXTURES[2], confirmedAt: null }).valid, false);
  assert.equal(validateMyConfirmation({ ...MY_CONFIRMATION_FIXTURES[0], reason: "already-confirmed" }).valid, false);
  assert.equal(validateConfirmationResult(MY_CONFIRMATION_FIXTURES[0]).valid, false);
  assert.equal(validateConfirmationResult(MY_CONFIRMATION_FIXTURES[2]).valid, true);
});

test("los casos de publicación documentados tienen sobres y códigos válidos; no se ejecuta ningún servicio de publicación", () => {
  for (const item of PUBLICATION_CASES) {
    assert.equal(validateApiResult(item.response, validateReport).valid, true, item.name);
    if (item.response.error) assert.equal(ERROR_STATUS[item.response.error.code], item.status);
  }
  assert.equal(PUBLICATION_CASES[0].response.data?.id, PUBLICATION_CASES[1].response.data?.id);
});

test("los casos de confirmación documentados tienen formas válidas, no son evidencia de concurrencia en la base de datos", () => {
  for (const item of CONFIRMATION_CASES) {
    assert.equal(validateApiResult(item.response, (value) => validateConfirmationResult(value, { allowInstitutionalSimulation: item.simulation === true })).valid, true, item.name);
    if (item.response.error) assert.equal(ERROR_STATUS[item.response.error.code], item.status);
    if (item.response.data) assert.equal(item.response.data.confirmed, true);
    if (item.simulation) assert.match(item.name, /Simulación - sin aval municipal/);
  }
});

test("las colecciones de fixtures no comparten referencias a objetos mutables", () => {
  const roots = {
    REPORT_FIELDS_FIXTURES, REPORT_FIXTURES, VERIFICATION_FIXTURES,
    INSTITUTIONAL_SIMULATIONS, SUGGESTION_FIXTURES, EMPTY_LIST_FIXTURE,
    REPORT_LIST_FIXTURE, MY_CONFIRMATION_FIXTURES, PUBLICATION_CASES,
    CONFIRMATION_CASES, ANALYSIS_ERROR_CASES,
  };
  const seen = new WeakMap<object, string>();
  function visit(value: unknown, path: string) {
    if (value === null || typeof value !== "object") return;
    assert.equal(seen.has(value), false, `Shared object at ${path}; first seen at ${seen.get(value)}`);
    seen.set(value, path);
    for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
  }
  visit(roots, "fixtures");
});

test("editar los ejemplos de origen no altera otros escenarios ni sus valores anidados", () => {
  const before = cloneFixture({ reports: REPORT_FIXTURES, verification: VERIFICATION_FIXTURES,
    simulations: INSTITUTIONAL_SIMULATIONS, list: REPORT_LIST_FIXTURE,
    confirmations: MY_CONFIRMATION_FIXTURES, publications: PUBLICATION_CASES,
    confirmationCases: CONFIRMATION_CASES });
  const latitude = REPORT_FIELDS_FIXTURES[0].location.latitude;
  const url = REPORT_FIXTURES[0].photo.url;
  try {
    REPORT_FIELDS_FIXTURES[0].location.latitude = 88;
    assert.deepEqual(REPORT_FIXTURES, before.reports);
    REPORT_FIXTURES[0].photo.url = "https://example.invalid/edited.jpg";
    assert.deepEqual(VERIFICATION_FIXTURES, before.verification);
    assert.deepEqual(INSTITUTIONAL_SIMULATIONS, before.simulations);
    assert.deepEqual(REPORT_LIST_FIXTURE, before.list);
    assert.deepEqual(MY_CONFIRMATION_FIXTURES, before.confirmations);
    assert.deepEqual(PUBLICATION_CASES, before.publications);
    assert.deepEqual(CONFIRMATION_CASES, before.confirmationCases);
  } finally {
    REPORT_FIELDS_FIXTURES[0].location.latitude = latitude;
    REPORT_FIXTURES[0].photo.url = url;
  }
});

test("los consumidores pueden clonar un fixture para tener borradores editables independientes", () => {
  const first = cloneFixture(report);
  const second = cloneFixture(report);
  first.location.latitude = 88;
  first.photo.url = "https://example.invalid/edited.jpg";
  first.citizenVerification.confirmationCount = 77;
  assert.deepEqual(second, report);
  assert.notEqual(first.location.latitude, second.location.latitude);
  const warningDraft = cloneFixture(SUGGESTION_FIXTURES.at(-1)!);
  warningDraft.suggestion.warnings.push("Aclaración del ejemplo editado.");
  assert.equal(SUGGESTION_FIXTURES.at(-1)!.suggestion.warnings.length, 1);
});

test("los fixtures de falla, no disponibilidad y tiempo agotado de Gemini coinciden con los sobres de error sin llamar al proveedor", () => {
  assert.deepEqual(ANALYSIS_ERROR_CASES.map((item) => item.response.error?.code), ["ANALYSIS_FAILED", "ANALYSIS_UNAVAILABLE", "ANALYSIS_TIMEOUT"]);
  assert.deepEqual(ANALYSIS_ERROR_CASES.map((item) => item.status), [502, 503, 504]);
  for (const item of ANALYSIS_ERROR_CASES) {
    assert.equal(validateApiResult(item.response, validateAnalyzeImageResponse).valid, true);
    assert.ok(item.response.error);
    assert.equal(ERROR_STATUS[item.response.error.code], item.status);
    assert.equal(Object.hasOwn(item.response, "data"), false);
    assert.deepEqual(Object.keys(item.response.error).sort(), ["code", "message"]);
  }
});

test("los estados institucionales de confirmación requieren validación explícita de simulación futura", () => {
  assert.deepEqual(MVP_REPORT_STAGES, ["pending", "citizen-verification"]);
  assert.deepEqual(FUTURE_INSTITUTIONAL_STAGES, ["municipal-verification", "resolved"]);
  for (const status of FUTURE_INSTITUTIONAL_STAGES) {
    const example = { ...cloneFixture(MY_CONFIRMATION_FIXTURES[3]), status,
      reason: status === "resolved" ? "resolved" : "already-confirmed" };
    assert.equal(validateMyConfirmation(example).valid, false);
    assert.equal(validateConfirmationResult(example).valid, false);
    assert.equal(validateMyConfirmation(example, { allowInstitutionalSimulation: true }).valid, true);
    assert.equal(validateConfirmationResult(example, { allowInstitutionalSimulation: true }).valid, true);
  }
});

test("los sobres de error y de éxito son excluyentes y rechazan campos adicionales o privados", () => {
  assert.equal(validateApiResult({ data: report }, validateReport).valid, true);
  assert.equal(validateApiResult({ error: { code: "REPORT_NOT_FOUND", message: "No se encontró el reporte." } }, validateReport).valid, true);
  for (const candidate of [{}, { data: report, error: {} }, { data: report, debug: "private" }]) assert.equal(validateApiResult(candidate, validateReport).valid, false);
  assert.equal(validateApiError({ code: "INTERNAL_ERROR", message: "Error.", stack: "private" }).valid, false);
  assert.equal(validateApiError({ code: "constructor", message: "Error." }).valid, false);
  assert.equal(validateApiError({ code: "VALIDATION_ERROR", message: "Revisá los datos.", fieldErrors: { title: ["Ingresá un título."] } }).valid, true);
});

test("el parseo de la consulta de lista valida parámetros, claves repetidas y límites geométricos", () => {
  const parsed = parseReportListQuery(new URLSearchParams("categoryId=pothole&bbox=-61,-33,-60,-32&limit=10"));
  assert.equal(parsed.valid, true);
  if (parsed.valid) assert.equal(parsed.value.limit, 10);
  assert.deepEqual(validateReportListQuery({}), { valid: true, value: { limit: 50 } });
  for (const query of ["limit=0", "limit=101", "limit=1.5", "limit=", "limit=2&limit=3", "authorId=x", "categoryId=other", "status=open", "bbox=-60,-33,-61,-32", "bbox=,0,1,2", "bbox=-181,0,1,2", "bbox=0,0,1,91"]) {
    assert.equal(parseReportListQuery(new URLSearchParams(query)).valid, false, query);
  }
});

test("la validación del cursor opaco vincula la versión, la última tupla y los filtros", () => {
  assert.equal(validateReportListQuery({ cursor: cursorFor() }).valid, true);
  assert.equal(validateReportListQuery({ categoryId: "pothole", cursor: cursorFor({ categoryId: "pothole" }) }).valid, true);
  assert.equal(validateReportListQuery({ categoryId: "missing-light", cursor: cursorFor({ categoryId: "pothole" }) }).valid, false);
  for (const cursor of ["bad!", "x".repeat(4097), cursorFor({}, { version: 2 }), cursorFor({}, { id: "bad" })]) assert.equal(validateReportListQuery({ cursor }).valid, false);
});

test("los bounding boxes numéricamente equivalentes usan una forma canónica y el mismo cursor", () => {
  const forms = ["0,0,1,1", "0.0,0.00,1.0,1.00", "-0,+0,1e0,1", " 0 , 0 , 1 , 1 "];
  for (const bound of forms) for (const requested of forms) {
    const input = { bbox: requested, cursor: cursorFor({ bbox: bound }) };
    const parsed = validateReportListQuery(input);
    assert.equal(parsed.valid, true, `${requested} bound to ${bound}`);
    if (parsed.valid) assert.equal(parsed.value.bbox, "0,0,1,1");
    assert.equal(input.bbox, requested, "input should not be mutated");
  }
  const parsed = parseReportListQuery(new URLSearchParams({ bbox: "0.0,0,1,1", cursor: cursorFor({ bbox: "0,0,1,1" }) }));
  assert.equal(parsed.valid, true);
  if (parsed.valid) assert.equal(parsed.value.bbox, "0,0,1,1");
  assert.equal(validateReportList({ items: [], nextCursor: cursorFor({ bbox: forms[2] }) }).valid, true);
});

test("la normalización del bbox conserva el rango, la vinculación con los filtros y la validación del cursor", () => {
  for (const bbox of ["0,0,Infinity,1", "0,0,NaN,1", "0,0,,1", "0,0,0,1", "0,0,1,0", "-181,0,1,1", "0,-91,1,1", "0,0,181,1", "0,0,1,91", "0,0,1", "0,0,1,1,2"]) {
    assert.equal(validateReportListQuery({ bbox }).valid, false, bbox);
    assert.equal(validateReportListQuery({ bbox: "0,0,1,1", cursor: cursorFor({ bbox }) }).valid, false, bbox);
  }
  assert.equal(validateReportListQuery({ bbox: "0,0,1.000000000000001,1", cursor: cursorFor({ bbox: "0,0,1,1" }) }).valid, false, "distinct coordinates must not be rounded together");
  assert.equal(validateReportListQuery({ bbox: "0,0,1,1", cursor: cursorFor() }).valid, false);
  assert.equal(validateReportListQuery({ cursor: cursorFor({ bbox: "0,0,1,1" }) }).valid, false);
  assert.equal(validateReportListQuery({ bbox: "0,0,1,1", categoryId: "pothole", cursor: cursorFor({ bbox: "0.0,0,1,1", categoryId: "missing-light" }) }).valid, false);
  assert.equal(validateReportListQuery({ bbox: "0,0,1,1", cursor: cursorFor({ bbox: "0,0,1,1", privateField: true }) }).valid, false);
  assert.equal(parseReportListQuery(new URLSearchParams("bbox=0,0,1,1&bbox=0.0,0,1,1")).valid, false);
});

test("los sobres de lista incluyen reportes públicos válidos, nextCursor y ejemplos vacíos", () => {
  assert.equal(validateReportList(EMPTY_LIST_FIXTURE).valid, true);
  assert.equal(validateReportList(REPORT_LIST_FIXTURE).valid, true);
  assert.equal(validateReportList({ items: [report] }).valid, false);
  assert.equal(validateReportList({ items: [{ ...report, email: "private" }], nextCursor: null }).valid, false);
  assert.equal(validateReportList({ items: [], nextCursor: cursorFor() }).valid, true);
  assert.equal(validateReportList({ items: [], nextCursor: "x" }).valid, false);
});

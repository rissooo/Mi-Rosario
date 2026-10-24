import assert from "node:assert/strict";
import test from "node:test";
import { REPORT_FIELDS_FIXTURES } from "../../../lib/contracts/fixtures";
import { validateReport } from "../../../lib/contracts/validation";
import { listReports } from "../map/report-source";
import { fieldForErrorPath, groupFieldErrors, randomUuid } from "./form-helpers";
import { fitWithin, MAX_PHOTO_SIDE } from "./photo-size";
import { parseSimulatedFailure, publishReport } from "./report-publisher";
import { draftReducer, emptyDraft, hasDraftData, toReportFields } from "./report-draft";
import { changesFromVisionSuggestion } from "./vision-suggestion";
import { geolocationOutcome } from "./geolocation-outcome";
import { validateReportFields } from "../../../lib/contracts/validation";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fields = { ...REPORT_FIELDS_FIXTURES[0], title: "Bache en Córdoba", description: "Bache profundo frente al número 1250." };
const photo = (bytes = 2048) => new File([new Uint8Array(bytes)], "foto.jpg", { type: "image/jpeg" });
const now = { delayMs: 0 };

test("fitWithin achica el lado mayor a 2560 px sin agrandar ni deformar", () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 2560, height: 1920 });
  assert.deepEqual(fitWithin(3000, 4000), { width: 1920, height: 2560 });
  assert.deepEqual(fitWithin(5000, 5000), { width: MAX_PHOTO_SIDE, height: MAX_PHOTO_SIDE });
  assert.deepEqual(fitWithin(1200, 900), { width: 1200, height: 900 });
  assert.deepEqual(fitWithin(2560, 1000), { width: 2560, height: 1000 });
});

test("randomUuid genera un UUID v4 con randomUUID y también sin él", () => {
  assert.match(randomUuid(), UUID_V4);
  const withoutRandomUuid = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) };
  const keys = new Set(Array.from({ length: 50 }, () => randomUuid(withoutRandomUuid)));
  assert.equal(keys.size, 50);
  for (const key of keys) assert.match(key, UUID_V4);
});

test("los errores del contrato se asocian al campo del formulario que corresponde", () => {
  assert.equal(fieldForErrorPath("report.title"), "title");
  assert.equal(fieldForErrorPath("report.location.address.street"), "street");
  assert.equal(fieldForErrorPath("report.location.address.number"), "number");
  assert.equal(fieldForErrorPath("report.location.latitude"), "location");
  assert.equal(fieldForErrorPath("image.size"), "photo");
  assert.equal(fieldForErrorPath("report.reviewed"), "general");
  assert.deepEqual(groupFieldErrors({ "report.title": ["a"], "image": ["b"], "image.type": ["c"] }), { title: ["a"], photo: ["b", "c"] });
});

test("una publicación válida devuelve 201 con un reporte válido que aparece en el mapa", async () => {
  const result = await publishReport({ report: fields, image: photo(), idempotencyKey: randomUuid() }, now);
  assert.equal(result.status, 201);
  assert.ok(result.body.data);
  assert.equal(validateReport(result.body.data).valid, true);
  assert.equal(result.body.data.status, "pending");
  assert.deepEqual(result.body.data.location.address, fields.location.address);
  const { latitude, longitude } = result.body.data.location;
  const list = await listReports({ bbox: `${longitude - 0.001},${latitude - 0.001},${longitude + 0.001},${latitude + 0.001}` });
  assert.ok(list.items.some((report) => report.id === result.body.data?.id));
});

test("repetir la misma clave con los mismos datos devuelve 200 y el mismo reporte", async () => {
  const idempotencyKey = randomUuid();
  const first = await publishReport({ report: fields, image: photo(), idempotencyKey }, now);
  const replay = await publishReport({ report: fields, image: photo(), idempotencyKey }, now);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.data?.id, first.body.data?.id);
});

test("la misma clave con otros datos devuelve 409 IDEMPOTENCY_CONFLICT", async () => {
  const idempotencyKey = randomUuid();
  await publishReport({ report: fields, image: photo(), idempotencyKey }, now);
  const changed = await publishReport({ report: { ...fields, title: "Otro título distinto" }, image: photo(), idempotencyKey }, now);
  assert.equal(changed.status, 409);
  assert.equal(changed.body.error?.code, "IDEMPOTENCY_CONFLICT");
});

test("los datos inválidos devuelven 422 con errores de campo en español", async () => {
  const result = await publishReport({ report: { ...fields, title: "abc" }, image: photo(0), idempotencyKey: randomUuid() }, now);
  assert.equal(result.status, 422);
  const grouped = groupFieldErrors(result.body.error?.fieldErrors);
  assert.ok(grouped.title?.[0]?.startsWith("Ingresá"));
  assert.ok(grouped.photo?.length);
});

test("una clave que no es UUID se rechaza", async () => {
  const result = await publishReport({ report: fields, image: photo(), idempotencyKey: "no-es-uuid" }, now);
  assert.equal(result.status, 422);
});

test("los errores simulados responden con el status y el mensaje del contrato", async () => {
  const cases = [["STORAGE_UNAVAILABLE", 503], ["PUBLICATION_IN_PROGRESS", 409], ["RATE_LIMITED", 429], ["UNAUTHENTICATED", 401]] as const;
  const messages = new Map<string, string | undefined>();
  for (const [code, status] of cases) {
    const result = await publishReport({ report: fields, image: photo(), idempotencyKey: randomUuid() }, { ...now, simulate: code });
    assert.equal(result.status, status, code);
    assert.equal(result.body.error?.code, code);
    assert.ok(result.body.error?.message.length);
    messages.set(code, result.body.error?.message);
  }
  // La cuota de la cuenta no se presenta como una publicación en curso.
  assert.notEqual(messages.get("RATE_LIMITED"), messages.get("PUBLICATION_IN_PROGRESS"));
  assert.equal(parseSimulatedFailure("RATE_LIMITED"), "RATE_LIMITED");
  assert.equal(parseSimulatedFailure("STORAGE_UNAVAILABLE"), "STORAGE_UNAVAILABLE");
  assert.equal(parseSimulatedFailure("cualquier-cosa"), null);
  assert.equal(parseSimulatedFailure(null), null);
});

test("el borrador vacío no tiene datos; con foto, título o dirección sí", () => {
  const empty = emptyDraft();
  assert.equal(hasDraftData(empty), false);
  assert.equal(hasDraftData({ ...empty, point: { latitude: -32.95, longitude: -60.66 } }), false, "el punto solo no cuenta");
  assert.equal(hasDraftData({ ...empty, title: "   " }), false);
  assert.equal(hasDraftData({ ...empty, photo: photo() }), true);
  assert.equal(hasDraftData({ ...empty, title: "Bache" }), true);
  assert.equal(hasDraftData({ ...empty, street: "Córdoba" }), true);
});

test("el reducer cambia solo lo indicado y reset deja un borrador vacío con la clave vacía", () => {
  const filled = draftReducer(emptyDraft(), { type: "set", changes: { title: "Bache", idempotencyKey: randomUuid() } });
  assert.equal(filled.title, "Bache");
  assert.match(filled.idempotencyKey, UUID_V4);
  const changedPoint = draftReducer(filled, { type: "set", changes: { point: { latitude: -32.94, longitude: -60.63 } } });
  assert.equal(changedPoint.title, "Bache", "cambiar el punto no pierde lo cargado");
  assert.equal(changedPoint.idempotencyKey, filled.idempotencyKey);
  const reset = draftReducer(changedPoint, { type: "reset" });
  assert.deepEqual({ ...reset, photo: null }, emptyDraft());
  assert.equal(reset.idempotencyKey, "");
});

test("toReportFields arma campos válidos del contrato, con y sin altura", () => {
  const draft = { ...emptyDraft(), point: { latitude: -32.9477, longitude: -60.6304 }, categoryId: "pothole", severity: "high" as const, title: "Bache frente al Monumento", description: "Bache profundo sobre la calzada.", street: "Santa Fe", number: "581" };
  const withNumber = toReportFields(draft);
  assert.equal(validateReportFields(withNumber).valid, true);
  assert.deepEqual(withNumber.location.address, { street: "Santa Fe", number: 581 });
  const noNumber = toReportFields({ ...draft, noNumber: true, number: "581" });
  assert.equal(noNumber.location.address.number, null);
  assert.equal(validateReportFields(toReportFields({ ...draft, number: "" })).valid, false, "altura vacía sin marcar Sin altura");
});

test("una ubicación fuera de Rosario no mueve el mapa; una imprecisa avisa", () => {
  const monumento = { latitude: -32.9477, longitude: -60.6304 };
  assert.deepEqual(geolocationOutcome(monumento, 20), { move: true, message: null });
  const approximate = geolocationOutcome(monumento, 3000);
  assert.equal(approximate.move, true);
  assert.match(approximate.message ?? "", /aproximada \(±3 km\)/);
  const cordoba = geolocationOutcome({ latitude: -31.4201, longitude: -64.1888 }, 5000);
  assert.equal(cordoba.move, false);
  assert.match(cordoba.message ?? "", /fuera de Rosario/);
  assert.equal(geolocationOutcome({ latitude: -32.915, longitude: -60.8 }, 30).move, false, "Funes");
});

test("IA solo completa campos vacíos y nunca reemplaza datos ciudadanos", () => {
  const draft = {
    ...emptyDraft(), title: "Mi título", categoryId: "pothole" as const,
    street: "Córdoba", number: "123", point: { latitude: -32.95, longitude: -60.66 },
  };
  const changes = changesFromVisionSuggestion(draft, {
    title: "Título IA", description: "Se observa un bache profundo en la calle.",
    categoryId: "damaged-sidewalk", severity: "medium", warnings: [],
  });
  assert.deepEqual(changes, { description: "Se observa un bache profundo en la calle.", severity: "medium" });
  const merged = { ...draft, ...changes };
  assert.equal(merged.title, "Mi título");
  assert.equal(merged.categoryId, "pothole");
  assert.deepEqual(merged.point, draft.point);
  assert.equal(merged.street, "Córdoba");
  assert.equal(merged.number, "123");
});

test("IA permite sugerencias parciales o sin certeza sin cambiar el borrador", () => {
  const draft = emptyDraft();
  const changes = changesFromVisionSuggestion(draft, {
    title: null, description: null, categoryId: null, severity: null,
    warnings: ["La foto no demuestra una falla de semáforo."],
  });
  assert.deepEqual(changes, {});
});

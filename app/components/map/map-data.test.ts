import assert from "node:assert/strict";
import test from "node:test";
import { FUTURE_INSTITUTIONAL_STAGES, SEVERITIES } from "../../../lib/contracts/reports";
import { INITIAL_CATEGORIES } from "../../../lib/contracts/categories";
import { validateReport, validateReportList } from "../../../lib/contracts/validation";
import { addPublishedSampleReport, listReports, loadAllReportsInBbox, ReportSourceError, toBbox } from "./report-source";
import { isInsideRosario } from "./rosario-boundary";
import { SAMPLE_REPORTS } from "./sample-reports";

const ROSARIO_BBOX = "-60.8,-33.05,-60.55,-32.85";

test("los reportes de ejemplo son reportes válidos del MVP y cubren todas las categorías y gravedades", () => {
  for (const report of SAMPLE_REPORTS) assert.equal(validateReport(report).valid, true, report.id);
  assert.equal(new Set(SAMPLE_REPORTS.map((report) => report.id)).size, SAMPLE_REPORTS.length);
  for (const category of INITIAL_CATEGORIES) assert.ok(SAMPLE_REPORTS.some((report) => report.categoryId === category.id), category.id);
  for (const severity of SEVERITIES) assert.ok(SAMPLE_REPORTS.some((report) => report.severity === severity), severity);
  assert.ok(SAMPLE_REPORTS.some((report) => report.status === "pending"));
  assert.ok(SAMPLE_REPORTS.some((report) => report.status === "citizen-verification"));
  assert.ok(SAMPLE_REPORTS.some((report) => report.citizenVerification.threshold !== 3));
  assert.ok(SAMPLE_REPORTS.some((report) => report.location.address.number === null), "un lugar sin altura");
});

test("los reportes de ejemplo están dentro del límite municipal de Rosario", () => {
  for (const report of SAMPLE_REPORTS) {
    const { latitude, longitude } = report.location;
    assert.ok(isInsideRosario(latitude, longitude), report.title);
  }
  assert.equal(isInsideRosario(-33.0, -60.77), false, "Pérez queda afuera");
  assert.equal(isInsideRosario(-32.915, -60.8), false, "Funes queda afuera");
});

test("los reportes de ejemplo nunca tienen etapas institucionales", () => {
  for (const report of SAMPLE_REPORTS) {
    assert.ok(!FUTURE_INSTITUTIONAL_STAGES.some((stage) => stage === report.status), report.id);
    assert.equal(report.institutionalVerification.availability, "unavailable");
    assert.equal(report.resolvedAt, null);
  }
});

test("listReports filtra por bbox, incluidos los reportes en el borde", async () => {
  const target = SAMPLE_REPORTS[0];
  const { latitude, longitude } = target.location;
  const border = await listReports({ bbox: `${longitude},${latitude},${longitude + 0.001},${latitude + 0.001}` });
  assert.deepEqual(border.items.map((report) => report.id), [target.id]);

  const all = await listReports({ bbox: ROSARIO_BBOX });
  assert.equal(all.items.length, SAMPLE_REPORTS.length);
  assert.equal(all.nextCursor, null);
});

test("listReports devuelve una lista vacía fuera de Rosario", async () => {
  const empty = await listReports({ bbox: "10,10,11,11" });
  assert.deepEqual(empty, { items: [], nextCursor: null });
});

test("listReports rechaza consultas inválidas con errores de campo en español", async () => {
  await assert.rejects(listReports({ bbox: "1,1,0,0" }), (error: unknown) => {
    assert.ok(error instanceof ReportSourceError);
    assert.equal(error.apiError.code, "VALIDATION_ERROR");
    assert.ok(error.apiError.fieldErrors?.bbox?.[0]?.startsWith("Ingresá"));
    return true;
  });
});

test("las páginas usan el cursor del contrato y validan como ReportList", async () => {
  const first = await listReports({ bbox: ROSARIO_BBOX, limit: 5 });
  assert.equal(first.items.length, 5);
  assert.ok(first.nextCursor);
  assert.equal(validateReportList(first).valid, true);
  const second = await listReports({ bbox: ROSARIO_BBOX, limit: 5, cursor: first.nextCursor });
  assert.equal(second.items.length, 5);
  assert.ok(second.items.every((report) => !first.items.some((seen) => seen.id === report.id)));
});

test("un cursor no se puede reutilizar con otros filtros", async () => {
  const first = await listReports({ bbox: ROSARIO_BBOX, limit: 5 });
  await assert.rejects(listReports({ bbox: "-61,-34,-60,-32", limit: 5, cursor: first.nextCursor ?? undefined }), ReportSourceError);
});

test("loadAllReportsInBbox recorre todas las páginas sin perder ni duplicar reportes", async () => {
  const reports = await loadAllReportsInBbox(ROSARIO_BBOX, 5);
  assert.equal(reports.length, SAMPLE_REPORTS.length);
  assert.equal(new Set(reports.map((report) => report.id)).size, SAMPLE_REPORTS.length);
});

test("un reporte publicado en el modo de ejemplo aparece en el área que lo contiene", async () => {
  const published = { ...SAMPLE_REPORTS[0], id: "40000000-0000-4000-8000-000000000001", title: "Reporte publicado de prueba" };
  addPublishedSampleReport(published);
  const { latitude, longitude } = published.location;
  const inside = await listReports({ bbox: `${longitude - 0.001},${latitude - 0.001},${longitude + 0.001},${latitude + 0.001}` });
  assert.ok(inside.items.some((report) => report.id === published.id));
  const outside = await listReports({ bbox: "10,10,11,11" });
  assert.ok(!outside.items.some((report) => report.id === published.id));
});

test("toBbox recorta a rangos válidos los límites del área visible que dan la vuelta", () => {
  assert.equal(toBbox({ west: -200, south: -95, east: 200, north: 95 }), "-180,-90,180,90");
  assert.equal(toBbox({ west: -60.7, south: -33, east: -60.6, north: -32.9 }), "-60.7,-33,-60.6,-32.9");
});

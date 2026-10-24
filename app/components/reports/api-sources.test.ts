import assert from "node:assert/strict";
import test from "node:test";
import { cloneFixture, MY_CONFIRMATION_FIXTURES, REPORT_FIELDS_FIXTURES, REPORT_FIXTURES } from "../../../lib/contracts/fixtures";
import { listReports, ReportSourceError } from "../map/report-source";
import { confirmReport, getMyConfirmation } from "./confirmation-source";
import { publishReport } from "./report-publisher";

// El runner activa el modo de ejemplo para los otros tests; acá se prueban las fuentes reales.
process.env.NEXT_PUBLIC_REPORTS_SAMPLE_MODE = "0";

type Call = { url: string; init: RequestInit };
const calls: Call[] = [];

function respondWith(status: number, body: unknown) {
  calls.length = 0;
  globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

const report = { ...cloneFixture(REPORT_FIXTURES[0]), photo: { ...cloneFixture(REPORT_FIXTURES[0].photo), expiresAt: null } };
const fields = cloneFixture(REPORT_FIELDS_FIXTURES[0]);
const image = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "foto.jpg", { type: "image/jpeg" });
const idempotencyKey = "20000000-0000-4000-8000-000000000002";

test("listReports pide GET /api/reports sin caché y devuelve la lista validada", async () => {
  respondWith(200, { data: { items: [report], nextCursor: null } });
  const list = await listReports({ bbox: "-60.8,-33.1,-60.5,-32.8", limit: 5 });
  assert.equal(list.items[0].id, report.id);
  assert.equal(list.items[0].photo.expiresAt, null);
  const url = new URL(calls[0].url, "http://localhost");
  assert.equal(url.pathname, "/api/reports");
  assert.equal(url.searchParams.get("bbox"), "-60.8,-33.1,-60.5,-32.8");
  assert.equal(url.searchParams.get("limit"), "5");
  assert.equal(calls[0].init.cache, "no-store");
});

test("listReports trata una lista fuera del contrato como error, no como datos", async () => {
  respondWith(200, { data: { items: [{ ...report, title: "" }], nextCursor: null } });
  await assert.rejects(listReports({}), (error: unknown) =>
    error instanceof ReportSourceError && error.apiError.code === "INTERNAL_ERROR");
});

test("listReports respeta el error del servidor", async () => {
  respondWith(422, { error: { code: "VALIDATION_ERROR", message: "Revisá los filtros." } });
  await assert.rejects(listReports({}), (error: unknown) =>
    error instanceof ReportSourceError && error.apiError.code === "VALIDATION_ERROR" && error.apiError.message === "Revisá los filtros.");
});

test("publishReport manda multipart con report, image e Idempotency-Key", async () => {
  respondWith(201, { data: report });
  const result = await publishReport({ report: fields, image, idempotencyKey });
  assert.equal(result.status, 201);
  assert.equal(result.body.data?.id, report.id);
  assert.equal(calls[0].url, "/api/reports");
  assert.equal(calls[0].init.method, "POST");
  assert.equal((calls[0].init.headers as Record<string, string>)["Idempotency-Key"], idempotencyKey);
  assert.equal(Object.keys(calls[0].init.headers as Record<string, string>).some((name) => name.toLowerCase() === "content-type"), false);
  const body = calls[0].init.body as FormData;
  assert.deepEqual(JSON.parse(String(body.get("report"))), fields);
  assert.equal((body.get("image") as File).size, image.size);
});

test("publishReport muestra la cuota con el mensaje del servidor", async () => {
  respondWith(429, { error: { code: "RATE_LIMITED", message: "Alcanzaste el máximo de reportes para las últimas 24 horas." } });
  const result = await publishReport({ report: fields, image, idempotencyKey });
  assert.equal(result.status, 429);
  assert.equal(result.body.error?.code, "RATE_LIMITED");
  assert.match(result.body.error?.message ?? "", /24 horas/);
});

test("publishReport conserva los errores por campo del servidor", async () => {
  respondWith(422, { error: { code: "VALIDATION_ERROR", message: "Revisá los datos.", fieldErrors: { title: ["Muy corto."] } } });
  const result = await publishReport({ report: fields, image, idempotencyKey });
  assert.deepEqual(result.body.error?.fieldErrors, { title: ["Muy corto."] });
});

test("un error sin la forma del contrato se muestra como falla genérica", async () => {
  respondWith(502, { mensaje: "gateway" });
  const result = await publishReport({ report: fields, image, idempotencyKey });
  assert.equal(result.body.error?.code, "INTERNAL_ERROR");
  assert.equal(result.body.error?.message, "No se pudo publicar el reporte. Reintentá en un rato.");
});

test("getMyConfirmation consulta /confirmations/me sin caché", async () => {
  respondWith(200, { data: MY_CONFIRMATION_FIXTURES[0] });
  const result = await getMyConfirmation(report.id);
  assert.equal(result.body.data?.canConfirm, true);
  assert.equal(calls[0].url, `/api/reports/${report.id}/confirmations/me`);
  assert.equal(calls[0].init.cache, "no-store");
});

test("confirmReport manda POST con {} y devuelve lo que informa el servidor", async () => {
  respondWith(201, { data: MY_CONFIRMATION_FIXTURES[2] });
  const result = await confirmReport(report.id);
  assert.equal(result.status, 201);
  assert.equal(result.body.data?.confirmed, true);
  assert.equal(calls[0].url, `/api/reports/${report.id}/confirmations`);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body, "{}");
});

test("una confirmación fuera del contrato se trata como falla temporal", async () => {
  respondWith(200, { data: { ...MY_CONFIRMATION_FIXTURES[0], canConfirm: "sí" } });
  const result = await getMyConfirmation(report.id);
  assert.equal(result.body.error?.code, "INTERNAL_ERROR");
});

test("el autor recibe el error del servidor tal cual", async () => {
  respondWith(403, { error: { code: "AUTHOR_CANNOT_CONFIRM", message: "No podés confirmar tu propio reporte." } });
  const result = await confirmReport(report.id);
  assert.equal(result.status, 403);
  assert.equal(result.body.error?.code, "AUTHOR_CANNOT_CONFIRM");
});

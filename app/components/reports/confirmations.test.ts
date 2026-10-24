import assert from "node:assert/strict";
import test from "node:test";
import { validateConfirmationResult, validateMyConfirmation } from "../../../lib/contracts/validation";
import { addPublishedSampleReport, findSampleReport, listReports, updateSampleReport } from "../map/report-source";
import { SAMPLE_REPORTS } from "../map/sample-reports";
import { confirmReport, getMyConfirmation, parseSimulatedConfirmationFailure } from "./confirmation-source";

const now = { delayMs: 0 };
const ROSARIO_BBOX = "-60.8,-33.05,-60.55,-32.85";
const pendingSamples = SAMPLE_REPORTS.filter((report) => report.status === "pending");

test("confirmar de 1 a 2 de 3 suma una y la etapa sigue pendiente", async () => {
  const report = pendingSamples.find((entry) => entry.citizenVerification.confirmationCount === 0);
  assert.ok(report);
  updateSampleReport(report.id, { status: "pending", citizenVerification: { ...report.citizenVerification, confirmationCount: 1 } });

  const before = await getMyConfirmation(report.id, now);
  assert.equal(before.status, 200);
  assert.equal(before.body.data?.canConfirm, true);
  assert.equal(before.body.data?.reason, null);

  const result = await confirmReport(report.id, now);
  assert.equal(result.status, 201);
  assert.equal(result.body.data?.citizenVerification.confirmationCount, 2);
  assert.equal(result.body.data?.status, "pending");
  assert.equal(result.body.data?.reason, "already-confirmed");
  assert.equal(validateConfirmationResult(result.body.data).valid, true);
});

test("la confirmación que alcanza el umbral pasa el reporte a verificación ciudadana, también en el mapa", async () => {
  const report = pendingSamples.find((entry) => entry.citizenVerification.confirmationCount === 2);
  assert.ok(report, "hay un ejemplo a una confirmación del umbral");
  const result = await confirmReport(report.id, now);
  assert.equal(result.status, 201);
  assert.equal(result.body.data?.status, "citizen-verification");
  assert.deepEqual(result.body.data?.citizenVerification, { ...report.citizenVerification, confirmationCount: 3, corroborated: true });

  const listed = (await listReports({ bbox: ROSARIO_BBOX })).items.find((entry) => entry.id === report.id);
  assert.equal(listed?.status, "citizen-verification");
  assert.equal(listed?.citizenVerification.confirmationCount, 3);
});

test("se respeta el umbral del reporte y no un 3 fijo", async () => {
  const report = SAMPLE_REPORTS.find((entry) => entry.citizenVerification.threshold === 5);
  assert.ok(report);
  updateSampleReport(report.id, { status: "pending", citizenVerification: { ...report.citizenVerification, confirmationCount: 3, corroborated: false } });
  const result = await confirmReport(report.id, now);
  assert.equal(result.status, 201);
  assert.equal(result.body.data?.citizenVerification.confirmationCount, 4);
  assert.equal(result.body.data?.citizenVerification.threshold, 5);
  assert.equal(result.body.data?.status, "pending");
});

test("repetir la confirmación devuelve 200 sin sumar", async () => {
  const report = pendingSamples.find((entry) => entry.citizenVerification.confirmationCount === 0 && findSampleReport(entry.id)?.citizenVerification.confirmationCount === 0);
  assert.ok(report);
  const first = await confirmReport(report.id, now);
  const replay = await confirmReport(report.id, now);
  assert.equal(first.status, 201);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.body.data?.citizenVerification, first.body.data?.citizenVerification);
  const mine = await getMyConfirmation(report.id, now);
  assert.equal(mine.body.data?.confirmed, true);
  assert.equal(mine.body.data?.canConfirm, false);
  assert.equal(mine.body.data?.reason, "already-confirmed");
});

test("quien publicó el reporte no puede confirmarlo", async () => {
  const published = { ...SAMPLE_REPORTS[0], id: "50000000-0000-4000-8000-000000000001", status: "pending" as const,
    citizenVerification: { confirmationCount: 0, threshold: 3, policyStatus: "approved" as const, corroborated: false } };
  addPublishedSampleReport(published);
  const mine = await getMyConfirmation(published.id, now);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.data?.reason, "author");
  assert.equal(mine.body.data?.canConfirm, false);
  const result = await confirmReport(published.id, now);
  assert.equal(result.status, 403);
  assert.equal(result.body.error?.code, "AUTHOR_CANNOT_CONFIRM");
  assert.equal(result.body.error?.message, "No podés confirmar tu propio reporte.");
  assert.equal(findSampleReport(published.id)?.citizenVerification.confirmationCount, 0);
});

test("un reporte inexistente responde 404 en la consulta y en la confirmación", async () => {
  const missing = "50000000-0000-4000-8000-00000000ffff";
  const mine = await getMyConfirmation(missing, now);
  const result = await confirmReport(missing, now);
  assert.equal(mine.status, 404);
  assert.equal(result.status, 404);
  assert.equal(result.body.error?.message, "No se encontró el reporte.");
});

test("los errores simulados responden con el status del contrato y un mensaje en español, sin sumar", async () => {
  const report = SAMPLE_REPORTS[SAMPLE_REPORTS.length - 1];
  const before = findSampleReport(report.id)?.citizenVerification.confirmationCount;
  const cases = [["UNAUTHENTICATED", 401], ["REPORT_NOT_FOUND", 404], ["INTERNAL_ERROR", 500]] as const;
  for (const [code, status] of cases) {
    const result = await confirmReport(report.id, { ...now, simulate: code });
    assert.equal(result.status, status, code);
    assert.equal(result.body.error?.code, code);
    assert.ok(result.body.error?.message.length);
  }
  assert.equal(findSampleReport(report.id)?.citizenVerification.confirmationCount, before);
  assert.equal(parseSimulatedConfirmationFailure("INTERNAL_ERROR"), "INTERNAL_ERROR");
  assert.equal(parseSimulatedConfirmationFailure("STORAGE_UNAVAILABLE"), null);
  assert.equal(parseSimulatedConfirmationFailure(null), null);
});

test("todas las consultas exitosas cumplen el contrato de MyConfirmation", async () => {
  for (const report of SAMPLE_REPORTS) {
    const mine = await getMyConfirmation(report.id, now);
    assert.equal(mine.status, 200, report.title);
    assert.equal(validateMyConfirmation(mine.body.data).valid, true, report.title);
  }
});

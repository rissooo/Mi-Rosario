import assert from "node:assert/strict";
import test from "node:test";
import { validateApiResult, validateReportList } from "../lib/contracts/validation";
import { parseReportsListRequest } from "../lib/reports/list-query";

test("la ruta de lista acepta parámetros válidos normalizados por el contrato", () => {
  const parsed = parseReportsListRequest(new URLSearchParams("categoryId=pothole&bbox=-61,-33,-60,-32&limit=10"));

  assert.deepEqual(parsed, {
    valid: true,
    query: { categoryId: "pothole", bbox: "-61,-33,-60,-32", limit: 10 },
  });
});

test("la ruta rechaza parámetros repetidos con el sobre de error del contrato", () => {
  const parsed = parseReportsListRequest(new URLSearchParams("limit=10&limit=20"));

  assert.equal(parsed.valid, false);
  if (!parsed.valid) {
    assert.equal(parsed.httpStatus, 422);
    assert.ok(parsed.result.error);
    assert.equal(parsed.result.error.code, "VALIDATION_ERROR");
    assert.ok(parsed.result.error.fieldErrors?.limit);
    assert.equal(validateApiResult(parsed.result, validateReportList).valid, true);
  }
});

test("la ruta rechaza parámetros desconocidos con el sobre de error del contrato", () => {
  const parsed = parseReportsListRequest(new URLSearchParams("admin=true"));

  assert.equal(parsed.valid, false);
  if (!parsed.valid) {
    assert.equal(parsed.httpStatus, 422);
    assert.ok(parsed.result.error?.fieldErrors?.admin);
    assert.equal(validateApiResult(parsed.result, validateReportList).valid, true);
  }
});

test("la ruta rechaza valores numéricos parciales en limit", () => {
  const parsed = parseReportsListRequest(new URLSearchParams("limit=10abc"));

  assert.equal(parsed.valid, false);
  if (!parsed.valid) {
    assert.equal(parsed.httpStatus, 422);
    assert.ok(parsed.result.error?.fieldErrors?.limit);
    assert.equal(validateApiResult(parsed.result, validateReportList).valid, true);
  }
});

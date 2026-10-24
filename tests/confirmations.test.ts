import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateConfirmationResult, validateMyConfirmation } from "../lib/contracts/validation";
import { confirmReport, getMyConfirmation } from "../lib/reports/confirmations";

const reportId = "10000000-0000-4000-8000-000000000001";
const nowIso = "2026-10-22T15:30:00.000Z";

test("confirmReport maps successful first confirmation and validates contract", async () => {
  const mockSupabase = {
    rpc: async () => ({
      data: {
        success: true,
        code: "CONFIRMED",
        confirmed: true,
        confirmedAt: nowIso,
        confirmationCount: 1,
        threshold: 3,
        status: "pending",
      },
      error: null,
    }),
  } as unknown as SupabaseClient;

  const res = await confirmReport(mockSupabase, reportId);
  assert.equal(res.httpStatus, 201);
  assert.ok(res.result.data);
  const validation = validateConfirmationResult(res.result.data);
  assert.equal(validation.valid, true);
  if (res.result.data) {
    assert.equal(res.result.data.confirmed, true);
    assert.equal(res.result.data.citizenVerification.confirmationCount, 1);
    assert.equal(res.result.data.citizenVerification.corroborated, false);
  }
});

test("confirmReport maps threshold corroborated confirmation to citizen-verification", async () => {
  const mockSupabase = {
    rpc: async () => ({
      data: {
        success: true,
        code: "CONFIRMED_AND_CORROBORATED",
        confirmed: true,
        confirmedAt: nowIso,
        confirmationCount: 3,
        threshold: 3,
        status: "citizen-verification",
      },
      error: null,
    }),
  } as unknown as SupabaseClient;

  const res = await confirmReport(mockSupabase, reportId);
  assert.equal(res.httpStatus, 201);
  assert.ok(res.result.data);
  const validation = validateConfirmationResult(res.result.data);
  assert.equal(validation.valid, true);
  if (res.result.data) {
    assert.equal(res.result.data.status, "citizen-verification");
    assert.equal(res.result.data.citizenVerification.confirmationCount, 3);
    assert.equal(res.result.data.citizenVerification.corroborated, true);
  }
});

test("confirmReport maps duplicate confirmation to HTTP 200", async () => {
  const mockSupabase = {
    rpc: async () => ({
      data: {
        success: true,
        code: "ALREADY_CONFIRMED",
        confirmed: true,
        confirmedAt: nowIso,
        confirmationCount: 2,
        threshold: 3,
        status: "pending",
      },
      error: null,
    }),
  } as unknown as SupabaseClient;

  const res = await confirmReport(mockSupabase, reportId);
  assert.equal(res.httpStatus, 200);
  assert.ok(res.result.data);
  const validation = validateConfirmationResult(res.result.data);
  assert.equal(validation.valid, true);
});

test("confirmReport maps domain error codes to exact HTTP statuses", async () => {
  const cases = [
    { code: "REPORT_NOT_FOUND", expectedStatus: 404 },
    { code: "AUTHOR_CANNOT_CONFIRM", expectedStatus: 403 },
    { code: "REPORT_RESOLVED", expectedStatus: 409 },
  ];

  for (const c of cases) {
    const mockSupabase = {
      rpc: async () => ({
        data: { success: false, code: c.code },
        error: null,
      }),
    } as unknown as SupabaseClient;

    const res = await confirmReport(mockSupabase, reportId);
    assert.equal(res.httpStatus, c.expectedStatus);
    assert.ok(res.result.error);
    if (res.result.error) {
      assert.equal(res.result.error.code, c.code);
    }
  }
});

test("confirmReport no expone mensajes internos de SQL en el error público", async () => {
  const mockSupabase = {
    rpc: async () => ({ data: null, error: { message: "private_table user_id storage_path function secret_name" } }),
  } as unknown as SupabaseClient;

  const response = await confirmReport(mockSupabase, reportId);
  assert.equal(response.httpStatus, 500);
  assert.equal(response.result.error?.message, "No se pudo confirmar el reporte.");
  assert.doesNotMatch(response.result.error?.message ?? "", /private_table|user_id|storage_path|secret_name/);
});

test("confirmReport no reenvía el mensaje de una respuesta RPC fallida", async () => {
  const mockSupabase = {
    rpc: async () => ({
      data: { success: false, code: "UNEXPECTED", message: "private_table user_id storage_path" },
      error: null,
    }),
  } as unknown as SupabaseClient;

  const response = await confirmReport(mockSupabase, reportId);
  assert.equal(response.httpStatus, 400);
  assert.equal(response.result.error?.message, "No se pudo confirmar el reporte.");
  assert.doesNotMatch(response.result.error?.message ?? "", /private_table|user_id|storage_path/);
});

test("getMyConfirmation usa la RPC y devuelve confirmación, conteo y umbral reales", async () => {
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  const mockSupabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: "user-non-author" } } }),
    },
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return {
        data: {
          success: true,
          status: "pending",
          confirmed: true,
          confirmedAt: nowIso,
          canConfirm: false,
          reason: "already-confirmed",
          confirmationCount: 4,
          threshold: 5,
        },
        error: null,
      };
    },
    from: () => assert.fail("getMyConfirmation no debe consultar tablas directamente"),
  } as unknown as SupabaseClient;

  const res = await getMyConfirmation(mockSupabase, reportId);
  assert.equal(res.httpStatus, 200);
  assert.ok(res.result.data);
  const validation = validateMyConfirmation(res.result.data);
  assert.equal(validation.valid, true);
  if (res.result.data) {
    assert.equal(res.result.data.canConfirm, false);
    assert.equal(res.result.data.confirmed, true);
    assert.equal(res.result.data.confirmedAt, nowIso);
    assert.equal(res.result.data.reason, "already-confirmed");
    assert.equal(res.result.data.citizenVerification.confirmationCount, 4);
    assert.equal(res.result.data.citizenVerification.threshold, 5);
    assert.equal(res.result.data.citizenVerification.corroborated, false);
  }
  assert.deepEqual(rpcCalls, [{ name: "get_my_confirmation", args: { p_report_id: reportId } }]);
});

test("getMyConfirmation conserva elegibilidad con umbral distinto del inicial", async () => {
  const mockSupabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: "user-non-author" } } }),
    },
    rpc: async () => ({
      data: {
        success: true,
        status: "pending",
        confirmed: false,
        confirmedAt: null,
        canConfirm: true,
        reason: null,
        confirmationCount: 2,
        threshold: 5,
      },
      error: null,
    }),
    from: () => assert.fail("getMyConfirmation no debe consultar tablas directamente"),
  } as unknown as SupabaseClient;

  const res = await getMyConfirmation(mockSupabase, reportId);
  assert.equal(res.httpStatus, 200);
  assert.ok(res.result.data);
  const validation = validateMyConfirmation(res.result.data);
  assert.equal(validation.valid, true);
  if (res.result.data) {
    assert.equal(res.result.data.canConfirm, true);
    assert.equal(res.result.data.confirmed, false);
    assert.equal(res.result.data.confirmedAt, null);
    assert.equal(res.result.data.reason, null);
    assert.equal(res.result.data.citizenVerification.threshold, 5);
  }
});

test("getMyConfirmation devuelve 401 y no llama la RPC sin sesión", async () => {
  let rpcCalled = false;
  const mockSupabase = {
    auth: {
      getUser: async () => ({ data: { user: null } }),
    },
    rpc: async () => {
      rpcCalled = true;
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;

  const res = await getMyConfirmation(mockSupabase, reportId);
  assert.equal(res.httpStatus, 401);
  assert.equal(res.result.error?.code, "UNAUTHENTICATED");
  assert.equal(rpcCalled, false);
});

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

test("getMyConfirmation returns eligible status for non-author citizen", async () => {
  const mockSupabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: "user-non-author" } } }),
    },
    from: (table: string) => ({
      select: (fields: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count) {
          return {
            eq: () => ({ count: 1 }),
          };
        }
        return {
          eq: (field: string) => ({
            eq: () => ({ maybeSingle: async () => ({ data: null }) }),
            single: async () => ({
              data: {
                id: reportId,
                user_id: "author-user",
                status: "pending",
              },
              error: null,
            }),
          }),
        };
      },
    }),
  } as unknown as SupabaseClient;

  const res = await getMyConfirmation(mockSupabase, reportId);
  assert.equal(res.httpStatus, 200);
  assert.ok(res.result.data);
  const validation = validateMyConfirmation(res.result.data);
  assert.equal(validation.valid, true);
  if (res.result.data) {
    assert.equal(res.result.data.canConfirm, true);
    assert.equal(res.result.data.confirmed, false);
    assert.equal(res.result.data.reason, null);
  }
});

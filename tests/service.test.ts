import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateReport, validateReportList } from "../lib/contracts/validation";
import {
  decodeCursor,
  encodeCursor,
  getReportDetailService,
  listReportsService,
  mapRowToReport,
} from "../lib/reports/service";

test("encodeCursor and decodeCursor round-trip faithfully", () => {
  const report = { id: "10000000-0000-4000-8000-000000000001", createdAt: "2026-10-22T12:00:00.000Z" };
  const filters = { categoryId: "pothole" as const, bbox: "-60.7,-33.0,-60.6,-32.9" };

  const cursor = encodeCursor(report, filters);
  assert.ok(typeof cursor === "string");
  assert.ok(!cursor.includes("+") && !cursor.includes("/") && !cursor.includes("="));

  const decoded = decodeCursor(cursor);
  assert.ok(decoded);
  assert.equal(decoded.version, 1);
  assert.equal(decoded.id, report.id);
  assert.equal(decoded.createdAt, report.createdAt);
  assert.deepEqual(decoded.filters, filters);
});

test("decodeCursor returns null on corrupted or invalid string", () => {
  assert.equal(decodeCursor("not-a-valid-cursor"), null);
  assert.equal(decodeCursor(""), null);
  assert.equal(decodeCursor(Buffer.from(JSON.stringify({ version: 2 })).toString("base64")), null);
});

test("mapRowToReport creates contract-compliant Report DTO", () => {
  const rowWithoutAddress = {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Bache profundo en la calle",
    description: "Bache grande en el carril derecho.",
    category_id: "pothole",
    severity: "high",
    status: "pending",
    latitude: -32.9468,
    longitude: -60.6393,
    street: null,
    street_number: null,
    created_at: "2026-10-22T10:00:00.000Z",
    updated_at: "2026-10-22T10:00:00.000Z",
    corroborated_at: null,
    resolved_at: null,
    storage_path: "user-1/10000000-0000-4000-8000-000000000001/original.jpg",
    mime_type: "image/jpeg",
    byte_size: 2048,
    confirmation_count: 2,
    threshold: 3,
  };

  const report = mapRowToReport(
    rowWithoutAddress,
    "https://example.invalid/signed/photo.jpg",
    "2026-10-22T11:00:00.000Z",
  );

  const validation = validateReport(report);
  assert.equal(validation.valid, true);
  assert.equal(report.id, rowWithoutAddress.id);
  assert.equal(report.citizenVerification.confirmationCount, 2);
  assert.equal(report.citizenVerification.threshold, 3);
  assert.equal(report.citizenVerification.corroborated, false);

  // When street is present, address is mapped
  const rowWithAddress = {
    ...rowWithoutAddress,
    street: "Córdoba",
    street_number: 1250,
  };
  const reportWithAddress = mapRowToReport(
    rowWithAddress,
    "https://example.invalid/signed/photo.jpg",
    "2026-10-22T11:00:00.000Z",
  );
  assert.deepEqual(
    (reportWithAddress.location as { address?: { street: string; number: number | null } }).address,
    { street: "Córdoba", number: 1250 },
  );
});

test("getReportDetailService returns 404 for missing report", async () => {
  const mockSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: { message: "Row not found" } }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;

  const res = await getReportDetailService(mockSupabase, "non-existent-id");
  assert.equal(res.httpStatus, 404);
  assert.ok(res.result.error);
  if (res.result.error) {
    assert.equal(res.result.error.code, "REPORT_NOT_FOUND");
  }
});

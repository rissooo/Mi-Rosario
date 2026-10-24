import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportFields } from "../lib/contracts/reports";
import {
  canonicalizeReportFields,
  claimIdempotencySlot,
  computePayloadHash,
  failIdempotencySlot,
  publishReportSlot,
  ReportRpcError,
} from "../lib/reports/idempotency";

type ReportInputWithAddress = Omit<ReportFields, "location"> & {
  location: {
    latitude: number;
    longitude: number;
    address: {
      street: string;
      number: number | null;
    };
  };
};

const sampleFields1: ReportInputWithAddress = {
  title: "Bache profundo en calzada",
  description: "Bache peligroso para motos y ciclistas.",
  categoryId: "pothole",
  severity: "high",
  location: {
    latitude: -32.9468,
    longitude: -60.6393,
    address: {
      street: "Córdoba",
      number: 1250,
    },
  },
  reviewed: true,
};

const sampleFieldsPermuted: ReportInputWithAddress = {
  reviewed: true,
  severity: "high",
  categoryId: "pothole",
  description: "  Bache peligroso para motos y ciclistas.  ",
  title: "  Bache profundo en calzada  ",
  location: {
    longitude: -60.6393,
    latitude: -32.9468,
    address: {
      number: 1250,
      street: "  Córdoba  ",
    },
  },
};

const imageA = new Uint8Array([1, 2, 3, 4, 5]);
const imageB = new Uint8Array([1, 2, 3, 4, 6]);

test("canonicalizeReportFields produces identical JSON regardless of key order or whitespace", () => {
  const json1 = canonicalizeReportFields(sampleFields1);
  const json2 = canonicalizeReportFields(sampleFieldsPermuted);
  assert.equal(json1, json2);

  // Verify alphabetical key order
  assert.ok(json1.indexOf('"categoryId"') < json1.indexOf('"description"'));
  assert.ok(json1.indexOf('"description"') < json1.indexOf('"location"'));
});

test("computePayloadHash is deterministic and detects field / image variations", () => {
  const hash1 = computePayloadHash(sampleFields1, imageA);
  const hashPermuted = computePayloadHash(sampleFieldsPermuted, imageA);
  assert.equal(hash1, hashPermuted);

  // Different image bytes -> different hash
  const hashDifferentImage = computePayloadHash(sampleFields1, imageB);
  assert.notEqual(hash1, hashDifferentImage);

  // Different street number -> different hash
  const fieldsModifiedNumber: ReportInputWithAddress = {
    ...sampleFields1,
    location: {
      ...sampleFields1.location,
      address: {
        ...sampleFields1.location.address,
        number: 1251,
      },
    },
  };
  const hashModifiedNumber = computePayloadHash(fieldsModifiedNumber, imageA);
  assert.notEqual(hash1, hashModifiedNumber);

  // Different street -> different hash
  const fieldsModifiedStreet: ReportInputWithAddress = {
    ...sampleFields1,
    location: {
      ...sampleFields1.location,
      address: {
        ...sampleFields1.location.address,
        street: "Santa Fe",
      },
    },
  };
  const hashModifiedStreet = computePayloadHash(fieldsModifiedStreet, imageA);
  assert.notEqual(hash1, hashModifiedStreet);
});

test("claimIdempotencySlot usa solo los argumentos definidos por la migración y devuelve el ID reservado", async () => {
  let calledRpc = "";
  let calledParams: unknown = null;

  const mockSupabase = {
    rpc: async (fn: string, params: unknown) => {
      calledRpc = fn;
      calledParams = params;
      return {
        data: {
          action: "CLAIMED",
          status: "in_progress",
          reportId: "report-uuid",
        },
        error: null,
      };
    },
  } as unknown as SupabaseClient;

  const res = await claimIdempotencySlot(mockSupabase, "key-uuid", "hash123");
  assert.equal(calledRpc, "claim_idempotency_key");
  assert.deepEqual(calledParams, {
    p_key: "key-uuid",
    p_payload_hash: "hash123",
  });
  assert.equal(res.action, "CLAIMED");
  if (res.action === "CLAIMED") assert.equal(res.reportId, "report-uuid");
});

test("publishReportSlot y failIdempotencySlot coinciden con las firmas de las migraciones", async () => {
  const calls: Array<{ fn: string; params: unknown }> = [];

  const mockSupabase = {
    rpc: async (fn: string, params: unknown) => {
      calls.push({ fn, params });
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;

  await publishReportSlot(mockSupabase, {
    key: "key-uuid",
    payloadHash: "hash123",
    title: "Bache en calle",
    description: "Bache en la calzada.",
    categoryId: "pothole",
    severity: "high",
    latitude: -32.9,
    longitude: -60.6,
    street: "Córdoba",
    streetNumber: 1250,
    storagePath: "user-uuid/report-uuid/original.jpg",
    photoPublicPath: "report-uuid.jpg",
    mimeType: "image/jpeg",
    byteSize: 2048,
  });
  await failIdempotencySlot(mockSupabase, "key-uuid", "report-uuid", "hash123");

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {
    fn: "publish_report",
    params: {
      p_key: "key-uuid",
      p_payload_hash: "hash123",
      p_title: "Bache en calle",
      p_description: "Bache en la calzada.",
      p_category_id: "pothole",
      p_severity: "high",
      p_latitude: -32.9,
      p_longitude: -60.6,
      p_street: "Córdoba",
      p_street_number: 1250,
      p_storage_path: "user-uuid/report-uuid/original.jpg",
      p_photo_public_path: "report-uuid.jpg",
      p_photo_public_mime_type: "image/jpeg",
      p_photo_public_byte_size: 2048,
    },
  });
  assert.deepEqual(calls[1], {
    fn: "fail_idempotency_key",
    params: { p_key: "key-uuid", p_report_id: "report-uuid", p_payload_hash: "hash123" },
  });
});

test("ReportRpcError distingue un rechazo de base de un resultado de red ambiguo", () => {
  assert.equal(new ReportRpcError("publish_report", { code: "23514", message: "constraint" }).definitive, true);
  assert.equal(new ReportRpcError("publish_report", { message: "fetch failed" }).definitive, false);
  assert.equal(new ReportRpcError("publish_report", { code: "57014", message: "statement timeout" }).definitive, false);
});

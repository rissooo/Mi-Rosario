import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportFields } from "../lib/contracts/reports";
import {
  canonicalizeReportFields,
  claimIdempotencySlot,
  completeIdempotencySlot,
  computePayloadHash,
  failIdempotencySlot,
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

test("claimIdempotencySlot calls supabase.rpc with parameters and returns response", async () => {
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
          reportId: null,
        },
        error: null,
      };
    },
  } as unknown as SupabaseClient;

  const res = await claimIdempotencySlot(mockSupabase, "key-uuid", "hash123", 120);
  assert.equal(calledRpc, "claim_idempotency_key");
  assert.deepEqual(calledParams, {
    p_key: "key-uuid",
    p_payload_hash: "hash123",
    p_operation: "publish_report",
    p_lock_seconds: 120,
  });
  assert.equal(res.action, "CLAIMED");
});

test("completeIdempotencySlot and failIdempotencySlot call respective RPCs", async () => {
  const calls: Array<{ fn: string; params: unknown }> = [];

  const mockSupabase = {
    rpc: async (fn: string, params: unknown) => {
      calls.push({ fn, params });
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;

  await completeIdempotencySlot(mockSupabase, "key-uuid", "report-uuid");
  await failIdempotencySlot(mockSupabase, "key-uuid");

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {
    fn: "complete_idempotency_key",
    params: { p_key: "key-uuid", p_report_id: "report-uuid" },
  });
  assert.deepEqual(calls[1], {
    fn: "fail_idempotency_key",
    params: { p_key: "key-uuid" },
  });
});

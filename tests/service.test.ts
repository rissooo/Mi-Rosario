import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportFields } from "../lib/contracts/reports";
import { validateReport } from "../lib/contracts/validation";
import {
  decodeCursor,
  encodeCursor,
  getReportDetailService,
  listReportsService,
  mapRowToReport,
  publishReportService,
} from "../lib/reports/service";

const reservedReportId = "10000000-0000-4000-8000-000000000001";
const idempotencyKey = "20000000-0000-4000-8000-000000000002";
const JPEG_WITH_EXIF = new Uint8Array([
  0xff, 0xd8,
  0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  0x11, 0x22, 0xff, 0xd9,
]);
const publishFields: ReportFields = {
  title: "Bache profundo en la calzada",
  description: "Bache grande en el carril derecho.",
  categoryId: "pothole",
  severity: "high",
  location: {
    latitude: -32.9468,
    longitude: -60.6393,
    address: { street: "Córdoba", number: 1250 },
  },
  reviewed: true,
};

function createPublishForm(report: unknown = publishFields): FormData {
  const form = new FormData();
  form.set("report", typeof report === "string" ? report : JSON.stringify(report));
  form.set("image", new File([JPEG_WITH_EXIF], "foto.jpg", {
    type: "image/jpeg",
  }));
  return form;
}

function createPublishSupabase(options: {
  claimResult?: unknown;
  publishError?: { code?: string; message: string };
  publishThrow?: unknown;
  detailError?: boolean;
} = {}) {
  const rpcCalls: Array<{ name: string; params: unknown }> = [];
  const uploadedPaths: string[] = [];
  const removedPaths: string[] = [];
  const queriedTables: string[] = [];
  const reportRow = {
    id: reservedReportId,
    title: publishFields.title,
    description: publishFields.description,
    category_id: publishFields.categoryId,
    severity: publishFields.severity,
    status: "pending",
    latitude: publishFields.location.latitude,
    longitude: publishFields.location.longitude,
    street: publishFields.location.address.street,
    street_number: publishFields.location.address.number,
    created_at: "2026-10-22T10:00:00.000Z",
    updated_at: "2026-10-22T10:00:00.000Z",
    photo_public_path: `${reservedReportId}.jpg`,
    photo_public_mime_type: "image/jpeg",
    photo_public_byte_size: 14,
    confirmation_count: 0,
    confirmation_threshold: 3,
  };

  const supabase = {
    rpc: async (name: string, params: unknown) => {
      rpcCalls.push({ name, params });
      if (name === "claim_idempotency_key") {
        return {
          data: options.claimResult ?? { action: "CLAIMED", status: "in_progress", reportId: reservedReportId },
          error: null,
        };
      }
      if (name === "publish_report") {
        if (options.publishThrow) throw options.publishThrow;
        if (options.publishError) return { data: null, error: options.publishError };
        return { data: { success: true, action: "CREATED", reportId: reservedReportId }, error: null };
      }
      if (name === "fail_idempotency_key") return { data: { action: "FAILED", reportId: reservedReportId }, error: null };
      throw new Error(`RPC no esperada: ${name}`);
    },
    from: (table: string) => {
      queriedTables.push(table);
      if (table !== "public_reports") throw new Error(`Consulta no esperada: ${table}`);
      const query = {
        select: () => query,
        eq: () => query,
        single: async () => options.detailError
          ? { data: null, error: { message: "vista pública todavía no disponible" } }
          : { data: reportRow, error: null },
      };
      return query;
    },
    storage: {
      from: () => ({
        upload: async (path: string) => {
          uploadedPaths.push(path);
          return { data: { path }, error: null };
        },
        remove: async (paths: string[]) => {
          removedPaths.push(...paths);
          return { data: paths, error: null };
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://project.example/storage/v1/object/public/reports-public/${path}` },
        }),
      }),
    },
  } as unknown as SupabaseClient;

  return { supabase, rpcCalls, uploadedPaths, removedPaths, queriedTables };
}

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

test("mapRowToReport usa metadatos de la copia y deja visible el bloqueo de expiresAt", () => {
  const row = {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Bache profundo en la calle",
    description: "Bache grande en el carril derecho.",
    category_id: "pothole",
    severity: "high",
    status: "pending",
    latitude: -32.9468,
    longitude: -60.6393,
    street: "Córdoba",
    street_number: 1250,
    created_at: "2026-10-22T10:00:00.000Z",
    updated_at: "2026-10-22T10:00:00.000Z",
    corroborated_at: null,
    photo_public_path: "10000000-0000-4000-8000-000000000001.jpg",
    photo_public_mime_type: "image/jpeg",
    photo_public_byte_size: 1912,
    confirmation_count: 2,
    confirmation_threshold: 3,
  };

  const report = mapRowToReport(row, "https://project.example/storage/v1/object/public/reports-public/10000000-0000-4000-8000-000000000001.jpg");

  const validation = validateReport(report);
  assert.equal(validation.valid, false);
  assert.ok(validation.error?.fieldErrors?.["photo.expiresAt"]);
  assert.equal(Object.hasOwn(report.photo, "expiresAt"), false);
  assert.equal(report.photo.byteSize, 1912);
  assert.equal(report.id, row.id);
  assert.equal(report.citizenVerification.confirmationCount, 2);
  assert.equal(report.citizenVerification.threshold, 3);
  assert.equal(report.citizenVerification.corroborated, false);
  assert.deepEqual(report.location.address, { street: "Córdoba", number: 1250 });
  assert.equal(report.photo.url, "https://project.example/storage/v1/object/public/reports-public/10000000-0000-4000-8000-000000000001.jpg");
  assert.equal(report.photo.byteSize, 1912);
  assert.equal(Object.hasOwn(report.photo, "expiresAt"), false);
});

test("getReportDetailService devuelve siempre la dirección del reporte", async () => {
  const row = {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Bache profundo en la calle",
    description: "Bache grande en el carril derecho.",
    category_id: "pothole",
    severity: "high",
    status: "pending",
    latitude: -32.9468,
    longitude: -60.6393,
    street: "Córdoba",
    street_number: 1250,
    created_at: "2026-10-22T10:00:00.000Z",
    updated_at: "2026-10-22T10:00:00.000Z",
    corroborated_at: null,
    photo_public_path: "10000000-0000-4000-8000-000000000001.jpg",
    photo_public_mime_type: "image/jpeg",
    photo_public_byte_size: 1912,
    confirmation_count: 2,
    confirmation_threshold: 3,
  };
  const mockSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: row, error: null }) }),
      }),
    }),
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://public.example/${path}` } }),
      }),
    },
  } as unknown as SupabaseClient;

  const response = await getReportDetailService(mockSupabase, row.id);
  assert.equal(response.httpStatus, 200);
  assert.ok(response.result.data);
  if (response.result.data) {
    assert.deepEqual(response.result.data.location.address, { street: "Córdoba", number: 1250 });
    assert.equal(response.result.data.photo.url, "https://public.example/10000000-0000-4000-8000-000000000001.jpg");
    assert.equal(response.result.data.photo.byteSize, 1912);
    assert.equal(Object.hasOwn(response.result.data.photo, "expiresAt"), false);
  }
});

test("listReportsService devuelve siempre la dirección de cada reporte", async () => {
  const row = {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Bache profundo en la calle",
    description: "Bache grande en el carril derecho.",
    category_id: "pothole",
    severity: "high",
    status: "pending",
    latitude: -32.9468,
    longitude: -60.6393,
    street: "Córdoba",
    street_number: 1250,
    created_at: "2026-10-22T10:00:00.000Z",
    updated_at: "2026-10-22T10:00:00.000Z",
    corroborated_at: null,
    photo_public_path: "10000000-0000-4000-8000-000000000001.jpg",
    photo_public_mime_type: "image/jpeg",
    photo_public_byte_size: 1912,
    confirmation_count: 2,
    confirmation_threshold: 3,
  };
  const query = {
    select: () => query,
    order: () => query,
    limit: async () => ({ data: [row], error: null }),
  };
  const mockSupabase = {
    from: () => query,
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://public.example/${path}` } }),
      }),
    },
  } as unknown as SupabaseClient;

  const response = await listReportsService(mockSupabase, {});
  assert.equal(response.httpStatus, 200);
  assert.ok(response.result.data);
  if (response.result.data) {
    assert.deepEqual(response.result.data.items[0].location.address, { street: "Córdoba", number: 1250 });
    assert.equal(response.result.data.items[0].photo.url, "https://public.example/10000000-0000-4000-8000-000000000001.jpg");
    assert.equal(response.result.data.items[0].photo.byteSize, 1912);
    assert.equal(Object.hasOwn(response.result.data.items[0].photo, "expiresAt"), false);
  }
});

test("publishReportService parsea report como JSON y publica con el report_id reservado por la RPC", async () => {
  const mock = createPublishSupabase();
  const response = await publishReportService({
    supabase: mock.supabase,
    userId: "user-1",
    formData: createPublishForm(),
    idempotencyKey,
  });

  assert.equal(response.httpStatus, 201);
  assert.ok(response.result.data);
  assert.equal(response.result.data?.id, reservedReportId);
  assert.deepEqual(mock.rpcCalls.map((call) => call.name), ["claim_idempotency_key", "publish_report"]);
  assert.deepEqual(mock.uploadedPaths, [`user-1/${reservedReportId}/original.jpg`, `${reservedReportId}.jpg`]);
  assert.deepEqual(mock.queriedTables, ["public_reports"]);

  const claimParams = mock.rpcCalls[0].params as Record<string, unknown>;
  const publishParams = mock.rpcCalls[1].params as Record<string, unknown>;
  assert.equal(claimParams.p_key, idempotencyKey);
  assert.equal(claimParams.p_payload_hash, publishParams.p_payload_hash);
  assert.equal(publishParams.p_street, "Córdoba");
  assert.equal(publishParams.p_street_number, 1250);
  assert.equal(publishParams.p_storage_path, `user-1/${reservedReportId}/original.jpg`);
  assert.equal(publishParams.p_photo_public_path, `${reservedReportId}.jpg`);
});

test("publishReportService rechaza JSON mal formado antes de reclamar o subir", async () => {
  const mock = createPublishSupabase();
  const response = await publishReportService({
    supabase: mock.supabase,
    userId: "user-1",
    formData: createPublishForm("{"),
    idempotencyKey,
  });

  assert.equal(response.httpStatus, 400);
  assert.equal(response.result.error?.code, "INVALID_JSON");
  assert.deepEqual(mock.rpcCalls, []);
  assert.deepEqual(mock.uploadedPaths, []);
});

test("publishReportService valida el contenido JSON del reporte antes de reclamar", async () => {
  const mock = createPublishSupabase();
  const response = await publishReportService({
    supabase: mock.supabase,
    userId: "user-1",
    formData: createPublishForm({ ...publishFields, title: "cort" }),
    idempotencyKey,
  });

  assert.equal(response.httpStatus, 422);
  assert.equal(response.result.error?.code, "VALIDATION_ERROR");
  assert.ok(response.result.error?.fieldErrors?.title);
  assert.deepEqual(mock.rpcCalls, []);
  assert.deepEqual(mock.uploadedPaths, []);
});

test("publishReportService reutiliza el report_id reservado en un reintento completado", async () => {
  const mock = createPublishSupabase({
    claimResult: { action: "COMPLETED", status: "completed", reportId: reservedReportId },
  });
  const response = await publishReportService({
    supabase: mock.supabase,
    userId: "user-1",
    formData: createPublishForm(),
    idempotencyKey,
  });

  assert.equal(response.httpStatus, 200);
  assert.equal(response.result.data?.id, reservedReportId);
  assert.deepEqual(mock.rpcCalls.map((call) => call.name), ["claim_idempotency_key"]);
  assert.deepEqual(mock.uploadedPaths, []);
});

test("un rechazo definitivo antes del commit compensa la foto y marca la clave failed", async () => {
  const mock = createPublishSupabase({ publishError: { code: "23514", message: "constraint violation" } });
  const response = await publishReportService({
    supabase: mock.supabase,
    userId: "user-1",
    formData: createPublishForm(),
    idempotencyKey,
  });

  assert.equal(response.httpStatus, 500);
  assert.deepEqual(mock.removedPaths, [`user-1/${reservedReportId}/original.jpg`, `${reservedReportId}.jpg`]);
  assert.deepEqual(mock.rpcCalls.map((call) => call.name), [
    "claim_idempotency_key",
    "publish_report",
    "fail_idempotency_key",
  ]);
  assert.deepEqual(mock.rpcCalls[2].params, {
    p_key: idempotencyKey,
    p_report_id: reservedReportId,
    p_payload_hash: mock.rpcCalls[1].params && (mock.rpcCalls[1].params as Record<string, unknown>).p_payload_hash,
  });
});

test("un timeout de publish_report conserva la foto y no marca failed", async () => {
  const mock = createPublishSupabase({ publishError: { code: "57014", message: "statement timeout" } });
  const response = await publishReportService({
    supabase: mock.supabase,
    userId: "user-1",
    formData: createPublishForm(),
    idempotencyKey,
  });

  assert.equal(response.httpStatus, 500);
  assert.deepEqual(mock.uploadedPaths, [`user-1/${reservedReportId}/original.jpg`, `${reservedReportId}.jpg`]);
  assert.deepEqual(mock.removedPaths, []);
  assert.deepEqual(mock.rpcCalls.map((call) => call.name), ["claim_idempotency_key", "publish_report"]);
});

test("un error desconocido de publish_report conserva ambas fotos y no marca failed", async () => {
  const mock = createPublishSupabase({ publishThrow: new Error("resultado no reconocido") });
  const response = await publishReportService({
    supabase: mock.supabase,
    userId: "user-1",
    formData: createPublishForm(),
    idempotencyKey,
  });

  assert.equal(response.httpStatus, 500);
  assert.deepEqual(mock.uploadedPaths, [`user-1/${reservedReportId}/original.jpg`, `${reservedReportId}.jpg`]);
  assert.deepEqual(mock.removedPaths, []);
  assert.deepEqual(mock.rpcCalls.map((call) => call.name), ["claim_idempotency_key", "publish_report"]);
});

test("un error al preparar la respuesta después del commit no borra ni marca failed", async () => {
  const mock = createPublishSupabase({ detailError: true });
  const response = await publishReportService({
    supabase: mock.supabase,
    userId: "user-1",
    formData: createPublishForm(),
    idempotencyKey,
  });

  assert.equal(response.httpStatus, 500);
  assert.equal(response.result.error?.code, "INTERNAL_ERROR");
  assert.deepEqual(mock.removedPaths, []);
  assert.deepEqual(mock.rpcCalls.map((call) => call.name), ["claim_idempotency_key", "publish_report"]);
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

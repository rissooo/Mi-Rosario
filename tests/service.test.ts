import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_IMAGE_BYTES, type ReportFields } from "../lib/contracts/reports";
import { validateReport, validateReportList } from "../lib/contracts/validation";
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

function createPublishForm(
  report: unknown = publishFields,
  imageBytes: Uint8Array = JPEG_WITH_EXIF,
): FormData {
  const form = new FormData();
  form.set("report", typeof report === "string" ? report : JSON.stringify(report));
  const imageBuffer = new ArrayBuffer(imageBytes.byteLength);
  new Uint8Array(imageBuffer).set(imageBytes);
  form.set("image", new File([imageBuffer], "foto.jpg", {
    type: "image/jpeg",
  }));
  return form;
}

function createPublishSupabase(options: {
  claimResult?: unknown;
  publishError?: { code?: string; message: string };
  publishThrow?: unknown;
  publishResult?: unknown;
  detailError?: boolean;
  reportRowOverrides?: Record<string, unknown>;
} = {}) {
  const rpcCalls: Array<{ name: string; params: unknown }> = [];
  const uploadedPaths: string[] = [];
  const removedPaths: string[] = [];
  const queriedTables: string[] = [];
  const events: string[] = [];
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
    ...options.reportRowOverrides,
  };

  const supabase = {
    rpc: async (name: string, params: unknown) => {
      rpcCalls.push({ name, params });
      events.push(`rpc:${name}`);
      if (name === "claim_idempotency_key") {
        return {
          data: options.claimResult ?? { action: "CLAIMED", status: "in_progress", reportId: reservedReportId },
          error: null,
        };
      }
      if (name === "publish_report") {
        if (options.publishThrow) throw options.publishThrow;
        if (options.publishError) return { data: null, error: options.publishError };
        if (options.publishResult !== undefined) return { data: options.publishResult, error: null };
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
      from: (bucket: string) => ({
        upload: async (path: string) => {
          uploadedPaths.push(path);
          events.push(`upload:${bucket}`);
          return { data: { path }, error: null };
        },
        remove: async (paths: string[]) => {
          removedPaths.push(...paths);
          events.push(`remove:${bucket}`);
          return { data: paths, error: null };
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://project.example/storage/v1/object/public/reports-public/${path}` },
        }),
      }),
    },
  } as unknown as SupabaseClient;

  return { supabase, rpcCalls, uploadedPaths, removedPaths, queriedTables, events };
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
    const validation = validateReport(response.result.data);
    assert.equal(validation.valid, false);
    assert.ok(validation.error?.fieldErrors?.["photo.expiresAt"]);
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
    assert.equal(validateReportList(response.result.data).valid, false);
    assert.deepEqual(response.result.data.items[0].location.address, { street: "Córdoba", number: 1250 });
    assert.equal(response.result.data.items[0].photo.url, "https://public.example/10000000-0000-4000-8000-000000000001.jpg");
    assert.equal(response.result.data.items[0].photo.byteSize, 1912);
    assert.equal(Object.hasOwn(response.result.data.items[0].photo, "expiresAt"), false);
    const validation = validateReport(response.result.data.items[0]);
    assert.equal(validation.valid, false);
    assert.ok(validation.error?.fieldErrors?.["photo.expiresAt"]);
  }
});

function createListSupabase(rows: unknown[]) {
  const orFilters: string[] = [];
  const query = {
    select: () => query,
    order: () => query,
    limit: () => query,
    eq: () => query,
    gte: () => query,
    lte: () => query,
    or: (filter: string) => {
      orFilters.push(filter);
      return query;
    },
    then: (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null }),
  };
  const supabase = {
    from: () => query,
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://public.example/${path}` } }),
      }),
    },
  } as unknown as SupabaseClient;
  return { supabase, orFilters };
}

const listRow = {
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
  created_at: "2026-10-22T10:00:00.123Z",
  updated_at: "2026-10-22T10:00:00.123Z",
  corroborated_at: null,
  photo_public_path: "10000000-0000-4000-8000-000000000001.jpg",
  photo_public_mime_type: "image/jpeg",
  photo_public_byte_size: 1912,
  confirmation_count: 0,
  confirmation_threshold: 3,
};

test("una fecha con el formato crudo de PostgREST hace fallar la lista: la vista debe formatearla", async () => {
  const { supabase } = createListSupabase([
    { ...listRow, created_at: "2026-10-22T10:00:00.123456+00:00" },
  ]);
  const response = await listReportsService(supabase, {});
  assert.equal(response.httpStatus, 500);
  assert.equal(response.result.error?.code, "INTERNAL_ERROR");
});

test("el cursor filtra por fecha entre comillas y con el id validado", async () => {
  const { supabase, orFilters } = createListSupabase([listRow]);
  const cursor = encodeCursor({ id: listRow.id, createdAt: listRow.created_at }, {});
  const response = await listReportsService(supabase, { cursor });
  assert.equal(response.httpStatus, 200);
  assert.deepEqual(orFilters, [
    `created_at.lt."2026-10-22T10:00:00.123Z",and(created_at.eq."2026-10-22T10:00:00.123Z",id.lt.${listRow.id})`,
  ]);
});

test("publishReportService devuelve error 415 de validación ante JPEG truncado, no 500", async () => {
  const mock = createPublishSupabase();
  const response = await publishReportService({
    supabase: mock.supabase,
    storage: mock.supabase,
    userId: "user-1",
    formData: createPublishForm(publishFields, new Uint8Array([0xff, 0xd8, 0xff])),
    idempotencyKey,
  });

  assert.equal(response.httpStatus, 415);
  assert.equal(response.result.error?.code, "UNSUPPORTED_MEDIA_TYPE");
  assert.deepEqual(mock.uploadedPaths, []);
  assert.ok(mock.rpcCalls.some((call) => call.name === "fail_idempotency_key"));
});

test("publishReportService parsea report como JSON y publica con el report_id reservado por la RPC", async () => {
  const mock = createPublishSupabase();
  const response = await publishReportService({
    supabase: mock.supabase,
    storage: mock.supabase,
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
    storage: mock.supabase,
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
    storage: mock.supabase,
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

test("las fotos se suben y compensan con el cliente del servidor, nunca con la sesión del vecino", async () => {
  const session = createPublishSupabase({ publishError: { code: "23514", message: "constraint violation" } });
  const server = createPublishSupabase();
  const sessionStorageUse: string[] = [];
  (session.supabase as unknown as { storage: unknown }).storage = {
    from: (bucket: string) => {
      sessionStorageUse.push(bucket);
      throw new Error("la sesión del vecino no debe tocar Storage");
    },
  };

  const response = await publishReportService({
    supabase: session.supabase,
    storage: server.supabase,
    userId: "user-1",
    formData: createPublishForm(),
    idempotencyKey,
  });

  assert.equal(response.result.error?.code, "INTERNAL_ERROR");
  assert.deepEqual(sessionStorageUse, []);
  assert.deepEqual(session.rpcCalls.map((call) => call.name), [
    "claim_idempotency_key",
    "publish_report",
    "fail_idempotency_key",
  ]);
  assert.deepEqual(server.rpcCalls, []);
  assert.equal(server.uploadedPaths.length, 2);
  assert.deepEqual(server.removedPaths.sort(), server.uploadedPaths.sort());
});

test("publishReportService reutiliza el report_id reservado en un reintento completado", async () => {
  const mock = createPublishSupabase({
    claimResult: { action: "COMPLETED", status: "completed", reportId: reservedReportId },
  });
  const response = await publishReportService({
    supabase: mock.supabase,
    storage: mock.supabase,
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
    storage: mock.supabase,
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
  assert.deepEqual(mock.events.slice(-3), [
    "remove:reports-originals",
    "remove:reports-public",
    "rpc:fail_idempotency_key",
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
    storage: mock.supabase,
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
    storage: mock.supabase,
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
    storage: mock.supabase,
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

test("el límite del tamaño real devuelve 413 antes de reclamar o leer la imagen", async () => {
  const mock = createPublishSupabase();
  const formData = createPublishForm(publishFields, new Uint8Array(MAX_IMAGE_BYTES + 1));
  const response = await publishReportService({
    supabase: mock.supabase,
    storage: mock.supabase,
    userId: "user-1",
    formData,
    idempotencyKey,
  });

  assert.equal(response.httpStatus, 413);
  assert.equal(response.result.error?.code, "PAYLOAD_TOO_LARGE");
  assert.deepEqual(mock.rpcCalls, []);
  assert.deepEqual(mock.uploadedPaths, []);
});

test("el claim de cuota devuelve el error del contrato y el Retry-After", async () => {
  const mock = createPublishSupabase({
    claimResult: {
      action: "LIMIT_REACHED",
      status: "in_progress",
      code: "PUBLICATION_IN_PROGRESS",
      quota: "active_claims",
      retryAfter: 37,
    },
  });
  const response = await publishReportService({
    supabase: mock.supabase,
    storage: mock.supabase,
    userId: "user-1",
    formData: createPublishForm(),
    idempotencyKey,
  });

  assert.equal(response.httpStatus, 409);
  assert.equal(response.result.error?.code, "PUBLICATION_IN_PROGRESS");
  assert.equal(response.retryAfter, 37);
  assert.match(response.result.error?.message ?? "", /publicaciones en curso/);
  assert.deepEqual(mock.uploadedPaths, []);
  assert.deepEqual(mock.rpcCalls.map((call) => call.name), ["claim_idempotency_key"]);
});

test("el límite diario de publish_report compensa antes de marcar la clave fallida", async () => {
  const mock = createPublishSupabase({
    publishResult: {
      success: false,
      code: "PUBLICATION_IN_PROGRESS",
      quota: "published_24h",
      retryAfter: 7200,
    },
  });
  const response = await publishReportService({
    supabase: mock.supabase,
    storage: mock.supabase,
    userId: "user-1",
    formData: createPublishForm(),
    idempotencyKey,
  });

  assert.equal(response.httpStatus, 409);
  assert.equal(response.result.error?.code, "PUBLICATION_IN_PROGRESS");
  assert.equal(response.retryAfter, 7200);
  assert.deepEqual(mock.removedPaths, [`user-1/${reservedReportId}/original.jpg`, `${reservedReportId}.jpg`]);
  assert.deepEqual(mock.events.slice(-3), [
    "remove:reports-originals",
    "remove:reports-public",
    "rpc:fail_idempotency_key",
  ]);
});

test("los GET rechazan DTO inválidos y no exponen mensajes de base de datos", async () => {
  const invalidDetail = createPublishSupabase({ reportRowOverrides: { title: "x" } });
  const detail = await getReportDetailService(invalidDetail.supabase, reservedReportId);
  assert.equal(detail.httpStatus, 500);
  assert.equal(detail.result.error?.message, "No se pudo preparar el reporte público.");

  const row = {
    id: reservedReportId,
    title: "x",
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
  let query: Record<string, (...args: unknown[]) => unknown>;
  query = {
    select: () => query,
    order: () => query,
    limit: async () => ({ data: [row], error: null }),
  };
  const invalidListSupabase = {
    from: () => query,
    storage: { from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: path } }) }) },
  } as unknown as SupabaseClient;
  const invalidList = await listReportsService(invalidListSupabase, {});
  assert.equal(invalidList.httpStatus, 500);
  assert.equal(invalidList.result.error?.message, "No se pudo preparar la lista pública de reportes.");

  query = {
    select: () => query,
    order: () => query,
    limit: async () => ({ data: null, error: { message: "storage_path user_id private SQL function" } }),
  };
  const failedList = await listReportsService({ from: () => query } as unknown as SupabaseClient, {});
  assert.equal(failedList.httpStatus, 500);
  assert.equal(failedList.result.error?.message, "No se pudo consultar la lista de reportes.");
  assert.doesNotMatch(failedList.result.error?.message ?? "", /storage_path|user_id|SQL function/);
});

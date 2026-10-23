import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  compensateRemovePhotos,
  getPublicPhotoUrl,
  getStoragePath,
  REPORTS_PUBLIC_BUCKET,
  REPORTS_STORAGE_BUCKET,
  sanitizeImageMetadata,
  sniffImageMimeType,
  uploadReportPhoto,
} from "../lib/reports/photos";

const JPEG_HEADER = new Uint8Array([
  0xff, 0xd8,
  0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  0x11, 0x22, 0xff, 0xd9,
]);
const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP_HEADER = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const TXT_HEADER = new Uint8Array(Buffer.from("Hello world, this is a plain text file pretending to be an image"));

function concat(...chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function asciiBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "ascii"));
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(data.length + 12);
  new DataView(chunk.buffer).setUint32(0, data.length, false);
  chunk.set(asciiBytes(type), 4);
  chunk.set(data, 8);
  return chunk;
}

function minimalPngWithMetadata(): Uint8Array {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, 1, false);
  new DataView(header.buffer).setUint32(4, 1, false);
  header.set([8, 2, 0, 0, 0], 8);
  return concat(
    signature,
    pngChunk("IHDR", header),
    pngChunk("eXIf", asciiBytes("Exif\u0000\u0000GPS")),
    pngChunk("tEXt", asciiBytes("Comment\u0000private note")),
    pngChunk("IDAT", new Uint8Array([0x00])),
    pngChunk("IEND", new Uint8Array()),
  );
}

function webpChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(8 + data.length + (data.length % 2));
  chunk.set(asciiBytes(type), 0);
  new DataView(chunk.buffer).setUint32(4, data.length, true);
  chunk.set(data, 8);
  return chunk;
}

function minimalWebpWithExif(): Uint8Array {
  const extendedHeader = new Uint8Array(10);
  extendedHeader[0] = 0x0c;
  const chunks = concat(
    webpChunk("VP8X", extendedHeader),
    webpChunk("EXIF", asciiBytes("GPS coordinates")),
    webpChunk("VP8L", new Uint8Array([0x2f, 1, 2, 3, 4])),
  );
  const file = concat(asciiBytes("RIFF"), new Uint8Array(4), asciiBytes("WEBP"), chunks);
  new DataView(file.buffer).setUint32(4, file.length - 8, true);
  return file;
}

test("sniffImageMimeType correctly detects JPEG, PNG, and WebP from magic bytes", () => {
  assert.equal(sniffImageMimeType(JPEG_HEADER), "image/jpeg");
  assert.equal(sniffImageMimeType(PNG_HEADER), "image/png");
  assert.equal(sniffImageMimeType(WEBP_HEADER), "image/webp");
  assert.equal(sniffImageMimeType(TXT_HEADER), null);
  assert.equal(sniffImageMimeType(new Uint8Array([0x00, 0x01])), null);
});

test("getStoragePath constructs canonical author-scoped path", () => {
  const path = getStoragePath("user-123", "report-456");
  assert.equal(path, "user-123/report-456/original.jpg");
  assert.throws(() => getStoragePath("", "report-456"));
  assert.throws(() => getStoragePath("user-123", ""));
});

test("getPublicPhotoUrl usa la ruta de la copia en el bucket público", () => {
  let requestedBucket = "";
  let requestedPath = "";
  const mockSupabase = {
    storage: {
      from: (bucket: string) => {
        requestedBucket = bucket;
        return {
          getPublicUrl: (path: string) => {
            requestedPath = path;
            return { data: { publicUrl: `https://storage.example/${path}` } };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  assert.equal(getPublicPhotoUrl(mockSupabase, "report-1.jpg"), "https://storage.example/report-1.jpg");
  assert.equal(requestedBucket, REPORTS_PUBLIC_BUCKET);
  assert.equal(requestedPath, "report-1.jpg");
});

test("sanitizeImageMetadata elimina segmentos APP de JPEG con EXIF", () => {
  const sanitized = sanitizeImageMetadata(JPEG_HEADER, "image/jpeg");
  assert.equal(sniffImageMimeType(sanitized), "image/jpeg");
  assert.equal(Buffer.from(sanitized).includes(Buffer.from("Exif")), false);
  assert.deepEqual(Array.from(sanitized.slice(0, 2)), [0xff, 0xd8]);
});

test("sanitizeImageMetadata elimina eXIf y chunks de texto PNG", () => {
  const sanitized = sanitizeImageMetadata(minimalPngWithMetadata(), "image/png");
  const contents = Buffer.from(sanitized).toString("latin1");
  assert.equal(sniffImageMimeType(sanitized), "image/png");
  assert.equal(contents.includes("eXIf"), false);
  assert.equal(contents.includes("tEXt"), false);
  assert.equal(contents.includes("private note"), false);
});

test("sanitizeImageMetadata elimina el chunk EXIF y actualiza el tamaño RIFF WebP", () => {
  const sanitized = sanitizeImageMetadata(minimalWebpWithExif(), "image/webp");
  const contents = Buffer.from(sanitized).toString("latin1");
  assert.equal(sniffImageMimeType(sanitized), "image/webp");
  assert.equal(contents.includes("EXIF"), false);
  assert.equal(new DataView(sanitized.buffer, sanitized.byteOffset, sanitized.byteLength).getUint32(4, true), sanitized.length - 8);
  assert.equal(sanitized[20] & 0x0c, 0);
});

test("sanitizeImageMetadata rechaza estructuras incompletas que no puede analizar", () => {
  assert.throws(() => sanitizeImageMetadata(JPEG_HEADER.slice(0, 8), "image/jpeg"), /JPEG/);
  assert.throws(() => sanitizeImageMetadata(PNG_HEADER, "image/png"), /PNG/);
  assert.throws(() => sanitizeImageMetadata(WEBP_HEADER, "image/webp"), /WebP/);
});

test("uploadReportPhoto validates size, magic bytes and calls storage.upload", async () => {
  const uploads: Array<{ bucket: string; path: string; bytes: Uint8Array; options: unknown }> = [];

  const mockSupabase = {
    storage: {
      from: (bucket: string) => {
        return {
          upload: async (path: string, bytes: Uint8Array, opts: unknown) => {
            uploads.push({ bucket, path, bytes, options: opts });
            return { data: { path }, error: null };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  // Éxito con JPEG.
  const res = await uploadReportPhoto({
    supabase: mockSupabase,
    userId: "u-1",
    reportId: "r-1",
    fileBytes: JPEG_HEADER,
    declaredMimeType: "image/jpeg",
  });

  assert.equal(res.storagePath, "u-1/r-1/original.jpg");
  assert.equal(res.photoPublicPath, "r-1.jpg");
  assert.equal(res.mimeType, "image/jpeg");
  assert.ok(res.byteSize < JPEG_HEADER.byteLength);
  assert.deepEqual(uploads.map(({ bucket, path }) => ({ bucket, path })), [
    { bucket: REPORTS_STORAGE_BUCKET, path: "u-1/r-1/original.jpg" },
    { bucket: REPORTS_PUBLIC_BUCKET, path: "r-1.jpg" },
  ]);
  assert.deepEqual(uploads[0].bytes, JPEG_HEADER);
  assert.equal(Buffer.from(uploads[1].bytes).includes(Buffer.from("Exif")), false);
  assert.deepEqual(uploads.map((upload) => upload.options), [
    { contentType: "image/jpeg", upsert: true },
    { contentType: "image/jpeg", upsert: true },
  ]);

  // Rechaza un MIME declarado que no coincide con el contenido.
  await assert.rejects(
    async () => {
      await uploadReportPhoto({
        supabase: mockSupabase,
        userId: "u-1",
        reportId: "r-1",
        fileBytes: JPEG_HEADER,
        declaredMimeType: "image/png",
      });
    },
    /tipo declarado no coincide/,
  );

  // Rechaza contenido que no es una imagen admitida.
  await assert.rejects(
    async () => {
      await uploadReportPhoto({
        supabase: mockSupabase,
        userId: "u-1",
        reportId: "r-1",
        fileBytes: TXT_HEADER,
      });
    },
    /no es una imagen JPEG, PNG o WebP/,
  );
});

test("reintentar la misma foto reutiliza la ruta y permite reemplazar el objeto existente", async () => {
  const storedObjects = new Map<string, Uint8Array>();
  const attempts: Array<{ bucket: string; path: string; alreadyExists: boolean; upsert: boolean }> = [];
  const mockSupabase = {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, bytes: Uint8Array, options: { upsert?: boolean }) => {
          const key = `${bucket}/${path}`;
          const alreadyExists = storedObjects.has(key);
          attempts.push({ bucket, path, alreadyExists, upsert: options.upsert === true });
          storedObjects.set(key, new Uint8Array(bytes));
          return { data: { path }, error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  const input = {
    supabase: mockSupabase,
    userId: "u-retry",
    reportId: "r-reserved",
    fileBytes: JPEG_HEADER,
    declaredMimeType: "image/jpeg",
  };

  const firstAttempt = await uploadReportPhoto(input);
  const retry = await uploadReportPhoto(input);

  assert.equal(firstAttempt.storagePath, "u-retry/r-reserved/original.jpg");
  assert.equal(retry.storagePath, firstAttempt.storagePath);
  assert.equal(firstAttempt.photoPublicPath, retry.photoPublicPath);
  assert.equal(storedObjects.size, 2);
  assert.deepEqual(attempts, [
    { bucket: REPORTS_STORAGE_BUCKET, path: firstAttempt.storagePath, alreadyExists: false, upsert: true },
    { bucket: REPORTS_PUBLIC_BUCKET, path: firstAttempt.photoPublicPath, alreadyExists: false, upsert: true },
    { bucket: REPORTS_STORAGE_BUCKET, path: firstAttempt.storagePath, alreadyExists: true, upsert: true },
    { bucket: REPORTS_PUBLIC_BUCKET, path: firstAttempt.photoPublicPath, alreadyExists: true, upsert: true },
  ]);
});

test("compensateRemovePhotos elimina originales y copias por bucket", async () => {
  const removals: Array<{ bucket: string; paths: string[] }> = [];

  const mockSupabase = {
    storage: {
      from: (bucket: string) => ({
          remove: async (paths: string[]) => {
            removals.push({ bucket, paths });
            return { data: paths, error: null };
          },
      }),
    },
  } as unknown as SupabaseClient;

  await compensateRemovePhotos(mockSupabase, [
    { bucket: REPORTS_STORAGE_BUCKET, path: "u-1/r-1/original.jpg" },
    { bucket: REPORTS_PUBLIC_BUCKET, path: "r-1.jpg" },
  ]);
  assert.deepEqual(removals, [
    { bucket: REPORTS_STORAGE_BUCKET, paths: ["u-1/r-1/original.jpg"] },
    { bucket: REPORTS_PUBLIC_BUCKET, paths: ["r-1.jpg"] },
  ]);
});

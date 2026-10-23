import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  compensateRemovePhoto,
  createBatchSignedUrls,
  getStoragePath,
  REPORTS_STORAGE_BUCKET,
  sniffImageMimeType,
  uploadReportPhoto,
} from "../lib/reports/photos";

// Synthetic image headers
const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP_HEADER = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const TXT_HEADER = new Uint8Array(Buffer.from("Hello world, this is a plain text file pretending to be an image"));

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

test("uploadReportPhoto validates size, magic bytes and calls storage.upload", async () => {
  let uploadedBucket = "";
  let uploadedPath = "";
  let uploadedBytes: Uint8Array | null = null;
  let uploadOptions: unknown = null;

  const mockSupabase = {
    storage: {
      from: (bucket: string) => {
        uploadedBucket = bucket;
        return {
          upload: async (path: string, bytes: Uint8Array, opts: unknown) => {
            uploadedPath = path;
            uploadedBytes = bytes;
            uploadOptions = opts;
            return { data: { path }, error: null };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  // 1. Success case with JPEG
  const res = await uploadReportPhoto({
    supabase: mockSupabase,
    userId: "u-1",
    reportId: "r-1",
    fileBytes: JPEG_HEADER,
    declaredMimeType: "image/jpeg",
  });

  assert.equal(res.storagePath, "u-1/r-1/original.jpg");
  assert.equal(res.mimeType, "image/jpeg");
  assert.equal(res.byteSize, JPEG_HEADER.byteLength);
  assert.equal(uploadedBucket, REPORTS_STORAGE_BUCKET);
  assert.equal(uploadedPath, "u-1/r-1/original.jpg");
  assert.deepEqual(uploadedBytes, JPEG_HEADER);
  assert.deepEqual(uploadOptions, { contentType: "image/jpeg", upsert: true });

  // 2. Reject mismatched declared MIME type
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
    /Declared MIME type image\/png does not match detected content image\/jpeg/,
  );

  // 3. Reject non-image content
  await assert.rejects(
    async () => {
      await uploadReportPhoto({
        supabase: mockSupabase,
        userId: "u-1",
        reportId: "r-1",
        fileBytes: TXT_HEADER,
      });
    },
    /not a recognized or supported image format/,
  );
});

test("reintentar la misma foto reutiliza la ruta y permite reemplazar el objeto existente", async () => {
  const storedObjects = new Map<string, Uint8Array>();
  const attempts: Array<{ path: string; alreadyExists: boolean; upsert: boolean }> = [];
  const mockSupabase = {
    storage: {
      from: () => ({
        upload: async (path: string, bytes: Uint8Array, options: { upsert?: boolean }) => {
          const alreadyExists = storedObjects.has(path);
          attempts.push({ path, alreadyExists, upsert: options.upsert === true });
          storedObjects.set(path, new Uint8Array(bytes));
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
  assert.equal(storedObjects.size, 1);
  assert.deepEqual(attempts, [
    { path: firstAttempt.storagePath, alreadyExists: false, upsert: true },
    { path: firstAttempt.storagePath, alreadyExists: true, upsert: true },
  ]);
});

test("compensateRemovePhoto calls storage.remove with the target path", async () => {
  let removedBucket = "";
  let removedPaths: string[] = [];

  const mockSupabase = {
    storage: {
      from: (bucket: string) => {
        removedBucket = bucket;
        return {
          remove: async (paths: string[]) => {
            removedPaths = paths;
            return { data: paths, error: null };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  await compensateRemovePhoto(mockSupabase, "u-1/r-1/original.jpg");
  assert.equal(removedBucket, REPORTS_STORAGE_BUCKET);
  assert.deepEqual(removedPaths, ["u-1/r-1/original.jpg"]);
});

test("createBatchSignedUrls calls storage.createSignedUrls and returns map", async () => {
  const mockSupabase = {
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => {
          return {
            data: paths.map((path) => ({
              path,
              signedUrl: `https://example.invalid/signed/${path}`,
              error: null,
            })),
            error: null,
          };
        },
      }),
    },
  } as unknown as SupabaseClient;

  const urls = await createBatchSignedUrls(mockSupabase, ["u-1/r-1/original.jpg", "u-2/r-2/original.jpg"], 1800);
  assert.equal(urls.size, 2);
  const first = urls.get("u-1/r-1/original.jpg");
  assert.ok(first);
  assert.equal(first.url, "https://example.invalid/signed/u-1/r-1/original.jpg");
  assert.ok(first.expiresAt);
});

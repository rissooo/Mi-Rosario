import type { SupabaseClient } from "@supabase/supabase-js";
import {
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  type ImageMimeType,
} from "../contracts/reports";

export const REPORTS_STORAGE_BUCKET = "reports-originals";
export const DEFAULT_SIGNED_URL_EXPIRES_IN_SECONDS = 3600; // 1 hour

/**
 * Validates image content sniffing / magic bytes against allowed MIME types.
 * Rejects spoofed extensions and arbitrary files.
 */
export function sniffImageMimeType(buffer: Uint8Array | ArrayBuffer): ImageMimeType | null {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 12) return null;

  // JPEG: starts with FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: starts with 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP: RIFF ... WEBP
  // bytes 0..3 === 'RIFF' (0x52, 0x49, 0x46, 0x46)
  // bytes 8..11 === 'WEBP' (0x57, 0x42, 0x50, 0x20 or 0x57, 0x45, 0x42, 0x50)
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

/**
 * Returns deterministic storage path scoped to author and report.
 * Pattern: ${userId}/${reportId}/original.jpg
 */
export function getStoragePath(userId: string, reportId: string): string {
  if (!userId || !reportId) {
    throw new Error("userId and reportId are required for storage path");
  }
  return `${userId}/${reportId}/original.jpg`;
}

export type UploadPhotoOptions = {
  supabase: SupabaseClient;
  userId: string;
  reportId: string;
  fileBytes: Uint8Array;
  declaredMimeType?: string;
};

export type UploadPhotoResult = {
  storagePath: string;
  mimeType: ImageMimeType;
  byteSize: number;
};

/**
 * Uploads an original photo into private storage with content verification.
 * Enforces size limits and author-scoped folder isolation.
 */
export async function uploadReportPhoto({
  supabase,
  userId,
  reportId,
  fileBytes,
  declaredMimeType,
}: UploadPhotoOptions): Promise<UploadPhotoResult> {
  if (fileBytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`File size ${fileBytes.byteLength} exceeds maximum allowed of ${MAX_IMAGE_BYTES} bytes`);
  }

  const detectedMime = sniffImageMimeType(fileBytes);
  if (!detectedMime) {
    throw new Error("File content is not a recognized or supported image format (JPEG, PNG, WebP required)");
  }

  if (declaredMimeType && declaredMimeType !== detectedMime) {
    throw new Error(`Declared MIME type ${declaredMimeType} does not match detected content ${detectedMime}`);
  }

  const storagePath = getStoragePath(userId, reportId);

  const { error } = await supabase.storage
    .from(REPORTS_STORAGE_BUCKET)
    .upload(storagePath, fileBytes, {
      contentType: detectedMime,
      upsert: true,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  return {
    storagePath,
    mimeType: detectedMime,
    byteSize: fileBytes.byteLength,
  };
}

/**
 * Compensating removal: deletes an uploaded photo from storage upon definitive DB failure.
 */
export async function compensateRemovePhoto(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<void> {
  if (!storagePath) return;
  try {
    await supabase.storage.from(REPORTS_STORAGE_BUCKET).remove([storagePath]);
  } catch (error) {
    // Log compensation error; background cleanup job will reclaim orphan later
    console.error(`Failed compensating removal for ${storagePath}:`, error);
  }
}

/**
 * Batch generates signed viewing URLs for a list of storage paths.
 * Returns a Map of storagePath -> { url, expiresAt }.
 */
export async function createBatchSignedUrls(
  supabase: SupabaseClient,
  storagePaths: string[],
  expiresInSeconds: number = DEFAULT_SIGNED_URL_EXPIRES_IN_SECONDS,
): Promise<Map<string, { url: string; expiresAt: string }>> {
  const result = new Map<string, { url: string; expiresAt: string }>();
  if (storagePaths.length === 0) return result;

  const uniquePaths = Array.from(new Set(storagePaths.filter(Boolean)));
  if (uniquePaths.length === 0) return result;

  const { data, error } = await supabase.storage
    .from(REPORTS_STORAGE_BUCKET)
    .createSignedUrls(uniquePaths, expiresInSeconds);

  if (error || !data) {
    throw new Error(`Failed to create batch signed URLs: ${error?.message ?? "unknown error"}`);
  }

  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  for (const item of data) {
    if (item.signedUrl && item.path) {
      result.set(item.path, {
        url: item.signedUrl,
        expiresAt,
      });
    }
  }

  return result;
}

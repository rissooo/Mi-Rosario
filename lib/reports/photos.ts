import type { SupabaseClient } from "@supabase/supabase-js";
import {
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  type ImageMimeType,
} from "../contracts/reports";

export const REPORTS_STORAGE_BUCKET = "reports-originals";
export const REPORTS_PUBLIC_BUCKET = "reports-public";

export type PhotoStorageObject = { bucket: string; path: string };

export class ReportPhotoError extends Error {
  constructor(
    message: string,
    readonly kind: "validation" | "storage",
    readonly definitive: boolean,
    readonly apiCode?: "PAYLOAD_TOO_LARGE" | "UNSUPPORTED_MEDIA_TYPE",
    readonly uploadedObjects: PhotoStorageObject[] = [],
  ) {
    super(message);
    this.name = "ReportPhotoError";
  }
}

function invalidImage(message: string): ReportPhotoError {
  return new ReportPhotoError(message, "validation", true, "UNSUPPORTED_MEDIA_TYPE");
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function sanitizeJpeg(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw invalidImage("La estructura JPEG no es válida.");
  }

  const chunks: Uint8Array[] = [bytes.slice(0, 2)];
  let offset = 2;
  let inScan = false;
  let sawScan = false;
  let sawEnd = false;

  while (offset < bytes.length) {
    if (inScan) {
      let markerStart = offset;
      while (markerStart < bytes.length) {
        if (bytes[markerStart] !== 0xff) {
          markerStart += 1;
          continue;
        }

        let markerCodeIndex = markerStart + 1;
        while (markerCodeIndex < bytes.length && bytes[markerCodeIndex] === 0xff) markerCodeIndex += 1;
        if (markerCodeIndex >= bytes.length) throw invalidImage("El JPEG termina dentro de los datos de imagen.");

        const markerCode = bytes[markerCodeIndex];
        if (markerCode === 0x00 || (markerCode >= 0xd0 && markerCode <= 0xd7)) {
          markerStart = markerCodeIndex + 1;
          continue;
        }

        chunks.push(bytes.slice(offset, markerStart));
        offset = markerStart;
        inScan = false;
        break;
      }
      if (inScan) throw invalidImage("El JPEG no contiene un marcador final válido.");
      continue;
    }

    const markerStart = offset;
    if (bytes[offset] !== 0xff) throw invalidImage("Se encontró un segmento JPEG mal formado.");
    offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) throw invalidImage("El JPEG termina dentro de un marcador.");

    const markerCode = bytes[offset];
    offset += 1;
    if (markerCode === 0xd9) {
      chunks.push(bytes.slice(markerStart, offset));
      sawEnd = true;
      break;
    }
    if (markerCode === 0x00 || markerCode === 0xd8 || (markerCode >= 0xd0 && markerCode <= 0xd7)) {
      throw invalidImage("El JPEG contiene un marcador inesperado.");
    }
    if (offset + 2 > bytes.length) throw invalidImage("El segmento JPEG no tiene longitud completa.");

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      throw invalidImage("La longitud de un segmento JPEG no es válida.");
    }

    const segmentEnd = offset + segmentLength;
    const isAppSegment = markerCode >= 0xe0 && markerCode <= 0xef;
    const isCommentSegment = markerCode === 0xfe;
    if (!isAppSegment && !isCommentSegment) chunks.push(bytes.slice(markerStart, segmentEnd));
    if (markerCode === 0xda) {
      sawScan = true;
      inScan = true;
    }
    offset = segmentEnd;
  }

  if (!sawScan || !sawEnd || inScan) throw invalidImage("El JPEG está incompleto o no se puede analizar.");
  return concatBytes(chunks);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function sanitizePng(bytes: Uint8Array): Uint8Array {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 8 || signature.some((byte, index) => bytes[index] !== byte)) {
    throw invalidImage("La firma PNG no es válida.");
  }

  const chunks: Uint8Array[] = [bytes.slice(0, 8)];
  let offset = 8;
  let chunkCount = 0;
  let sawHeader = false;
  let sawImageData = false;
  let sawEnd = false;

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw invalidImage("El PNG contiene un chunk incompleto.");
    const dataLength = readUint32BigEndian(bytes, offset);
    const chunkEnd = offset + 12 + dataLength;
    if (chunkEnd > bytes.length) throw invalidImage("La longitud de un chunk PNG no es válida.");

    const chunkType = ascii(bytes, offset + 4, 4);
    if (!/^[A-Za-z]{4}$/.test(chunkType)) throw invalidImage("El PNG contiene un tipo de chunk inválido.");
    if (chunkCount === 0 && chunkType !== "IHDR") throw invalidImage("El primer chunk PNG debe ser IHDR.");
    if (chunkType === "IHDR") {
      if (sawHeader || chunkCount !== 0 || dataLength !== 13) throw invalidImage("El chunk IHDR no es válido.");
      sawHeader = true;
    }
    if (chunkType === "IDAT") sawImageData = true;

    const isMetadataChunk = ["eXIf", "tEXt", "zTXt", "iTXt", "tIME"].includes(chunkType);
    if (!isMetadataChunk) chunks.push(bytes.slice(offset, chunkEnd));
    offset = chunkEnd;
    chunkCount += 1;

    if (chunkType === "IEND") {
      if (dataLength !== 0 || offset !== bytes.length) throw invalidImage("El chunk IEND debe ser final y no contener datos.");
      sawEnd = true;
      break;
    }
  }

  if (!sawHeader || !sawImageData || !sawEnd) throw invalidImage("El PNG está incompleto o no se puede analizar.");
  return concatBytes(chunks);
}

function readUint32LittleEndian(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function writeUint32LittleEndian(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true);
}

function sanitizeWebp(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    throw invalidImage("La cabecera WebP no es válida.");
  }
  if (readUint32LittleEndian(bytes, 4) !== bytes.length - 8) {
    throw invalidImage("El tamaño RIFF del WebP no coincide con el archivo.");
  }

  const chunks: Uint8Array[] = [bytes.slice(8, 12)];
  let offset = 12;
  let sawImageData = false;
  let sawChunk = false;
  let sawExif = false;
  let sawXmp = false;
  let sawExtendedHeader = false;

  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw invalidImage("El WebP contiene un chunk incompleto.");
    const chunkType = ascii(bytes, offset, 4);
    const dataLength = readUint32LittleEndian(bytes, offset + 4);
    const chunkEnd = offset + 8 + dataLength + (dataLength % 2);
    if (chunkEnd > bytes.length) throw invalidImage("La longitud de un chunk WebP no es válida.");
    if (chunkType === "VP8X") {
      if (offset !== 12 || sawExtendedHeader || dataLength !== 10) {
        throw invalidImage("El chunk extendido VP8X no es válido.");
      }
      sawExtendedHeader = true;
    }
    if (chunkType === "EXIF") sawExif = true;
    if (chunkType === "XMP ") sawXmp = true;
    const isImageChunk = ["VP8 ", "VP8L", "ANMF"].includes(chunkType);
    if (isImageChunk) sawImageData = true;
    if (chunkType !== "EXIF" && chunkType !== "XMP ") {
      const chunk = bytes.slice(offset, chunkEnd);
      if (chunkType === "VP8X") {
        chunk[8] &= ~0x0c;
      }
      chunks.push(chunk);
    }
    sawChunk = true;
    offset = chunkEnd;
  }

  if (offset !== bytes.length || !sawChunk || !sawImageData || ((sawExif || sawXmp) && !sawExtendedHeader)) {
    throw invalidImage("El WebP está incompleto o no se puede analizar.");
  }

  const output = concatBytes([bytes.slice(0, 8), ...chunks]);
  writeUint32LittleEndian(output, 4, output.length - 8);
  return output;
}

/** Quita metadatos de presentación sin decodificar ni volver a codificar los píxeles. */
export function sanitizeImageMetadata(bytes: Uint8Array, mimeType: ImageMimeType): Uint8Array {
  if (mimeType === "image/jpeg") return sanitizeJpeg(bytes);
  if (mimeType === "image/png") return sanitizePng(bytes);
  if (mimeType === "image/webp") return sanitizeWebp(bytes);
  throw invalidImage("El formato de imagen no está permitido.");
}

/** Valida el tipo de imagen por su firma binaria y la lista permitida del contrato. */
export function sniffImageMimeType(buffer: Uint8Array | ArrayBuffer): ImageMimeType | null {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let detected: string | null = null;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    detected = "image/jpeg";
  } else if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
    bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    detected = "image/png";
  } else if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    detected = "image/webp";
  }
  return IMAGE_MIME_TYPES.find((mimeType) => mimeType === detected) ?? null;
}

function extensionForMimeType(mimeType: ImageMimeType): string {
  return mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp";
}

/** Ruta determinista privada, acotada al usuario y al ID reservado por la RPC. */
export function getStoragePath(userId: string, reportId: string, mimeType: ImageMimeType = "image/jpeg"): string {
  if (!userId || !reportId) throw new Error("Se requieren userId y reportId para la ruta privada.");
  return `${userId}/${reportId}/original.${extensionForMimeType(mimeType)}`;
}

export function getPublicPhotoPath(reportId: string, mimeType: ImageMimeType): string {
  if (!reportId) throw new Error("Se requiere reportId para la ruta pública.");
  return `${reportId}.${extensionForMimeType(mimeType)}`;
}

export function getPublicPhotoUrl(supabase: SupabaseClient, path: string): string {
  return supabase.storage.from(REPORTS_PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
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
  photoPublicPath: string;
  mimeType: ImageMimeType;
  byteSize: number;
  uploadedObjects: PhotoStorageObject[];
};

function storageErrorMessage(error: unknown): string {
  return error && typeof error === "object" && "message" in error && typeof error.message === "string"
    ? error.message
    : "respuesta desconocida de Storage";
}

function storageErrorIsDefinitive(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const details = error as { status?: unknown; statusCode?: unknown; message?: unknown };
  const status = Number(details.statusCode ?? details.status);
  const message = typeof details.message === "string" ? details.message.toLowerCase() : "";
  if ([408, 504, 524].includes(status) || /timeout|timed out|network|fetch failed|connection reset|socket hang up|aborted/.test(message)) {
    return false;
  }
  return Number.isInteger(status) && status >= 400 && status < 500;
}

async function uploadObject(
  supabase: SupabaseClient,
  object: PhotoStorageObject,
  bytes: Uint8Array,
  mimeType: ImageMimeType,
  priorUploads: PhotoStorageObject[],
): Promise<void> {
  try {
    const { error } = await supabase.storage.from(object.bucket).upload(object.path, bytes, {
      contentType: mimeType,
      upsert: true,
    });
    if (error) {
      throw new ReportPhotoError(
        `No se pudo subir la foto a Storage: ${storageErrorMessage(error)}`,
        "storage",
        storageErrorIsDefinitive(error),
        undefined,
        priorUploads,
      );
    }
  } catch (error: unknown) {
    if (error instanceof ReportPhotoError) throw error;
    throw new ReportPhotoError(
      `No se pudo confirmar la subida a Storage: ${storageErrorMessage(error)}`,
      "storage",
      false,
      undefined,
      priorUploads,
    );
  }
}

/** Sube la entrada original al bucket privado y su copia saneada al bucket público. */
export async function uploadReportPhoto({
  supabase,
  userId,
  reportId,
  fileBytes,
  declaredMimeType,
}: UploadPhotoOptions): Promise<UploadPhotoResult> {
  if (fileBytes.byteLength > MAX_IMAGE_BYTES) {
    throw new ReportPhotoError(
      `El archivo supera el máximo permitido de ${MAX_IMAGE_BYTES} bytes.`,
      "validation",
      true,
      "PAYLOAD_TOO_LARGE",
    );
  }

  const detectedMime = sniffImageMimeType(fileBytes);
  if (!detectedMime) throw invalidImage("El contenido no es una imagen JPEG, PNG o WebP reconocida.");
  if (declaredMimeType && declaredMimeType !== detectedMime) {
    throw invalidImage("El tipo declarado no coincide con el contenido de la imagen.");
  }

  const sanitizedBytes = sanitizeImageMetadata(fileBytes, detectedMime);
  if (sanitizedBytes.byteLength === 0 || sanitizedBytes.byteLength > MAX_IMAGE_BYTES) {
    throw invalidImage("La copia saneada no tiene un tamaño válido.");
  }

  const storagePath = getStoragePath(userId, reportId, detectedMime);
  const photoPublicPath = getPublicPhotoPath(reportId, detectedMime);
  const originalObject = { bucket: REPORTS_STORAGE_BUCKET, path: storagePath };
  const publicObject = { bucket: REPORTS_PUBLIC_BUCKET, path: photoPublicPath };
  const uploadedObjects: PhotoStorageObject[] = [];

  try {
    await uploadObject(supabase, originalObject, fileBytes, detectedMime, uploadedObjects);
    uploadedObjects.push(originalObject);
    await uploadObject(supabase, publicObject, sanitizedBytes, detectedMime, uploadedObjects);
    uploadedObjects.push(publicObject);
  } catch (error: unknown) {
    if (error instanceof ReportPhotoError) {
      throw new ReportPhotoError(
        error.message,
        error.kind,
        error.definitive,
        error.apiCode,
        error.uploadedObjects,
      );
    }
    throw new ReportPhotoError("No se pudo confirmar la carga de la fotografía.", "storage", false, undefined, uploadedObjects);
  }

  return {
    storagePath,
    photoPublicPath,
    mimeType: detectedMime,
    byteSize: sanitizedBytes.byteLength,
    uploadedObjects,
  };
}

/** Compensa exclusivamente las subidas conocidas antes del commit. */
export async function compensateRemovePhotos(
  supabase: SupabaseClient,
  objects: PhotoStorageObject[],
): Promise<void> {
  const byBucket = new Map<string, string[]>();
  for (const object of objects) {
    const paths = byBucket.get(object.bucket) ?? [];
    paths.push(object.path);
    byBucket.set(object.bucket, paths);
  }

  for (const [bucket, paths] of byBucket) {
    try {
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) console.error(`No se pudo compensar la carga en ${bucket}:`, error.message);
    } catch (error) {
      console.error(`No se pudo compensar la carga en ${bucket}:`, error);
    }
  }
}

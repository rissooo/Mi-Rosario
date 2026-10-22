import "server-only";
import sharp, { type Sharp } from "sharp";
import type { ImageMimeType } from "../contracts/reports";
import { MAX_IMAGE_BYTES } from "../contracts/reports";
import { VisionError } from "./errors";

export type NormalizedImage = { bytes: Buffer; mimeType: ImageMimeType };
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function format(bytes: Buffer): ImageMimeType | undefined {
  if (bytes.subarray(0, 8).equals(PNG)) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
}

/** Revisa chunks PNG para no confundir APNG con una imagen estática. */
function animatedPng(bytes: Buffer) {
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) throw new VisionError("VALIDATION_ERROR");
    if (bytes.toString("ascii", offset + 4, offset + 8) === "acTL") return true;
    if (bytes.toString("ascii", offset + 4, offset + 8) === "IEND") {
      if (offset + length + 12 !== bytes.length) throw new VisionError("VALIDATION_ERROR");
      return false;
    }
    offset += length + 12;
  }
  throw new VisionError("VALIDATION_ERROR");
}

function checkWebp(bytes: Buffer) {
  if (bytes.length < 12 || bytes.readUInt32LE(4) + 8 !== bytes.length) throw new VisionError("VALIDATION_ERROR");
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const kind = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (size > bytes.length - offset - 8 || kind === "ANIM" || kind === "ANMF" ||
      (kind === "VP8X" && size > 0 && (bytes[offset + 8] & 2) !== 0)) throw new VisionError("VALIDATION_ERROR");
    offset += 8 + size + (size % 2);
  }
  if (offset !== bytes.length) throw new VisionError("VALIDATION_ERROR");
}

function checkJpeg(bytes: Buffer) {
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 255) break;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217) {
      if (offset === bytes.length) return;
      break;
    }
    if (marker === 216 || marker === 0 || marker === undefined) break;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || length > bytes.length - offset) break;
    offset += length;
    if (marker === 218) {
      while (offset < bytes.length) {
        if (bytes[offset] !== 255) { offset++; continue; }
        const next = bytes[offset + 1];
        if (next === 0 || (next >= 208 && next <= 215)) { offset += 2; continue; }
        break;
      }
    }
  }
  throw new VisionError("VALIDATION_ERROR");
}

export async function normalizeImage(file: File, signal: AbortSignal): Promise<NormalizedImage> {
  if (signal.aborted) throw new VisionError("ANALYSIS_TIMEOUT");
  if (file.size > MAX_IMAGE_BYTES) throw new VisionError("PAYLOAD_TOO_LARGE");
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = format(bytes);
  if (!mime || mime !== file.type) throw new VisionError("UNSUPPORTED_MEDIA_TYPE");
  if (mime === "image/png" && animatedPng(bytes)) throw new VisionError("VALIDATION_ERROR");
  if (mime === "image/webp") checkWebp(bytes);
  if (mime === "image/jpeg") checkJpeg(bytes);
  const decoder = sharp(bytes, { failOn: "warning", limitInputPixels: 24_000_000, limitInputChannels: 4, unlimited: false }).timeout({ seconds: 3 });
  let output: Sharp | undefined;
  const cancel = () => { decoder.destroy(); output?.destroy(); };
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  const started = performance.now();
  try {
    const meta = await decoder.metadata();
    if (!meta.width || !meta.height || meta.width > 8192 || meta.height > 8192 ||
      meta.width * meta.height > 24_000_000 || (meta.pages ?? 1) !== 1 || (meta.channels ?? 0) > 4) throw new VisionError("VALIDATION_ERROR");
    const detected = meta.format === "jpeg" ? "image/jpeg" : meta.format === "png" ? "image/png" : meta.format === "webp" ? "image/webp" : undefined;
    if (detected !== mime) throw new VisionError("UNSUPPORTED_MEDIA_TYPE");
    // Forzar píxeles completos evita validar solo cabeceras o una miniatura.
    const raw = await decoder.autoOrient().raw().toBuffer({ resolveWithObject: true });
    if (signal.aborted) throw new VisionError("ANALYSIS_TIMEOUT");
    output = sharp(raw.data, { raw: raw.info }).resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true });
    const remaining = 3 - (performance.now() - started) / 1000;
    if (remaining <= 0) throw new VisionError("ANALYSIS_TIMEOUT");
    output.timeout({ seconds: Math.max(1, Math.ceil(remaining)) });
    const hasAlpha = raw.info.channels === 2 || raw.info.channels === 4;
    const normalized = await (hasAlpha ? output.png() : output.jpeg({ quality: 80 })).toBuffer();
    if (signal.aborted || performance.now() - started >= 3000) throw new VisionError("ANALYSIS_TIMEOUT");
    if (normalized.length > 2 * 1024 * 1024) throw new VisionError("VALIDATION_ERROR");
    return { bytes: normalized, mimeType: hasAlpha ? "image/png" : "image/jpeg" };
  } catch (error) {
    if (signal.aborted || (error instanceof Error && /timeout|time.?out/i.test(error.message))) throw new VisionError("ANALYSIS_TIMEOUT");
    if (error instanceof VisionError) throw error;
    throw new VisionError("VALIDATION_ERROR");
  } finally {
    signal.removeEventListener("abort", cancel);
    decoder.destroy(); output?.destroy();
  }
}

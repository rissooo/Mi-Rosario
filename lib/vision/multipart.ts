import { MAX_IMAGE_BYTES, MAX_MULTIPART_BYTES, IMAGE_MIME_TYPES } from "../contracts/reports";
import { VisionError } from "./errors";

export async function readImage(request: Request, signal: AbortSignal): Promise<File> {
  if (signal.aborted) throw new VisionError("ANALYSIS_TIMEOUT");
  const type = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(type) || request.headers.has("content-encoding")) {
    throw new VisionError("UNSUPPORTED_MEDIA_TYPE");
  }
  if (!/;\s*boundary=(?:"[^"\r\n]{1,200}"|[^;\s]{1,200})(?:;|$)/i.test(type)) throw new VisionError("VALIDATION_ERROR");
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > MAX_MULTIPART_BYTES) throw new VisionError("PAYLOAD_TOO_LARGE");
  if (!request.body) throw new VisionError("VALIDATION_ERROR");
  const reader = request.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  // Una sola reserva; la memoria retenida no crece con la cantidad de fragmentos.
  const buffer = Buffer.alloc(MAX_MULTIPART_BYTES);
  let size = 0;
  let reads = 0;
  try {
    while (true) {
      // Los streams muy fragmentados no deben impedir que corra el timeout/abort.
      if (++reads % 256 === 0) await new Promise<void>((resolve) => setImmediate(resolve));
      if (signal.aborted) throw new VisionError("ANALYSIS_TIMEOUT");
      const { done, value } = await reader.read();
      if (done) break;
      if (signal.aborted) throw new VisionError("ANALYSIS_TIMEOUT");
      if (!value.byteLength) continue;
      if (value.byteLength > MAX_MULTIPART_BYTES - size) { cancel(); throw new VisionError("PAYLOAD_TOO_LARGE"); }
      buffer.set(value, size);
      size += value.byteLength;
    }
    if (signal.aborted) throw new VisionError("ANALYSIS_TIMEOUT");
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  let form: FormData;
  try { form = await new Response(buffer.subarray(0, size), { headers: { "content-type": type } }).formData(); }
  catch { throw new VisionError(signal.aborted ? "ANALYSIS_TIMEOUT" : "VALIDATION_ERROR"); }
  if (signal.aborted) throw new VisionError("ANALYSIS_TIMEOUT");
  const entries = [...form.entries()];
  if (entries.length !== 1 || entries[0][0] !== "image" || !(entries[0][1] instanceof File)) throw new VisionError("VALIDATION_ERROR");
  const image = entries[0][1];
  if (image.size > MAX_IMAGE_BYTES) throw new VisionError("PAYLOAD_TOO_LARGE");
  if (!image.size) throw new VisionError("VALIDATION_ERROR");
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(image.type)) throw new VisionError("UNSUPPORTED_MEDIA_TYPE");
  return image;
}

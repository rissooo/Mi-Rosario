import "server-only";
import { MAX_JSON_BYTES } from "../contracts/reports";
import { suggestionSchema, SYSTEM_INSTRUCTION } from "./prompt";
import { VisionError } from "./errors";
import type { VisionProvider } from "./provider";

const MODEL = "qwen/qwen3.8-27b";
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const MAX_RESPONSE_BYTES = 64 * 1024;

function groqFailure(status: number): VisionError {
  return status === 408 || status === 504
    ? new VisionError("ANALYSIS_TIMEOUT")
    : new VisionError(status === 401 || status === 403 || status === 429 || status >= 500
      ? "ANALYSIS_UNAVAILABLE" : "ANALYSIS_FAILED");
}

/** Recibe solo el status HTTP de un rechazo de Groq; nunca la imagen, la clave ni el cuerpo. */
export type GroqFailureReporter = (status: number) => void;

/** Usa la misma solicitud multimodal estructurada que dio JSON válido en el benchmark. */
export function createGroqVisionProvider(
  apiKey: string,
  transport: typeof fetch = fetch,
  reportFailure?: GroqFailureReporter,
): VisionProvider {
  if (!apiKey.trim()) throw new VisionError("ANALYSIS_UNAVAILABLE");
  return {
    async analyze(image, signal, remainingMs) {
      if (signal.aborted || remainingMs <= 0) throw new VisionError("ANALYSIS_TIMEOUT");
      try {
        const base64 = image.bytes.toString("base64");
        const response = await transport(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          cache: "no-store",
          redirect: "error",
          signal,
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: "system", content: SYSTEM_INSTRUCTION + "\nRespondé exclusivamente un objeto JSON válido." },
              { role: "user", content: [
                { type: "text", text: "Analizá solo la evidencia visual de esta imagen urbana." },
                { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${base64}` } },
              ] },
            ],
            response_format: {
              type: "json_schema",
              json_schema: { name: "vision_suggestion", strict: true, schema: suggestionSchema() },
            },
            temperature: 0,
            max_completion_tokens: 1024,
          }),
        });
        if (!response.ok) {
          // Un fallo del observador nunca cambia la respuesta del endpoint.
          try { reportFailure?.(response.status); } catch {}
          throw groqFailure(response.status);
        }
        if (Number(response.headers.get("content-length") || 0) > MAX_RESPONSE_BYTES) throw new VisionError("ANALYSIS_FAILED");
        const raw = await response.text();
        if (Buffer.byteLength(raw, "utf8") > MAX_RESPONSE_BYTES) throw new VisionError("ANALYSIS_FAILED");
        const json: unknown = JSON.parse(raw);
        if (!json || typeof json !== "object" || !("choices" in json) || !Array.isArray(json.choices)) {
          throw new VisionError("ANALYSIS_FAILED");
        }
        const result = json.choices[0] as { finish_reason?: unknown; message?: { content?: unknown } } | undefined;
        const content = result?.message?.content;
        if (result?.finish_reason !== "stop" || typeof content !== "string" ||
            Buffer.byteLength(content, "utf8") > MAX_JSON_BYTES) throw new VisionError("ANALYSIS_FAILED");
        return JSON.parse(content) as unknown;
      } catch (error) {
        if (signal.aborted) throw new VisionError("ANALYSIS_TIMEOUT");
        if (error instanceof VisionError) throw error;
        throw new VisionError(error instanceof TypeError ? "ANALYSIS_UNAVAILABLE" : "ANALYSIS_FAILED");
      }
    },
  };
}

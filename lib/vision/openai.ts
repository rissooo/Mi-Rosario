import "server-only";
import { MAX_JSON_BYTES } from "../contracts/reports";
import { suggestionSchema, SYSTEM_INSTRUCTION } from "./prompt";
import { VisionError } from "./errors";
import type { VisionProvider } from "./provider";

const MODEL = "gpt-6-luna";
const ENDPOINT = "https://api.openai.com/v1/responses";
const MAX_RESPONSE_BYTES = 64 * 1024;

/** Recibe solo el status HTTP de un rechazo de OpenAI; nunca la imagen, la clave ni el cuerpo. */
export type OpenAIFailureReporter = (status: number) => void;

/**
 * Proveedor de la IA desplegada en Vercel. En local solo se instancia con VISION_LOCAL_OPENAI_REAL=1:
 * la clave en .env.local, por sí sola, NO habilita gasto.
 */
export function createOpenAIVisionProvider(
  apiKey: string,
  transport: typeof fetch = fetch,
  reportFailure?: OpenAIFailureReporter,
): VisionProvider {
  if (!apiKey.trim()) throw new VisionError("ANALYSIS_UNAVAILABLE");
  return {
    async analyze(image, signal, remainingMs) {
      if (signal.aborted || remainingMs <= 0) throw new VisionError("ANALYSIS_TIMEOUT");
      try {
        // OpenAI Structured Outputs no admite maxItems en su subconjunto JSON Schema.
        // El contrato local vuelve a verificar el límite de 5 advertencias tras la respuesta.
        const baseSchema = suggestionSchema();
        const openaiSchema = { ...baseSchema, properties: {
          ...baseSchema.properties,
          warnings: { type: "array", items: { type: "string" } },
        } };
        const response = await transport(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          cache: "no-store",
          redirect: "error",
          signal,
          body: JSON.stringify({
            model: MODEL,
            store: false,
            reasoning: { effort: "none" },
            instructions: SYSTEM_INSTRUCTION + "\nRespondé exclusivamente un objeto JSON válido.",
            input: [{ role: "user", content: [
              { type: "input_text", text: "Analizá solo la evidencia visual de esta imagen urbana." },
              { type: "input_image", image_url: `data:${image.mimeType};base64,${image.bytes.toString("base64")}`, detail: "high" },
            ] }],
            text: { format: { type: "json_schema", name: "vision_suggestion", strict: true, schema: openaiSchema } },
            max_output_tokens: 1024,
          }),
        });
        if (!response.ok) {
          // Un fallo del observador nunca cambia la respuesta del endpoint.
          try { reportFailure?.(response.status); } catch {}
          throw new VisionError(response.status === 408 || response.status === 504
            ? "ANALYSIS_TIMEOUT" : response.status === 401 || response.status === 403 ||
            response.status === 429 || response.status >= 500 ? "ANALYSIS_UNAVAILABLE" : "ANALYSIS_FAILED");
        }
        if (Number(response.headers.get("content-length") || 0) > MAX_RESPONSE_BYTES) throw new VisionError("ANALYSIS_FAILED");
        const raw = await response.text();
        if (Buffer.byteLength(raw, "utf8") > MAX_RESPONSE_BYTES) throw new VisionError("ANALYSIS_FAILED");
        const json: unknown = JSON.parse(raw);
        if (!json || typeof json !== "object" || !("output" in json) || !Array.isArray(json.output) ||
            ("status" in json && json.status !== "completed")) throw new VisionError("ANALYSIS_FAILED");
        const output = json.output as { type?: string; content?: { type?: string; text?: string }[] }[];
        const content = output.filter((item) => item.type === "message")
          .flatMap((item) => item.content ?? [])
          .filter((item) => item.type === "output_text")
          .map((item) => item.text ?? "").join("");
        if (!content || Buffer.byteLength(content, "utf8") > MAX_JSON_BYTES) throw new VisionError("ANALYSIS_FAILED");
        return JSON.parse(content) as unknown;
      } catch (error) {
        if (signal.aborted) throw new VisionError("ANALYSIS_TIMEOUT");
        if (error instanceof VisionError) throw error;
        throw new VisionError(error instanceof TypeError ? "ANALYSIS_UNAVAILABLE" : "ANALYSIS_FAILED");
      }
    },
  };
}

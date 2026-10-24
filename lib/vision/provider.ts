import "server-only";
import type { GenerateContentParameters } from "@google/genai";
import { MAX_JSON_BYTES } from "../contracts/reports";
import type { NormalizedImage } from "./image";
import { VisionError } from "./errors";
import type { VisionDiagnostic } from "./diagnostics";
import { createGeminiGenerateParams } from "./gemini-request";

export interface VisionProvider {
  analyze(image: NormalizedImage, signal: AbortSignal, remainingMs: number): Promise<unknown>;
}
type Reply = { text?: string; candidates?: { finishReason?: string }[] };
export type Generate = (request: GenerateContentParameters) => Promise<Reply>;
const ALLOWED_GEMINI_MODELS: readonly string[] = Object.freeze(["gemini-3.8-flash"]);

/** Valida el JSON antes de que el SDK agregue propiedades a la respuesta HTTP exitosa. */
export function createGeminiFetch(transport: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const response = await transport(input, init);
    if (response.ok) {
      const parseJson = response.json.bind(response);
      response.json = async () => {
        const body: unknown = await parseJson();
        if (body === null || typeof body !== "object" || Array.isArray(body)) throw new VisionError("ANALYSIS_FAILED");
        return body;
      };
    }
    return response;
  };
}

/** Solo se conecta al transporte explícito: simulado en tests o SDK en modo real local autorizado. */
export function createGeminiProvider(generate: Generate, model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash", diagnostic?: VisionDiagnostic): VisionProvider {
  if (!ALLOWED_GEMINI_MODELS.includes(model)) { diagnostic?.event("configuration", "model_rejected", 503); throw new VisionError("ANALYSIS_UNAVAILABLE"); }
  return {
    async analyze(image, signal, remainingMs) {
      if (signal.aborted || remainingMs <= 0) throw new VisionError("ANALYSIS_TIMEOUT");
      try {
        const reply = await generate(createGeminiGenerateParams(image, signal, remainingMs, model));
        diagnostic?.event("generate", "ok");
        if (signal.aborted) throw new VisionError("ANALYSIS_TIMEOUT");
        if (reply.candidates?.length !== 1 || reply.candidates[0].finishReason !== "STOP" || !reply.text ||
          Buffer.byteLength(reply.text, "utf8") > MAX_JSON_BYTES) throw new VisionError("ANALYSIS_FAILED");
        try { return JSON.parse(reply.text) as unknown; }
        catch { throw new VisionError("ANALYSIS_FAILED"); }
      } catch (error) {
        const safeStatus = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : undefined;
        diagnostic?.event("generate", signal.aborted ? "timeout" : safeStatus !== undefined ? "provider_http" : error instanceof TypeError ? "network" : "failed", safeStatus);
        if (signal.aborted) throw new VisionError("ANALYSIS_TIMEOUT");
        if (error instanceof VisionError) throw error;
        const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : undefined;
        if (status === 408 || status === 504) throw new VisionError("ANALYSIS_TIMEOUT");
        if (status === 429 || status === 401 || status === 403 || (status !== undefined && status >= 500) || error instanceof TypeError) {
          throw new VisionError("ANALYSIS_UNAVAILABLE", 60);
        }
        throw new VisionError("ANALYSIS_FAILED");
      }
    },
  };
}

export function createSimulatedProvider(): VisionProvider {
  return {
    async analyze(_image, signal) {
      if (signal.aborted) throw new VisionError("ANALYSIS_TIMEOUT");
      return { title: null, description: null, categoryId: null, severity: null,
        warnings: ["Simulación local: no se realizó un análisis visual con Gemini. Completá los campos manualmente."] };
    },
  };
}

import "server-only";
import { ThinkingLevel, type GenerateContentParameters } from "@google/genai";
import { MAX_JSON_BYTES } from "../contracts/reports";
import type { NormalizedImage } from "./image";
import { VisionError } from "./errors";
import { suggestionSchema, SYSTEM_INSTRUCTION } from "./prompt";

export interface VisionProvider {
  analyze(image: NormalizedImage, signal: AbortSignal, remainingMs: number): Promise<unknown>;
}
type Reply = { text?: string; candidates?: { finishReason?: string }[] };
export type Generate = (request: GenerateContentParameters) => Promise<Reply>;
const ALLOWED_GEMINI_MODELS: readonly string[] = Object.freeze(["gemini-3.8-flash"]);

/** Solo se conecta a un transporte suministrado explícitamente. La ruta local nunca usa este adaptador. */
export function createGeminiProvider(generate: Generate, model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash"): VisionProvider {
  if (!ALLOWED_GEMINI_MODELS.includes(model)) throw new VisionError("ANALYSIS_UNAVAILABLE");
  return {
    async analyze(image, signal, remainingMs) {
      if (signal.aborted || remainingMs <= 0) throw new VisionError("ANALYSIS_TIMEOUT");
      try {
        const reply = await generate({
          model,
          contents: [{ role: "user", parts: [{ text: "Analizá solo la evidencia visual de esta imagen urbana." },
            { inlineData: { data: image.bytes.toString("base64"), mimeType: image.mimeType } }] }],
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: "application/json", responseJsonSchema: suggestionSchema(),
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, maxOutputTokens: 2048,
            candidateCount: 1, tools: [], automaticFunctionCalling: { disable: true },
            abortSignal: signal,
            httpOptions: { timeout: Math.min(20_000, remainingMs), retryOptions: { attempts: 1 } },
          },
        });
        if (signal.aborted) throw new VisionError("ANALYSIS_TIMEOUT");
        if (reply.candidates?.length !== 1 || reply.candidates[0].finishReason !== "STOP" || !reply.text ||
          Buffer.byteLength(reply.text, "utf8") > MAX_JSON_BYTES) throw new VisionError("ANALYSIS_FAILED");
        try { return JSON.parse(reply.text) as unknown; }
        catch { throw new VisionError("ANALYSIS_FAILED"); }
      } catch (error) {
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

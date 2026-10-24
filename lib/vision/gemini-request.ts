import { ThinkingLevel, type GenerateContentParameters } from "@google/genai";
import type { NormalizedImage } from "./image";
import { suggestionSchema, SYSTEM_INSTRUCTION } from "./prompt";

/** Petición multimodal compartida para Gemini 3.8 Flash.
 * Mantener libre de candidateCount: Gemini 3.8 Flash rechaza ese parámetro con HTTP 400.
 * El schema es JSON Schema y se valida nuevamente en el servidor después de generar.
 */
export function createGeminiGenerateParams(
  image: NormalizedImage,
  signal: AbortSignal,
  remainingMs: number,
  model: string,
): GenerateContentParameters {
  return {
    model,
    contents: [{ role: "user", parts: [
      { text: "Analizá solo la evidencia visual de esta imagen urbana." },
      { inlineData: { data: image.bytes.toString("base64"), mimeType: image.mimeType } },
    ] }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseJsonSchema: suggestionSchema(),
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      maxOutputTokens: 2048,
      tools: [],
      automaticFunctionCalling: { disable: true },
      abortSignal: signal,
      httpOptions: { timeout: Math.min(20_000, remainingMs), retryOptions: { attempts: 1 } },
    },
  };
}

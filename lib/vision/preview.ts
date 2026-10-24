import "server-only";
import { VisionError } from "./errors";
import type { VisionProvider } from "./provider";
import { createOpenAIVisionProvider } from "./openai";
import { createFallbackVisionProvider, type VisionAttemptEvent } from "./router";

type Env = Readonly<Record<string, string | undefined>>;
type LogLine = (line: string) => void;

/**
 * Logs de Vercel para diagnosticar la IA desplegada: resultado, duración y, si OpenAI rechaza, su
 * status HTTP (401 clave, 429 sin saldo o límite). Nunca la imagen, la clave ni el texto.
 */
export function visionLogReporters(write: LogLine = (line) => console.warn(line)) {
  const log = (record: Record<string, unknown>) => {
    try { write(JSON.stringify({ source: "vision", ...record })); } catch {}
  };
  return {
    providerFailure: (status: number) => log({ provider: "openai", outcome: "provider_http", status }),
    attempt: (event: VisionAttemptEvent) => {
      if (event.outcome !== "success") log({ provider: event.provider, outcome: event.outcome, durationMs: event.durationMs });
    },
  };
}

/** OpenAI tarda unos 5 s con fotos de celular; 18 s deja margen dentro del plazo total de 20 s. */
export const OPENAI_ATTEMPT_MS = 18_000;

/** En Vercel la IA usa solo OpenAI; Groq quedó fuera por el límite de su plan gratis. */
export function previewVisionProvider(env: Env, write?: LogLine): VisionProvider {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) throw new VisionError("ANALYSIS_UNAVAILABLE");
  const reporters = visionLogReporters(write);
  return createFallbackVisionProvider([
    { name: "openai", provider: createOpenAIVisionProvider(key, fetch, reporters.providerFailure), limitMs: OPENAI_ATTEMPT_MS },
  ], reporters.attempt);
}

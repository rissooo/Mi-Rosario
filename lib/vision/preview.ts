import "server-only";
import { VisionError } from "./errors";
import type { VisionProvider } from "./provider";
import { createGroqVisionProvider } from "./groq";
import { createOpenAIVisionProvider } from "./openai";
import { createFallbackVisionProvider, type VisionAttemptEvent, type VisionFallbackStep } from "./router";

type Env = Readonly<Record<string, string | undefined>>;

type LogLine = (line: string) => void;

/**
 * Logs de Vercel para diagnosticar la IA desplegada: proveedor, resultado, duración y, si Groq
 * rechaza, su status HTTP (401 clave, 429 límite del plan). Nunca la imagen, la clave ni el texto.
 */
export function visionLogReporters(write: LogLine = (line) => console.warn(line)) {
  const log = (record: Record<string, unknown>) => {
    try { write(JSON.stringify({ source: "vision", ...record })); } catch {}
  };
  return {
    groqFailure: (status: number) => log({ provider: "groq", outcome: "provider_http", status }),
    attempt: (event: VisionAttemptEvent) => {
      if (event.outcome !== "success") log({ provider: event.provider, outcome: event.outcome, durationMs: event.durationMs });
    },
  };
}

/** Groq tarda 2-4 s con fotos de celular; 12 s deja margen dentro del plazo total de 20 s. */
export const GROQ_ATTEMPT_MS = 12_000;

/** El flag de OpenAI en local NO autoriza gastos en Vercel. */
export function previewVisionProvider(env: Env, write?: LogLine): VisionProvider {
  const key = env.GROQ_API_KEY?.trim();
  if (!key) throw new VisionError("ANALYSIS_UNAVAILABLE");
  const reporters = visionLogReporters(write);
  const steps: VisionFallbackStep[] = [
    { name: "groq", provider: createGroqVisionProvider(key, fetch, reporters.groqFailure), limitMs: GROQ_ATTEMPT_MS },
  ];
  // El respaldo de OpenAI requiere autorización separada para Production.
  const openaiEnabled = env.VERCEL_ENV === "production"
    ? env.VISION_PRODUCTION_OPENAI_ENABLED === "1"
    : env.VERCEL_ENV === "preview" && env.VISION_DEPLOY_OPENAI_ENABLED === "1";
  if (openaiEnabled) {
    const openaiKey = env.OPENAI_API_KEY?.trim();
    if (!openaiKey) throw new VisionError("ANALYSIS_UNAVAILABLE");
    steps.push({ name: "openai", provider: createOpenAIVisionProvider(openaiKey), limitMs: 12_000 });
  }
  return createFallbackVisionProvider(steps, reporters.attempt);
}


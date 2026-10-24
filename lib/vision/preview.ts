import "server-only";
import { VisionError } from "./errors";
import type { VisionProvider } from "./provider";
import { createGroqVisionProvider } from "./groq";
import { createOpenAIVisionProvider } from "./openai";
import { createFallbackVisionProvider, type VisionFallbackStep } from "./router";

/** El flag de OpenAI en local NO autoriza gastos en Vercel. */
export function previewVisionProvider(env: Env): VisionProvider {
  const key = env.GROQ_API_KEY?.trim();
  if (!key) throw new VisionError("ANALYSIS_UNAVAILABLE");
  const steps: VisionFallbackStep[] = [
    { name: "groq", provider: createGroqVisionProvider(key), limitMs: 5_000 },
  ];
  if (env.VISION_DEPLOY_OPENAI_ENABLED === "1") {
    const openaiKey = env.OPENAI_API_KEY?.trim();
    if (!openaiKey) throw new VisionError("ANALYSIS_UNAVAILABLE");
    steps.push({ name: "openai", provider: createOpenAIVisionProvider(openaiKey), limitMs: 12_000 });
  }
  return createFallbackVisionProvider(steps);
}


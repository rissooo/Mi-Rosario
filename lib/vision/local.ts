import "server-only";
import { GoogleGenAI, type GoogleGenAIOptions } from "@google/genai";
import { VisionError } from "./errors";
import { createGroqVisionProvider } from "./groq";
import { createOpenAIVisionProvider } from "./openai";
import { createFallbackVisionProvider, type VisionFallbackStep, type VisionAttemptEvent } from "./router";
import type { VisionDiagnostic } from "./diagnostics";
import { createGeminiFetch, createGeminiProvider, createSimulatedProvider, type Generate, type VisionProvider } from "./provider";

type LocalEnvironment = Readonly<Record<string, string | undefined>>;
type ClientFactory = (options: GoogleGenAIOptions) => { models: { generateContent: Generate } };

/** Selección local únicamente; la fábrica inyectable permite probar sin red ni claves reales. */
export function selectLocalVisionProvider(
  env: LocalEnvironment = process.env,
  createClient: ClientFactory = (options) => new GoogleGenAI(options),
  diagnostic?: VisionDiagnostic,
): VisionProvider | null {
  if (env.NODE_ENV !== "development" || env.VERCEL !== undefined) return null;
  const real = env.VISION_LOCAL_GEMINI_REAL === "1";
  const router = env.VISION_LOCAL_ROUTER_REAL === "1";
  const simulated = env.VISION_LOCAL_SIMULATION === "1";
  // Sin autorización o con modos ambiguos se falla cerrado, sin fallback.
  if (Number(real) + Number(simulated) + Number(router) !== 1) { diagnostic?.event("configuration", "flags_invalid", 503); return null; }
  if (simulated) return createSimulatedProvider();

  if (router) {
    const groqKey = env.GROQ_API_KEY?.trim();
    if (!groqKey) { diagnostic?.event("configuration", "key_missing", 503); throw new VisionError("ANALYSIS_UNAVAILABLE"); }
    // Esta simulación solo existe en desarrollo local y no llama a Groq.
    const forcedGroqFailure = env.VISION_LOCAL_TEST_GROQ_FAILURE === "1";
    const groqProvider: VisionProvider = forcedGroqFailure
      ? { async analyze() { throw new VisionError("ANALYSIS_UNAVAILABLE"); } }
      : createGroqVisionProvider(groqKey);
    const steps: VisionFallbackStep[] = [
      { name: "groq", provider: groqProvider, limitMs: 5_000 },
    ];
    const geminiKey = env.GEMINI_API_KEY?.trim();
    if (geminiKey) steps.push({ name: "gemini", provider: buildGeminiProvider(geminiKey, env.GEMINI_MODEL ?? "gemini-3.8-flash", createClient, diagnostic), limitMs: 9_000 });
    if (env.VISION_LOCAL_OPENAI_REAL === "1") {
      const openaiKey = env.OPENAI_API_KEY?.trim();
      if (!openaiKey) { diagnostic?.event("configuration", "key_missing", 503); throw new VisionError("ANALYSIS_UNAVAILABLE"); }
      steps.push({ name: "openai", provider: createOpenAIVisionProvider(openaiKey), limitMs: 4_000 });
    }
    const reporter = env.VISION_LOCAL_ROUTER_TRACE === "1"
      ? (event: VisionAttemptEvent) => {
        // Campos cerrados: nunca se imprimen prompts, fotos, respuestas ni credenciales.
        const record = {
          source: "vision-router-local",
          provider: event.provider,
          outcome: event.outcome,
          durationMs: event.durationMs,
          ...(forcedGroqFailure && event.provider === "groq" ? { testFailure: true } : {}),
        };
        try { console.info(JSON.stringify(record)); } catch {}
      }
      : undefined;
    return createFallbackVisionProvider(steps, reporter);
  }

  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) { diagnostic?.event("configuration", "key_missing", 503); throw new VisionError("ANALYSIS_UNAVAILABLE"); }
  return buildGeminiProvider(apiKey, env.GEMINI_MODEL ?? "gemini-3.8-flash", createClient, diagnostic);
}

function buildGeminiProvider(apiKey: string, model: string, createClient: ClientFactory, diagnostic?: VisionDiagnostic): VisionProvider {
  return createGeminiProvider((params) => {
    // Este transporte solo se invoca luego de validar origen, sesión, admisión e imagen.
    diagnostic?.event("client", "started");
    let client: ReturnType<ClientFactory>;
    try { client = createClient({
      apiKey, vertexai: false,
      httpOptions: {
        baseUrl: "https://generativelanguage.googleapis.com",
        apiVersion: "v1beta", retryOptions: { attempts: 1 },
        fetch: createGeminiFetch(),
      },
    }); } catch (error) { diagnostic?.event("client", "failed"); throw error; }
    diagnostic?.event("client", "ok");
    diagnostic?.event("generate", "started");
    return client.models.generateContent(params);
  }, model, diagnostic);
}

import "server-only";
import { GoogleGenAI, type GoogleGenAIOptions } from "@google/genai";
import { VisionError } from "./errors";
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
  const simulated = env.VISION_LOCAL_SIMULATION === "1";
  // Sin autorización o con modos ambiguos se falla cerrado, sin fallback.
  if (real === simulated) { diagnostic?.event("configuration", "flags_invalid", 503); return null; }
  if (simulated) return createSimulatedProvider();

  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) { diagnostic?.event("configuration", "key_missing", 503); throw new VisionError("ANALYSIS_UNAVAILABLE"); }
  const model = env.GEMINI_MODEL ?? "gemini-3.8-flash";
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

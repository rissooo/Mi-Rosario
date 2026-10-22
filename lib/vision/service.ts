import "server-only";
import { ANALYSIS_DEADLINE_MS } from "../contracts/vision";
import { validateAnalyzeImageResponse, validateImageSuggestion } from "../contracts/validation";
import type { Admission } from "./admission";
import { Deadline } from "./deadline";
import { errorResponse, VisionError } from "./errors";
import { normalizeImage, type NormalizedImage } from "./image";
import { readImage } from "./multipart";
import type { VisionProvider } from "./provider";

export type VisionDependencies = {
  enabled: () => boolean;
  authenticate: () => Promise<string | null>;
  origin: string;
  admission: Admission;
  provider: VisionProvider;
  normalize?: (file: File, signal: AbortSignal) => Promise<NormalizedImage>;
  budgetMs?: number;
};

export function localSimulationEnabled(env: Readonly<Record<string, string | undefined>> = process.env) {
  return env.NODE_ENV === "development" && !env.VERCEL && env.VISION_LOCAL_SIMULATION === "1";
}

export function isLoopback(url: string) {
  try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname); }
  catch { return false; }
}

export function createAnalyzeHandler(deps: VisionDependencies) {
  return async function analyze(request: Request): Promise<Response> {
    if (!deps.enabled()) return errorResponse(new VisionError("ANALYSIS_UNAVAILABLE"));
    const deadline = new Deadline(request.signal, deps.budgetMs ?? ANALYSIS_DEADLINE_MS);
    let release: (() => void) | undefined;
    let imageWork: Promise<NormalizedImage> | undefined;
    let providerWork: Promise<unknown> | undefined;
    try {
      deadline.remaining();
      const origin = request.headers.get("origin");
      if (!isLoopback(request.url) || new URL(request.url).origin !== deps.origin ||
        (origin !== null && origin !== deps.origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new VisionError("FORBIDDEN");
      const userId = await deadline.wait(deps.authenticate());
      if (!userId) throw new VisionError("UNAUTHENTICATED");
      release = deps.admission.acquire(userId);
      const file = await deadline.wait(readImage(request, deadline.signal));
      imageWork = (deps.normalize ?? normalizeImage)(file, deadline.signal);
      const image = await deadline.wait(imageWork);
      providerWork = deps.provider.analyze(image, deadline.signal, deadline.remaining());
      const suggestion = await deadline.wait(providerWork);
      deadline.remaining();
      const parsed = validateImageSuggestion(suggestion);
      if (!parsed.valid) throw new VisionError("ANALYSIS_FAILED");
      const result = validateAnalyzeImageResponse({ suggestion: parsed.value });
      if (!result.valid) throw new VisionError("ANALYSIS_FAILED");
      return Response.json({ data: result.value }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return errorResponse(deadline.signal.aborted ? new VisionError("ANALYSIS_TIMEOUT") : error);
    } finally {
      deadline.close();
      // Un decoder nativo puede seguir terminando luego de cancelar la espera.
      if (imageWork && release) { const done = release; void Promise.allSettled([imageWork, providerWork]).then(done); }
      else release?.();
    }
  };
}

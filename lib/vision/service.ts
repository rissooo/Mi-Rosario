import "server-only";
import { ANALYSIS_DEADLINE_MS } from "../contracts/vision";
import { validateAnalyzeImageResponse, validateImageSuggestion } from "../contracts/validation";
import type { Admission } from "./admission";
import type { VisionDiagnostic, DiagnosticStage } from "./diagnostics";
import { Deadline } from "./deadline";
import { errorResponse, VisionError } from "./errors";
import { normalizeImage, type NormalizedImage } from "./image";
import { readImage } from "./multipart";
import type { VisionProvider } from "./provider";

export type VisionDependencies = {
  enabled: () => boolean;
  authenticate: () => Promise<string | null>;
  origin: string;
  /** Orígenes HTTPS exactos, solo para despliegue con autorización expresa. */
  allowedOrigins?: readonly string[];
  admission: Admission;
  provider: VisionProvider;
  normalize?: (file: File, signal: AbortSignal) => Promise<NormalizedImage>;
  budgetMs?: number;
  diagnostic?: VisionDiagnostic;
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
    let readWork: Promise<File> | undefined;
    let imageWork: Promise<NormalizedImage> | undefined;
    let providerWork: Promise<unknown> | undefined;
    let stage: DiagnosticStage = "origin";
    try {
      deps.diagnostic?.event(stage, "started");
      deadline.remaining();
      const origin = request.headers.get("origin");
      const targetOrigin = new URL(request.url).origin;
      const allowed = deps.allowedOrigins;
      if (allowed) {
        // En producción, exigir Origin explícito y mismo origen exacto; no confiar en Referer.
        if (!origin || !allowed.includes(origin) || targetOrigin !== origin ||
          request.headers.get("sec-fetch-site") === "cross-site") throw new VisionError("FORBIDDEN");
      } else if (!isLoopback(request.url) || targetOrigin !== deps.origin ||
        (origin !== null && origin !== deps.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
        throw new VisionError("FORBIDDEN");
      }
      deps.diagnostic?.event(stage, "ok");
      stage = "authentication";
      deps.diagnostic?.event(stage, "started");
      const userId = await deadline.wait(deps.authenticate());
      if (!userId) throw new VisionError("UNAUTHENTICATED");
      deps.diagnostic?.event(stage, "ok");
      stage = "admission";
      deps.diagnostic?.event(stage, "started");
      release = await deadline.wait(Promise.resolve(deps.admission.acquire(userId)));
      deps.diagnostic?.event(stage, "ok");
      stage = "image";
      deps.diagnostic?.event(stage, "started");
      readWork = readImage(request, deadline.signal);
      const file = await deadline.wait(readWork);
      imageWork = (deps.normalize ?? normalizeImage)(file, deadline.signal);
      const image = await deadline.wait(imageWork);
      deps.diagnostic?.event(stage, "ok");
      stage = "generate";
      providerWork = deps.provider.analyze(image, deadline.signal, deadline.remaining());
      const suggestion = await deadline.wait(providerWork);
      deadline.remaining();
      stage = "validation";
      deps.diagnostic?.event(stage, "started");
      const parsed = validateImageSuggestion(suggestion);
      if (!parsed.valid) throw new VisionError("ANALYSIS_FAILED");
      const result = validateAnalyzeImageResponse({ suggestion: parsed.value });
      if (!result.valid) throw new VisionError("ANALYSIS_FAILED");
      deps.diagnostic?.event(stage, "ok");
      const response = Response.json({ data: result.value }, { headers: { "Cache-Control": "no-store" } });
      deadline.remaining();
      // El log final se ejecuta después de decidir el retorno, fuera del tramo crítico.
      if (deps.diagnostic) queueMicrotask(() => {
        try { deps.diagnostic?.event("result", "ok", 200); } catch {}
      });
      return response;
    } catch (error) {
      const response = errorResponse(deadline.signal.aborted ? new VisionError("ANALYSIS_TIMEOUT") : error);
      deps.diagnostic?.event(stage, response.status === 504 ? "timeout" : "failed", response.status);
      deps.diagnostic?.event("result", "failed", response.status);
      return response;
    } finally {
      deadline.close();
      // Parseo y trabajo nativo/remoto pueden seguir tras cancelar la espera.
      if (readWork && release) { const done = release; void Promise.allSettled([readWork, imageWork, providerWork]).then(done); }
      else release?.();
    }
  };
}

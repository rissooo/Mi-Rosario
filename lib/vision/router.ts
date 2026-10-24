import { validateImageSuggestion } from "../contracts/validation";
import { VisionError } from "./errors";
import type { VisionProvider } from "./provider";

/** Orden explícito, sin paralelismo ni doble consumo cuando la primera API responde. */
export type VisionFallbackStep = Readonly<{
  name: "groq" | "gemini" | "openai";
  provider: VisionProvider;
  limitMs: number;
}>;

export type VisionAttemptOutcome = "success" | "failed" | "invalid" | "timeout";
export type VisionAttemptEvent = Readonly<{
  provider: VisionFallbackStep["name"];
  outcome: VisionAttemptOutcome;
  durationMs: number;
}>;
export type VisionAttemptReporter = (event: VisionAttemptEvent) => void;

function reportSafely(reporter: VisionAttemptReporter | undefined, event: VisionAttemptEvent) {
  // El observador jamás puede bloquear una solicitud ni registrar imágenes o claves.
  try { reporter?.(event); } catch {}
}

/** Un intento nunca puede superar ni su propio plazo ni el presupuesto del request. */
export function createFallbackVisionProvider(
  steps: readonly VisionFallbackStep[],
  reporter?: VisionAttemptReporter,
): VisionProvider {
  if (!steps.length || steps.some((step) => !Number.isInteger(step.limitMs) || step.limitMs < 1)) {
    throw new VisionError("ANALYSIS_UNAVAILABLE");
  }
  return {
    async analyze(image, signal, remainingMs) {
      const began = performance.now();
      for (const step of steps) {
        if (signal.aborted) throw new VisionError("ANALYSIS_TIMEOUT");
        const availableMs = Math.floor(remainingMs - (performance.now() - began));
        if (availableMs <= 0) throw new VisionError("ANALYSIS_TIMEOUT");

        const attemptMs = Math.max(1, Math.min(step.limitMs, availableMs));
        const controller = new AbortController();
        let rejectOnAbort: (reason: VisionError) => void = () => {};
        const cancelled = new Promise<never>((_resolve, reject) => { rejectOnAbort = reject; });
        const abortAttempt = () => {
          controller.abort();
          rejectOnAbort(new VisionError("ANALYSIS_TIMEOUT"));
        };
        const onParentAbort = () => abortAttempt();
        signal.addEventListener("abort", onParentAbort, { once: true });
        const timer = setTimeout(abortAttempt, attemptMs);
        const attemptStarted = performance.now();
        let outcome: VisionAttemptOutcome = "failed";
        try {
          if (signal.aborted) throw new VisionError("ANALYSIS_TIMEOUT");
          // La API recibe la señal propia; Promise.race impide que una API lenta bloquee el fallback.
          const raw = await Promise.race([
            step.provider.analyze(image, controller.signal, attemptMs),
            cancelled,
          ]);
          if (signal.aborted || controller.signal.aborted) throw new VisionError("ANALYSIS_TIMEOUT");
          // No aceptar una respuesta 200 con JSON inválido: probar el siguiente proveedor.
          const checked = validateImageSuggestion(raw);
          if (!checked.valid) { outcome = "invalid"; throw new VisionError("ANALYSIS_FAILED"); }
          outcome = "success";
          return checked.value;
        } catch (error) {
          if (signal.aborted || controller.signal.aborted ||
              (error instanceof VisionError && error.code === "ANALYSIS_TIMEOUT")) outcome = "timeout";
          if (signal.aborted) throw new VisionError("ANALYSIS_TIMEOUT");
          // El usuario podrá completar manualmente si todos los proveedores fallan.
        } finally {
          clearTimeout(timer);
          signal.removeEventListener("abort", onParentAbort);
          reportSafely(reporter, { provider: step.name, outcome,
            durationMs: Math.max(0, Math.round(performance.now() - attemptStarted)) });
        }
      }
      if (signal.aborted || remainingMs - (performance.now() - began) <= 0) {
        throw new VisionError("ANALYSIS_TIMEOUT");
      }
      throw new VisionError("ANALYSIS_UNAVAILABLE");
    },
  };
}

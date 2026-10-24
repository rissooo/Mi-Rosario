import { validateImageSuggestion } from "../contracts/validation";
import { VisionError } from "./errors";
import type { VisionProvider } from "./provider";

/** Orden explícito, sin paralelismo ni doble consumo cuando la primera API responde. */
export type VisionFallbackStep = Readonly<{
  name: "groq" | "gemini" | "openai";
  provider: VisionProvider;
  limitMs: number;
}>;

/** Un intento nunca puede superar ni su propio plazo ni el presupuesto del request. */
export function createFallbackVisionProvider(steps: readonly VisionFallbackStep[]): VisionProvider {
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
          if (!checked.valid) throw new VisionError("ANALYSIS_FAILED");
          return checked.value;
        } catch {
          if (signal.aborted) throw new VisionError("ANALYSIS_TIMEOUT");
          // El usuario podrá completar manualmente si todos los proveedores fallan.
        } finally {
          clearTimeout(timer);
          signal.removeEventListener("abort", onParentAbort);
        }
      }
      if (signal.aborted || remainingMs - (performance.now() - began) <= 0) {
        throw new VisionError("ANALYSIS_TIMEOUT");
      }
      throw new VisionError("ANALYSIS_UNAVAILABLE");
    },
  };
}

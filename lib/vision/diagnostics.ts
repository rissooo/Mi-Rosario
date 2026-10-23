import "server-only";
import { randomUUID } from "node:crypto";

export type DiagnosticStage = "configuration" | "origin" | "authentication" | "admission" | "image" | "client" | "generate" | "validation" | "result";
export type DiagnosticCategory = "started" | "ok" | "blocked" | "failed" | "timeout" | "network" | "provider_http" | "flags_invalid" | "key_missing" | "model_rejected" | "limits_invalid";
export interface VisionDiagnostic {
  event(stage: DiagnosticStage, category: DiagnosticCategory, status?: number): void;
}
const stages: readonly string[] = ["configuration", "origin", "authentication", "admission", "image", "client", "generate", "validation", "result"];
const categories: readonly string[] = ["started", "ok", "blocked", "failed", "timeout", "network", "provider_http", "flags_invalid", "key_missing", "model_rejected", "limits_invalid"];

/** No acepta objetos de contexto ni excepciones: solo campos cerrados sin contenido privado. */
export function createVisionDiagnostic(
  env: Readonly<Record<string, string | undefined>> = process.env,
  write: (line: string) => void = (line) => console.info(line),
): VisionDiagnostic {
  if (env.NODE_ENV !== "development" || env.VERCEL !== undefined || env.VISION_LOCAL_DIAGNOSTICS !== "1") return { event() {} };
  const requestId = randomUUID();
  const started = performance.now();
  let previous = started;
  return { event(stage, category, status) {
    if (!stages.includes(stage) || !categories.includes(category)) return;
    const now = performance.now();
    const record = { source: "vision-local", requestId, stage, category,
      elapsedMs: Math.round(now - started), stepMs: Math.round(now - previous),
      ...(Number.isInteger(status) && status! >= 100 && status! <= 599 ? { status } : {}) };
    previous = now;
    // Un fallo del destino de logs nunca cambia la respuesta del endpoint.
    try { write(JSON.stringify(record)); } catch {}
  } };
}

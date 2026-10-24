"use client";

import { useEffect, useRef, useState } from "react";
import type { ImageSuggestion } from "@/lib/contracts/vision";

type Props = {
  photo: File | null;
  disabled: boolean;
  onSuggestion: (suggestion: ImageSuggestion, photo: File) => void;
};

export function VisionAssist({ photo, disabled, onSuggestion }: Props) {
  type AnalysisState = { photo: File | null; busy: boolean; message: string | null; warnings: string[] };
  const [state, setState] = useState<AnalysisState>({
    photo: null, busy: false, message: null, warnings: [],
  });
  const active = useRef<AbortController | null>(null);
  // Los resultados pertenecen a una foto concreta; otra foto no hereda mensajes ni carga.
  const current = state.photo === photo
    ? state
    : { photo, busy: false, message: null, warnings: [] };

  useEffect(() => {
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [photo]);

  async function analyze() {
    if (!photo || disabled || current.busy) return;
    const chosen = photo;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setState({ photo: chosen, busy: true, message: null, warnings: [] });
    try {
      const form = new FormData();
      form.append("image", chosen);
      const response = await fetch("/api/vision/analyze", {
        method: "POST", body: form, credentials: "same-origin",
        cache: "no-store", signal: controller.signal,
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error("El análisis no está disponible.");
      const body = result as { data?: { suggestion?: ImageSuggestion } };
      const suggestion = body?.data?.suggestion;
      if (!suggestion || !Array.isArray(suggestion.warnings)) throw new Error("Respuesta inválida.");
      if (controller.signal.aborted || active.current !== controller) return;
      onSuggestion(suggestion, chosen);
      setState({
        photo: chosen, busy: false,
        message: "Sugerencias aplicadas a los campos vacíos. Revisá y corregí los datos antes de publicar.",
        warnings: suggestion.warnings,
      });
    } catch {
      if (!controller.signal.aborted && active.current === controller) {
        setState({
          photo: chosen, busy: false,
          message: "La IA no pudo analizar esta foto. Podés completar el reporte manualmente.",
          warnings: [],
        });
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        setState(prev => prev.photo === chosen ? { ...prev, busy: false } : prev);
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => { void analyze(); }}
        disabled={!photo || disabled || current.busy}
        className="flex min-h-11 items-center justify-center rounded-full border border-blue-500 px-4 py-2 text-sm font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-300"
      >
        {current.busy ? "Analizando foto con IA..." : "✨ Analizar foto con IA"}
      </button>
      <p className="text-xs text-zinc-500">
        Opcional. La IA sugiere datos, nunca publica por vos ni modifica la ubicación.
      </p>
      {current.message && <p role="status" className="text-sm text-zinc-600 dark:text-zinc-300">{current.message}</p>}
      {current.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 p-3 text-sm dark:border-amber-800">
          <p className="font-semibold">Advertencias de la IA</p>
          <ul className="ml-4 list-disc">
            {current.warnings.map((warning, i) => <li key={i}>{warning}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

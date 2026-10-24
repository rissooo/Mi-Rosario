"use client";

import { useEffect, useRef, useState } from "react";
import type { ImageSuggestion } from "@/lib/contracts/vision";

type Props = {
  photo: File | null;
  disabled: boolean;
  onSuggestion: (suggestion: ImageSuggestion, photo: File) => void;
};

export function VisionAssist({ photo, disabled, onSuggestion }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const active = useRef<AbortController | null>(null);
  const currentPhoto = useRef(photo);
  const unmounted = useRef(false);
  currentPhoto.current = photo;

  useEffect(() => {
    unmounted.current = false;
    return () => { unmounted.current = true; active.current?.abort(); };
  }, []);

  useEffect(() => {
    active.current?.abort();
    active.current = null;
    setBusy(false);
    setMessage(null);
    setWarnings([]);
  }, [photo]);

  async function analyze() {
    if (!photo || disabled || busy) return;
    const chosen = photo;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setMessage(null);
    setWarnings([]);
    try {
      const form = new FormData();
      form.append("image", chosen);
      const response = await fetch("/api/vision/analyze", {
        method: "POST",
        body: form,
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error("No se pudo analizar la imagen. Podés completar el reporte manualmente.");
      const body = result as { data?: { suggestion?: ImageSuggestion } };
      const suggestion = body?.data?.suggestion;
      if (!suggestion || !Array.isArray(suggestion.warnings)) {
        throw new Error("La IA no devolvió sugerencias válidas.");
      }
      if (controller.signal.aborted || unmounted.current || currentPhoto.current !== chosen) return;
      onSuggestion(suggestion, chosen);
      setWarnings(suggestion.warnings);
      setMessage("Sugerencias aplicadas a los campos vacíos. Revisá y corregí los datos antes de publicar.");
    } catch {
      if (!controller.signal.aborted && !unmounted.current) {
        setMessage("La IA no pudo analizar esta foto. Podés completar el reporte manualmente.");
      }
    } finally {
      if (active.current === controller) {
        active.current = null;
        if (!unmounted.current) setBusy(false);
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => { void analyze(); }}
        disabled={!photo || disabled || busy}
        className="flex min-h-11 items-center justify-center rounded-full border border-blue-500 px-4 py-2 text-sm font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-300"
      >
        {busy ? "Analizando foto con IA..." : "✨ Analizar foto con IA"}
      </button>
      <p className="text-xs text-zinc-500">
        Opcional. La IA sugiere datos, nunca publica por vos ni modifica la ubicación.
      </p>
      {message && <p role="status" className="text-sm text-zinc-600 dark:text-zinc-300">{message}</p>}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 p-3 text-sm dark:border-amber-800">
          <p className="font-semibold">Advertencias de la IA</p>
          <ul className="ml-4 list-disc">
            {warnings.map((warning, i) => <li key={i}>{warning}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

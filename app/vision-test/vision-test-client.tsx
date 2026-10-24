"use client";

import { useState, type FormEvent } from "react";

type VisionSuggestion = {
  title: string | null;
  description: string | null;
  categoryId: string | null;
  severity: string | null;
  warnings: string[];
};

const CATEGORY_LABELS: Record<string, string> = {
  pothole: "Baches",
  "missing-light": "Falta de luz",
  "damaged-sidewalk": "Veredas dañadas",
  "faulty-traffic-light": "Semáforos defectuosos",
};
const SEVERITY_LABELS: Record<string, string> = {
  low: "Baja", medium: "Media", high: "Alta",
};

export default function VisionTestClient() {
  const [image, setImage] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [suggestion, setSuggestion] = useState<VisionSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!image || pending) return;
    setPending(true);
    setElapsedMs(null);
    const started = performance.now();
    setSuggestion(null);
    setError(null);
    try {
      const data = new FormData();
      data.append("image", image);
      const response = await fetch("/api/vision/analyze", {
        method: "POST", body: data, cache: "no-store", credentials: "same-origin",
      });
      const json: unknown = await response.json();
      if (!response.ok) {
        const payload = json as { error?: { message?: string; code?: string } };
        throw new Error(payload?.error?.message || payload?.error?.code || `HTTP ${response.status}`);
      }
      const payload = json as { data?: { suggestion?: VisionSuggestion } };
      if (!payload?.data?.suggestion) throw new Error("El endpoint no devolvió una sugerencia.");
      setSuggestion(payload.data.suggestion);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo analizar la fotografía.");
    } finally {
      setElapsedMs(Math.round(performance.now() - started));
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 bg-white px-6 py-12 text-zinc-900">
      <div>
        <p className="text-sm font-semibold text-blue-700">Mi Rosario · solo desarrollo local</p>
        <h1 className="mt-2 text-3xl font-bold">Probar análisis de una fotografía</h1>
        <p className="mt-3 text-sm text-zinc-600">
          Iniciá sesión desde <a className="underline" href="/">la página principal</a> antes de probar.
          Esta pantalla NO publica reportes ni guarda imágenes.
        </p>
      </div>
      <form onSubmit={analyze} className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-5">
        <label htmlFor="vision-photo" className="text-sm font-semibold">Fotografía urbana</label>
        <input id="vision-photo" type="file" accept="image/jpeg,image/png,image/webp"
          required disabled={pending}
          onChange={(event) => { setImage(event.target.files?.[0] ?? null); setSuggestion(null); setError(null); }}
          className="w-full text-sm" />
        <p className="text-xs text-zinc-600">Hasta 4 MB. No uses imágenes sensibles o con datos personales.</p>
        <button type="submit" disabled={!image || pending}
          className="rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? "Analizando (hasta 20 segundos)..." : "Analizar con IA"}
        </button>
      </form>
      {elapsedMs !== null && <p className="text-sm text-zinc-600" aria-live="polite">
        Tiempo total de la solicitud desde el navegador: <strong>{(elapsedMs / 1000).toFixed(2)} s</strong>.
        Para ver el tiempo de cada proveedor, activá VISION_LOCAL_ROUTER_TRACE=1 y revisá la terminal.
      </p>}
      {error && <section role="alert" className="rounded-lg border border-amber-400 p-4">
        <strong>La IA no devolvió una sugerencia.</strong>
        <p className="mt-2 text-sm">{error}</p>
        <p className="mt-2 text-sm">En la aplicación final, el vecino podrá completar el reporte manualmente.</p>
      </section>}
      {suggestion && <section aria-live="polite" className="rounded-xl border border-green-400 p-5">
        <h2 className="text-xl font-bold">Sugerencia de la IA</h2>
        <p className="mt-3"><strong>Título:</strong> {suggestion.title ?? "Sin sugerencia"}</p>
        <p className="mt-2"><strong>Descripción:</strong> {suggestion.description ?? "Sin sugerencia"}</p>
        <p className="mt-2"><strong>Categoría:</strong> {suggestion.categoryId ? CATEGORY_LABELS[suggestion.categoryId] ?? suggestion.categoryId : "No determinada"}</p>
        <p className="mt-2"><strong>Gravedad:</strong> {suggestion.severity ? SEVERITY_LABELS[suggestion.severity] ?? suggestion.severity : "No determinada"}</p>
        {suggestion.warnings?.length > 0 && <div className="mt-4">
          <h3 className="font-semibold">Advertencias</h3>
          <ul className="ml-5 list-disc text-sm">
            {suggestion.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
          </ul>
        </div>}
        <p className="mt-4 text-xs text-zinc-600">Resultado de prueba; revisalo antes de usarlo en un reporte.</p>
      </section>}
    </main>
  );
}

import type { Metadata } from "next";
import { MapLoader } from "@/app/components/map/MapLoader";
import { USING_SAMPLE_DATA } from "@/app/components/map/report-source";

export const metadata: Metadata = {
  title: "Mapa de reportes | Mi Rosario",
  description: "Incidentes urbanos reportados por vecinos de Rosario.",
};

export default function MapPage() {
  return (
    <main className="flex h-dvh flex-col bg-zinc-50 dark:bg-black">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[.08] bg-white px-4 py-3 dark:border-white/[.145] dark:bg-zinc-950">
        <h1 className="text-lg font-semibold text-black dark:text-zinc-50">Mapa de reportes</h1>
        {USING_SAMPLE_DATA && (
          <p role="note" className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
            Reportes de ejemplo, no son datos reales
          </p>
        )}
      </header>
      <MapLoader />
    </main>
  );
}

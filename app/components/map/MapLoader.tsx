"use client";

import dynamic from "next/dynamic";

// Leaflet usa `window` al importarse, así que el mapa solo se renderiza en el navegador.
// `ssr: false` solo se permite dentro de un Client Component; por eso existe este envoltorio.
const ReportsMap = dynamic(() => import("./ReportsMap"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
      Cargando mapa...
    </div>
  ),
});

export function MapLoader() {
  return <ReportsMap />;
}

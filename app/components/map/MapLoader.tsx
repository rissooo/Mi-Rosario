"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window` on import, so the map only renders in the browser.
// `ssr: false` is only allowed inside a Client Component, hence this wrapper.
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

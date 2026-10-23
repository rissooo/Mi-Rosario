"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { MapContainer, Marker, Polygon, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { INITIAL_CATEGORIES } from "@/lib/contracts/categories";
import type { Report, Severity } from "@/lib/contracts/reports";
import { ReportDetail } from "@/app/components/reports/ReportDetail";
import { loadAllReportsInBbox, toBbox } from "./report-source";
import { ROSARIO_BBOX, ROSARIO_BOUNDARY } from "./rosario-boundary";

// Un poco al oeste de la costa, para que la vista la ocupe la ciudad y no las islas del Paraná.
const ROSARIO_CENTER: L.LatLngTuple = [-32.952, -60.66];
const INITIAL_ZOOM = 13;
// La vista se mantiene alrededor del municipio; la máscara oscurece lo que queda fuera del límite.
const ROSARIO_BOUNDS = L.latLngBounds(ROSARIO_BBOX[0], ROSARIO_BBOX[1]);
// Margen extra (dentro de la zona oscurecida) para que un marcador del borde de la ciudad, como el
// centro junto al río, se pueda seguir moviendo para que salga de abajo del panel de detalle.
const PANNING_BOUNDS = ROSARIO_BOUNDS.pad(0.35);
const BOUNDARY_RINGS: L.LatLngTuple[][] = ROSARIO_BOUNDARY.map((ring) => [...ring]);
const WORLD_RING: L.LatLngTuple[] = [[-90, -180], [-90, 180], [90, 180], [90, -180]];
const OUTSIDE_MASK: L.LatLngTuple[][] = [WORLD_RING, ...BOUNDARY_RINGS];
const RELOAD_DEBOUNCE_MS = 300;

const SEVERITY_MARKER_CLASSES: Record<Severity, string> = {
  low: "bg-sky-600",
  medium: "bg-amber-500",
  high: "bg-red-600",
};

const iconCache = new Map<string, L.DivIcon>();

/** El color indica la gravedad; la letra es la inicial de la etiqueta de la categoría. */
function markerIcon(report: Report): L.DivIcon {
  const key = `${report.categoryId}:${report.severity}`;
  let icon = iconCache.get(key);
  if (!icon) {
    const letter = INITIAL_CATEGORIES.find((category) => category.id === report.categoryId)?.label[0] ?? "?";
    icon = L.divIcon({
      className: "",
      html: `<span aria-hidden="true" class="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-sm font-bold text-white shadow-md ${SEVERITY_MARKER_CLASSES[report.severity]}">${letter}</span>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

function ViewportWatcher({ onViewportChange }: { onViewportChange: (bbox: string) => void }) {
  const map = useMap();
  const report = useCallback(() => {
    const bounds = map.getBounds();
    onViewportChange(toBbox({ west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() }));
  }, [map, onViewportChange]);

  useMapEvents({ moveend: report });
  useEffect(report, [report]);
  return null;
}

/** El límite para alejar el zoom depende del tamaño de la pantalla: como máximo, la ciudad entera ocupa la vista. */
function RosarioZoomLimit() {
  const map = useMap();
  useEffect(() => {
    const update = () => map.setMinZoom(map.getBoundsZoom(ROSARIO_BOUNDS));
    update();
    map.on("resize", update);
    return () => {
      map.off("resize", update);
    };
  }, [map]);
  return null;
}

const FOCUS_MARGIN_PX = 40;

/**
 * Mueve el mapa solo cuando el marcador elegido queda debajo del panel de detalle, y solo lo justo para
 * llevarlo a la zona libre: un marcador visible nunca se mueve y los del borde no salen de los límites.
 */
function SelectedMarkerFocus({ report, panelRef }: { report: Report | null; panelRef: RefObject<HTMLElement | null> }) {
  const map = useMap();
  useEffect(() => {
    const panel = panelRef.current;
    if (!report || !panel) return;
    const mapRect = map.getContainer().getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    // Panel de ancho completo: el panel inferior del celular. Si no, el panel lateral de la derecha.
    const free = panelRect.width >= mapRect.width - 1
      ? { left: 0, top: 0, right: mapRect.width, bottom: panelRect.top - mapRect.top }
      : { left: 0, top: 0, right: panelRect.left - mapRect.left, bottom: mapRect.height };
    const point = map.latLngToContainerPoint([report.location.latitude, report.location.longitude]);
    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
    const targetX = clamp(point.x, free.left + FOCUS_MARGIN_PX, free.right - FOCUS_MARGIN_PX);
    const targetY = clamp(point.y, free.top + FOCUS_MARGIN_PX, free.bottom - FOCUS_MARGIN_PX);
    if (targetX === point.x && targetY === point.y) return;
    map.panBy([point.x - targetX, point.y - targetY]);
  }, [map, report, panelRef]);
  return null;
}

type LoadState = "loading" | "ready" | "error";

export default function ReportsMap() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [selected, setSelected] = useState<Report | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const latestRequest = useRef(0);
  const lastBbox = useRef<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async (bbox: string) => {
    const requestId = ++latestRequest.current;
    lastBbox.current = bbox;
    setLoadState("loading");
    try {
      const next = await loadAllReportsInBbox(bbox);
      // Una respuesta más vieja y más lenta no debe pisar el área visible actual.
      if (requestId !== latestRequest.current) return;
      setReports(next);
      setLoadState("ready");
    } catch {
      if (requestId === latestRequest.current) setLoadState("error");
    }
  }, []);

  const handleViewportChange = useCallback((bbox: string) => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void load(bbox), RELOAD_DEBOUNCE_MS);
  }, [load]);

  useEffect(() => () => clearTimeout(debounce.current), []);

  const retry = () => {
    if (lastBbox.current) void load(lastBbox.current);
  };

  return (
    <div className="relative flex-1">
      <MapContainer
        center={ROSARIO_CENTER}
        zoom={INITIAL_ZOOM}
        maxBounds={PANNING_BOUNDS}
        maxBoundsViscosity={1}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          bounds={PANNING_BOUNDS}
        />
        <Polygon
          positions={OUTSIDE_MASK}
          interactive={false}
          pathOptions={{ stroke: false, fillColor: "#3f3f46", fillOpacity: 0.55 }}
        />
        <Polygon
          positions={BOUNDARY_RINGS}
          interactive={false}
          pathOptions={{ color: "#18181b", weight: 2, fill: false }}
        />
        <RosarioZoomLimit />
        <ViewportWatcher onViewportChange={handleViewportChange} />
        <SelectedMarkerFocus report={selected} panelRef={panelRef} />
        {reports.map((report) => (
          <Marker
            key={report.id}
            position={[report.location.latitude, report.location.longitude]}
            icon={markerIcon(report)}
            title={report.title}
            eventHandlers={{ click: () => setSelected(report) }}
          />
        ))}
      </MapContainer>

      <div className="pointer-events-none absolute inset-x-0 top-3 z-[1000] flex justify-center px-4" aria-live="polite">
        {loadState === "loading" && (
          <p className="rounded-full bg-white/90 px-3 py-1 text-sm text-zinc-700 shadow dark:bg-zinc-900/90 dark:text-zinc-200">
            Cargando reportes...
          </p>
        )}
        {loadState === "error" && (
          <div role="alert" className="pointer-events-auto flex items-center gap-3 rounded-full bg-white px-4 py-2 text-sm text-red-700 shadow dark:bg-zinc-900 dark:text-red-400">
            No pudimos cargar los reportes.
            <button type="button" onClick={retry} className="font-semibold underline">
              Reintentar
            </button>
          </div>
        )}
      </div>

      {selected && <ReportDetail key={selected.id} ref={panelRef} report={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

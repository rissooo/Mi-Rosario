"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useCallback, useEffect, useReducer, useRef, useState, type RefObject } from "react";
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
import { INITIAL_CATEGORIES } from "@/lib/contracts/categories";
import type { Report, Severity } from "@/lib/contracts/reports";
import { ReportDetail } from "@/app/components/reports/ReportDetail";
import { LoginPrompt } from "@/app/components/reports/LoginPrompt";
import { ReportPanel } from "@/app/components/reports/ReportPanel";
import { draftReducer, emptyDraft, hasDraftData, type Point } from "@/app/components/reports/report-draft";
import { parseSimulatedFailure, type SimulatedFailure } from "@/app/components/reports/report-publisher";
import { useGeolocation } from "@/app/components/reports/use-geolocation";
import { createClient } from "@/utils/supabase/client";
import { loadAllReportsInBbox, toBbox, USING_SAMPLE_DATA } from "./report-source";
import { isInsideRosario } from "./rosario-boundary";
import { PANNING_BOUNDS, ROSARIO_CENTER, RosarioMask } from "./RosarioMask";

const INITIAL_ZOOM = 13;
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

const PIN_HTML = '<span aria-hidden="true" class="block h-8 w-8 -rotate-45 rounded-full rounded-bl-none border-2 border-white bg-red-600 shadow-md"></span>';
// La punta del pin es la esquina recta del cuadrado de 32 px rotado 45°: queda centrada
// horizontalmente y a 16 + 16·√2 ≈ 39 px del borde superior. Ese es el punto marcado.
const PIN_TIP: [number, number] = [16, 39];
const PIN_ICON = L.divIcon({ className: "", html: PIN_HTML, iconSize: [32, 32], iconAnchor: PIN_TIP });

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

/** Informa el centro del mapa cada vez que se termina de mover: es el punto bajo el pin fijo. */
function CenterWatcher({ onCenterChange }: { onCenterChange: (point: Point) => void }) {
  const map = useMap();
  const report = useCallback(() => {
    const center = map.getCenter();
    onCenterChange({ latitude: center.lat, longitude: center.lng });
  }, [map, onCenterChange]);

  useMapEvents({ moveend: report });
  useEffect(report, [report]);
  return null;
}

const FOCUS_MARGIN_PX = 40;

/**
 * Mueve el mapa solo cuando el punto queda debajo del panel (de detalle o del reporte), y solo lo
 * justo para llevarlo a la zona libre: un punto visible nunca se mueve y los del borde no salen de
 * los límites.
 */
function PointFocus({ point, panelRef }: { point: Point | null; panelRef: RefObject<HTMLElement | null> }) {
  const map = useMap();
  useEffect(() => {
    const panel = panelRef.current;
    if (!point || !panel) return;
    const mapRect = map.getContainer().getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    // Panel de ancho completo: el panel inferior del celular. Si no, el panel lateral de la derecha.
    const free = panelRect.width >= mapRect.width - 1
      ? { left: 0, top: 0, right: mapRect.width, bottom: panelRect.top - mapRect.top }
      : { left: 0, top: 0, right: panelRect.left - mapRect.left, bottom: mapRect.height };
    const target = map.latLngToContainerPoint([point.latitude, point.longitude]);
    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
    const targetX = clamp(target.x, free.left + FOCUS_MARGIN_PX, free.right - FOCUS_MARGIN_PX);
    const targetY = clamp(target.y, free.top + FOCUS_MARGIN_PX, free.bottom - FOCUS_MARGIN_PX);
    if (targetX === target.x && targetY === target.y) return;
    map.panBy([target.x - targetX, target.y - targetY]);
  }, [map, point, panelRef]);
  return null;
}

const hasSession = async () => Boolean((await createClient().auth.getClaims()).data?.claims);

type LoadState = "loading" | "ready" | "error";
/** viewing: mapa normal; picking: elegir el punto con el pin fijo; filling: panel del reporte. */
type Mode = "viewing" | "picking" | "filling";

const floatingButton = "pointer-events-auto rounded-full px-4 py-2 text-sm font-medium shadow disabled:opacity-50";

export default function ReportsMap() {
  const [map, setMap] = useState<L.Map | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [selected, setSelected] = useState<Report | null>(null);
  const [mode, setMode] = useState<Mode>("viewing");
  const [draft, dispatch] = useReducer(draftReducer, undefined, emptyDraft);
  const [center, setCenter] = useState<Point | null>(null);
  const [loginNeeded, setLoginNeeded] = useState(false);
  const geolocation = useGeolocation();
  const panelRef = useRef<HTMLElement>(null);
  const reportPanelRef = useRef<HTMLElement>(null);
  const latestRequest = useRef(0);
  const lastBbox = useRef<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const simulate = useRef<SimulatedFailure | null>(null);

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

  const { clearMessage } = geolocation;

  /** Con sesión empieza el reporte; sin sesión muestra el login. La verificación real la hace la publicación (401). */
  const applySession = useCallback((hasSession: boolean) => {
    setLoginNeeded(!hasSession);
    if (!hasSession) return;
    setSelected(null);
    clearMessage();
    setMode("picking");
  }, [clearMessage]);

  const startReport = useCallback(() => hasSession().then(applySession), [applySession]);

  // Al volver del login con ?reportar=1 se abre el reporte; ?simular= solo vale en el modo de ejemplo.
  // Corre una sola vez: si no, el error simulado se volvería a cargar en cada reintento.
  const readUrlOnce = useRef(false);
  useEffect(() => {
    if (readUrlOnce.current) return;
    readUrlOnce.current = true;
    const params = new URLSearchParams(window.location.search);
    if (USING_SAMPLE_DATA) simulate.current = parseSimulatedFailure(params.get("simular"));
    if (params.get("reportar") !== "1") return;
    params.delete("reportar");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    void hasSession().then(applySession);
  }, [applySession]);

  const insideRosario = center ? isInsideRosario(center.latitude, center.longitude) : false;

  const confirmPoint = () => {
    if (!center || !insideRosario) return;
    dispatch({ type: "set", changes: { point: center } });
    setMode("filling");
  };

  const changeLocation = () => {
    if (draft.point) map?.setView([draft.point.latitude, draft.point.longitude]);
    clearMessage();
    setMode("picking");
  };

  const cancelReport = () => {
    if (hasDraftData(draft) && !window.confirm("¿Descartar el reporte?")) return;
    dispatch({ type: "reset" });
    setMode("viewing");
  };

  const locateMe = () => {
    geolocation.locate((point) => map?.flyTo([point.latitude, point.longitude], Math.max(map.getZoom(), 16)));
  };

  const handlePublished = () => {
    // El borrador y su clave se descartan; el marcador nuevo aparece al recargar el área visible.
    dispatch({ type: "reset" });
    if (lastBbox.current) void load(lastBbox.current);
  };

  const viewReport = (report: Report) => {
    setMode("viewing");
    setSelected(report);
  };

  const reportAnother = () => {
    dispatch({ type: "reset" });
    clearMessage();
    setMode("picking");
  };

  return (
    <div className="relative flex-1">
      <MapContainer
        ref={setMap}
        center={ROSARIO_CENTER}
        zoom={INITIAL_ZOOM}
        maxBounds={PANNING_BOUNDS}
        maxBoundsViscosity={1}
        className="h-full w-full"
      >
        <RosarioMask />
        <ViewportWatcher onViewportChange={handleViewportChange} />
        {mode === "picking" && <CenterWatcher onCenterChange={setCenter} />}
        <PointFocus
          point={mode === "filling" ? draft.point : selected?.location ?? null}
          panelRef={mode === "filling" ? reportPanelRef : panelRef}
        />
        {reports.map((report) => (
          <Marker
            key={report.id}
            position={[report.location.latitude, report.location.longitude]}
            icon={markerIcon(report)}
            title={report.title}
            eventHandlers={{ click: () => { if (mode === "viewing") setSelected(report); } }}
          />
        ))}
        {mode === "filling" && draft.point && (
          <Marker position={[draft.point.latitude, draft.point.longitude]} icon={PIN_ICON} interactive={false} title="Ubicación del reporte" />
        )}
      </MapContainer>

      <div className="pointer-events-none absolute inset-x-0 top-3 z-[1000] flex justify-center px-4" aria-live="polite">
        {loadState === "loading" && mode === "viewing" && (
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

      {mode === "viewing" && !selected && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 z-[1000] flex flex-col items-center gap-3 px-4">
          {loginNeeded && (
            <div className="pointer-events-auto relative w-full max-w-sm">
              <LoginPrompt next="/mapa?reportar=1" message="Entrá con Google para reportar." />
              <button type="button" onClick={() => setLoginNeeded(false)} aria-label="Cerrar" className="absolute right-3 top-2 text-lg text-zinc-500">
                ×
              </button>
            </div>
          )}
          <button type="button" onClick={() => void startReport()} className={`${floatingButton} bg-foreground px-6 py-3 text-base text-background`}>
            Reportar
          </button>
        </div>
      )}

      {mode === "picking" && (
        <>
          {/* Pin fijo: se mueve el mapa, no el pin. La punta queda en el centro exacto del mapa. */}
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 z-[1000]"
            style={{ transform: `translate(-${PIN_TIP[0]}px, -${PIN_TIP[1]}px)` }}
            dangerouslySetInnerHTML={{ __html: PIN_HTML }}
          />
          {/* Margen a los costados para no tapar los botones de zoom de arriba a la izquierda. */}
          <div className="pointer-events-none absolute inset-x-0 top-3 z-[1001] flex justify-center px-14">
            <p className="rounded-2xl bg-white/95 px-4 py-2 text-center text-sm font-medium shadow dark:bg-zinc-900/95">
              Mové el mapa hasta que el pin quede sobre el problema
            </p>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-[1001] flex flex-col items-center gap-2 px-4">
            {center && !insideRosario && (
              <p role="alert" className="rounded-full bg-white px-4 py-2 text-sm font-medium text-red-700 shadow dark:bg-zinc-900 dark:text-red-400">
                El punto tiene que estar dentro de Rosario.
              </p>
            )}
            {geolocation.message && (
              <p role="status" className="max-w-sm rounded-2xl bg-white px-4 py-2 text-center text-sm shadow dark:bg-zinc-900">
                {geolocation.message}
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={locateMe} disabled={geolocation.locating} className={`${floatingButton} bg-white dark:bg-zinc-900`}>
                {geolocation.locating ? "Buscando tu ubicación..." : "Usar mi ubicación"}
              </button>
              <button type="button" onClick={cancelReport} className={`${floatingButton} bg-white dark:bg-zinc-900`}>
                Cancelar
              </button>
            </div>
            <button type="button" onClick={confirmPoint} disabled={!insideRosario} className={`${floatingButton} bg-foreground px-6 py-3 text-base text-background`}>
              Confirmar ubicación
            </button>
          </div>
        </>
      )}

      {mode === "filling" && (
        <ReportPanel
          ref={reportPanelRef}
          draft={draft}
          onChange={(changes) => dispatch({ type: "set", changes })}
          onChangeLocation={changeLocation}
          onCancel={cancelReport}
          onPublished={handlePublished}
          onViewReport={viewReport}
          onReportAnother={reportAnother}
          takeSimulatedFailure={() => {
            const failure = simulate.current;
            simulate.current = null;
            return failure;
          }}
        />
      )}

      {mode === "viewing" && selected && (
        <ReportDetail key={selected.id} ref={panelRef} report={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

/**
 * Única fuente de datos del mapa. Hoy sirve reportes sintéticos con la forma de
 * GET /api/reports; para integrar el backend solo se reemplaza listReports.
 */
import type { ApiError } from "../../../lib/contracts/errors";
import type { Report, ReportList, ReportListQuery } from "../../../lib/contracts/reports";
import { validateReportListQuery } from "../../../lib/contracts/validation";
import { SAMPLE_REPORTS } from "./sample-reports";

/** Vale true mientras listReports sirve datos sintéticos; la página muestra un aviso de datos de ejemplo. */
export const USING_SAMPLE_DATA = true;

// Reportes publicados desde el formulario en el modo de ejemplo. Viven en memoria hasta recargar la página.
const publishedSampleReports: Report[] = [];

/** Suma un reporte publicado en el modo de ejemplo para que aparezca en el mapa. */
export function addPublishedSampleReport(report: Report): void {
  publishedSampleReports.push(report);
}

export class ReportSourceError extends Error {
  constructor(readonly apiError: ApiError) {
    super(apiError.message);
    this.name = "ReportSourceError";
  }
}

export type Bounds = { west: number; south: number; east: number; north: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Convierte los límites del área visible al bbox "oeste,sur,este,norte" del contrato, recortado a rangos válidos. */
export function toBbox({ west, south, east, north }: Bounds): string {
  return [clamp(west, -180, 180), clamp(south, -90, 90), clamp(east, -180, 180), clamp(north, -90, 90)].join(",");
}

type CursorFilters = Pick<ReportListQuery, "categoryId" | "status" | "bbox">;
type CursorPayload = { version: 1; createdAt: string; id: string; filters: CursorFilters };

function encodeCursor(report: Report, filters: CursorFilters): string {
  const payload: CursorPayload = { version: 1, createdAt: report.createdAt, id: report.id, filters };
  return btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeCursor(cursor: string): CursorPayload {
  const padded = cursor.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(padded + "=".repeat((4 - padded.length % 4) % 4)));
}

/** Los más nuevos primero; el id desempata para que las páginas sean estables. */
function compareReports(a: Report, b: Report): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

function insideBbox(report: Report, bbox: string): boolean {
  const [west, south, east, north] = bbox.split(",").map(Number);
  const { latitude, longitude } = report.location;
  return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
}

export async function listReports(query: ReportListQuery): Promise<ReportList> {
  const parsed = validateReportListQuery(query);
  if (!parsed.valid) throw new ReportSourceError(parsed.error);
  const { categoryId, status, bbox, limit = 50, cursor } = parsed.value;
  const filters: CursorFilters = Object.fromEntries(
    Object.entries({ categoryId, status, bbox }).filter(([, value]) => value !== undefined),
  );

  let matches = [...SAMPLE_REPORTS, ...publishedSampleReports]
    .filter((report) => (!bbox || insideBbox(report, bbox)) &&
      (!categoryId || report.categoryId === categoryId) &&
      (!status || report.status === status))
    .sort(compareReports);

  if (cursor) {
    const after = decodeCursor(cursor);
    const position = { createdAt: after.createdAt, id: after.id } as Report;
    matches = matches.filter((report) => compareReports(position, report) < 0);
  }

  const items = matches.slice(0, limit);
  const nextCursor = matches.length > limit ? encodeCursor(items[items.length - 1], filters) : null;
  return { items, nextCursor };
}

/** Recorre todas las páginas de un área visible para no descartar ningún reporte en silencio. */
export async function loadAllReportsInBbox(bbox: string, limit?: number): Promise<Report[]> {
  const reports: Report[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await listReports({ bbox, ...(limit ? { limit } : {}), ...(cursor ? { cursor } : {}) });
    reports.push(...page.items);
    cursor = page.nextCursor ?? undefined;
    if (cursor && seenCursors.has(cursor)) throw new Error("La paginación de reportes devolvió un cursor repetido.");
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return reports;
}

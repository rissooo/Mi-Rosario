/**
 * Single data source for the map. Today it serves synthetic reports with the
 * GET /api/reports shape; integration replaces only listReports.
 */
import type { ApiError } from "../../../lib/contracts/errors";
import type { Report, ReportList, ReportListQuery } from "../../../lib/contracts/reports";
import { validateReportListQuery } from "../../../lib/contracts/validation";
import { SAMPLE_REPORTS } from "./sample-reports";

/** True while listReports serves synthetic data; the page shows a sample-data notice. */
export const USING_SAMPLE_DATA = true;

export class ReportSourceError extends Error {
  constructor(readonly apiError: ApiError) {
    super(apiError.message);
    this.name = "ReportSourceError";
  }
}

export type Bounds = { west: number; south: number; east: number; north: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Map viewport bounds to the contract's "west,south,east,north" bbox, clamped to valid ranges. */
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

/** Newest first; id breaks ties so pages are stable. */
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

  let matches = SAMPLE_REPORTS
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

/** Follow every page for a viewport so no report is silently dropped. */
export async function loadAllReportsInBbox(bbox: string, limit?: number): Promise<Report[]> {
  const reports: Report[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await listReports({ bbox, ...(limit ? { limit } : {}), ...(cursor ? { cursor } : {}) });
    reports.push(...page.items);
    cursor = page.nextCursor ?? undefined;
    if (cursor && seenCursors.has(cursor)) throw new Error("Report pagination returned a repeated cursor.");
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return reports;
}

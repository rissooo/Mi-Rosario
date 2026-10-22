/** Catalog IDs are stable. Extending the active catalog requires product review. */
export type CategoryId = string;
export type InitialMvpCategoryId =
  | "pothole"
  | "missing-light"
  | "damaged-sidewalk"
  | "faulty-traffic-light";

export type CategoryDefinition = Readonly<{
  id: CategoryId;
  label: string;
  active: boolean;
  scope: "mvp" | "future";
}>;

export const INITIAL_CATEGORIES = Object.freeze([
  Object.freeze({ id: "pothole", label: "Baches", active: true, scope: "mvp" }),
  Object.freeze({ id: "missing-light", label: "Falta de luz", active: true, scope: "mvp" }),
  Object.freeze({ id: "damaged-sidewalk", label: "Veredas dañadas", active: true, scope: "mvp" }),
  Object.freeze({ id: "faulty-traffic-light", label: "Semáforos defectuosos", active: true, scope: "mvp" }),
] as const satisfies readonly (CategoryDefinition & { id: InitialMvpCategoryId })[]);

export function isActiveCategory(
  value: unknown,
  catalog: readonly CategoryDefinition[] = INITIAL_CATEGORIES,
): value is CategoryId {
  return typeof value === "string" && catalog.some((entry) => entry.active && entry.id === value);
}

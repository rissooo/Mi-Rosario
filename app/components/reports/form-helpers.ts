type CryptoLike = Pick<Crypto, "getRandomValues"> & { randomUUID?: () => string };

/**
 * UUID v4. `crypto.randomUUID` solo existe en contextos seguros (https o localhost); por la IP de la
 * red local se arma con `getRandomValues`, que sí está disponible.
 */
export function randomUuid(source: CryptoLike = globalThis.crypto): string {
  if (typeof source.randomUUID === "function") return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type FormField = "photo" | "categoryId" | "severity" | "title" | "description" | "location" | "street" | "number" | "general";

// Rutas de los fieldErrors del contrato, de la más específica a la más general.
const FIELD_PATHS: readonly (readonly [string, FormField])[] = [
  ["report.location.address.street", "street"],
  ["report.location.address.number", "number"],
  ["report.location.address", "street"],
  ["report.location", "location"],
  ["report.title", "title"],
  ["report.description", "description"],
  ["report.categoryId", "categoryId"],
  ["report.severity", "severity"],
  ["image", "photo"],
];

/** Indica a qué campo del formulario corresponde una ruta de error del contrato. */
export function fieldForErrorPath(path: string): FormField {
  const match = FIELD_PATHS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}.`));
  return match ? match[1] : "general";
}

/** Agrupa los fieldErrors del contrato por campo del formulario. */
export function groupFieldErrors(fieldErrors: Record<string, string[]> = {}): Partial<Record<FormField, string[]>> {
  const grouped: Partial<Record<FormField, string[]>> = {};
  for (const [path, messages] of Object.entries(fieldErrors)) {
    const field = fieldForErrorPath(path);
    grouped[field] = [...(grouped[field] ?? []), ...messages];
  }
  return grouped;
}

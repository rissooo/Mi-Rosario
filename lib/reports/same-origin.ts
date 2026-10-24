/**
 * Detecta mutaciones enviadas desde otro sitio. Los navegadores mandan Origin en los
 * POST; si falta, Sec-Fetch-Site indica si el pedido salió de otro sitio. Un cliente
 * sin ninguno de los dos (curl, scripts) no lleva cookies ajenas, así que se acepta.
 */
export function isCrossSiteMutation(headers: Headers, expectedOrigin: string): boolean {
  const origin = headers.get("origin");
  if (origin !== null) return origin !== expectedOrigin;
  return headers.get("sec-fetch-site") === "cross-site";
}

export const CROSS_SITE_MUTATION_ERROR = {
  error: { code: "FORBIDDEN", message: "La solicitud no proviene de Mi Rosario." },
} as const;

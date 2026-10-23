import { isInsideRosario } from "../map/rosario-boundary";
import type { Point } from "./report-draft";

/** A partir de este margen de error (en metros) se avisa que la ubicación es aproximada. */
export const APPROXIMATE_ACCURACY_M = 500;

const kmFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

/**
 * Decide qué hacer con la ubicación del navegador. En una compu no hay GPS: la posición sale del
 * Wi-Fi o de la IP y puede caer en otra ciudad, así que fuera de Rosario no se mueve el mapa.
 */
export function geolocationOutcome(point: Point, accuracyMeters: number): { move: boolean; message: string | null } {
  if (!isInsideRosario(point.latitude, point.longitude)) {
    return { move: false, message: "Tu ubicación aparece fuera de Rosario (en una compu suele ser aproximada). Mové el mapa hasta el lugar." };
  }
  if (accuracyMeters > APPROXIMATE_ACCURACY_M) {
    return { move: true, message: `Ubicación aproximada (±${kmFormat.format(accuracyMeters / 1000)} km): ajustá el mapa hasta el lugar exacto.` };
  }
  return { move: true, message: null };
}

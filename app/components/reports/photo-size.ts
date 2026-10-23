/** Lado mayor máximo de la foto publicada, en píxeles. */
export const MAX_PHOTO_SIDE = 2560;

/** Calidades JPEG que se prueban en orden hasta que la foto quede por debajo del límite de bytes. */
export const JPEG_QUALITIES = [0.85, 0.75, 0.65] as const;

/** Achica proporcionalmente para que el lado mayor no supere `maxSide`. Nunca agranda. */
export function fitWithin(width: number, height: number, maxSide: number = MAX_PHOTO_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

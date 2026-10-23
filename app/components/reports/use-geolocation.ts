"use client";

import { useCallback, useState } from "react";
import { geolocationOutcome } from "./geolocation-outcome";
import type { Point } from "./report-draft";

const GEOLOCATION_MESSAGES: Record<number, string> = {
  1: "No diste permiso para usar tu ubicación. Mové el mapa hasta el lugar.",
  2: "No pudimos obtener tu ubicación. Mové el mapa hasta el lugar.",
  3: "Tu ubicación tardó demasiado. Mové el mapa hasta el lugar.",
};

/**
 * Pide la ubicación una vez y solo llama a `onPoint` si está dentro de Rosario. Los errores y las
 * ubicaciones aproximadas o fuera de la ciudad quedan como un mensaje en español.
 */
export function useGeolocation() {
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const locate = useCallback((onPoint: (point: Point) => void) => {
    // El navegador solo da la ubicación en contextos seguros (https o localhost).
    if (!window.isSecureContext || !("geolocation" in navigator)) {
      setMessage("Tu navegador no puede darnos tu ubicación acá. Mové el mapa hasta el lugar.");
      return;
    }
    setLocating(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        const outcome = geolocationOutcome(point, position.coords.accuracy);
        setMessage(outcome.message);
        if (outcome.move) onPoint(point);
      },
      (error) => {
        setLocating(false);
        setMessage(GEOLOCATION_MESSAGES[error.code] ?? GEOLOCATION_MESSAGES[2]);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);
  const clearMessage = useCallback(() => setMessage(null), []);

  return { locate, locating, message, clearMessage };
}

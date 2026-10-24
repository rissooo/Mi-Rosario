"use client";

import { useEffect, useRef, useState } from "react";
import { signInWithGoogle } from "@/app/components/reports/LoginPrompt";

const optionClass = "flex h-11 w-full items-center justify-center rounded-full px-4 text-sm font-medium";

/**
 * Menú de la cuenta arriba a la izquierda del mapa, encima de los botones de zoom. Muestra la
 * sesión y permite entrar o salir sin dejar `/mapa`. Va fuera del contenedor de Leaflet, así que
 * tocarlo no cuenta como tocar el mapa.
 */
export function SessionMenu({
  signedIn,
  email,
  onSignOut,
}: {
  /** null mientras todavía no se sabe si hay sesión. */
  signedIn: boolean | null;
  email: string | null;
  /** Cierra la sesión; si falla, rechaza la promesa. */
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    // En captura y sin propagar: Escape cierra solo el menú, no también el detalle abierto.
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open]);

  const toggle = () => {
    setError(null);
    setOpen((current) => !current);
  };

  const signOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSignOut();
      setOpen(false);
    } catch {
      setError("No pudimos cerrar la sesión. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={container} className="absolute left-[10px] top-[10px] z-[1001]">
      {/* Mismo tamaño y borde que los botones de zoom de Leaflet. */}
      <button
        type="button"
        onClick={toggle}
        aria-label="Menú de la cuenta"
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-[34px] w-[34px] items-center justify-center rounded border-2 border-black/20 bg-white bg-clip-padding text-black hover:bg-zinc-100"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
          <rect x="2" y="4" width="16" height="2" rx="1" />
          <rect x="2" y="9" width="16" height="2" rx="1" />
          <rect x="2" y="14" width="16" height="2" rx="1" />
        </svg>
      </button>

      {open && (
        <div role="menu" className="mt-2 flex w-64 flex-col gap-3 rounded-2xl bg-white p-4 text-sm shadow-xl dark:bg-zinc-900">
          {signedIn === null ? (
            <p role="status" className="text-zinc-500">Cargando...</p>
          ) : signedIn ? (
            <>
              <p className="text-zinc-700 dark:text-zinc-300">
                Sesión iniciada{email ? " como" : ""}
                {email && <span className="block break-all font-medium text-black dark:text-zinc-50">{email}</span>}
              </p>
              <button
                type="button"
                role="menuitem"
                onClick={() => void signOut()}
                disabled={busy}
                className={`${optionClass} border border-black/[.15] disabled:opacity-60 dark:border-white/[.2]`}
              >
                {busy ? "Cerrando sesión..." : "Cerrar sesión"}
              </button>
              {error && <p role="alert" className="text-red-700 dark:text-red-400">{error}</p>}
            </>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); void signInWithGoogle("/mapa"); }}
              className={`${optionClass} bg-foreground text-background`}
            >
              Entrar con Google
            </button>
          )}
        </div>
      )}
    </div>
  );
}

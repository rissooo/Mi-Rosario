"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiError } from "@/lib/contracts/errors";
import type { MyConfirmation } from "@/lib/contracts/reports";
import type { SampleReportChanges } from "../map/report-source";
import { confirmReport, getMyConfirmation, type SimulatedConfirmationFailure } from "./confirmation-source";
import { LoginPrompt } from "./LoginPrompt";

type Retry = "load" | "confirm";
type State =
  | { kind: "loading" }
  | { kind: "ready"; mine: MyConfirmation }
  | { kind: "sending" }
  /** Sin opción de confirmar: autor rechazado por el servidor o reporte inexistente. */
  | { kind: "blocked"; message: string }
  | { kind: "login"; message: string }
  | { kind: "failed"; message: string; retry: Retry };

const REASON_MESSAGES: Record<NonNullable<MyConfirmation["reason"]>, string> = {
  author: "No podés confirmar tu propio reporte.",
  "already-confirmed": "Ya confirmaste este reporte.",
  resolved: "El reporte ya está resuelto.",
};

const NETWORK_ERROR = "No pudimos conectarnos. Revisá tu conexión y probá de nuevo.";
const buttonClass = "flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 font-medium text-background disabled:opacity-60";

function errorState(error: ApiError | undefined, retry: Retry): State {
  if (!error) return { kind: "failed", message: NETWORK_ERROR, retry };
  if (error.code === "UNAUTHENTICATED") return { kind: "login", message: error.message };
  if (error.code === "AUTHOR_CANNOT_CONFIRM" || error.code === "REPORT_NOT_FOUND") return { kind: "blocked", message: error.message };
  return { kind: "failed", message: error.message, retry };
}

/**
 * Sección "Yo también lo vi" del detalle. Muestra lo que informa el servidor (elegibilidad, contador
 * y etapa) y nunca lo calcula; los permisos reales los aplica el backend.
 */
export function ConfirmationAction({
  reportId,
  signedIn,
  onConfirmed,
  takeSimulatedFailure,
}: {
  reportId: string;
  /** null mientras todavía no se sabe si hay sesión. */
  signedIn: boolean | null;
  onConfirmed: (changes: SampleReportChanges) => void;
  takeSimulatedFailure: () => SimulatedConfirmationFailure | null;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  // Evita un segundo envío antes de que React vuelva a renderizar el botón deshabilitado.
  const sending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /** Consulta la elegibilidad de la cuenta; isActive descarta respuestas de un detalle ya cerrado. */
  const fetchMine = useCallback((isActive: () => boolean) => {
    getMyConfirmation(reportId).then(
      (response) => {
        if (!isActive()) return;
        const { data, error } = response.body;
        setState(data ? { kind: "ready", mine: data } : errorState(error, "load"));
      },
      () => { if (isActive()) setState({ kind: "failed", message: NETWORK_ERROR, retry: "load" }); },
    );
  }, [reportId]);

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    fetchMine(() => active);
    return () => { active = false; };
  }, [signedIn, fetchMine]);

  const reload = () => {
    setState({ kind: "loading" });
    fetchMine(() => mounted.current);
  };

  const confirm = async () => {
    if (sending.current) return;
    sending.current = true;
    setState({ kind: "sending" });
    try {
      const { data, error } = (await confirmReport(reportId, { simulate: takeSimulatedFailure() })).body;
      if (!mounted.current) return;
      if (data) {
        onConfirmed({ status: data.status, citizenVerification: data.citizenVerification });
        setState({ kind: "ready", mine: data });
      } else {
        setState(errorState(error, "confirm"));
      }
    } catch {
      if (mounted.current) setState({ kind: "failed", message: NETWORK_ERROR, retry: "confirm" });
    } finally {
      sending.current = false;
    }
  };

  const next = `/mapa?reporte=${reportId}`;
  let content;
  if (signedIn === false) {
    content = <LoginPrompt next={next} message="Entrá con Google para confirmar." />;
  } else if (signedIn === null || state.kind === "loading") {
    content = <p role="status" className="text-sm text-zinc-500">Cargando...</p>;
  } else if (state.kind === "login") {
    content = <LoginPrompt next={next} message={state.message} />;
  } else if (state.kind === "blocked") {
    content = <p className="text-sm">{state.message}</p>;
  } else if (state.kind === "failed") {
    content = (
      <div role="alert" className="flex flex-col gap-2">
        <p className="text-sm text-red-700 dark:text-red-400">{state.message}</p>
        <button type="button" onClick={state.retry === "load" ? reload : () => void confirm()} className="self-start text-sm font-semibold underline">
          Reintentar
        </button>
      </div>
    );
  } else if (state.kind === "sending" || state.mine.canConfirm) {
    content = (
      <button type="button" onClick={() => void confirm()} disabled={state.kind === "sending"} className={buttonClass}>
        {state.kind === "sending" ? "Enviando..." : "Yo también lo vi"}
      </button>
    );
  } else {
    content = <p className="text-sm">{state.mine.reason ? REASON_MESSAGES[state.mine.reason] : null}</p>;
  }

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <h3 className="text-sm font-semibold text-black dark:text-zinc-50">¿Lo viste?</h3>
      {content}
    </div>
  );
}

"use client";

import { useEffect, useState, type Ref } from "react";
import { INITIAL_CATEGORIES } from "@/lib/contracts/categories";
import {
  FUTURE_INSTITUTIONAL_STAGES, REPORT_STAGES, SEVERITY_DETAILS, STAGE_LABELS,
  type Address, type Photo, type Report, type ReportStage,
} from "@/lib/contracts/reports";

const dateFormat = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});
// Las alturas se leen tal cual ("Córdoba 6400"), sin separador de miles.
const formatAddress = ({ street, number }: Address) => (number === null ? `${street} (sin altura)` : `${street} ${number}`);

const isInstitutional = (stage: ReportStage) => FUTURE_INSTITUTIONAL_STAGES.some((future) => future === stage);

function ReportPhoto({ photo, title }: { photo: Photo; title: string }) {
  const [failed, setFailed] = useState(() => Date.parse(photo.expiresAt) <= Date.now());

  if (failed) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-zinc-100 text-sm text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        Foto no disponible
      </div>
    );
  }
  return (
    // Las URLs firmadas de las fotos vencen y vienen del backend; next/image necesitaría
    // remotePatterns en el next.config.ts compartido y, de todos modos, no podría cachearlas.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo.url}
      alt={`Foto del reporte: ${title}`}
      onError={() => setFailed(true)}
      className="aspect-video w-full rounded-lg object-cover"
    />
  );
}

function StageTrack({ status }: { status: ReportStage }) {
  const currentIndex = REPORT_STAGES.indexOf(status);
  return (
    <ol className="flex flex-col gap-2">
      {REPORT_STAGES.map((stage, index) => {
        const unavailable = isInstitutional(stage);
        const current = stage === status;
        const note = current ? "Etapa actual" : unavailable ? "No disponible" : index < currentIndex ? "Completada" : "Próxima";
        return (
          <li
            key={stage}
            aria-current={current ? "step" : undefined}
            className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
              current
                ? "border-foreground font-semibold"
                : unavailable
                  ? "border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
                  : "border-zinc-200 dark:border-zinc-700"
            }`}
          >
            <span>{STAGE_LABELS[stage]}</span>
            <span className="text-xs font-normal">{note}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function ReportDetail({ report, onClose, ref }: { report: Report; onClose: () => void; ref?: Ref<HTMLElement> }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const category = INITIAL_CATEGORIES.find((entry) => entry.id === report.categoryId)?.label ?? report.categoryId;
  const severity = SEVERITY_DETAILS[report.severity];
  const { confirmationCount, threshold } = report.citizenVerification;

  return (
    <section
      ref={ref}
      aria-labelledby="report-detail-title"
      className="absolute inset-x-0 bottom-0 z-[1100] flex max-h-[60%] flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-950 md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-96 md:rounded-none"
    >
      <div className="flex items-start justify-between gap-3 border-b border-black/[.08] px-4 py-3 dark:border-white/[.145]">
        <h2 id="report-detail-title" className="text-base font-semibold text-black dark:text-zinc-50">
          {report.title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full border border-black/[.08] px-3 py-1 text-sm font-medium dark:border-white/[.145]"
        >
          Cerrar
        </button>
      </div>

      <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4 text-zinc-700 dark:text-zinc-300">
        <ReportPhoto photo={report.photo} title={report.title} />

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="font-medium text-zinc-500">Categoría</dt>
          <dd>{category}</dd>
          <dt className="font-medium text-zinc-500">Gravedad</dt>
          <dd>
            {severity.label}
            <span className="block text-zinc-500">{severity.description}</span>
          </dd>
          <dt className="font-medium text-zinc-500">Confirmaciones</dt>
          <dd>{confirmationCount} de {threshold} confirmaciones ciudadanas</dd>
          <dt className="font-medium text-zinc-500">Fecha</dt>
          <dd>{dateFormat.format(new Date(report.createdAt))}</dd>
          <dt className="font-medium text-zinc-500">Ubicación</dt>
          <dd>{formatAddress(report.location.address)}</dd>
        </dl>

        <p className="text-sm leading-6">{report.description}</p>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-black dark:text-zinc-50">Estado</h3>
          <StageTrack status={report.status} />
        </div>
      </div>
    </section>
  );
}

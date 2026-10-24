"use client";

import { useLayoutEffect, useRef, useState, type Ref } from "react";
import type { ImageSuggestion } from "@/lib/contracts/vision";
import { INITIAL_CATEGORIES } from "@/lib/contracts/categories";
import { SEVERITIES, SEVERITY_DETAILS, type Report } from "@/lib/contracts/reports";
import { validatePublishReportRequest } from "@/lib/contracts/validation";
import { isInsideRosario } from "../map/rosario-boundary";
import { USING_SAMPLE_DATA } from "../map/report-source";
import { groupFieldErrors, randomUuid, type FormField } from "./form-helpers";
import { LoginPrompt } from "./LoginPrompt";
import { PhotoField } from "./PhotoField";
import { VisionAssist } from "./VisionAssist";
import { changesFromVisionSuggestion } from "./vision-suggestion";
import { toReportFields, type Draft, type DraftChanges } from "./report-draft";
import { publishReport, type SimulatedFailure } from "./report-publisher";

type Submission =
  | { state: "editing" }
  | { state: "publishing" }
  | { state: "failed"; message: string; needsLogin: boolean }
  | { state: "published"; report: Report };

type Errors = Partial<Record<FormField, string[]>>;

// Qué campo del formulario muestra los errores de cada parte del borrador.
const DRAFT_FIELD: Record<keyof Draft, FormField | null> = {
  idempotencyKey: null,
  point: "location",
  photo: "photo",
  categoryId: "categoryId",
  severity: "severity",
  title: "title",
  description: "description",
  street: "street",
  number: "number",
  noNumber: "number",
};

function FieldErrors({ messages }: { messages?: string[] }) {
  return (messages ?? []).map((message) => (
    <p key={message} role="alert" className="text-sm text-red-700 dark:text-red-400">{message}</p>
  ));
}

const sectionClass = "flex flex-col gap-3";
const inputClass = "rounded-lg border border-black/[.15] bg-white px-3 py-2 text-base dark:border-white/[.2] dark:bg-zinc-900";
const choiceClass = (selected: boolean) =>
  `flex cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm ${selected ? "border-foreground font-semibold" : "border-black/[.15] dark:border-white/[.2]"}`;
const primaryButton = "flex h-12 items-center justify-center rounded-full bg-foreground px-5 font-medium text-background disabled:opacity-60";
const secondaryButton = "flex h-12 items-center justify-center rounded-full border border-black/[.08] px-5 font-medium dark:border-white/[.145]";

/**
 * Formulario del reporte, con la misma forma que el panel de detalle: abajo en el celular y al
 * costado en pantallas anchas. El borrador lo maneja el mapa, así que volver a elegir el punto no
 * pierde nada.
 */
export function ReportPanel({
  draft,
  onChange,
  onChangeLocation,
  onCancel,
  onPublished,
  onViewReport,
  onReportAnother,
  takeSimulatedFailure,
  ref,
}: {
  draft: Draft;
  onChange: (changes: DraftChanges) => void;
  onChangeLocation: () => void;
  onCancel: () => void;
  onPublished: (report: Report) => void;
  onViewReport: (report: Report) => void;
  onReportAnother: () => void;
  takeSimulatedFailure: () => SimulatedFailure | null;
  ref?: Ref<HTMLElement>;
}) {
  const [submission, setSubmission] = useState<Submission>({ state: "editing" });
  const [errors, setErrors] = useState<Errors>({});
  const publishing = useRef(false);
  // Snapshot actualizado tras cada commit; un resultado asíncrono no debe usar datos anteriores.
  const latestDraft = useRef(draft);
  useLayoutEffect(() => { latestDraft.current = draft; }, [draft]);

  // Al corregir un campo se borra su error, para no dejar a la vista un mensaje que ya no aplica.
  const set = (changes: DraftChanges) => {
    latestDraft.current = { ...latestDraft.current, ...changes };
    onChange(changes);
    const touched = new Set(Object.keys(changes).map((key) => DRAFT_FIELD[key as keyof Draft]).filter(Boolean));
    if (touched.size) setErrors((current) => Object.fromEntries(Object.entries(current).filter(([field]) => !touched.has(field as FormField))));
  };

  const applyVisionSuggestion = (suggestion: ImageSuggestion, photo: File) => {
    const current = latestDraft.current;
    if (current.photo !== photo || publishing.current) return;
    const changes = changesFromVisionSuggestion(current, suggestion);
    if (Object.keys(changes).length > 0) set(changes);
  };

  const submit = async () => {
    // Un doble toque no debe mandar dos publicaciones.
    if (publishing.current) return;
    const report = toReportFields(draft);
    const parsed = validatePublishReportRequest({ report, image: draft.photo });
    const nextErrors: Errors = parsed.valid ? {} : groupFieldErrors(parsed.error.fieldErrors);
    // El punto ya se validó al confirmarlo; esto cubre un borrador inconsistente.
    delete nextErrors.location;
    if (!draft.point || !isInsideRosario(draft.point.latitude, draft.point.longitude)) nextErrors.location = ["Elegí un punto dentro de Rosario."];
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !parsed.valid || !draft.photo) return;

    publishing.current = true;
    setSubmission({ state: "publishing" });
    const idempotencyKey = draft.idempotencyKey || randomUuid();
    if (!draft.idempotencyKey) onChange({ idempotencyKey });
    try {
      const result = await publishReport(
        { report: parsed.value.report, image: draft.photo, idempotencyKey },
        { simulate: takeSimulatedFailure() },
      );
      if (result.body.data) {
        setSubmission({ state: "published", report: result.body.data });
        setErrors({});
        onPublished(result.body.data);
      } else if (result.body.error) {
        const { code, message, fieldErrors } = result.body.error;
        if (fieldErrors) setErrors(groupFieldErrors(fieldErrors));
        setSubmission({ state: "failed", message, needsLogin: code === "UNAUTHENTICATED" });
      }
    } catch {
      setSubmission({ state: "failed", message: "No se pudo publicar el reporte. Revisá tu conexión y reintentá.", needsLogin: false });
    } finally {
      publishing.current = false;
    }
  };

  const isPublishing = submission.state === "publishing";
  const severity = draft.severity ? SEVERITY_DETAILS[draft.severity] : null;

  return (
    <section
      ref={ref}
      aria-labelledby="report-panel-title"
      className="absolute inset-x-0 bottom-0 z-[1100] flex max-h-[60%] flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-950 md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-96 md:rounded-none"
    >
      <div className="flex items-center justify-between gap-3 border-b border-black/[.08] px-4 py-3 dark:border-white/[.145]">
        <h2 id="report-panel-title" className="text-base font-semibold text-black dark:text-zinc-50">
          {submission.state === "published" ? "¡Reporte publicado!" : "Nuevo reporte"}
        </h2>
        {submission.state !== "published" && (
          <button type="button" onClick={onCancel} className="shrink-0 rounded-full border border-black/[.08] px-3 py-1 text-sm font-medium dark:border-white/[.145]">
            Cancelar
          </button>
        )}
      </div>

      {submission.state === "published" ? (
        <div className="flex flex-col gap-3 px-4 py-4" aria-live="polite">
          <p className="text-zinc-600 dark:text-zinc-400">“{submission.report.title}” ya está en el mapa.</p>
          <button type="button" onClick={() => onViewReport(submission.report)} className={primaryButton}>Ver el reporte</button>
          <button type="button" onClick={onReportAnother} className={secondaryButton}>Reportar otro</button>
        </div>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-5 overflow-y-auto px-4 py-4 text-zinc-700 dark:text-zinc-300"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {USING_SAMPLE_DATA && (
            <p role="note" className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
              Modo de ejemplo: los reportes no se guardan de verdad.
            </p>
          )}

          <div className="flex items-center justify-between gap-2 text-sm">
            <span>Ubicación elegida en el mapa</span>
            <button type="button" onClick={onChangeLocation} className="font-semibold underline">Cambiar</button>
          </div>
          <FieldErrors messages={errors.location} />

          <div className={sectionClass}>
            <h3 className="font-semibold text-black dark:text-zinc-50">Foto</h3>
            <PhotoField photo={draft.photo} onChange={(photo) => set({ photo })} errors={errors.photo} />
            <VisionAssist photo={draft.photo} disabled={submission.state === "publishing"} onSuggestion={applyVisionSuggestion} />
          </div>

          <div className={sectionClass}>
            <h3 className="font-semibold text-black dark:text-zinc-50">Qué pasó</h3>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Categoría</legend>
              <div className="grid grid-cols-2 gap-2">
                {INITIAL_CATEGORIES.filter((category) => category.active).map((category) => (
                  <label key={category.id} className={choiceClass(draft.categoryId === category.id)}>
                    <input type="radio" name="categoryId" value={category.id} className="sr-only" checked={draft.categoryId === category.id} onChange={() => set({ categoryId: category.id })} />
                    {category.label}
                  </label>
                ))}
              </div>
              <FieldErrors messages={errors.categoryId} />
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Gravedad</legend>
              <div className="grid grid-cols-3 gap-2">
                {SEVERITIES.map((value) => (
                  <label key={value} className={`${choiceClass(draft.severity === value)} items-center`}>
                    <input type="radio" name="severity" value={value} className="sr-only" checked={draft.severity === value} onChange={() => set({ severity: value })} />
                    {SEVERITY_DETAILS[value].label}
                  </label>
                ))}
              </div>
              {severity && <p className="text-sm text-zinc-600 dark:text-zinc-400">{severity.description}</p>}
              <FieldErrors messages={errors.severity} />
            </fieldset>

            <label className="flex flex-col gap-1 text-sm font-medium">
              Título
              <input className={inputClass} value={draft.title} maxLength={120} placeholder="Ej.: Bache profundo frente a la escuela" onChange={(event) => set({ title: event.target.value })} />
              <FieldErrors messages={errors.title} />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium">
              Descripción
              <textarea className={inputClass} rows={3} value={draft.description} maxLength={1000} placeholder="Contá qué viste y desde cuándo." onChange={(event) => set({ description: event.target.value })} />
              <FieldErrors messages={errors.description} />
            </label>
          </div>

          <div className={sectionClass}>
            <h3 className="font-semibold text-black dark:text-zinc-50">Dirección</h3>
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Calle
                <input className={inputClass} value={draft.street} maxLength={80} placeholder="Ej.: Córdoba" onChange={(event) => set({ street: event.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Altura
                <input className={inputClass} value={draft.noNumber ? "" : draft.number} inputMode="numeric" disabled={draft.noNumber} placeholder="1250" onChange={(event) => set({ number: event.target.value.replace(/\D/g, "") })} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.noNumber} onChange={(event) => set({ noNumber: event.target.checked })} />
              Sin altura (una plaza, un parque)
            </label>
            <FieldErrors messages={errors.street} />
            <FieldErrors messages={errors.number} />
          </div>

          {submission.state === "failed" && (
            <div role="alert" className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              <p>{submission.message}</p>
              {submission.needsLogin && <LoginPrompt next="/mapa?reportar=1" message="Tu sesión venció. Volvé a entrar para publicar." />}
            </div>
          )}
          <FieldErrors messages={errors.general} />

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Al publicar, la foto, el texto y el punto elegido quedan visibles para todos en el mapa. La foto
            pública se guarda sin los datos del celular (como la ubicación GPS); la original queda privada. Si
            usás la ayuda de la IA, la foto se envía a OpenAI solo para sugerir los campos.
          </p>

          <button type="submit" disabled={isPublishing} className={primaryButton}>
            {isPublishing ? "Publicando..." : submission.state === "failed" ? "Reintentar" : "Publicar"}
          </button>
        </form>
      )}
    </section>
  );
}

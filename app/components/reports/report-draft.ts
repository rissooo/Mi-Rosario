import type { CategoryId } from "../../../lib/contracts/categories";
import type { ReportFields, Severity } from "../../../lib/contracts/reports";

export type Point = { latitude: number; longitude: number };

export type Draft = {
  /** Se crea la primera vez que se publica (no durante el render) y se reutiliza en cada reintento. */
  idempotencyKey: string;
  point: Point | null;
  photo: File | null;
  categoryId: CategoryId | null;
  severity: Severity | null;
  title: string;
  description: string;
  street: string;
  number: string;
  noNumber: boolean;
};

export type DraftChanges = Partial<Draft>;
export type DraftAction = { type: "set"; changes: DraftChanges } | { type: "reset" };

export const emptyDraft = (): Draft => ({
  idempotencyKey: "",
  point: null,
  photo: null,
  categoryId: null,
  severity: null,
  title: "",
  description: "",
  street: "",
  number: "",
  noNumber: false,
});

export function draftReducer(draft: Draft, action: DraftAction): Draft {
  return action.type === "reset" ? emptyDraft() : { ...draft, ...action.changes };
}

/** Indica si el vecino ya cargó algo que se perdería al cancelar (el punto solo no cuenta). */
export function hasDraftData(draft: Draft): boolean {
  return Boolean(
    draft.photo || draft.categoryId || draft.severity || draft.title.trim() || draft.description.trim() ||
    draft.street.trim() || draft.number.trim() || draft.noNumber,
  );
}

/** Arma los campos del contrato a partir del borrador; `reviewed` es la confirmación al tocar Publicar. */
export function toReportFields(draft: Draft): ReportFields {
  return {
    title: draft.title,
    description: draft.description,
    categoryId: draft.categoryId as CategoryId,
    severity: draft.severity as Severity,
    location: {
      latitude: draft.point?.latitude ?? Number.NaN,
      longitude: draft.point?.longitude ?? Number.NaN,
      address: { street: draft.street, number: draft.noNumber ? null : draft.number.trim() === "" ? Number.NaN : Number(draft.number) },
    },
    reviewed: true,
  };
}

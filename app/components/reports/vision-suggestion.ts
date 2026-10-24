import type { ImageSuggestion } from "../../../lib/contracts/vision";
import type { Draft, DraftChanges } from "./report-draft";

/** Solo ocupa campos vacíos: el ciudadano conserva el control del reporte. */
export function changesFromVisionSuggestion(draft: Draft, suggestion: ImageSuggestion): DraftChanges {
  const changes: DraftChanges = {};
  if (!draft.title.trim() && suggestion.title) changes.title = suggestion.title;
  if (!draft.description.trim() && suggestion.description) changes.description = suggestion.description;
  if (!draft.categoryId && suggestion.categoryId) changes.categoryId = suggestion.categoryId;
  if (!draft.severity && suggestion.severity) changes.severity = suggestion.severity;
  return changes;
}

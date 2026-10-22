import type { CategoryId } from "./categories";
import type { Severity } from "./reports";

export type AnalyzeImageRequest = { image: File };
export type ImageSuggestion = {
  title: string | null;
  description: string | null;
  categoryId: CategoryId | null;
  severity: Severity | null;
  warnings: string[];
};
export type AnalyzeImageResponse = { suggestion: ImageSuggestion };
export const ANALYSIS_DEADLINE_MS = 20_000;

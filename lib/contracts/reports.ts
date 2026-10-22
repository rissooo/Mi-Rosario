import type { CategoryId } from "./categories";

/** These aliases describe wire values; runtime validators enforce their format. */
export type UUID = string;
export type IsoDateTime = string;
/** Human-readable street address; number is null where the place has no house number. */
export type Address = { street: string; number: number | null };
export type Location = { latitude: number; longitude: number; address: Address };
export type Severity = "low" | "medium" | "high";
export const SEVERITIES = ["low", "medium", "high"] as const;
export const SEVERITY_DETAILS: Readonly<Record<Severity, { label: string; description: string }>> = {
  low: { label: "Baja", description: "Molestia o deterioro menor." },
  medium: { label: "Media", description: "Puede dificultar la circulación o el uso del espacio público." },
  high: { label: "Alta", description: "Riesgo importante para personas o vehículos." },
};

export const MVP_REPORT_STAGES = ["pending", "citizen-verification"] as const;
export const FUTURE_INSTITUTIONAL_STAGES = ["municipal-verification", "resolved"] as const;
export type MvpReportStage = (typeof MVP_REPORT_STAGES)[number];
export type FutureInstitutionalStage = (typeof FUTURE_INSTITUTIONAL_STAGES)[number];
/** Four-stage vocabulary; the institutional values are not operational MVP states. */
export type ReportStage = MvpReportStage | FutureInstitutionalStage;
export const REPORT_STAGES = [...MVP_REPORT_STAGES, ...FUTURE_INSTITUTIONAL_STAGES] as const;
export const STAGE_LABELS: Readonly<Record<ReportStage, string>> = {
  pending: "Pendiente",
  "citizen-verification": "Verificación ciudadana",
  "municipal-verification": "Verificación municipal",
  resolved: "Resuelto",
};

/** Initial backend policy, not an authoritative browser-side transition rule. */
export const INITIAL_CONFIRMATION_THRESHOLD = 3;
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_MULTIPART_BYTES = MAX_IMAGE_BYTES + 64 * 1024;
export const MAX_JSON_BYTES = 16 * 1024;
/** Provisional title limits: for contract evaluation, not approved production policy. */
export const PROVISIONAL_TITLE_LIMITS = { min: 5, max: 120 } as const;
export const DESCRIPTION_LIMITS = { min: 10, max: 1000 } as const;
export const STREET_LIMITS = { min: 2, max: 80 } as const;
export const STREET_NUMBER_LIMITS = { min: 1, max: 99999 } as const;

export type ReportFields = {
  title: string;
  description: string;
  categoryId: CategoryId;
  severity: Severity;
  location: Location;
  reviewed: true;
};
/** Serialize report as JSON and image as a file in multipart FormData. */
export type PublishReportRequest = { report: ReportFields; image: File };
export type PublicationHeaders = { "Idempotency-Key": UUID };
/** Presentation resource only; never a private original object reference. */
export type Photo = { id: UUID; url: string; expiresAt: IsoDateTime; mimeType: ImageMimeType; byteSize: number };
export type CitizenVerification = {
  confirmationCount: number;
  threshold: number;
  policyStatus: "approved";
  corroborated: boolean;
};
export type InstitutionalVerification = { availability: "unavailable" | "enabled"; verifiedAt: IsoDateTime | null };
export type Report = {
  id: UUID;
  title: string;
  description: string;
  categoryId: CategoryId;
  severity: Severity;
  photo: Photo;
  status: ReportStage;
  location: Location;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  citizenVerification: CitizenVerification;
  institutionalVerification: InstitutionalVerification;
  resolvedAt: IsoDateTime | null;
};
export type ReportListQuery = { categoryId?: CategoryId; status?: ReportStage; bbox?: string; limit?: number; cursor?: string };
export type ReportList = { items: Report[]; nextCursor: string | null };
export type MyConfirmation = {
  reportId: UUID;
  status: ReportStage;
  confirmed: boolean;
  confirmedAt: IsoDateTime | null;
  canConfirm: boolean;
  reason: "author" | "resolved" | "already-confirmed" | null;
  citizenVerification: CitizenVerification;
};
export type ConfirmReportRequest = Record<string, never>;
export type ConfirmationResult = MyConfirmation & { confirmed: true };

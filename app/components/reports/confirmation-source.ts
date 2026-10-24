/**
 * Única fuente de confirmaciones del detalle, con la forma de GET /api/reports/{id}/confirmations/me
 * y POST /api/reports/{id}/confirmations. Hoy es falsa: guarda en memoria y hace de servidor. Para
 * integrar el backend se reemplazan getMyConfirmation y confirmReport por un fetch (sin caché,
 * porque la respuesta es privada) y se conserva la validación del contrato.
 */
import { ERROR_STATUS, type ApiResult, type ErrorCode } from "../../../lib/contracts/errors";
import { CONFIRMATION_CASES } from "../../../lib/contracts/fixtures";
import type { ConfirmationResult, MyConfirmation, Report } from "../../../lib/contracts/reports";
import { validateConfirmationResult, validateMyConfirmation, type ValidationResult } from "../../../lib/contracts/validation";
import { findSampleReport, isSampleAuthor, updateSampleReport } from "../map/report-source";

export type ConfirmationResponse<T> = { status: number; body: ApiResult<T> };

/** Errores que se pueden simular en la confirmación con `?simular=` mientras se usa la fuente falsa. */
export const SIMULATED_CONFIRMATION_FAILURES = ["UNAUTHENTICATED", "REPORT_NOT_FOUND", "INTERNAL_ERROR"] as const;
export type SimulatedConfirmationFailure = (typeof SIMULATED_CONFIRMATION_FAILURES)[number];

export function parseSimulatedConfirmationFailure(value: string | null): SimulatedConfirmationFailure | null {
  return SIMULATED_CONFIRMATION_FAILURES.find((code) => code === value) ?? null;
}

const caseMessage = (code: ErrorCode) => {
  const response = CONFIRMATION_CASES.find((item) => "error" in item.response && item.response.error?.code === code)?.response;
  return response && "error" in response ? response.error?.message : undefined;
};

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  UNAUTHENTICATED: caseMessage("UNAUTHENTICATED"),
  AUTHOR_CANNOT_CONFIRM: caseMessage("AUTHOR_CANNOT_CONFIRM"),
  REPORT_NOT_FOUND: caseMessage("REPORT_NOT_FOUND"),
  REPORT_RESOLVED: caseMessage("REPORT_RESOLVED"),
  INTERNAL_ERROR: "No pudimos registrar tu confirmación. Probá de nuevo en un rato.",
};

function failure<T>(code: ErrorCode, message = MESSAGES[code] ?? "No pudimos registrar tu confirmación."): ConfirmationResponse<T> {
  return { status: ERROR_STATUS[code], body: { error: { code, message } } };
}

/** Una respuesta que no cumple el contrato se trata como falla temporal, no se muestra. */
function checked<T>(status: number, result: ValidationResult<T>): ConfirmationResponse<T> {
  if (!result.valid) return failure("INTERNAL_ERROR", "Recibimos una respuesta inesperada. Probá de nuevo.");
  return { status, body: { data: result.value } };
}

// Confirmaciones de la cuenta actual por reporte, como las guardaría el backend.
const confirmations = new Map<string, string>();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Options = { delayMs?: number };

function myConfirmation(report: Report): MyConfirmation {
  const confirmedAt = confirmations.get(report.id) ?? null;
  const author = isSampleAuthor(report.id);
  const reason = author ? "author" : confirmedAt ? "already-confirmed" : null;
  return {
    reportId: report.id,
    status: report.status,
    confirmed: confirmedAt !== null,
    confirmedAt,
    canConfirm: reason === null,
    reason,
    citizenVerification: report.citizenVerification,
  };
}

export async function getMyConfirmation(reportId: string, options: Options = {}): Promise<ConfirmationResponse<MyConfirmation>> {
  await wait(options.delayMs ?? 400);
  const report = findSampleReport(reportId);
  if (!report) return failure("REPORT_NOT_FOUND");
  return checked(200, validateMyConfirmation(myConfirmation(report)));
}

export async function confirmReport(
  reportId: string,
  options: Options & { simulate?: SimulatedConfirmationFailure | null } = {},
): Promise<ConfirmationResponse<ConfirmationResult>> {
  await wait(options.delayMs ?? 600);
  if (options.simulate) return failure(options.simulate);

  // Mismo orden que el backend: reporte, autor, repetición y, si no, una confirmación nueva.
  const report = findSampleReport(reportId);
  if (!report) return failure("REPORT_NOT_FOUND");
  if (isSampleAuthor(reportId)) return failure("AUTHOR_CANNOT_CONFIRM");
  if (confirmations.has(reportId)) return checked(200, validateConfirmationResult(myConfirmation(report)));

  // Esta transición representa al servidor: la interfaz nunca la calcula.
  const { threshold } = report.citizenVerification;
  const confirmationCount = report.citizenVerification.confirmationCount + 1;
  const reached = confirmationCount >= threshold;
  const status = report.status === "pending" && reached ? "citizen-verification" : report.status;
  const citizenVerification = { ...report.citizenVerification, confirmationCount, corroborated: reached };
  confirmations.set(reportId, new Date().toISOString());
  updateSampleReport(reportId, { status, citizenVerification });
  return checked(201, validateConfirmationResult(myConfirmation({ ...report, status, citizenVerification })));
}

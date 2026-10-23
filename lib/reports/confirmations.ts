import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiResult } from "../contracts/errors";
import type {
  ConfirmationResult,
  MyConfirmation,
  ReportStage,
  UUID,
} from "../contracts/reports";

type ConfirmRpcResponse = {
  success: boolean;
  code: string;
  message?: string;
  confirmed?: boolean;
  confirmedAt?: string;
  confirmationCount?: number;
  threshold?: number;
  status?: ReportStage;
};

export type ConfirmExecutionResult = {
  httpStatus: number;
  result: ApiResult<ConfirmationResult>;
};

export type MyConfirmationExecutionResult = {
  httpStatus: number;
  result: ApiResult<MyConfirmation>;
};

/**
 * Executes report confirmation via atomic PostgreSQL RPC confirm_report.
 * Maps RPC response to contract ConfirmationResult DTO and HTTP status.
 */
export async function confirmReport(
  supabase: SupabaseClient,
  reportId: string,
): Promise<ConfirmExecutionResult> {
  const { data, error } = await supabase.rpc("confirm_report", {
    p_report_id: reportId,
  });

  if (error) {
    if (error.message.includes("UNAUTHENTICATED")) {
      return {
        httpStatus: 401,
        result: {
          error: {
            code: "UNAUTHENTICATED",
            message: "Iniciá sesión para confirmar.",
          },
        },
      };
    }
    return {
      httpStatus: 500,
      result: {
        error: {
          code: "INTERNAL_ERROR",
          message: error.message,
        },
      },
    };
  }

  const response = data as ConfirmRpcResponse;

  if (!response.success) {
    switch (response.code) {
      case "REPORT_NOT_FOUND":
        return {
          httpStatus: 404,
          result: {
            error: {
              code: "REPORT_NOT_FOUND",
              message: "No se encontró el reporte.",
            },
          },
        };
      case "AUTHOR_CANNOT_CONFIRM":
        return {
          httpStatus: 403,
          result: {
            error: {
              code: "AUTHOR_CANNOT_CONFIRM",
              message: "No podés confirmar tu propio reporte.",
            },
          },
        };
      case "REPORT_RESOLVED":
        return {
          httpStatus: 409,
          result: {
            error: {
              code: "REPORT_RESOLVED",
              message: "El reporte ya está resuelto.",
            },
          },
        };
      default:
        return {
          httpStatus: 400,
          result: {
            error: {
              code: "INTERNAL_ERROR",
              message: response.message || "No se pudo confirmar el reporte.",
            },
          },
        };
    }
  }

  const count = response.confirmationCount ?? 1;
  const threshold = response.threshold ?? 3;
  const status = response.status ?? "pending";
  const corroborated = count >= threshold;

  const confirmationResult: ConfirmationResult = {
    reportId: reportId as UUID,
    status,
    confirmed: true,
    confirmedAt: response.confirmedAt!,
    canConfirm: false,
    reason: "already-confirmed",
    citizenVerification: {
      confirmationCount: count,
      threshold,
      policyStatus: "approved",
      corroborated,
    },
  };

  const httpStatus = response.code === "ALREADY_CONFIRMED" ? 200 : 201;

  return {
    httpStatus,
    result: { data: confirmationResult },
  };
}

/**
 * Resolves current user's confirmation status and eligibility for a given report.
 */
export async function getMyConfirmation(
  supabase: SupabaseClient,
  reportId: string,
): Promise<MyConfirmationExecutionResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      httpStatus: 401,
      result: {
        error: {
          code: "UNAUTHENTICATED",
          message: "Iniciá sesión para consultar la confirmación.",
        },
      },
    };
  }

  // 1. Fetch report details
  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id, user_id, status")
    .eq("id", reportId)
    .single();

  if (reportError || !report) {
    return {
      httpStatus: 404,
      result: {
        error: {
          code: "REPORT_NOT_FOUND",
          message: "No se encontró el reporte.",
        },
      },
    };
  }

  // 2. Fetch confirmation count and current user's confirmation
  const [{ count }, { data: existingConfirmation }] = await Promise.all([
    supabase
      .from("report_confirmations")
      .select("*", { count: "exact", head: true })
      .eq("report_id", reportId),
    supabase
      .from("report_confirmations")
      .select("created_at")
      .eq("report_id", reportId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const confirmationCount = count ?? 0;
  const threshold = 3;
  const isAuthor = report.user_id === user.id;
  const isConfirmed = !!existingConfirmation;
  const isResolved = report.status === "resolved" || report.status === "municipal-verification";

  let canConfirm = true;
  let reason: "author" | "resolved" | "already-confirmed" | null = null;

  if (isAuthor) {
    canConfirm = false;
    reason = "author";
  } else if (isConfirmed) {
    canConfirm = false;
    reason = "already-confirmed";
  } else if (isResolved) {
    canConfirm = false;
    reason = "resolved";
  }

  const myConfirmation: MyConfirmation = {
    reportId: reportId as UUID,
    status: report.status as ReportStage,
    confirmed: isConfirmed,
    confirmedAt: existingConfirmation?.created_at ?? null,
    canConfirm,
    reason,
    citizenVerification: {
      confirmationCount,
      threshold,
      policyStatus: "approved",
      corroborated: confirmationCount >= threshold,
    },
  };

  return {
    httpStatus: 200,
    result: { data: myConfirmation },
  };
}

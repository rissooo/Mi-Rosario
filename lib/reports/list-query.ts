import { ERROR_STATUS, type ApiResult } from "../contracts/errors";
import type { ReportListQuery } from "../contracts/reports";
import { parseReportListQuery } from "../contracts/validation";

export type ReportsListRequestQuery =
  | { valid: true; query: ReportListQuery }
  | { valid: false; httpStatus: number; result: ApiResult<never> };

export function parseReportsListRequest(params: URLSearchParams): ReportsListRequestQuery {
  const parsed = parseReportListQuery(params);
  if (!parsed.valid) {
    return {
      valid: false,
      httpStatus: ERROR_STATUS[parsed.error.code],
      result: { error: parsed.error },
    };
  }

  return { valid: true, query: parsed.value };
}

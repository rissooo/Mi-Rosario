import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { parseReportsListRequest } from "@/lib/reports/list-query";
import { listReportsService, publishReportService } from "@/lib/reports/service";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHENTICATED",
            message: "Iniciá sesión para publicar un reporte.",
          },
        },
        { status: 401 },
      );
    }

    const idempotencyKey = request.headers.get("Idempotency-Key");
    const formData = await request.formData();

    const { httpStatus, result, retryAfter } = await publishReportService({
      supabase,
      userId: user.id,
      formData,
      idempotencyKey,
    });

    const headers: Record<string, string> = {};
    if (retryAfter) {
      headers["Retry-After"] = String(retryAfter);
    }

    return NextResponse.json(result, { status: httpStatus, headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno del servidor";
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message,
        },
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = parseReportsListRequest(new URL(request.url).searchParams);
    if (!parsedQuery.valid) {
      return NextResponse.json(parsedQuery.result, { status: parsedQuery.httpStatus });
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { httpStatus, result } = await listReportsService(supabase, parsedQuery.query);

    return NextResponse.json(result, { status: httpStatus });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno del servidor";
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message,
        },
      },
      { status: 500 },
    );
  }
}

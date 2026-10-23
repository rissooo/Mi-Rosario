import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { CategoryId } from "@/lib/contracts/categories";
import type { ReportListQuery, ReportStage } from "@/lib/contracts/reports";
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
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { searchParams } = new URL(request.url);
    const categoryId = (searchParams.get("categoryId") as CategoryId) || undefined;
    const status = (searchParams.get("status") as ReportStage) || undefined;
    const bbox = searchParams.get("bbox") || undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const cursor = searchParams.get("cursor") || undefined;

    const query: ReportListQuery = {
      ...(categoryId ? { categoryId } : {}),
      ...(status ? { status } : {}),
      ...(bbox ? { bbox } : {}),
      ...(limit !== undefined && !Number.isNaN(limit) ? { limit } : {}),
      ...(cursor ? { cursor } : {}),
    };

    const { httpStatus, result } = await listReportsService(supabase, query);

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

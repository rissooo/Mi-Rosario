import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getReportDetailService } from "@/lib/reports/service";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { httpStatus, result } = await getReportDetailService(supabase, id);

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

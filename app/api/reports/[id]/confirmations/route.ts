import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { confirmReport } from "@/lib/reports/confirmations";
import { CROSS_SITE_MUTATION_ERROR, isCrossSiteMutation } from "@/lib/reports/same-origin";
import { createClient } from "@/utils/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (isCrossSiteMutation(request.headers, request.nextUrl.origin)) {
      return NextResponse.json(CROSS_SITE_MUTATION_ERROR, { status: 403 });
    }

    const { id } = await params;
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
            message: "Iniciá sesión para confirmar.",
          },
        },
        { status: 401 },
      );
    }

    const { httpStatus, result } = await confirmReport(supabase, id);

    return NextResponse.json(result, { status: httpStatus });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "No se pudo registrar la confirmación.",
        },
      },
      { status: 500 },
    );
  }
}

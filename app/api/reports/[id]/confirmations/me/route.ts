import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getMyConfirmation } from "@/lib/reports/confirmations";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { httpStatus, result } = await getMyConfirmation(supabase, id);

    return NextResponse.json(result, { status: httpStatus });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "No se pudo consultar la confirmación.",
        },
      },
      { status: 500 },
    );
  }
}

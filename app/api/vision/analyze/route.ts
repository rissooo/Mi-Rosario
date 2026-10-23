import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { admissionLimitsFromEnv, LocalAdmission } from "@/lib/vision/admission";
import { authenticateVisionUser } from "@/lib/vision/authentication";
import { errorResponse, VisionError } from "@/lib/vision/errors";
import { selectLocalVisionProvider } from "@/lib/vision/local";
import { createAnalyzeHandler } from "@/lib/vision/service";
import { createVisionDiagnostic } from "@/lib/vision/diagnostics";

// Cache Components usa Node.js por defecto y no admite exportar runtime.
let admission: LocalAdmission | undefined;

export async function POST(request: Request) {
  const diagnostic = createVisionDiagnostic();
  try {
    diagnostic.event("configuration", "started");
    const provider = selectLocalVisionProvider(process.env, undefined, diagnostic);
    if (!provider) throw new VisionError("ANALYSIS_UNAVAILABLE");
    try { admission ??= new LocalAdmission(undefined, admissionLimitsFromEnv()); }
    catch (error) { diagnostic.event("configuration", "limits_invalid", 503); throw error; }
    diagnostic.event("configuration", "ok");
    const handler = createAnalyzeHandler({
      enabled: () => true,
      origin: process.env.VISION_LOCAL_ORIGIN ?? "http://localhost:3000",
      admission,
      provider,
      diagnostic,
      authenticate: () => authenticateVisionUser(async () => {
        const client = createClient(await cookies());
        return client.auth.getUser();
      }, diagnostic),
    });
    return await handler(request);
  } catch (error) {
    const response = errorResponse(error);
    diagnostic.event("configuration", "failed", response.status);
    diagnostic.event("result", "failed", response.status);
    return response;
  }
}

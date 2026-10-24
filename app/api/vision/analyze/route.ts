import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { admissionLimitsFromEnv, LocalAdmission } from "@/lib/vision/admission";
import { authenticateVisionUser } from "@/lib/vision/authentication";
import { errorResponse, VisionError } from "@/lib/vision/errors";
import { selectLocalVisionProvider } from "@/lib/vision/local";
import { createAnalyzeHandler } from "@/lib/vision/service";
import { createVisionDiagnostic } from "@/lib/vision/diagnostics";
import { createPreviewAdmission, previewVisionConfig, previewVisionProvider } from "@/lib/vision/preview";

// Cache Components usa Node.js por defecto y no admite exportar runtime.
let admission: LocalAdmission | undefined;

export async function POST(request: Request) {
  const diagnostic = createVisionDiagnostic();
  try {
    diagnostic.event("configuration", "started");
    const preview = previewVisionConfig(process.env);
    const deployed = process.env.VERCEL !== undefined;
    // No exponer Groq si faltan autorización explícita, migración o lista de usuarios.
    if (deployed && !preview.enabled) throw new VisionError("ANALYSIS_UNAVAILABLE");
    const provider = deployed ? previewVisionProvider(process.env) :
      selectLocalVisionProvider(process.env, undefined, diagnostic);
    if (!provider) throw new VisionError("ANALYSIS_UNAVAILABLE");
    let activeAdmission;
    if (deployed) {
      const allowed = preview.allowedUserIds;
      activeAdmission = createPreviewAdmission(async () => {
        const supabase = createClient(await cookies());
        return supabase.rpc("admit_vision_analysis");
      }, (userId) => allowed.has(userId.toLowerCase()));
    } else {
      try { admission ??= new LocalAdmission(undefined, admissionLimitsFromEnv()); }
      catch (error) { diagnostic.event("configuration", "limits_invalid", 503); throw error; }
      activeAdmission = admission;
    }
    diagnostic.event("configuration", "ok");
    const handler = createAnalyzeHandler({
      enabled: () => true,
      origin: process.env.VISION_LOCAL_ORIGIN ?? "http://localhost:3000",
      admission: activeAdmission,
      provider,
      ...(deployed ? { allowedOrigins: preview.allowedOrigins } : {}),
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

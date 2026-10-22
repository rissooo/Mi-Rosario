import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { admissionLimitsFromEnv, LocalAdmission } from "@/lib/vision/admission";
import { authenticateVisionUser } from "@/lib/vision/authentication";
import { errorResponse, VisionError } from "@/lib/vision/errors";
import { createSimulatedProvider } from "@/lib/vision/provider";
import { createAnalyzeHandler, localSimulationEnabled } from "@/lib/vision/service";

// Cache Components usa Node.js por defecto y no admite exportar runtime.
let admission: LocalAdmission | undefined;

export async function POST(request: Request) {
  if (!localSimulationEnabled()) return errorResponse(new VisionError("ANALYSIS_UNAVAILABLE"));
  try {
    admission ??= new LocalAdmission(undefined, admissionLimitsFromEnv());
    const handler = createAnalyzeHandler({
      enabled: () => localSimulationEnabled(),
      origin: process.env.VISION_LOCAL_ORIGIN ?? "http://localhost:3000",
      admission,
      provider: createSimulatedProvider(),
      authenticate: () => authenticateVisionUser(async () => {
        const client = createClient(await cookies());
        return client.auth.getUser();
      }),
    });
    return await handler(request);
  } catch (error) {
    return errorResponse(error);
  }
}

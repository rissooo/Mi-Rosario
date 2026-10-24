import "server-only";
import { VisionError } from "./errors";
import type { Admission } from "./admission";
import type { VisionProvider } from "./provider";
import { createGroqVisionProvider } from "./groq";
import { createOpenAIVisionProvider } from "./openai";
import { createFallbackVisionProvider, type VisionFallbackStep } from "./router";

type Env = Readonly<Record<string, string | undefined>>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Un despliegue debe habilitarse expresamente, con un origen HTTPS concreto
 * y una lista cerrada de cuentas invitadas. Nunca se aceptan wildcards.
 */
export function previewVisionConfig(env: Env): {
  enabled: boolean;
  allowedOrigins: readonly string[];
  allowedUserIds: ReadonlySet<string>;
} {
  if (env.VERCEL !== "1" || env.VISION_DEPLOY_ENABLED !== "1") {
    return { enabled: false, allowedOrigins: [], allowedUserIds: new Set() };
  }
  const origins = (env.VISION_DEPLOY_ORIGINS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  const userIds = (env.VISION_DEPLOY_USER_IDS ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  if (!origins.length || !userIds.length || origins.length > 5 || userIds.length > 15 ||
      !env.GROQ_API_KEY?.trim() || !origins.every(value => {
        try {
          const url = new URL(value);
          return url.protocol === "https:" && url.origin === value &&
            !url.username && !url.password && !url.search && !url.hash;
        } catch { return false; }
      }) || !userIds.every(value => UUID.test(value))) {
    return { enabled: false, allowedOrigins: [], allowedUserIds: new Set() };
  }
  return { enabled: true, allowedOrigins: origins, allowedUserIds: new Set(userIds) };
}

/** El flag de OpenAI en local NO autoriza gastos en Vercel. */
export function previewVisionProvider(env: Env): VisionProvider {
  const key = env.GROQ_API_KEY?.trim();
  if (!key) throw new VisionError("ANALYSIS_UNAVAILABLE");
  const steps: VisionFallbackStep[] = [
    { name: "groq", provider: createGroqVisionProvider(key), limitMs: 5_000 },
  ];
  if (env.VISION_DEPLOY_OPENAI_ENABLED === "1") {
    const openaiKey = env.OPENAI_API_KEY?.trim();
    if (!openaiKey) throw new VisionError("ANALYSIS_UNAVAILABLE");
    steps.push({ name: "openai", provider: createOpenAIVisionProvider(openaiKey), limitMs: 12_000 });
  }
  return createFallbackVisionProvider(steps);
}

type QuotaRpc = () => Promise<{ data: boolean | null; error: unknown }>;

export function createPreviewAdmission(
  callQuota: QuotaRpc,
  allowUser: (userId: string) => boolean,
): Admission {
  return {
    async acquire(userId) {
      if (!allowUser(userId)) throw new VisionError("FORBIDDEN");
      let result: Awaited<ReturnType<QuotaRpc>>;
      try { result = await callQuota(); }
      catch { throw new VisionError("ANALYSIS_UNAVAILABLE"); }
      if (result.error || result.data === null) throw new VisionError("ANALYSIS_UNAVAILABLE");
      if (result.data !== true) throw new VisionError("ANALYSIS_UNAVAILABLE", 60);
      // El cupo ya quedó contabilizado en Supabase: no se devuelve con release.
      return () => {};
    },
  };
}

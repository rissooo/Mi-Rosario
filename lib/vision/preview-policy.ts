import { VisionError } from "./errors";
import type { Admission } from "./admission";

type Env = Readonly<Record<string, string | undefined>>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DeployedVisionConfig = {
  enabled: boolean;
  allowedOrigins: readonly string[];
  access: "disabled" | "invited" | "public";
  allowedUserIds: ReadonlySet<string>;
};

function disabled(): DeployedVisionConfig {
  return { enabled: false, allowedOrigins: [], access: "disabled", allowedUserIds: new Set() };
}

/** Solo orígenes HTTPS completos y exactos. Nunca comodines, rutas ni query strings. */
function exactOrigins(raw: string | undefined): string[] | null {
  const origins = (raw ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!origins.length || origins.length > 5 || new Set(origins).size !== origins.length) return null;
  const valid = origins.every((value) => {
    try {
      const url = new URL(value);
      // URL acepta un asterisco en el hostname: verificar cada etiqueta expresamente.
      const labels = url.hostname.split(".");
      const hostnameValid = labels.length >= 2 &&
        labels.every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
      return url.protocol === "https:" && url.origin === value && hostnameValid &&
        !url.port && !url.username && !url.password && !url.search && !url.hash;
    } catch { return false; }
  });
  return valid ? origins : null;
}

function invitedUsers(raw: string | undefined): Set<string> | null {
  const ids = (raw ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!ids.length || ids.length > 15 || new Set(ids).size !== ids.length ||
      !ids.every((value) => UUID.test(value))) return null;
  return new Set(ids);
}

/** Preview: solo invitados, deshabilitado por defecto. */
export function previewVisionConfig(env: Env): DeployedVisionConfig {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" ||
      env.VISION_DEPLOY_ENABLED !== "1" || !env.OPENAI_API_KEY?.trim()) return disabled();
  const origins = exactOrigins(env.VISION_DEPLOY_ORIGINS);
  const userIds = invitedUsers(env.VISION_DEPLOY_USER_IDS);
  if (!origins || !userIds) return disabled();
  return { enabled: true, allowedOrigins: origins, access: "invited", allowedUserIds: userIds };
}

/**
 * Production requiere interruptor propio y modo de acceso explícito.
 * - invited: únicamente UUIDs autorizados (demo privada).
 * - public: cualquier cuenta Supabase autenticada, SIEMPRE sujeta a la cuota SQL global.
 * No hereda VISION_DEPLOY_ENABLED ni VISION_DEPLOY_ORIGINS de Preview.
 */
export function productionVisionConfig(env: Env): DeployedVisionConfig {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "production" ||
      env.VISION_PRODUCTION_ENABLED !== "1" || !env.OPENAI_API_KEY?.trim()) return disabled();
  const origins = exactOrigins(env.VISION_PRODUCTION_ORIGINS);
  if (!origins) return disabled();
  if (env.VISION_PRODUCTION_ACCESS === "invited") {
    const userIds = invitedUsers(env.VISION_PRODUCTION_USER_IDS);
    if (!userIds) return disabled();
    return { enabled: true, allowedOrigins: origins, access: "invited", allowedUserIds: userIds };
  }
  if (env.VISION_PRODUCTION_ACCESS === "public" && !env.VISION_PRODUCTION_USER_IDS?.trim()) {
    return { enabled: true, allowedOrigins: origins, access: "public", allowedUserIds: new Set() };
  }
  return disabled();
}

/** Selección por el entorno real de Vercel; ningún flag de Preview habilita Production. */
export function deployedVisionConfig(env: Env): DeployedVisionConfig {
  if (env.VERCEL_ENV === "preview") return previewVisionConfig(env);
  if (env.VERCEL_ENV === "production") return productionVisionConfig(env);
  return disabled();
}

export function deployedVisionAllowsUser(config: DeployedVisionConfig, userId: string): boolean {
  return config.enabled && (
    config.access === "public" ||
    (config.access === "invited" && config.allowedUserIds.has(userId.toLowerCase()))
  );
}

type QuotaRpc = () => Promise<{ data: boolean | null; error: unknown }>;

/** La RPC autenticada de Supabase admite o rechaza de forma atómica ANTES de llamar a Groq. */
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
      // El intento ya se contabilizó en Supabase: release no lo devuelve.
      return () => {};
    },
  };
}

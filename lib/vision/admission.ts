import { VisionError } from "./errors";

export interface Admission { acquire(userId: string): () => void }

export type AdmissionLimits = Readonly<{ maxAttempts: number; windowMs: number; maxActive: number; maxEntries: number }>;
export const DEFAULT_ADMISSION_LIMITS: AdmissionLimits = Object.freeze({
  maxAttempts: 5, windowMs: 60_000, maxActive: 2, maxEntries: 10_000,
});
const BOUNDS: Record<keyof AdmissionLimits, readonly [number, number]> = {
  maxAttempts: [1, 5], windowMs: [60_000, 3_600_000], maxActive: [1, 2], maxEntries: [1, 10_000],
};
const ENV_KEYS: Record<keyof AdmissionLimits, string> = {
  maxAttempts: "VISION_LOCAL_MAX_ATTEMPTS", windowMs: "VISION_LOCAL_WINDOW_MS",
  maxActive: "VISION_LOCAL_MAX_ACTIVE", maxEntries: "VISION_LOCAL_MAX_ENTRIES",
};

function validatedLimits(options: Partial<AdmissionLimits>): AdmissionLimits {
  const limits = { ...DEFAULT_ADMISSION_LIMITS, ...options };
  for (const key of Object.keys(BOUNDS) as (keyof AdmissionLimits)[]) {
    const [min, max] = BOUNDS[key];
    if (!Number.isSafeInteger(limits[key]) || limits[key] < min || limits[key] > max) throw new VisionError("ANALYSIS_UNAVAILABLE");
  }
  return Object.freeze(limits);
}

export function admissionLimitsFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): AdmissionLimits {
  const options: Partial<Record<keyof AdmissionLimits, number>> = {};
  for (const key of Object.keys(ENV_KEYS) as (keyof AdmissionLimits)[]) {
    const value = env[ENV_KEYS[key]];
    if (value === undefined) continue;
    if (!/^[1-9]\d*$/.test(value)) throw new VisionError("ANALYSIS_UNAVAILABLE");
    options[key] = Number(value);
  }
  return validatedLimits(options);
}

/** Control local de Etapa 1; no comparte contadores entre procesos. */
export class LocalAdmission implements Admission {
  private readonly entries = new Map<string, { start: number; count: number; active: boolean }>();
  private active = 0;
  readonly limits: AdmissionLimits;
  constructor(private readonly now = () => performance.now(), options: Partial<AdmissionLimits> = {}) {
    this.limits = validatedLimits(options);
  }

  acquire(userId: string) {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (!entry.active && now - entry.start >= this.limits.windowMs) this.entries.delete(key);
    }
    let entry = this.entries.get(userId);
    if (this.active >= this.limits.maxActive || entry?.active || (entry && entry.count >= this.limits.maxAttempts) ||
      (!entry && this.entries.size >= this.limits.maxEntries)) throw new VisionError("ANALYSIS_UNAVAILABLE", Math.ceil(this.limits.windowMs / 1000));
    if (!entry) {
      entry = { start: now, count: 0, active: false };
      this.entries.set(userId, entry);
    }
    entry.count++;
    entry.active = true;
    this.active++;
    let released = false;
    return () => {
      if (!released) { released = true; entry.active = false; this.active--; }
    };
  }
}

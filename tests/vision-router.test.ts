import { previewVisionConfig, productionVisionConfig, deployedVisionConfig, deployedVisionAllowsUser, createPreviewAdmission } from "../lib/vision/preview-policy";
import assert from "node:assert/strict";
import test from "node:test";
import { createFallbackVisionProvider } from "../lib/vision/router";
import { VisionError } from "../lib/vision/errors";
import type { VisionProvider } from "../lib/vision/provider";

const image = { bytes: Buffer.from([255, 216, 255]), mimeType: "image/jpeg" as const };
const suggestion = {
  title: "Bache en la calzada", description: "Se observa un bache profundo en el pavimento de la vía.",
  categoryId: "pothole", severity: "high", warnings: [],
};
const success = (value: unknown = suggestion): VisionProvider => ({
  async analyze() { return value; },
});
const fails = (): VisionProvider => ({
  async analyze() { throw new VisionError("ANALYSIS_UNAVAILABLE"); },
});

test("Groq primero: si funciona no se llama a OpenAI", async () => {
  let secondaryCalls = 0;
  const router = createFallbackVisionProvider([
    { name: "groq", provider: success(), limitMs: 100 },
    { name: "openai", provider: { async analyze() { secondaryCalls++; return suggestion; } }, limitMs: 100 },
  ]);
  assert.deepEqual(await router.analyze(image, new AbortController().signal, 200), suggestion);
  assert.equal(secondaryCalls, 0);
});

test("si Groq falla, continúa con OpenAI", async () => {
  const router = createFallbackVisionProvider([
    { name: "groq", provider: fails(), limitMs: 100 },
    { name: "openai", provider: success(), limitMs: 100 },
  ]);
  assert.equal((await router.analyze(image, new AbortController().signal, 200) as typeof suggestion).categoryId, "pothole");
});

test("la respuesta inválida de un proveedor no se acepta como éxito", async () => {
  const router = createFallbackVisionProvider([
    { name: "groq", provider: success({ title: "incorrecto" }), limitMs: 100 },
    { name: "openai", provider: success(), limitMs: 100 },
  ]);
  assert.deepEqual(await router.analyze(image, new AbortController().signal, 200), suggestion);
});

test("el intento lento se cancela y deja paso al siguiente", async () => {
  let aborted = false;
  const slow: VisionProvider = {
    analyze(_image, signal) {
      signal.addEventListener("abort", () => { aborted = true; }, { once: true });
      return new Promise(() => {});
    },
  };
  const router = createFallbackVisionProvider([
    { name: "groq", provider: slow, limitMs: 20 },
    { name: "openai", provider: success(), limitMs: 100 },
  ]);
  assert.deepEqual(await router.analyze(image, new AbortController().signal, 200), suggestion);
  assert.equal(aborted, true);
});

test("una cancelación del request original detiene toda la cadena", async () => {
  const controller = new AbortController();
  let secondaryCalls = 0;
  const slow: VisionProvider = { analyze() { return new Promise(() => {}); } };
  const router = createFallbackVisionProvider([
    { name: "groq", provider: slow, limitMs: 1000 },
    { name: "openai", provider: { async analyze() { secondaryCalls++; return suggestion; } }, limitMs: 100 },
  ]);
  const work = router.analyze(image, controller.signal, 1500);
  controller.abort();
  await assert.rejects(work, (error: unknown) => error instanceof VisionError && error.code === "ANALYSIS_TIMEOUT");
  assert.equal(secondaryCalls, 0);
});

test("sin respuestas válidas, el sistema falla para habilitar carga manual", async () => {
  const router = createFallbackVisionProvider([
    { name: "groq", provider: fails(), limitMs: 100 },
    { name: "openai", provider: fails(), limitMs: 100 },
  ]);
  await assert.rejects(router.analyze(image, new AbortController().signal, 250),
    (error: unknown) => error instanceof VisionError && error.code === "ANALYSIS_UNAVAILABLE");
});

test("el registro por intento informa proveedor, resultado y duración sin payload", async () => {
  const events: unknown[] = [];
  const router = createFallbackVisionProvider([
    { name: "groq", provider: fails(), limitMs: 100 },
    { name: "openai", provider: success(), limitMs: 100 },
  ], (event) => { events.push(event); });
  assert.deepEqual(await router.analyze(image, new AbortController().signal, 250), suggestion);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((item) => (item as { provider: string; outcome: string }).provider),
    ["groq", "openai"]);
  assert.deepEqual(events.map((item) => (item as { provider: string; outcome: string }).outcome),
    ["failed", "success"]);
  for (const event of events) {
    const record = event as Record<string, unknown>;
    assert.deepEqual(Object.keys(record).sort(), ["durationMs", "outcome", "provider"]);
    assert.equal(typeof record.durationMs, "number");
  }
});

test("el registro que falla no interfiere con el análisis", async () => {
  const router = createFallbackVisionProvider([
    { name: "groq", provider: success(), limitMs: 100 },
  ], () => { throw new Error("falló el destino de logs"); });
  assert.deepEqual(await router.analyze(image, new AbortController().signal, 150), suggestion);
});

test("cuando OpenAI no está habilitado, solo se intenta Groq", async () => {
  let called = 0;
  const router = createFallbackVisionProvider([
    { name: "groq", provider: { async analyze() { called++; throw new VisionError("ANALYSIS_UNAVAILABLE"); } }, limitMs: 100 },
  ]);
  await assert.rejects(router.analyze(image, new AbortController().signal, 150),
    (error: unknown) => error instanceof VisionError && error.code === "ANALYSIS_UNAVAILABLE");
  assert.equal(called, 1);
});

test("Vercel Vision se niega salvo con flag, HTTPS exacto, usuario autorizado y clave", () => {
  const base = {
    VERCEL: "1", VERCEL_ENV: "preview", VISION_DEPLOY_ENABLED: "1", GROQ_API_KEY: "fake-key",
    VISION_DEPLOY_ORIGINS: "https://mi-rosario-prueba.vercel.app",
    VISION_DEPLOY_USER_IDS: "123e4567-e89b-42d3-a456-426614174000",
  };
  const valid = previewVisionConfig(base);
  assert.equal(valid.enabled, true);
  assert.deepEqual(valid.allowedOrigins, ["https://mi-rosario-prueba.vercel.app"]);
  assert.equal(valid.allowedUserIds.has("123e4567-e89b-42d3-a456-426614174000"), true);
  for (const extra of [
    { VERCEL: "" }, { VERCEL_ENV: "production" }, { VISION_DEPLOY_ENABLED: "0" },
    { GROQ_API_KEY: "" },
    { VISION_DEPLOY_ORIGINS: "https://*.vercel.app" },
    { VISION_DEPLOY_ORIGINS: "http://mi-rosario-prueba.vercel.app" },
    { VISION_DEPLOY_ORIGINS: "https://mi-rosario-prueba.vercel.app/" },
    { VISION_DEPLOY_ORIGINS: "https://evil.invalid,https://*.vercel.app" },
    { VISION_DEPLOY_USER_IDS: "not-a-uuid" },
  ]) {
    assert.equal(previewVisionConfig({ ...base, ...extra }).enabled, false, JSON.stringify(extra));
  }
});

test("cupo distribuido requiere autorización y error controlado ante fallo o límite", async () => {
  let calls = 0;
  const allowed = (id: string) => id === "approved";
  const ok = createPreviewAdmission(async () => { calls++; return { data: true, error: null }; }, allowed);
  await assert.rejects(Promise.resolve(ok.acquire("unknown")),
    (error: unknown) => error instanceof VisionError && error.code === "FORBIDDEN");
  assert.equal(calls, 0, "sin cuota ni API para usuarios no invitados");
  const release = await ok.acquire("approved");
  release();
  assert.equal(calls, 1);
  for (const [result, expected] of [
    [{ data: false, error: null }, "ANALYSIS_UNAVAILABLE"],
    [{ data: null, error: new Error("db down") }, "ANALYSIS_UNAVAILABLE"],
  ] as const) {
    const admission = createPreviewAdmission(async () => result, allowed);
    await assert.rejects(Promise.resolve(admission.acquire("approved")),
      (error: unknown) => error instanceof VisionError && error.code === expected);
  }
});

test("Production permanece apagado sin interruptor y modo explícitos", () => {
  const base = {
    VERCEL: "1", VERCEL_ENV: "production", GROQ_API_KEY: "fake-key",
    VISION_PRODUCTION_ORIGINS: "https://mi-rosario-psi.vercel.app",
    VISION_PRODUCTION_ACCESS: "public", VISION_PRODUCTION_ENABLED: "1",
  };
  assert.equal(productionVisionConfig(base).enabled, true);
  assert.equal(deployedVisionConfig(base).access, "public");
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(deployedVisionAllowsUser(deployedVisionConfig(base), id), true);
  for (const changes of [
    { VISION_PRODUCTION_ENABLED: "0" },
    { VISION_PRODUCTION_ENABLED: "" },
    { VISION_PRODUCTION_ACCESS: "" },
    { VISION_PRODUCTION_ACCESS: "everyone" },
    { VISION_PRODUCTION_ORIGINS: "https://*.vercel.app" },
    { VISION_PRODUCTION_ORIGINS: "https://mi-rosario-psi.vercel.app/" },
    { VISION_PRODUCTION_ORIGINS: "http://mi-rosario-psi.vercel.app" },
    { VISION_PRODUCTION_ORIGINS: "https://mi-rosario-psi.vercel.app,https://mi-rosario-psi.vercel.app" },
    { VISION_PRODUCTION_USER_IDS: id },
    { GROQ_API_KEY: "" },
    { VERCEL_ENV: "preview" },
    { VERCEL: "" },
  ]) assert.equal(productionVisionConfig({ ...base, ...changes }).enabled, false, JSON.stringify(changes));
});

test("Production invited admite solo UUIDs explícitos; configuración Preview no habilita Production", () => {
  const approved = "123e4567-e89b-42d3-a456-426614174000";
  const other = "123e4567-e89b-42d3-a456-426614174001";
  const base = {
    VERCEL: "1", VERCEL_ENV: "production", GROQ_API_KEY: "fake-key",
    VISION_PRODUCTION_ORIGINS: "https://mi-rosario-psi.vercel.app",
    VISION_PRODUCTION_ACCESS: "invited", VISION_PRODUCTION_ENABLED: "1",
    VISION_PRODUCTION_USER_IDS: approved,
  };
  const config = deployedVisionConfig(base);
  assert.equal(config.enabled, true);
  assert.equal(config.access, "invited");
  assert.equal(deployedVisionAllowsUser(config, approved), true);
  assert.equal(deployedVisionAllowsUser(config, other), false);
  assert.equal(productionVisionConfig({ ...base, VISION_PRODUCTION_USER_IDS: "" }).enabled, false);
  assert.equal(productionVisionConfig({ ...base, VISION_PRODUCTION_USER_IDS: "invalid" }).enabled, false);
  assert.equal(deployedVisionConfig({
    ...base, VISION_PRODUCTION_ENABLED: "0", VISION_DEPLOY_ENABLED: "1",
    VISION_DEPLOY_ORIGINS: "https://mi-rosario-pr.vercel.app", VISION_DEPLOY_USER_IDS: approved,
  }).enabled, false);
  const preview = deployedVisionConfig({
    ...base, VERCEL_ENV: "preview", VISION_DEPLOY_ENABLED: "1",
    VISION_DEPLOY_ORIGINS: "https://mi-rosario-pr.vercel.app", VISION_DEPLOY_USER_IDS: approved,
  });
  assert.equal(preview.enabled, true);
  assert.equal(preview.access, "invited");
  assert.equal(deployedVisionAllowsUser(preview, other), false);
});

test("Production sigue usando RPC de cupos y falla cerrado si falla Supabase", async () => {
  const approved = "123e4567-e89b-42d3-a456-426614174000";
  const config = productionVisionConfig({
    VERCEL: "1", VERCEL_ENV: "production", GROQ_API_KEY: "fake-key",
    VISION_PRODUCTION_ORIGINS: "https://mi-rosario-psi.vercel.app",
    VISION_PRODUCTION_ACCESS: "public", VISION_PRODUCTION_ENABLED: "1",
  });
  let count = 0;
  const admission = createPreviewAdmission(
    async () => { count++; return { data: true, error: null }; },
    (id) => deployedVisionAllowsUser(config, id),
  );
  (await admission.acquire(approved))();
  assert.equal(count, 1);
  const failed = createPreviewAdmission(
    async () => ({ data: null, error: new Error("DB offline") }),
    (id) => deployedVisionAllowsUser(config, id),
  );
  await assert.rejects(Promise.resolve(failed.acquire(approved)),
    (error: unknown) => error instanceof VisionError && error.code === "ANALYSIS_UNAVAILABLE");
});

test("Groq informa solo el status HTTP de un rechazo y responde ANALYSIS_UNAVAILABLE", async () => {
  const { createGroqVisionProvider } = await import("../lib/vision/groq");
  const statuses: number[] = [];
  const transport = (async () => new Response("{}", { status: 429 })) as typeof fetch;
  const provider = createGroqVisionProvider("gsk_prueba", transport, (status) => statuses.push(status));
  await assert.rejects(provider.analyze(image, new AbortController().signal, 1000),
    (error: unknown) => error instanceof VisionError && error.code === "ANALYSIS_UNAVAILABLE");
  assert.deepEqual(statuses, [429]);
});

test("un observador que falla no cambia el error de Groq", async () => {
  const { createGroqVisionProvider } = await import("../lib/vision/groq");
  const transport = (async () => new Response("{}", { status: 401 })) as typeof fetch;
  const provider = createGroqVisionProvider("gsk_prueba", transport, () => { throw new Error("log caído"); });
  await assert.rejects(provider.analyze(image, new AbortController().signal, 1000),
    (error: unknown) => error instanceof VisionError && error.code === "ANALYSIS_UNAVAILABLE");
});

test("los logs de la IA desplegada no incluyen imagen, clave ni texto", async () => {
  const { visionLogReporters, GROQ_ATTEMPT_MS } = await import("../lib/vision/preview");
  const lines: string[] = [];
  const reporters = visionLogReporters((line) => lines.push(line));
  reporters.groqFailure(401);
  reporters.attempt({ provider: "groq", outcome: "timeout", durationMs: 12000 });
  reporters.attempt({ provider: "groq", outcome: "success", durationMs: 3000 });
  assert.deepEqual(lines.map((line) => JSON.parse(line)), [
    { source: "vision", provider: "groq", outcome: "provider_http", status: 401 },
    { source: "vision", provider: "groq", outcome: "timeout", durationMs: 12000 },
  ]);
  assert.ok(lines.every((line) => !/gsk_|base64|data:image/.test(line)));
  assert.equal(GROQ_ATTEMPT_MS, 12_000);
});

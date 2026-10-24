import { previewVisionConfig, createPreviewAdmission } from "../lib/vision/preview-policy";
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
    VERCEL: "1", VISION_DEPLOY_ENABLED: "1", GROQ_API_KEY: "fake-key",
    VISION_DEPLOY_ORIGINS: "https://mi-rosario-prueba.vercel.app",
    VISION_DEPLOY_USER_IDS: "123e4567-e89b-42d3-a456-426614174000",
  };
  const valid = previewVisionConfig(base);
  assert.equal(valid.enabled, true);
  assert.deepEqual(valid.allowedOrigins, ["https://mi-rosario-prueba.vercel.app"]);
  assert.equal(valid.allowedUserIds.has("123e4567-e89b-42d3-a456-426614174000"), true);
  for (const extra of [
    { VERCEL: "" }, { VISION_DEPLOY_ENABLED: "0" },
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

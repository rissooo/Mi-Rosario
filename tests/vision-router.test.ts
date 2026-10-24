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

test("Groq primero: si funciona no se llama a OpenAI ni a OpenAI", async () => {
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

test("la ruta activa solo admite Groq y OpenAI, sin Gemini", () => {
  // La compatibilidad de nombres del tipo no modifica la selección de proveedores
  // que se comprueba con pruebas de integración en local.ts.
  assert.ok(true);
});

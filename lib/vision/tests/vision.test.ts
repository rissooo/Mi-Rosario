import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { GoogleGenAI, type GenerateContentParameters } from "@google/genai";
import { POST } from "../../../app/api/vision/analyze/route";
import { admissionLimitsFromEnv, DEFAULT_ADMISSION_LIMITS, LocalAdmission } from "../admission";
import { authenticateVisionUser } from "../authentication";
import { Deadline } from "../deadline";
import { createVisionDiagnostic } from "../diagnostics";
import { VisionError } from "../errors";
import { normalizeImage } from "../image";
import { selectLocalVisionProvider } from "../local";
import { readImage } from "../multipart";
import { createGeminiProvider, createSimulatedProvider, type VisionProvider } from "../provider";
import { createAnalyzeHandler, localSimulationEnabled, type VisionDependencies } from "../service";
import { suggestionSchema, SYSTEM_INSTRUCTION } from "../prompt";
import { INITIAL_CATEGORIES } from "../../contracts/categories";
import { MAX_IMAGE_BYTES, MAX_MULTIPART_BYTES } from "../../contracts/reports";

const empty = () => ({ title: null, description: null, categoryId: null, severity: null, warnings: [] });
const diagnosticEnv = { NODE_ENV: "development", VISION_LOCAL_DIAGNOSTICS: "1" };

test("diagnóstico apagado por defecto y bloqueado en producción/Vercel", () => {
  const lines: string[] = [];
  for (const env of [{}, { NODE_ENV: "development" }, { ...diagnosticEnv, NODE_ENV: "production" }, { ...diagnosticEnv, VERCEL: "" }]) {
    createVisionDiagnostic(env, line => lines.push(line)).event("configuration", "started");
  }
  assert.deepEqual(lines, []);
});

test("diagnóstico cerrado: UUID por solicitud, sin contexto privado ni excepciones del logger", () => {
  const lines: string[] = [];
  const diagnostic = createVisionDiagnostic({ ...diagnosticEnv, GEMINI_API_KEY: "secreto-canario" }, line => lines.push(line));
  diagnostic.event("configuration", "ok");
  diagnostic.event("generate", "provider_http", 429);
  diagnostic.event("secreto-canario" as "image", "failed");
  diagnostic.event("image", "secreto-canario" as "failed");
  createVisionDiagnostic(diagnosticEnv, line => lines.push(line)).event("result", "ok", 200);
  assert.equal(lines.length, 3);
  const records = lines.map(line => JSON.parse(line));
  assert.equal(records[0].requestId, records[1].requestId);
  assert.notEqual(records[0].requestId, records[2].requestId);
  assert.match(records[0].requestId, /^[0-9a-f-]{36}$/);
  for (const record of records) assert.ok(Object.keys(record).every(key => ["source", "requestId", "stage", "category", "elapsedMs", "stepMs", "status"].includes(key)));
  assert.ok(!lines.join().includes("secreto-canario"));
  assert.doesNotThrow(() => createVisionDiagnostic(diagnosticEnv, () => { throw new Error("privado"); }).event("image", "started"));
});

test("diagnóstico distingue origen, auth, capacidad, imagen y validación sin cambiar respuestas", async () => {
  const cases: [string, Partial<VisionDependencies>, Request, number][] = [
    ["origin", {}, request(undefined, undefined, { headers: { origin: "https://otro.invalid" } }), 403],
    ["authentication", { authenticate: async () => { throw new VisionError("ANALYSIS_UNAVAILABLE"); } }, request(), 503],
    ["admission", { admission: { acquire() { throw new VisionError("ANALYSIS_UNAVAILABLE", 60); } } }, request(), 503],
    ["image", {}, request(), 422],
    ["validation", { provider: { async analyze() { return { secret: "respuesta-privada" }; } } }, request(file(await imageBytes())), 502],
  ];
  for (const [stage, overrides, req, status] of cases) {
    const lines: string[] = [];
    const diagnostic = createVisionDiagnostic(diagnosticEnv, line => lines.push(line));
    const response = await setup({ ...overrides, diagnostic }).handle(req);
    assert.equal(response.status, status);
    assert.ok(lines.map(line => JSON.parse(line)).some(record => record.stage === stage && record.category === "failed" && record.status === status));
    assert.ok(!lines.join().includes("usuario-prueba"));
    assert.ok(!lines.join().includes("respuesta-privada"));
    assert.ok(!(await response.text()).includes("requestId"));
    assert.equal(response.headers.has("x-request-id"), false);
  }
});

test("diagnóstico SDK falso registra cliente, generate y status sin error crudo", async () => {
  const lines: string[] = [];
  const diagnostic = createVisionDiagnostic(diagnosticEnv, line => lines.push(line));
  const provider = selectLocalVisionProvider({ NODE_ENV: "development", VISION_LOCAL_GEMINI_REAL: "1", GEMINI_API_KEY: "clave-privada" }, () => ({ models: {
    async generateContent() { throw Object.assign(new Error("token-cookie-prompt-respuesta-privados"), { status: 429 }); },
  } }), diagnostic)!;
  const response = await setup({ provider, diagnostic }).handle(request(file(await imageBytes())));
  assert.equal(response.status, 503);
  const records = lines.map(line => JSON.parse(line));
  assert.ok(records.some(record => record.stage === "client" && record.category === "ok"));
  assert.ok(records.some(record => record.stage === "generate" && record.category === "started"));
  assert.ok(records.some(record => record.stage === "generate" && record.category === "provider_http" && record.status === 429));
  assert.ok(!lines.join().includes("clave-privada"));
  assert.ok(!lines.join().includes("token-cookie-prompt-respuesta-privados"));
  await assert.rejects(authenticateVisionUser(async () => ({ data: { user: null }, error: { status: 503, message: "auth-privada" } }), diagnostic));
  assert.ok(!lines.join().includes("auth-privada"));
  assert.ok(lines.map(line => JSON.parse(line)).some(record => record.stage === "authentication" && record.status === 503));
});

test("diagnóstico distingue configuración y construcción sin iniciar generate", async () => {
  const lines: string[] = [];
  const diagnostic = createVisionDiagnostic(diagnosticEnv, line => lines.push(line));
  selectLocalVisionProvider({ NODE_ENV: "development" }, undefined, diagnostic);
  assert.throws(() => selectLocalVisionProvider({ NODE_ENV: "development", VISION_LOCAL_GEMINI_REAL: "1" }, undefined, diagnostic));
  assert.throws(() => selectLocalVisionProvider({ NODE_ENV: "development", VISION_LOCAL_GEMINI_REAL: "1", GEMINI_API_KEY: "privado", GEMINI_MODEL: "otro" }, undefined, diagnostic));
  const provider = selectLocalVisionProvider({ NODE_ENV: "development", VISION_LOCAL_GEMINI_REAL: "1", GEMINI_API_KEY: "privado" }, () => { throw new TypeError("privado"); }, diagnostic)!;
  assert.equal((await setup({ provider, diagnostic }).handle(request(file(await imageBytes())))).status, 503);
  const records = lines.map(line => JSON.parse(line));
  for (const category of ["flags_invalid", "key_missing", "model_rejected"]) assert.ok(records.some(record => record.stage === "configuration" && record.category === category));
  assert.ok(records.some(record => record.stage === "client" && record.category === "failed"));
  assert.ok(!records.some(record => record.stage === "generate" && record.category === "started"));
  assert.ok(!lines.join().includes("privado"));
});
const signal = () => new AbortController().signal;
const file = (bytes: Uint8Array, type = "image/png") => new File([Uint8Array.from(bytes)], "sin-extension", { type });
async function imageBytes(format: "png" | "jpeg" | "webp" = "png", width = 12, height = 8) {
  return sharp({ create: { width, height, channels: 3, background: "#aabbcc" } }).toFormat(format).toBuffer();
}
function request(image?: File, extra?: string, options: RequestInit = {}) {
  const body = new FormData();
  if (image) body.append("image", image);
  if (extra) body.append(extra, "extra");
  return new Request("http://localhost:3000/api/vision/analyze", { method: "POST", body, ...options });
}
function setup(overrides: Partial<VisionDependencies> = {}) {
  let calls = 0;
  const deps: VisionDependencies = {
    enabled: () => true, authenticate: async () => "usuario-prueba", origin: "http://localhost:3000",
    admission: new LocalAdmission(), provider: { async analyze() { calls++; return empty(); } }, ...overrides,
  };
  return { handle: createAnalyzeHandler(deps), calls: () => calls };
}
async function code(response: Response, expected: string, status: number) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).error.code, expected);
}
function isCode(code: string) { return (error: unknown) => error instanceof VisionError && error.code === code; }

test("regresión deadline: rechaza expiración durante validación o serialización sin aceptar éxito", async (t) => {
  const bytes = await imageBytes();
  for (const during of ["validation-start", "validation-end", "serialization"] as const) {
    let now = 0;
    const records: string[] = [];
    const clock = t.mock.method(performance, "now", () => now);
    const originalJson = Response.json;
    const json = t.mock.method(Response, "json", (...args: Parameters<typeof Response.json>) => {
      const response = originalJson(...args);
      if (during === "serialization") now = 101;
      return response;
    });
    try {
      const app = setup({ budgetMs: 100, diagnostic: { event(stage, category) {
        records.push(`${stage}:${category}`);
        if (stage === "validation" && category === (during === "validation-start" ? "started" : during === "validation-end" ? "ok" : "")) now = 101;
      } } });
      await code(await app.handle(request(file(bytes))), "ANALYSIS_TIMEOUT", 504);
      assert.equal(records.includes("result:ok"), false);
      assert.equal(records.includes("result:failed"), true);
    } finally { json.mock.restore(); clock.mock.restore(); }
  }
});

test("regresión multipart pendiente: conserva cupo tras timeout y lo libera al finalizar o rechazar parseo", async (t) => {
  const bytes = await imageBytes();
  for (const reject of [false, true]) {
    let entered!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const original = Response.prototype.formData;
    const parser = t.mock.method(Response.prototype, "formData", async function (this: Response) {
      entered();
      await gate;
      if (reject) throw new Error("Fallo sintético de parseo");
      return original.call(this);
    });
    const admission = new LocalAdmission();
    let released = 0;
    const app = setup({ budgetMs: 25, admission: { acquire(userId) {
      const release = admission.acquire(userId);
      return () => { released++; release(); };
    } } });
    try {
      const pending = app.handle(request(file(bytes)));
      await ready;
      await code(await pending, "ANALYSIS_TIMEOUT", 504);
      assert.equal(released, 0);
      assert.throws(() => admission.acquire("usuario-prueba"), isCode("ANALYSIS_UNAVAILABLE"));
      finish();
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(released, 1);
      admission.acquire("usuario-prueba")();
      assert.equal(app.calls(), 0);
    } finally {
      finish();
      await new Promise<void>(resolve => setImmediate(resolve));
      parser.mock.restore();
    }
  }
});

test("runner aislado: no hereda credenciales ni opciones privadas del proceso padre", () => {
  const forbidden = Object.keys(process.env).filter(key => /KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/i.test(key));
  assert.equal(forbidden.length, 0, "El runner debe excluir credenciales del entorno hijo");
  assert.equal(process.env.NODE_OPTIONS, undefined);
});

test("entorno local explícito y bloqueo real de la ruta en producción", async () => {
  assert.equal(localSimulationEnabled({ NODE_ENV: "development", VISION_LOCAL_SIMULATION: "1" }), true);
  for (const env of [{}, { NODE_ENV: "production", VISION_LOCAL_SIMULATION: "1" },
    { NODE_ENV: "development", VISION_LOCAL_SIMULATION: "1", VERCEL: "1" }]) assert.equal(localSimulationEnabled(env), false);
  const saved = { ...process.env };
  try {
    process.env = { ...saved, NODE_ENV: "production", VISION_LOCAL_SIMULATION: "1" };
    await code(await POST(request()), "ANALYSIS_UNAVAILABLE", 503);
  } finally { process.env = saved; }
});

test("sesión, origen y guardia preceden al archivo; cero proveedor", async () => {
  const off = setup({ enabled: () => false, authenticate: async () => { throw new Error("No debe autenticar"); } });
  await code(await off.handle(request()), "ANALYSIS_UNAVAILABLE", 503);
  const anonymous = setup({ authenticate: async () => null });
  await code(await anonymous.handle(request()), "UNAUTHENTICATED", 401);
  const forbidden = setup();
  await code(await forbidden.handle(request(undefined, undefined, { headers: { origin: "https://otro.invalid" } })), "FORBIDDEN", 403);
  await code(await forbidden.handle(request(undefined, undefined, { headers: { "sec-fetch-site": "cross-site" } })), "FORBIDDEN", 403);
  assert.equal(forbidden.calls(), 0);
});

test("integración multipart -> imagen real -> sugerencia -> contrato para tres formatos", async () => {
  for (const format of ["png", "jpeg", "webp"] as const) {
    const bytes = await imageBytes(format);
    const original = Buffer.from(bytes);
    const app = setup();
    const response = await app.handle(request(file(bytes, `image/${format}`)));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.suggestion, empty());
    assert.equal(app.calls(), 1);
    assert.deepEqual(bytes, original);
  }
});

test("multipart vacío, duplicado, extra y corrupto; 422", async () => {
  const app = setup();
  await code(await app.handle(request()), "VALIDATION_ERROR", 422);
  await code(await app.handle(request(file(Buffer.alloc(0)))), "VALIDATION_ERROR", 422);
  await code(await app.handle(request(file(await imageBytes()), "prompt")), "VALIDATION_ERROR", 422);
  const body = new FormData(); body.append("image", file(await imageBytes())); body.append("image", file(await imageBytes()));
  await code(await app.handle(new Request("http://localhost:3000/api/vision/analyze", { method: "POST", body })), "VALIDATION_ERROR", 422);
  const broken = new Request("http://localhost:3000/api/vision/analyze", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x" }, body: "roto" });
  await code(await setup().handle(broken), "VALIDATION_ERROR", 422);
  assert.equal(app.calls(), 0);
});

test("413 real por stream sin Content-Length o mentiroso y por archivo", async () => {
  for (const length of [undefined, "1"]) {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(MAX_MULTIPART_BYTES + 1)); }, cancel() { cancelled = true; } });
    const headers = new Headers({ "content-type": "multipart/form-data; boundary=x" });
    if (length) headers.set("content-length", length);
    const req = new Request("http://localhost:3000", { method: "POST", body, headers, duplex: "half" } as RequestInit);
    await assert.rejects(readImage(req, signal()), isCode("PAYLOAD_TOO_LARGE"));
    assert.equal(cancelled, true);
  }
  await code(await setup().handle(request(file(Buffer.alloc(MAX_IMAGE_BYTES + 1)))), "PAYLOAD_TOO_LARGE", 413);
});

test("415 MIME, firma y content type; 422 imagen truncada y dimensiones", async () => {
  const png = await imageBytes();
  await assert.rejects(normalizeImage(file(png, "image/jpeg"), signal()), isCode("UNSUPPORTED_MEDIA_TYPE"));
  await assert.rejects(normalizeImage(file(Buffer.from("no es png")), signal()), isCode("UNSUPPORTED_MEDIA_TYPE"));
  await assert.rejects(normalizeImage(file(png.subarray(0, 40)), signal()), isCode("VALIDATION_ERROR"));
  await assert.rejects(normalizeImage(file(await imageBytes("png", 8193, 1)), signal()), isCode("VALIDATION_ERROR"));
  const response = await setup().handle(new Request("http://localhost:3000/api/vision/analyze", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
  await code(response, "UNSUPPORTED_MEDIA_TYPE", 415);
});

test("normalización aplica orientación, retira EXIF/GPS y no amplía", async () => {
  const source = await sharp({ create: { width: 30, height: 10, channels: 3, background: "red" } })
    .withMetadata({ orientation: 6 }).withExif({ IFD0: { Artist: "Dato sintético" }, IFD3: { GPSLatitudeRef: "N" } }).jpeg().toBuffer();
  const output = await normalizeImage(file(source, "image/jpeg"), signal());
  const meta = await sharp(output.bytes).metadata();
  assert.equal(meta.width, 10); assert.equal(meta.height, 30);
  assert.equal(meta.exif, undefined); assert.equal(meta.xmp, undefined); assert.equal(meta.icc, undefined);
  const alpha = await sharp({ create: { width: 3000, height: 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
  const normalized = await normalizeImage(file(alpha), signal());
  assert.equal(normalized.mimeType, "image/png");
  assert.equal((await sharp(normalized.bytes).metadata()).width, 2048);
});

test("APNG y WebP animado se rechazan sin seleccionar un frame", async () => {
  const png = await imageBytes();
  const chunk = Buffer.alloc(20); chunk.writeUInt32BE(8); chunk.write("acTL", 4); chunk.writeUInt32BE(2, 8);
  const apng = Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]);
  await assert.rejects(normalizeImage(file(apng), signal()), isCode("VALIDATION_ERROR"));
  const pixels = Buffer.alloc(2 * 2 * 3 * 2, 150); pixels.fill(230, 12);
  const animated = await sharp(pixels, { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  await assert.rejects(normalizeImage(file(animated, "image/webp"), signal()), isCode("VALIDATION_ERROR"));
});

test("admisión: ventana fija, un activo por usuario, dos globales, tabla acotada", () => {
  let now = 0;
  const admission = new LocalAdmission(() => now, { maxEntries: 3 });
  const a = admission.acquire("a");
  assert.throws(() => admission.acquire("a"), isCode("ANALYSIS_UNAVAILABLE"));
  const b = admission.acquire("b");
  assert.throws(() => admission.acquire("c"), isCode("ANALYSIS_UNAVAILABLE"));
  a(); a(); b();
  for (let i = 1; i < 5; i++) admission.acquire("a")();
  assert.throws(() => admission.acquire("a"), isCode("ANALYSIS_UNAVAILABLE"));
  now = 60_000; admission.acquire("a")();
  const bounded = new LocalAdmission(() => 0, { maxEntries: 1 }); bounded.acquire("a")();
  assert.throws(() => bounded.acquire("b"), isCode("ANALYSIS_UNAVAILABLE"));
});

test("categorías, null y fallas de estructura pasan por validadores compartidos", async () => {
  const bytes = await imageBytes();
  for (const category of INITIAL_CATEGORIES) {
    const app = setup({ provider: { async analyze() { return { ...empty(), categoryId: category.id, severity: "medium" }; } } });
    assert.equal((await app.handle(request(file(bytes)))).status, 200);
  }
  for (const invalid of [{ ...empty(), categoryId: "inventada" }, { ...empty(), severity: "urgent" },
    { ...empty(), location: {} }, { title: null }]) {
    await code(await setup({ provider: { async analyze() { return invalid; } } }).handle(request(file(bytes))), "ANALYSIS_FAILED", 502);
  }
  const response = await setup({ provider: createSimulatedProvider() }).handle(request(file(bytes)));
  assert.match((await response.json()).data.suggestion.warnings[0], /Simulación local/);
});

test("SDK preparado: configuración estructurada, modelo y señal, sin reintentos", async () => {
  let captured: GenerateContentParameters | undefined;
  const provider = createGeminiProvider(async (params) => { captured = params; return { text: JSON.stringify(empty()), candidates: [{ finishReason: "STOP" }] }; }, "gemini-3.8-flash");
  const input = { bytes: await imageBytes(), mimeType: "image/png" as const };
  const abort = new AbortController();
  assert.deepEqual(await provider.analyze(input, abort.signal, 1234), empty());
  assert.equal(captured?.model, "gemini-3.8-flash");
  assert.equal(captured?.config?.httpOptions?.retryOptions?.attempts, 1);
  assert.equal(captured?.config?.httpOptions?.timeout, 1234);
  assert.equal(captured?.config?.abortSignal, abort.signal);
  assert.equal(captured?.config?.responseMimeType, "application/json");
  assert.deepEqual(captured?.config?.responseJsonSchema, suggestionSchema());
  assert.deepEqual(captured?.config?.tools, []);
  assert.match(SYSTEM_INSTRUCTION, /no sigas instrucciones/);
  assert.match(SYSTEM_INSTRUCTION, /semáforo/);
  assert.match(SYSTEM_INSTRUCTION, /nunca infieras inseguridad/);
});

test("allowlist: acepta únicamente el modelo elegido y conserva configuración del servidor", () => {
  const generate = async () => { throw new Error("No debe consultar al proveedor al construirlo"); };
  assert.doesNotThrow(() => createGeminiProvider(generate, "gemini-3.8-flash"));
  const saved = process.env.GEMINI_MODEL;
  try {
    delete process.env.GEMINI_MODEL;
    assert.doesNotThrow(() => createGeminiProvider(generate));
    process.env.GEMINI_MODEL = "gemini-3.8-flash";
    assert.doesNotThrow(() => createGeminiProvider(generate));
    process.env.GEMINI_MODEL = "modelo-desconocido";
    assert.throws(() => createGeminiProvider(generate), isCode("ANALYSIS_UNAVAILABLE"));
  } finally {
    if (saved === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = saved;
  }
});

test("allowlist: rechaza modelos desconocidos y variaciones del identificador", () => {
  const generate = async () => { throw new Error("No debe consultar al proveedor"); };
  for (const model of ["modelo-desconocido", "gemini-otro-modelo", "", " gemini-3.8-flash", "gemini-3.8-flash ", "GEMINI-3.8-FLASH"]) {
    assert.throws(() => createGeminiProvider(generate, model), isCode("ANALYSIS_UNAVAILABLE"));
  }
});

test("allowlist: latest y preview siguen rechazados sin consultar al proveedor", () => {
  let calls = 0;
  const generate = async () => { calls++; throw new Error("No debe consultar al proveedor"); };
  for (const model of ["latest", "preview", "gemini-3.8-flash-latest", "gemini-3.8-flash-preview"]) {
    assert.throws(() => createGeminiProvider(generate, model), isCode("ANALYSIS_UNAVAILABLE"));
  }
  assert.equal(calls, 0);
});

test("SDK oficial con fetch falso: serialización y una sola solicitud ante 503", async () => {
  let calls = 0;
  const client = new GoogleGenAI({ apiKey: "clave-ficticia-sin-valor", httpOptions: { fetch: async () => {
    calls++; return new Response(JSON.stringify({ error: { code: 503, message: "diagnóstico privado" } }), { status: 503, headers: { "content-type": "application/json" } });
  } } });
  const provider = createGeminiProvider((params) => client.models.generateContent(params));
  await assert.rejects(provider.analyze({ bytes: await imageBytes(), mimeType: "image/png" }, signal(), 1000), isCode("ANALYSIS_UNAVAILABLE"));
  assert.equal(calls, 1);
});

test("SDK oficial serializa schema cerrado y recibe éxito desde transporte falso", async () => {
  let payload: Record<string, unknown> | undefined;
  const client = new GoogleGenAI({ apiKey: "valor-sintetico", httpOptions: { fetch: async (_url, options) => {
    payload = JSON.parse(String(options?.body));
    return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: JSON.stringify(empty()) }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } });
  } } });
  const provider = createGeminiProvider((params) => client.models.generateContent(params));
  assert.deepEqual(await provider.analyze({ bytes: await imageBytes(), mimeType: "image/png" }, signal(), 1000), empty());
  const config = payload?.generationConfig as Record<string, unknown>;
  assert.equal(config.responseMimeType, "application/json");
  assert.deepEqual(config.responseJsonSchema, suggestionSchema());
});

test("rechaza imágenes concatenadas y aplica límite de píxeles antes del proveedor", async () => {
  for (const type of ["png", "jpeg", "webp"] as const) {
    const bytes = await imageBytes(type);
    await assert.rejects(normalizeImage(file(Buffer.concat([bytes, bytes]), `image/${type}`), signal()), isCode("VALIDATION_ERROR"));
  }
  const pixels = await imageBytes("png", 5000, 5000);
  await assert.rejects(normalizeImage(file(pixels), signal()), isCode("VALIDATION_ERROR"));
});

test("abortar antes de la sesión no inicia autenticación ni análisis", async () => {
  let auth = 0;
  const controller = new AbortController(); controller.abort();
  const app = setup({ authenticate: async () => { auth++; return "usuario"; } });
  await code(await app.handle(request(undefined, undefined, { signal: controller.signal })), "ANALYSIS_TIMEOUT", 504);
  assert.equal(auth, 0); assert.equal(app.calls(), 0);
});

test("rechazos de admisión y formato no acceden a red ni registran datos", async () => {
  await assert.rejects(async () => fetch("https://example.invalid"), /Red prohibida/);
  const app = setup();
  const unsupported = request(file(await imageBytes()), undefined, { headers: { "content-type": "multipart/form-data; boundary=x", "content-encoding": "gzip" } });
  await code(await app.handle(unsupported), "UNSUPPORTED_MEDIA_TYPE", 415);
  assert.equal(app.calls(), 0);
});

test("errores del proveedor: JSON, bloqueo, truncamiento, cuota y timeout sin datos privados", async () => {
  const input = { bytes: await imageBytes(), mimeType: "image/png" as const };
  for (const reply of [{ text: "roto", candidates: [{ finishReason: "STOP" }] },
    { text: JSON.stringify(empty()), candidates: [{ finishReason: "MAX_TOKENS" }] }, {},
    { text: "x".repeat(16 * 1024 + 1), candidates: [{ finishReason: "STOP" }] }]) {
    await assert.rejects(createGeminiProvider(async () => reply).analyze(input, signal(), 1000), isCode("ANALYSIS_FAILED"));
  }
  for (const [status, expected, http] of [[429, "ANALYSIS_UNAVAILABLE", 503], [504, "ANALYSIS_TIMEOUT", 504], [400, "ANALYSIS_FAILED", 502]] as const) {
    const provider = createGeminiProvider(async () => { throw { status, message: "secreto-no-exponer" }; });
    const response = await setup({ provider }).handle(request(file(input.bytes)));
    const text = await response.text(); assert.equal(response.status, http); assert.match(text, new RegExp(expected)); assert.doesNotMatch(text, /secreto/);
  }
});

test("plazo total incluye sesión; no se inicia proveedor si sesión termina tarde", async () => {
  const app = setup({ budgetMs: 10, authenticate: () => new Promise((resolve) => setTimeout(() => resolve("tarde"), 40)) });
  await code(await app.handle(request()), "ANALYSIS_TIMEOUT", 504);
  assert.equal(app.calls(), 0);
});

test("cancelación y timeout ignoran resultados tardíos y conservan cupo hasta terminar trabajo", async () => {
  let finish: ((value: unknown) => void) | undefined;
  let providerSignal: AbortSignal | undefined;
  const admission = new LocalAdmission();
  const provider: VisionProvider = { analyze(_image, signal) { providerSignal = signal; return new Promise((resolve) => { finish = resolve; }); } };
  const app = setup({ admission, provider, budgetMs: 30, normalize: async () => ({ bytes: Buffer.from("normalizada"), mimeType: "image/png" }) });
  const response = await app.handle(request(file(await imageBytes())));
  await code(response, "ANALYSIS_TIMEOUT", 504);
  assert.equal(providerSignal?.aborted, true);
  assert.throws(() => admission.acquire("usuario-prueba"), isCode("ANALYSIS_UNAVAILABLE"));
  finish?.(empty()); await new Promise((resolve) => setTimeout(resolve, 0));
  admission.acquire("usuario-prueba")();
  const controller = new AbortController();
  const deadline = new Deadline(controller.signal, 20000);
  const waiting = deadline.wait(new Promise(() => {})); controller.abort();
  await assert.rejects(waiting, isCode("ANALYSIS_TIMEOUT")); deadline.close();
  await assert.rejects(normalizeImage(file(await imageBytes()), controller.signal), isCode("ANALYSIS_TIMEOUT"));
});

test("errores de infraestructura/inesperados y Retry-After sin logs privados", async () => {
  const auth = setup({ authenticate: async () => { throw new VisionError("ANALYSIS_UNAVAILABLE"); } });
  await code(await auth.handle(request()), "ANALYSIS_UNAVAILABLE", 503);
  await code(await setup({ authenticate: async () => { throw new Error("privado"); } }).handle(request()), "INTERNAL_ERROR", 500);
  const app = setup({ admission: { acquire() { throw new VisionError("ANALYSIS_UNAVAILABLE", 60); } } });
  const response = await app.handle(request()); assert.equal(response.headers.get("retry-after"), "60");
  await code(response, "ANALYSIS_UNAVAILABLE", 503);
});

test("cancelar el request durante el proveedor propaga señal y libera capacidad al terminar", async () => {
  const controller = new AbortController();
  let started: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  let observed = false;
  const admission = new LocalAdmission();
  const app = setup({ admission, provider: {
    analyze(_image, signal) {
      started?.();
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => { observed = true; reject(new VisionError("ANALYSIS_TIMEOUT")); }, { once: true });
      });
    },
  } });
  const result = app.handle(request(file(await imageBytes()), undefined, { signal: controller.signal }));
  await ready; controller.abort();
  await code(await result, "ANALYSIS_TIMEOUT", 504);
  assert.equal(observed, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  admission.acquire("usuario-prueba")();
});

test("regresión auth: 401 es sesión inválida; 429, 503 y excepciones son 503", async () => {
  for (const [status, expected, http] of [[401, "UNAUTHENTICATED", 401], [429, "ANALYSIS_UNAVAILABLE", 503], [503, "ANALYSIS_UNAVAILABLE", 503]] as const) {
    for (const throws of [false, true]) {
      const app = setup({ authenticate: () => authenticateVisionUser(async () => {
        const error = { status, message: "diagnóstico privado de sesión" };
        if (throws) throw error;
        return { data: { user: null }, error };
      }) });
      await code(await app.handle(request()), expected, http);
      assert.equal(app.calls(), 0);
    }
  }
  const unexpected = setup({ authenticate: () => authenticateVisionUser(async () => { throw new Error("detalle privado inesperado"); }) });
  const response = await unexpected.handle(request());
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /detalle privado/);
  assert.equal(unexpected.calls(), 0);
});

test("regresión auth: identifica sesión ausente por código sin confundir errores desconocidos", async () => {
  assert.equal(await authenticateVisionUser(async () => ({ data: { user: { id: "verificado" } }, error: null })), "verificado");
  assert.equal(await authenticateVisionUser(async () => ({ data: { user: null }, error: null })), null);
  for (const error of [{ status: 400, code: "session_expired" }, { name: "AuthSessionMissingError", status: 400 }, { status: 403, code: "bad_jwt" }]) {
    assert.equal(await authenticateVisionUser(async () => ({ data: { user: null }, error })), null);
  }
  for (const error of [{ status: 400, code: "desconocido" }, { status: 429, code: "bad_jwt" },
    { status: 0, name: "AuthRetryableFetchError" }]) {
    await assert.rejects(authenticateVisionUser(async () => ({ data: { user: { id: "no-aceptar" } }, error })), isCode("ANALYSIS_UNAVAILABLE"));
  }
});

test("regresión origen: rechaza antes de ejecutar la autenticación del handler", async () => {
  let authCalls = 0;
  const app = setup({ authenticate: async () => { authCalls++; throw new Error("No debe consultar sesión"); } });
  for (const headers of [new Headers({ origin: "https://otro.invalid" }), new Headers({ "sec-fetch-site": "cross-site" })]) {
    await code(await app.handle(request(undefined, undefined, { headers })), "FORBIDDEN", 403);
  }
  await code(await app.handle(new Request("https://otro.invalid/api/vision/analyze", { method: "POST" })), "FORBIDDEN", 403);
  assert.equal(authCalls, 0); assert.equal(app.calls(), 0);
});

test("regresión multipart: miles de fragmentos pequeños y vacíos conservan exactamente el archivo", async () => {
  const original = Buffer.alloc(12_000, 19);
  const input = request(file(original));
  const bytes = new Uint8Array(await input.arrayBuffer());
  let pulls = 0; let offset = 0;
  const body = new ReadableStream<Uint8Array>({ pull(controller) {
    pulls++;
    if (pulls <= 10_000 || pulls % 2 === 0) { controller.enqueue(new Uint8Array(0)); return; }
    if (offset < bytes.length) controller.enqueue(bytes.subarray(offset, ++offset));
    else controller.close();
  } });
  const fragmented = new Request(input.url, { method: "POST", body, headers: input.headers, duplex: "half" } as RequestInit);
  const result = await readImage(fragmented, signal());
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), original);
  assert.ok(pulls > 30_000);
});

test("regresión multipart: límite total exacto y exceso con muchos fragmentos", async () => {
  const input = request(file(Buffer.from([1, 2, 3])));
  const bytes = Buffer.from(await input.arrayBuffer());
  // El padding de preámbulo es multipart válido y permite probar el límite total exacto.
  const prefixLength = MAX_MULTIPART_BYTES - bytes.length;
  const padded = Buffer.concat([Buffer.alloc(prefixLength - 2, 32), Buffer.from("\r\n"), bytes]);
  const exact = new Request(input.url, { method: "POST", body: padded, headers: input.headers });
  assert.equal((await readImage(exact, signal())).size, 3);
  let sent = 0; let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) {
    const length = Math.min(1024, MAX_MULTIPART_BYTES + 1 - sent);
    controller.enqueue(new Uint8Array(length)); sent += length;
  }, cancel() { cancelled = true; } });
  await assert.rejects(readImage(new Request(input.url, { method: "POST", body: stream, headers: input.headers, duplex: "half" } as RequestInit), signal()), isCode("PAYLOAD_TOO_LARGE"));
  assert.equal(cancelled, true); assert.equal(sent, MAX_MULTIPART_BYTES + 1);
});

test("regresión multipart: cancelar lectura pendiente o stream de vacíos detiene el lector", async () => {
  for (const emptyLoop of [false, true]) {
    const controller = new AbortController();
    let pulls = 0; let cancelled = false;
    let started: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const stream = new ReadableStream<Uint8Array>({ pull(reader) {
      pulls++; started?.();
      if (emptyLoop) reader.enqueue(new Uint8Array(0));
    }, cancel() { cancelled = true; } });
    const pending = readImage(new Request("http://localhost:3000", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x" }, body: stream, duplex: "half" } as RequestInit), controller.signal);
    await ready;
    // Debe atender el event loop incluso cuando todos los reads se resuelven vacíos.
    setImmediate(() => controller.abort());
    await assert.rejects(pending, isCode("ANALYSIS_TIMEOUT"));
    assert.equal(cancelled, true);
    const stopped = pulls;
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(pulls, stopped);
  }
});

test("regresión admisión: configuración validada, defaults seguros y límites efectivos", () => {
  assert.deepEqual(admissionLimitsFromEnv({}), DEFAULT_ADMISSION_LIMITS);
  const limits = admissionLimitsFromEnv({ VISION_LOCAL_MAX_ATTEMPTS: "2", VISION_LOCAL_WINDOW_MS: "120000", VISION_LOCAL_MAX_ACTIVE: "1", VISION_LOCAL_MAX_ENTRIES: "3" });
  let now = 0;
  const admission = new LocalAdmission(() => now, limits);
  const release = admission.acquire("a");
  assert.throws(() => admission.acquire("b"), isCode("ANALYSIS_UNAVAILABLE")); release();
  admission.acquire("a")();
  assert.throws(() => admission.acquire("a"), isCode("ANALYSIS_UNAVAILABLE"));
  now = 60_000; assert.throws(() => admission.acquire("a"), isCode("ANALYSIS_UNAVAILABLE"));
  now = 120_000; admission.acquire("a")();
  for (const value of ["", "0", "-1", "1.5", "1e2", "Infinity", " 2", "6", "9007199254740993"]) {
    assert.throws(() => admissionLimitsFromEnv({ VISION_LOCAL_MAX_ATTEMPTS: value }), isCode("ANALYSIS_UNAVAILABLE"));
  }
  for (const env of [{ VISION_LOCAL_WINDOW_MS: "59999" }, { VISION_LOCAL_WINDOW_MS: "3600001" },
    { VISION_LOCAL_MAX_ACTIVE: "3" }, { VISION_LOCAL_MAX_ENTRIES: "10001" }]) {
    assert.throws(() => admissionLimitsFromEnv(env), isCode("ANALYSIS_UNAVAILABLE"));
  }
  assert.throws(() => new LocalAdmission(undefined, { maxActive: NaN }), isCode("ANALYSIS_UNAVAILABLE"));
  assert.throws(() => new LocalAdmission(undefined, { maxAttempts: 0 }), isCode("ANALYSIS_UNAVAILABLE"));
});

test("modo real local: sin flag, con modos ambiguos, producción o Vercel no lee clave ni crea SDK", () => {
  let clients = 0;
  for (const configuration of [
    { NODE_ENV: "development" },
    { NODE_ENV: "development", VISION_LOCAL_GEMINI_REAL: "0" },
    { NODE_ENV: "development", VISION_LOCAL_GEMINI_REAL: "1", VISION_LOCAL_SIMULATION: "1" },
    { NODE_ENV: "production", VISION_LOCAL_GEMINI_REAL: "1" },
    { NODE_ENV: "test", VISION_LOCAL_GEMINI_REAL: "1" },
    { NODE_ENV: "development", VISION_LOCAL_GEMINI_REAL: "1", VERCEL: "1" },
    { NODE_ENV: "development", VISION_LOCAL_GEMINI_REAL: "1", VERCEL: "" },
  ]) {
    const env = Object.defineProperty({ ...configuration }, "GEMINI_API_KEY", { get() { throw new Error("No debe leer la clave"); } });
    assert.equal(selectLocalVisionProvider(env, () => { clients++; throw new Error("No debe crear SDK"); }), null);
  }
  assert.equal(clients, 0);
});

test("simulador conserva su flag y no consulta clave ni transporte real", async () => {
  const env = Object.defineProperty({ NODE_ENV: "development", VISION_LOCAL_SIMULATION: "1" }, "GEMINI_API_KEY", { get() { throw new Error("No debe leer clave"); } });
  const provider = selectLocalVisionProvider(env, () => { throw new Error("No debe crear SDK"); });
  assert.ok(provider);
  const app = setup({ provider });
  const result = await app.handle(request(file(await imageBytes())));
  assert.equal(result.status, 200);
  assert.match((await result.json()).data.suggestion.warnings[0], /Simulación local/);
});

test("modo real local: falta de clave o modelo desconocido falla cerrado antes de crear SDK", () => {
  let calls = 0;
  const factory = () => { calls++; throw new Error("No debe crear SDK"); };
  const base = { NODE_ENV: "development", VISION_LOCAL_GEMINI_REAL: "1" };
  for (const value of [undefined, "", "   "]) {
    assert.throws(() => selectLocalVisionProvider({ ...base, GEMINI_API_KEY: value }, factory), isCode("ANALYSIS_UNAVAILABLE"));
  }
  for (const model of ["modelo-desconocido", "latest", "preview", "gemini-3.8-flash-preview"]) {
    assert.throws(() => selectLocalVisionProvider({ ...base, GEMINI_API_KEY: "sintetica", GEMINI_MODEL: model }, factory), isCode("ANALYSIS_UNAVAILABLE"));
  }
  assert.equal(calls, 0);
});

test("modo real local: la ruta bloquea sin flag, sin clave, con dos flags y en Vercel", async () => {
  const saved = { ...process.env };
  try {
    for (const config of [
      {}, { VISION_LOCAL_GEMINI_REAL: "1" },
      { VISION_LOCAL_GEMINI_REAL: "1", VISION_LOCAL_SIMULATION: "1" },
      { VISION_LOCAL_GEMINI_REAL: "1", VERCEL: "1" },
    ]) {
      process.env = { ...saved, NODE_ENV: "development", VISION_LOCAL_SIMULATION: "0", VISION_LOCAL_GEMINI_REAL: "0", GEMINI_API_KEY: "", ...config };
      await code(await POST(request()), "ANALYSIS_UNAVAILABLE", 503);
    }
  } finally { process.env = saved; }
});

test("modo real local: SDK diferido tras origen, sesión, admisión e imagen válidos", async () => {
  let clients = 0;
  const env = { NODE_ENV: "development", VISION_LOCAL_GEMINI_REAL: "1", GEMINI_API_KEY: "sintetica" };
  const provider = selectLocalVisionProvider(env, () => { clients++; throw new Error("No debe crear SDK ante rechazo"); });
  assert.ok(provider);
  const app = setup({ provider });
  await code(await app.handle(request(undefined, undefined, { headers: { origin: "https://otro.invalid" } })), "FORBIDDEN", 403);
  await code(await setup({ provider, authenticate: async () => null }).handle(request()), "UNAUTHENTICATED", 401);
  await code(await setup({ provider, admission: { acquire() { throw new VisionError("ANALYSIS_UNAVAILABLE"); } } }).handle(request()), "ANALYSIS_UNAVAILABLE", 503);
  await code(await app.handle(request()), "VALIDATION_ERROR", 422);
  assert.equal(clients, 0);
});

test("modo real local: SDK oficial con fetch falso atraviesa validadores sin filtrar secretos", async () => {
  let clients = 0; let requests = 0;
  const provider = selectLocalVisionProvider({ NODE_ENV: "development", VISION_LOCAL_GEMINI_REAL: "1", GEMINI_API_KEY: "valor-sintetico", GEMINI_MODEL: "gemini-3.8-flash" }, (options) => {
    clients++;
    assert.equal(options.vertexai, false);
    assert.equal(options.apiKey, "valor-sintetico");
    assert.equal(options.httpOptions?.retryOptions?.attempts, 1);
    assert.equal(options.httpOptions?.baseUrl, "https://generativelanguage.googleapis.com");
    return new GoogleGenAI({ ...options, httpOptions: { ...options.httpOptions, fetch: async (url, init) => {
      requests++;
      assert.match(String(url), /^https:\/\/generativelanguage\.googleapis\.com\//);
      const body = JSON.parse(String(init?.body));
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      assert.deepEqual(body.generationConfig.responseJsonSchema, suggestionSchema());
      return Response.json({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: JSON.stringify({ ...empty(), title: "Bache visible", description: "Se observa deterioro en la calzada.", categoryId: "pothole", severity: "low" }) }] } }] });
    } } });
  });
  assert.ok(provider); assert.equal(clients, 0);
  const result = await setup({ provider }).handle(request(file(await imageBytes())));
  assert.equal(result.status, 200);
  const text = await result.text(); assert.doesNotMatch(text, /valor-sintetico|apiKey/);
  assert.equal(JSON.parse(text).data.suggestion.categoryId, "pothole");
  assert.equal(clients, 1); assert.equal(requests, 1);
});

test("modo real local: salida inválida y fallos SDK siguen el contrato sin consumo real", async () => {
  for (const [status, text, expected, http] of [
    [200, JSON.stringify({ ...empty(), categoryId: "inventada" }), "ANALYSIS_FAILED", 502],
    [200, "no es JSON", "ANALYSIS_FAILED", 502],
    [429, "", "ANALYSIS_UNAVAILABLE", 503], [503, "", "ANALYSIS_UNAVAILABLE", 503],
    [504, "", "ANALYSIS_TIMEOUT", 504],
  ] as const) {
    let calls = 0;
    const provider = selectLocalVisionProvider({ NODE_ENV: "development", VISION_LOCAL_GEMINI_REAL: "1", GEMINI_API_KEY: "sintetica" }, (options) => new GoogleGenAI({ ...options, httpOptions: { ...options.httpOptions, fetch: async () => {
      calls++;
      return status === 200
        ? Response.json({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text }] } }] })
        : Response.json({ error: { code: status, message: "diagnostico-privado" } }, { status });
    } } }));
    assert.ok(provider);
    const response = await setup({ provider }).handle(request(file(await imageBytes())));
    await code(response, expected, http);
    assert.equal(calls, 1);
  }
});

test("modo real local: plazo total cancela el SDK y no reintenta", async () => {
  let calls = 0; let aborted = false;
  const provider = selectLocalVisionProvider({ NODE_ENV: "development", VISION_LOCAL_GEMINI_REAL: "1", GEMINI_API_KEY: "sintetica" }, (options) => new GoogleGenAI({ ...options, httpOptions: { ...options.httpOptions, fetch: async (_url, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => {
      const abort = () => { aborted = true; reject(new DOMException("Cancelada", "AbortError")); };
      init?.signal?.addEventListener("abort", abort, { once: true });
      if (init?.signal?.aborted) abort();
    });
  } } }));
  assert.ok(provider);
  const response = await setup({ provider, budgetMs: 100, normalize: async () => ({ bytes: Buffer.from("normalizada"), mimeType: "image/png" }) }).handle(request(file(await imageBytes())));
  await code(response, "ANALYSIS_TIMEOUT", 504);
  assert.equal(aborted, true); assert.equal(calls, 1);
});

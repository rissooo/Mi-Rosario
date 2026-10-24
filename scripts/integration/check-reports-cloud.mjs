import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const PRODUCTION_PROJECT_REF = "rsvtchefnydihokivaqg";
const TEST_ENV_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env.test.local");

function loadTestEnvironment() {
  let source;
  try {
    source = readFileSync(TEST_ENV_PATH, "utf8");
  } catch {
    throw new Error("Falta .env.test.local con la URL y la clave publicable del proyecto de pruebas.");
  }

  const fileEnvironment = {};
  for (const [index, sourceLine] of source.split(/\r?\n/).entries()) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) throw new Error(`Línea ${index + 1} inválida en .env.test.local.`);

    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    fileEnvironment[match[1]] = value;
  }

  if (!fileEnvironment.SUPABASE_URL) {
    throw new Error(".env.test.local debe definir SUPABASE_URL.");
  }
  if (!fileEnvironment.SUPABASE_PUBLISHABLE_KEY && !fileEnvironment.SUPABASE_ANON_KEY) {
    throw new Error(".env.test.local debe definir SUPABASE_PUBLISHABLE_KEY o SUPABASE_ANON_KEY.");
  }

  return { ...process.env, ...fileEnvironment };
}

function jwtRole(value) {
  const parts = value.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function assertSafeEnvironment(environment) {
  if (environment.TEST_PROJECT_CONFIRMED !== "true") {
    throw new Error("Falta TEST_PROJECT_CONFIRMED=true; no se harán requests.");
  }

  const configuredUrl = environment.SUPABASE_URL;
  if (!configuredUrl) throw new Error("Falta SUPABASE_URL.");
  if (configuredUrl.toLowerCase().includes(PRODUCTION_PROJECT_REF)) {
    throw new Error("La URL contiene el ref de producción; requests bloqueados.");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(configuredUrl);
  } catch {
    throw new Error("SUPABASE_URL no es una URL válida.");
  }

  if (
    parsedUrl.protocol !== "https:" ||
    !/^[a-z0-9-]+\.supabase\.co$/i.test(parsedUrl.hostname) ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search !== "" ||
    parsedUrl.hash !== ""
  ) {
    throw new Error("URL bloqueada: se requiere el origen HTTPS de un proyecto Supabase.");
  }

  const environmentContainsServiceKey = Object.entries(environment).some(([name, value]) => {
    if (!value) return false;
    if (/(SERVICE[_-]?ROLE|SB_SECRET|SUPABASE_SECRET)/i.test(name)) return true;
    if (/(SERVICE[_-]?ROLE|SB_SECRET)/i.test(value)) return true;
    return jwtRole(value) === "service_role";
  });
  if (environmentContainsServiceKey) {
    throw new Error("Se detectó una clave service_role/secret en el entorno; requests bloqueados.");
  }

  const publishableKey =
    environment.SUPABASE_PUBLISHABLE_KEY ??
    environment.SUPABASE_ANON_KEY;
  if (!publishableKey) {
    throw new Error("Falta SUPABASE_PUBLISHABLE_KEY o SUPABASE_ANON_KEY.");
  }

  if (
    !publishableKey.startsWith("sb_publishable_") &&
    jwtRole(publishableKey) !== "anon"
  ) {
    throw new Error("La clave debe ser publishable o anon; no se aceptan claves secretas.");
  }

  return { url: parsedUrl.origin, publishableKey };
}

const jpegOriginal = Buffer.from([
  0xff, 0xd8,
  0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
  0xff, 0xd9,
]);
const jpegPublic = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

function hashFor(key) {
  return createHash("sha256").update(`reports-integration:${key}`).digest("hex");
}

async function check(name, action) {
  await action();
  process.stdout.write(`OK ${name}\n`);
}

function requireNoError(error, operation) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

async function signInTestUsers(TEST_USERS) {
  for (const user of TEST_USERS) {
    const { data, error } = await user.client.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    requireNoError(error, "No se pudo iniciar sesión con una cuenta sintética");
    if (!data.user?.id || !data.session?.access_token) {
      throw new Error("Auth no devolvió una sesión para una cuenta sintética.");
    }
    user.id = data.user.id;
  }
}

function reportFields(label) {
  return {
    p_title: `Reporte de prueba ${label}`,
    p_description: `Descripción sintética para la prueba de integración ${label}.`,
    p_category_id: "pothole",
    p_severity: "medium",
    p_latitude: -32.9468,
    p_longitude: -60.6393,
    p_street: "Córdoba",
    p_street_number: 1200,
    p_photo_public_mime_type: "image/jpeg",
    p_photo_public_byte_size: jpegPublic.length,
  };
}

async function claim(user, key, payloadHash) {
  const { data, error } = await user.client.rpc("claim_idempotency_key", {
    p_key: key,
    p_payload_hash: payloadHash,
  });
  requireNoError(error, "claim_idempotency_key falló");
  return data;
}

async function failClaim(user, key, reportId, payloadHash) {
  const { data, error } = await user.client.rpc("fail_idempotency_key", {
    p_key: key,
    p_report_id: reportId,
    p_payload_hash: payloadHash,
  });
  requireNoError(error, "No se pudo liberar un claim de prueba");
  assert.equal(data?.action, "FAILED");
}

async function uploadReportPhotos(user, reportId) {
  const originalPath = `${user.id}/${reportId}/original.jpg`;
  const publicPath = `${reportId}.jpg`;

  const original = await user.client.storage.from("reports-originals").upload(
    originalPath,
    jpegOriginal,
    { contentType: "image/jpeg", upsert: false },
  );
  requireNoError(original.error, "No se pudo cargar la foto original de prueba");

  const derivative = await user.client.storage.from("reports-public").upload(
    publicPath,
    jpegPublic,
    { contentType: "image/jpeg", upsert: false },
  );
  requireNoError(derivative.error, "No se pudo cargar la copia pública sintética");

  return { originalPath, publicPath };
}

async function publishClaimedReport(user, key, payloadHash, reportId, label) {
  const paths = await uploadReportPhotos(user, reportId);
  const { data, error } = await user.client.rpc("publish_report", {
    p_key: key,
    p_payload_hash: payloadHash,
    ...reportFields(label),
    p_storage_path: paths.originalPath,
    p_photo_public_path: paths.publicPath,
  });
  requireNoError(error, "publish_report falló");
  assert.equal(data?.success, true, "publish_report no indicó éxito");
  assert.equal(data?.reportId, reportId, "publish_report cambió el report_id reservado");
  return { ...paths, reportId };
}

async function createTestReport(user, label) {
  const key = randomUUID();
  const payloadHash = hashFor(key);
  const claimResult = await claim(user, key, payloadHash);
  assert.equal(claimResult?.action, "CLAIMED");
  assert.ok(claimResult.reportId, "el claim no reservó report_id");

  const report = await publishClaimedReport(
    user,
    key,
    payloadHash,
    claimResult.reportId,
    label,
  );
  return { ...report, key, payloadHash };
}

async function confirm(user, reportId) {
  const { data, error } = await user.client.rpc("confirm_report", {
    p_report_id: reportId,
  });
  requireNoError(error, "confirm_report falló");
  return data;
}

async function runIntegrationChecks({ anonymousClient, TEST_USERS }) {
  await signInTestUsers(TEST_USERS);
  assert.equal(new Set(TEST_USERS.map((user) => user.id)).size, 4, "se requieren cuatro cuentas distintas");

  await check("lectura directa de reports denegada a anon", async () => {
    const { data, error } = await anonymousClient.from("reports").select("user_id").limit(1);
    assert.ok(error || !data?.length, "anon leyó filas de reports");
  });

  const sharedReport = await createTestReport(TEST_USERS[0], "RLS");

  await check("publicación RPC autenticada y rechazo sin sesión", async () => {
    const unclaimedArgs = {
      p_key: randomUUID(),
      p_payload_hash: hashFor(randomUUID()),
      ...reportFields("RPC sin sesión"),
      p_storage_path: "ruta-no-utilizada/original.jpg",
      p_photo_public_path: `${randomUUID()}.jpg`,
    };
    const anonymousResult = await anonymousClient.rpc("publish_report", unclaimedArgs);
    assert.ok(anonymousResult.error, "publish_report aceptó una llamada anónima");

    const authenticatedResult = await TEST_USERS[0].client.rpc("publish_report", unclaimedArgs);
    assert.ok(authenticatedResult.error, "publish_report aceptó una clave no reclamada");
  });

  await check("INSERT directo en reports y confirmations rechazado", async () => {
    const reportInsert = await TEST_USERS[1].client.from("reports").insert({
      user_id: TEST_USERS[1].id,
      title: "Reporte directo inválido",
      description: "No debe insertarse desde el cliente.",
      category_id: "pothole",
      severity: "low",
      latitude: -32.9468,
      longitude: -60.6393,
      street: "Córdoba",
      street_number: 1200,
      storage_path: "directo/original.jpg",
      photo_public_path: `${randomUUID()}.jpg`,
      photo_public_mime_type: "image/jpeg",
      photo_public_byte_size: jpegPublic.length,
    });
    assert.ok(reportInsert.error, "se permitió INSERT directo en reports");

    const confirmationInsert = await TEST_USERS[1].client.from("report_confirmations").insert({
      report_id: sharedReport.reportId,
      user_id: TEST_USERS[1].id,
    });
    assert.ok(confirmationInsert.error, "se permitió INSERT directo en report_confirmations");
  });

  await confirm(TEST_USERS[1], sharedReport.reportId);

  await check("RLS oculta a una cuenta la confirmación de otra", async () => {
    const { data, error } = await TEST_USERS[0].client
      .from("report_confirmations")
      .select("user_id")
      .eq("report_id", sharedReport.reportId);
    requireNoError(error, "consulta de confirmaciones falló");
    assert.deepEqual(data, [], "el autor vio la confirmación de otra cuenta");
  });

  const duplicateReport = await createTestReport(TEST_USERS[0], "duplicada");
  await check("dos confirmaciones concurrentes de la misma cuenta crean una fila", async () => {
    const outcomes = await Promise.all([
      confirm(TEST_USERS[1], duplicateReport.reportId),
      confirm(TEST_USERS[1], duplicateReport.reportId),
    ]);
    assert.ok(outcomes.every((outcome) => outcome?.success === true));
    assert.deepEqual(
      outcomes.map((outcome) => outcome.code).sort(),
      ["ALREADY_CONFIRMED", "CONFIRMED"],
    );

    const { data, error } = await TEST_USERS[1].client
      .from("report_confirmations")
      .select("id")
      .eq("report_id", duplicateReport.reportId);
    requireNoError(error, "no se pudo contar la confirmación propia");
    assert.equal(data.length, 1);
  });

  const thresholdReport = await createTestReport(TEST_USERS[0], "umbral");
  await check("tres cuentas concurrentes alcanzan una transición ciudadana", async () => {
    const outcomes = await Promise.all([
      confirm(TEST_USERS[1], thresholdReport.reportId),
      confirm(TEST_USERS[2], thresholdReport.reportId),
      confirm(TEST_USERS[3], thresholdReport.reportId),
    ]);
    assert.ok(outcomes.every((outcome) => outcome?.success === true));

    const { data, error } = await anonymousClient
      .from("public_reports")
      .select("status, confirmation_count, confirmation_threshold")
      .eq("id", thresholdReport.reportId)
      .single();
    requireNoError(error, "no se pudo leer la proyección pública");
    assert.equal(data.status, "citizen-verification");
    assert.equal(data.confirmation_count, 3);
    assert.equal(data.confirmation_threshold, 3);
  });

  await check("confirm_report rechaza una llamada sin sesión", async () => {
    const { error } = await anonymousClient.rpc("confirm_report", {
      p_report_id: sharedReport.reportId,
    });
    assert.ok(error, "confirm_report aceptó una llamada anónima");
  });

  await check("claim concurrente devuelve el mismo report_id y un solo claim activo", async () => {
    const key = randomUUID();
    const payloadHash = hashFor(key);
    const claims = await Promise.all([
      claim(TEST_USERS[0], key, payloadHash),
      claim(TEST_USERS[0], key, payloadHash),
    ]);
    assert.equal(claims.filter((result) => result.action === "CLAIMED").length, 1);
    assert.equal(claims.filter((result) => result.action === "IN_PROGRESS").length, 1);
    assert.equal(claims[0].reportId, claims[1].reportId);
    await failClaim(TEST_USERS[0], key, claims[0].reportId, payloadHash);
  });

  await check("la cuota rechaza el cuarto claim simultáneo", async () => {
    const quotaUser = TEST_USERS[3];
    const activeClaims = [];
    try {
      for (let index = 0; index < 3; index += 1) {
        const key = randomUUID();
        const payloadHash = hashFor(key);
        const result = await claim(quotaUser, key, payloadHash);
        assert.equal(result?.action, "CLAIMED", `el claim ${index + 1} debería entrar en la cuota`);
        activeClaims.push({ key, payloadHash, reportId: result.reportId });
      }

      const rejectedKey = randomUUID();
      const rejected = await claim(quotaUser, rejectedKey, hashFor(rejectedKey));
      assert.equal(rejected?.action, "LIMIT_REACHED");
      assert.equal(rejected?.code, "PUBLICATION_IN_PROGRESS");
      assert.equal(rejected?.quota, "active_claims");
      assert.ok(rejected?.retryAfter > 0);
    } finally {
      for (const active of activeClaims) {
        await failClaim(quotaUser, active.key, active.reportId, active.payloadHash);
      }
    }
  });

  await check("la cuota rechaza el reporte 11 de una ventana de 24 horas", async () => {
    // Escribe diez reportes persistentes con la cuenta 4; repetir requiere una cuenta fresca o esperar 24 h.
    const quotaUser = TEST_USERS[3];
    const publishedIds = [];
    for (let index = 1; index <= 10; index += 1) {
      const report = await createTestReport(quotaUser, `cuota-${index}`);
      publishedIds.push(report.reportId);
    }

    const rejectedKey = randomUUID();
    const rejected = await claim(quotaUser, rejectedKey, hashFor(rejectedKey));
    assert.equal(rejected?.action, "LIMIT_REACHED");
    assert.equal(rejected?.code, "PUBLICATION_IN_PROGRESS");
    assert.equal(rejected?.quota, "published_24h");
    assert.ok(rejected?.retryAfter > 0);
    assert.equal(rejected?.reportId, undefined, "la cuota no debe reservar el reporte 11");

    const { data, error } = await anonymousClient
      .from("public_reports")
      .select("id")
      .in("id", publishedIds);
    requireNoError(error, "no se pudo contar la muestra de diez reportes publicados");
    assert.equal(data.length, 10);
  });

  const replayReport = await createTestReport(TEST_USERS[0], "respuesta perdida");
  await check("replay tras descartar la respuesta del commit recupera el mismo reporte", async () => {
    // La creación ya confirmó el commit; se descarta su respuesta como timeout posterior al commit.
    const replay = await claim(TEST_USERS[0], replayReport.key, replayReport.payloadHash);
    assert.equal(replay.action, "COMPLETED");
    assert.equal(replay.reportId, replayReport.reportId);

    const { data, error } = await anonymousClient
      .from("public_reports")
      .select("id")
      .eq("id", replayReport.reportId);
    requireNoError(error, "no se pudo consultar el reporte reintentado");
    assert.equal(data.length, 1, "el replay creó un reporte duplicado");
  });

  await check("copia pública accesible sin sesión y original privada", async () => {
    const { data: publicUrlData } = anonymousClient.storage
      .from("reports-public")
      .getPublicUrl(replayReport.publicPath);
    const publicResponse = await fetch(publicUrlData.publicUrl);
    assert.equal(publicResponse.status, 200, "la copia pública no se pudo leer como anon");
    assert.deepEqual(
      Buffer.from(await publicResponse.arrayBuffer()),
      jpegPublic,
      "la URL pública no devolvió los bytes de la copia derivada sintética",
    );

    const original = await anonymousClient.storage
      .from("reports-originals")
      .download(replayReport.originalPath);
    assert.ok(original.error, "la foto original privada se pudo leer como anon");
  });
}

async function main() {
  const environment = loadTestEnvironment();
  const { url, publishableKey } = assertSafeEnvironment(environment);
  const anonymousClient = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const TEST_USERS = [1, 2, 3, 4].map((index) => {
    const email = environment[`REPORTS_TEST_USER_${index}_EMAIL`];
    const password = environment[`REPORTS_TEST_USER_${index}_PASSWORD`];
    if (!email || !password) {
      throw new Error(`Faltan credenciales sintéticas REPORTS_TEST_USER_${index}_EMAIL/PASSWORD.`);
    }

    const client = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return { email, password, client, id: null };
  });

  await runIntegrationChecks({ anonymousClient, TEST_USERS });
}

const isDirectExecution = process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirectExecution) await main();

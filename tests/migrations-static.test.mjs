import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = join(root, "supabase/migrations");

function getMigrations() {
  return readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({
      file,
      path: join(migrationsDirectory, file),
      sql: readFileSync(join(migrationsDirectory, file), "utf8"),
    }));
}

function collectCodeFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return collectCodeFiles(path);
    return [".ts", ".tsx", ".js", ".mjs"].includes(extname(path)) ? [path] : [];
  });
}

function getPropertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function findVariableDeclarations(sourceFile, name) {
  const found = [];
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function findFunctionReturns(sourceFile, name) {
  const found = [];
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name && node.body) {
      const visitBody = (child) => {
        if (ts.isFunctionLike(child) && child !== node) return;
        if (ts.isReturnStatement(child) && child.expression) found.push(child.expression);
        ts.forEachChild(child, visitBody);
      };
      visitBody(node.body);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function resolveObjectKeys(expression, sourceFile, seen = new Set()) {
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) {
    return resolveObjectKeys(expression.expression, sourceFile, seen);
  }

  if (ts.isObjectLiteralExpression(expression)) {
    const keys = new Set();
    for (const property of expression.properties) {
      if (ts.isSpreadAssignment(property)) {
        for (const key of resolveObjectKeys(property.expression, sourceFile, seen)) keys.add(key);
        continue;
      }
      if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
        const key = getPropertyName(property.name);
        assert.ok(key, `Clave de RPC no estática en ${property.getText(sourceFile)}`);
        keys.add(key);
      }
    }
    return keys;
  }

  if (ts.isIdentifier(expression)) {
    assert.ok(!seen.has(expression.text), `Referencia cíclica al resolver ${expression.text}`);
    const nextSeen = new Set(seen).add(expression.text);
    const declarations = findVariableDeclarations(sourceFile, expression.text);
    assert.equal(declarations.length, 1, `No se pudo resolver de forma unívoca ${expression.text}`);
    const initializer = declarations[0].initializer;
    assert.ok(initializer, `La variable ${expression.text} no tiene inicializador estático`);
    return resolveObjectKeys(initializer, sourceFile, nextSeen);
  }

  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) {
    const name = expression.expression.text;
    const returns = findFunctionReturns(sourceFile, name);
    assert.ok(returns.length > 0, `No se pudo resolver el objeto devuelto por ${name}()`);
    const keys = new Set();
    for (const returned of returns) {
      for (const key of resolveObjectKeys(returned, sourceFile, new Set(seen).add(name))) keys.add(key);
    }
    return keys;
  }

  assert.fail(`Argumentos de RPC no estáticos: ${expression.getText(sourceFile)}`);
}

function sqlArguments(argumentText) {
  if (!argumentText.trim()) return [];
  return argumentText.split(",").map((argument) => {
    const match = argument.trim().match(/^(?:(?:IN|OUT|INOUT|VARIADIC)\s+)?([a-z_][a-z0-9_]*)\s+/i);
    assert.ok(match, `No se pudo leer el argumento SQL: ${argument}`);
    return match[1];
  });
}

function rpcSignatures(migrations) {
  const signatures = new Map();
  const functionPattern = /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+public\.([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)\s*RETURNS\b/gi;
  for (const migration of migrations) {
    for (const match of migration.sql.matchAll(functionPattern)) {
      const name = match[1];
      const existing = signatures.get(name) ?? [];
      existing.push({ args: sqlArguments(match[2]), migration: migration.file });
      signatures.set(name, existing);
    }
  }
  return signatures;
}

function collectRpcCalls(sourceFile, filePath) {
  const calls = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "rpc"
    ) {
      const [nameNode, argsNode] = node.arguments;
      assert.ok(nameNode && ts.isStringLiteralLike(nameNode), `${filePath}: nombre RPC no estático`);
      assert.ok(argsNode, `${filePath}: faltan argumentos para ${nameNode.text}`);
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      calls.push({
        name: nameNode.text,
        keys: resolveObjectKeys(argsNode, sourceFile),
        location: `${filePath}:${line + 1}`,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return calls;
}

test("cada llamada .rpc del backend y del script cloud coincide con la firma SQL", () => {
  const migrations = getMigrations();
  const signatures = rpcSignatures(migrations);
  const sourceFiles = [
    ...collectCodeFiles(join(root, "app/api/reports")),
    ...collectCodeFiles(join(root, "lib/reports")),
    join(root, "scripts/integration/check-reports-cloud.mjs"),
  ];
  const calls = sourceFiles.flatMap((path) => {
    const sourceText = readFileSync(path, "utf8");
    const scriptKind = extname(path) === ".tsx" ? ts.ScriptKind.TSX :
      [".js", ".mjs"].includes(extname(path)) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
    return collectRpcCalls(sourceFile, path.slice(root.length + 1));
  });

  assert.ok(calls.length > 0, "No se encontraron llamadas RPC para verificar");
  for (const call of calls) {
    const matches = signatures.get(call.name) ?? [];
    assert.equal(matches.length, 1, `${call.location}: ${call.name} debe tener una única definición SQL`);
    assert.deepEqual(
      [...call.keys].sort(),
      [...matches[0].args].sort(),
      `${call.location}: claves de ${call.name} no coinciden con ${matches[0].migration}`,
    );
  }
});

test("las migraciones protegen funciones SECURITY DEFINER, tablas y orden de objetos", () => {
  const migrations = getMigrations();
  assert.deepEqual(
    migrations.map(({ file }) => file),
    [
      "20261023000001_reports_storage.sql",
      "20261023000002_reports_table.sql",
      "20261023000003_idempotency.sql",
      "20261023000004_confirmations.sql",
      "20261023000005_public_reports_view.sql",
    ],
    "Las migraciones deben estar completas y ordenadas para el proyecto Supabase de pruebas en la nube",
  );

  const allSql = migrations.map(({ sql }) => sql).join("\n");
  const functions = [...allSql.matchAll(
    /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+public\.([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)\s*RETURNS[\s\S]*?AS\s+\$\$[\s\S]*?\$\$;/gi,
  )];
  const definerFunctions = functions.filter((match) => /\bSECURITY\s+DEFINER\b/i.test(match[0]));
  const privilegeStatements = [...allSql.matchAll(
    /\b(REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+FUNCTION|GRANT\s+EXECUTE\s+ON\s+FUNCTION)\s+public\.([a-z_][a-z0-9_]*)\s*\(([^)]*)\)\s+(FROM|TO)\s+([^;]+);/gi,
  )];

  assert.ok(definerFunctions.length > 0, "Debe haber funciones SECURITY DEFINER cubiertas");
  for (const fn of definerFunctions) {
    const name = fn[1];
    const revoked = privilegeStatements.some((statement) =>
      statement[1].toUpperCase().startsWith("REVOKE") && statement[2] === name &&
      statement[5].toLowerCase().includes("public") && statement[5].toLowerCase().includes("anon"),
    );
    const granted = privilegeStatements.some((statement) =>
      statement[1].toUpperCase().startsWith("GRANT") && statement[2] === name &&
      statement[5].toLowerCase().includes("authenticated"),
    );
    assert.match(fn[0], /SET\s+search_path\s*=\s*''/i, `${name} debe fijar search_path vacío`);
    assert.ok(revoked, `${name} debe revocar ejecución a PUBLIC y anon`);
    assert.ok(granted, `${name} debe conceder ejecución explícita a authenticated`);
  }

  const reportsMigration = migrations.find(({ file }) => file === "20261023000002_reports_table.sql");
  const storageMigration = migrations.find(({ file }) => file === "20261023000003_idempotency.sql");
  const bucketMigration = migrations.find(({ file }) => file === "20261023000001_reports_storage.sql");
  const publicViewMigration = migrations.find(({ file }) => file === "20261023000005_public_reports_view.sql");
  assert.ok(reportsMigration && storageMigration && bucketMigration && publicViewMigration);
  const idempotencyMigration = storageMigration;
  const confirmationsMigration = migrations.find(({ file }) => file === "20261023000004_confirmations.sql");
  assert.ok(confirmationsMigration);

  const normalizedStorageSql = bucketMigration.sql.replace(/\s+/g, " ");
  for (const [bucket, isPublic] of [["reports-originals", "false"], ["reports-public", "true"]]) {
    const bucketDefinition = `'${bucket}', '${bucket}', ${isPublic}, 4194304, ARRAY['image/jpeg', 'image/png', 'image/webp']`;
    assert.ok(normalizedStorageSql.includes(bucketDefinition), `El bucket ${bucket} debe fijar privacidad, límite de 4 MiB y MIME permitidos`);
  }

  for (const constraint of [
    /check_reports_title[\s\S]*?char_length\(trim\(title\)\) BETWEEN 5 AND 120/i,
    /check_reports_description[\s\S]*?char_length\(trim\(description\)\) BETWEEN 10 AND 1000/i,
    /check_reports_category[\s\S]*?category_id IN \('pothole', 'missing-light', 'damaged-sidewalk', 'faulty-traffic-light'\)/i,
    /check_reports_severity[\s\S]*?severity IN \('low', 'medium', 'high'\)/i,
    /check_reports_status[\s\S]*?status IN \('pending', 'citizen-verification'\)/i,
    /check_reports_latitude[\s\S]*?latitude BETWEEN -90\.0 AND 90\.0/i,
    /check_reports_longitude[\s\S]*?longitude BETWEEN -180\.0 AND 180\.0/i,
    /check_reports_street[\s\S]*?char_length\(street\) BETWEEN 2 AND 80/i,
    /check_reports_street_number[\s\S]*?street_number IS NULL OR street_number BETWEEN 1 AND 99999/i,
    /check_reports_photo_public_mime_type[\s\S]*?photo_public_mime_type IN \('image\/jpeg', 'image\/png', 'image\/webp'\)/i,
    /check_reports_photo_public_byte_size[\s\S]*?photo_public_byte_size BETWEEN 1 AND 4194304/i,
    /check_reports_confirmation_count[\s\S]*?confirmation_count >= 0/i,
    /check_reports_confirmation_threshold[\s\S]*?confirmation_threshold > 0/i,
  ]) assert.match(reportsMigration.sql, constraint);
  assert.ok(reportsMigration.sql.includes("street !~ '^[[:space:]]|[[:space:]]$'"));

  assert.match(idempotencyMigration.sql, /report_id UUID NOT NULL DEFAULT gen_random_uuid\(\)(?![^,]*REFERENCES)/i);
  assert.match(idempotencyMigration.sql, /UNIQUE \(report_id\)/i);
  assert.match(idempotencyMigration.sql, /locked_until = now\(\) \+ interval '3 minutes'/i);
  assert.match(idempotencyMigration.sql, /ON CONFLICT \(user_id, key\) DO NOTHING/i);
  assert.match(idempotencyMigration.sql, /FROM public\.idempotency_keys[\s\S]*?WHERE user_id = v_user_id AND key = p_key\s+FOR UPDATE/i);
  assert.match(idempotencyMigration.sql, /CREATE OR REPLACE FUNCTION public\.publish_report[\s\S]*?INSERT INTO public\.reports[\s\S]*?UPDATE public\.idempotency_keys[\s\S]*?SET status = 'completed'/i);
  assert.match(idempotencyMigration.sql, /CREATE OR REPLACE FUNCTION public\.fail_idempotency_key[\s\S]*?SET status = 'failed'/i);
  assert.doesNotMatch(idempotencyMigration.sql, /get_confirmation_threshold/i);

  const confirmationFunction = confirmationsMigration.sql.match(
    /CREATE OR REPLACE FUNCTION public\.confirm_report\([\s\S]*?\$\$;/i,
  )?.[0];
  assert.ok(confirmationFunction, "Debe existir confirm_report");
  assert.match(confirmationFunction, /SELECT[\s\S]*?FROM public\.reports[\s\S]*?FOR UPDATE/i);
  assert.match(confirmationFunction, /confirmation_threshold/i);
  assert.match(confirmationFunction, /v_status\s+NOT\s+IN\s*\('pending',\s*'citizen-verification'\)/i);
  assert.match(confirmationFunction, /report_confirmations[\s\S]*?ALREADY_CONFIRMED[\s\S]*?REPORT_RESOLVED/i);

  assert.match(reportsMigration.sql, /CONSTRAINT\s+check_reports_status\s+CHECK\s*\(status\s+IN\s*\('pending',\s*'citizen-verification'\)\)/i);
  assert.match(storageMigration.sql, /ON\s+storage\.objects\s+FOR\s+INSERT\s+TO\s+authenticated[\s\S]*?public\.can_upload_report_object/i);
  assert.match(storageMigration.sql, /ON\s+storage\.objects\s+FOR\s+SELECT\s+TO\s+authenticated[\s\S]*?public\.can_upload_report_object/i);
  assert.match(storageMigration.sql, /ON\s+storage\.objects\s+FOR\s+UPDATE\s+TO\s+authenticated[\s\S]*?public\.can_upload_report_object/i);
  assert.match(storageMigration.sql, /ON\s+storage\.objects\s+FOR\s+DELETE\s+TO\s+authenticated[\s\S]*?public\.can_delete_unpublished_report_object/i);
  for (const helper of ["can_upload_report_object", "can_delete_unpublished_report_object"]) {
    const helperSql = storageMigration.sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${helper}\\([\\s\\S]*?\\$\\$;`, "i"))?.[0];
    assert.ok(helperSql, `Debe existir el helper ${helper}`);
    assert.match(helperSql, /auth\.uid\(\)/i);
    assert.match(helperSql, /k\.user_id = v_user_id[\s\S]*?k\.report_id::text = v_report_id[\s\S]*?k\.status = 'in_progress'/i);
    if (helper === "can_delete_unpublished_report_object") {
      assert.match(helperSql, /NOT EXISTS\s*\(\s*SELECT\s+1\s+FROM public\.reports r[\s\S]*?r\.id::text = v_report_id AND r\.user_id = v_user_id/i);
    }
  }
  assert.match(publicViewMigration.sql, /REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+TABLE\s+public\.reports\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i);
  assert.match(publicViewMigration.sql, /GRANT\s+SELECT\s+ON\s+TABLE\s+public\.public_reports\s+TO\s+anon,\s*authenticated/i);
  const viewProjection = publicViewMigration.sql.match(
    /CREATE\s+OR\s+REPLACE\s+VIEW\s+public\.public_reports[\s\S]*?AS\s+SELECT([\s\S]*?)FROM\s+public\.reports/i,
  )?.[1];
  assert.ok(viewProjection, "Debe existir una proyección SQL de public_reports");
  for (const column of ["photo_public_path", "photo_public_mime_type", "photo_public_byte_size", "confirmation_count", "confirmation_threshold", "street", "street_number"]) {
    assert.match(viewProjection, new RegExp(`\\br\\.${column}\\b`, "i"), `La vista debe exponer ${column}`);
  }
  assert.doesNotMatch(viewProjection, /\br\.(?:user_id|storage_path|resolved|resolved_at|mime_type|byte_size)\b/i);
  assert.match(publicViewMigration.sql, /WHERE\s+r\.status\s+IN\s*\('pending',\s*'citizen-verification'\)/i);

  const creations = new Map();
  const createPattern = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+public\.([a-z_][a-z0-9_]*)|CREATE(?:\s+OR\s+REPLACE)?\s+(?:FUNCTION|VIEW)\s+public\.([a-z_][a-z0-9_]*)/gi;
  migrations.forEach((migration, index) => {
    for (const match of migration.sql.matchAll(createPattern)) {
      const name = match[1] ?? match[2];
      if (!creations.has(name)) creations.set(name, { index, position: match.index, file: migration.file });
    }
  });

  const tablePattern = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+public\.([a-z_][a-z0-9_]*)/gi;
  for (const migration of migrations) {
    for (const match of migration.sql.matchAll(tablePattern)) {
      const table = match[1];
      assert.match(
        migration.sql,
        new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY\\s*;`, "i"),
        `${migration.file}: public.${table} debe activar RLS`,
      );
    }
  }

  migrations.forEach((migration, index) => {
    for (const [name, creation] of creations) {
      const referencePattern = new RegExp(`public\\.${name}\\b`, "gi");
      for (const match of migration.sql.matchAll(referencePattern)) {
        if (index > creation.index || (index === creation.index && match.index >= creation.position)) continue;
        const prefix = migration.sql.slice(Math.max(0, match.index - 80), match.index);
        if (/DROP\s+FUNCTION\s+IF\s+EXISTS\s*$/i.test(prefix)) continue;
        assert.fail(`${migration.file} usa public.${name} antes de su creación en ${creation.file}`);
      }
    }
  });
});

test("el script cloud carga su entorno solo al ejecutarse directamente y mantiene las guardias", () => {
  const cloudPath = join(root, "scripts/integration/check-reports-cloud.mjs");
  const cloudScript = readFileSync(cloudPath, "utf8");
  const unitRunner = readFileSync(join(root, "scripts/check-reports.mjs"), "utf8");

  assert.match(cloudScript, /readFileSync\(TEST_ENV_PATH,\s*"utf8"\)/);
  assert.match(cloudScript, /configuredUrl\.toLowerCase\(\)\.includes\(PRODUCTION_PROJECT_REF\)/);
  assert.match(cloudScript, /environment\.TEST_PROJECT_CONFIRMED\s*!==\s*"true"/);
  assert.match(cloudScript, /SB_SECRET/);
  assert.match(cloudScript, /SERVICE\[_-\]\?ROLE/);
  assert.doesNotMatch(cloudScript, /auth\.admin\.(?:createUser|inviteUserByEmail)/);
  assert.match(cloudScript, /signInWithPassword/);
  assert.match(cloudScript, /signInTestUsers\(TEST_USERS\)/);
  assert.match(cloudScript, /new Set\(TEST_USERS\.map\(\(user\) => user\.id\)\)\.size, 4/);
  assert.match(cloudScript, /process\.stdout\.write\(`OK \$\{name\}\\n`\)/);
  assert.doesNotMatch(cloudScript, /process\.stdout\.write\([^\n]*(?:publishableKey|SUPABASE_PUBLISHABLE_KEY|password)/i);
  assert.doesNotMatch(cloudScript, /console\.(?:log|error|warn)\([^\n]*(?:publishableKey|SUPABASE_PUBLISHABLE_KEY|password)/i);
  assert.doesNotMatch(cloudScript, /\.auth\.admin\./i);
  assert.match(cloudScript, /if\s*\(isDirectExecution\)\s*await main\(\)/);
  assert.doesNotMatch(unitRunner, /check-reports-cloud\.mjs/);
});

test("las cuotas configurables se serializan por usuario en claim y publicación", () => {
  const migrations = getMigrations();
  const idempotencyMigration = migrations.find(({ file }) => file === "20261023000003_idempotency.sql");
  const reportsMigration = migrations.find(({ file }) => file === "20261023000002_reports_table.sql");
  assert.ok(idempotencyMigration && reportsMigration);

  const limitsTable = idempotencyMigration.sql.match(
    /CREATE TABLE IF NOT EXISTS public\.report_backend_limits\s*\(([\s\S]*?)\);/i,
  )?.[0];
  assert.ok(limitsTable, "Debe existir la configuración SQL de cuotas");
  assert.match(limitsTable, /max_in_progress_claims INTEGER NOT NULL DEFAULT 3 CHECK \(max_in_progress_claims > 0\)/i);
  assert.match(limitsTable, /max_published_per_24h INTEGER NOT NULL DEFAULT 10 CHECK \(max_published_per_24h > 0\)/i);
  assert.match(idempotencyMigration.sql, /ALTER TABLE public\.report_backend_limits ENABLE ROW LEVEL SECURITY/i);
  assert.match(idempotencyMigration.sql, /REVOKE ALL PRIVILEGES ON TABLE public\.report_backend_limits FROM PUBLIC, anon, authenticated/i);
  assert.match(reportsMigration.sql, /ON public\.reports\s*\(user_id, created_at DESC\)/i);

  const functionSql = (name) => idempotencyMigration.sql.match(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`, "i"),
  )?.[0];
  const claim = functionSql("claim_idempotency_key");
  const publish = functionSql("publish_report");
  const fail = functionSql("fail_idempotency_key");
  assert.ok(claim && publish && fail);

  for (const sql of [claim, publish, fail]) {
    assert.match(sql, /pg_catalog\.pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(v_user_id::text, 0\)\)/i);
  }
  assert.ok(claim.indexOf("pg_catalog.pg_advisory_xact_lock") < claim.indexOf("INSERT INTO public.idempotency_keys"));
  assert.match(claim, /status = 'in_progress'[\s\S]*?locked_until > now\(\)/i);
  assert.match(claim, /v_active_claim_count > v_max_in_progress_claims/i);
  assert.match(claim, /v_active_claim_count >= v_max_in_progress_claims/i);
  assert.match(claim, /v_published_count >= v_max_published_per_24h/i);
  assert.match(claim, /created_at >= now\(\) - interval '24 hours'/i);

  assert.ok(publish.indexOf("pg_catalog.pg_advisory_xact_lock") < publish.indexOf("FROM public.idempotency_keys"));
  assert.ok(publish.indexOf("v_published_count >= v_max_published_per_24h") < publish.indexOf("INSERT INTO public.reports"));
  assert.match(publish, /created_at >= now\(\) - interval '24 hours'/i);
  assert.match(publish, /'code', 'PUBLICATION_IN_PROGRESS'[\s\S]*?'quota', 'published_24h'/i);
  assert.match(publish, /v_locked_until <= now\(\)/i);

  for (const helper of ["can_upload_report_object", "can_delete_unpublished_report_object"]) {
    const helperSql = functionSql(helper);
    assert.ok(helperSql);
    assert.match(helperSql, /k\.locked_until > now\(\)/i, `${helper} debe exigir que el claim siga vigente`);
  }
});

test("el POST limita Content-Length antes de leer el multipart y oculta errores internos", () => {
  const routeFiles = [
    "app/api/reports/route.ts",
    "app/api/reports/[id]/route.ts",
    "app/api/reports/[id]/confirmations/route.ts",
    "app/api/reports/[id]/confirmations/me/route.ts",
  ];
  const routes = routeFiles.map((file) => readFileSync(join(root, file), "utf8"));
  const publishRoute = routes[0];

  assert.ok(publishRoute.indexOf("isMultipartContentLengthTooLarge") < publishRoute.indexOf("request.formData()"));
  assert.match(publishRoute, /status:\s*413/);
  assert.doesNotMatch(routes.join("\n"), /message:\s*(?:err|error|response)\.message/);
});

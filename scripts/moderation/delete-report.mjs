// Borra un reporte publicado: su fila (las confirmaciones caen en cascada), la copia pública y la
// foto original. Usa la clave secreta de .env.local, así que corre contra el proyecto que apunte ese
// archivo. Sin --confirmar solo muestra qué borraría.
//
//   node scripts/moderation/delete-report.mjs <id-del-reporte>             # vista previa
//   node scripts/moderation/delete-report.mjs <id-del-reporte> --confirmar  # borra
//
// Requiere Node 22 o más (@supabase/supabase-js necesita WebSocket nativo).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const [id, flag] = process.argv.slice(2);
if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
  console.error("Uso: node scripts/moderation/delete-report.mjs <id-del-reporte> [--confirmar]");
  process.exit(1);
}

const env = {};
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
}
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY?.startsWith("sb_secret_")) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY (sb_secret_...) en .env.local.");
  process.exit(1);
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: report, error } = await admin
  .from("reports")
  .select("id, title, created_at, street, street_number, storage_path, photo_public_path, confirmation_count")
  .eq("id", id)
  .maybeSingle();
if (error) {
  console.error("No se pudo leer el reporte.");
  process.exit(1);
}
if (!report) {
  console.log("No existe un reporte con ese id.");
  process.exit(0);
}

const project = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
console.log(`Proyecto: ${project}`);
console.log(`Reporte: "${report.title}" (${report.street} ${report.street_number ?? "s/n"}), ` +
  `${report.created_at}, ${report.confirmation_count} confirmaciones`);
if (flag !== "--confirmar") {
  console.log("Vista previa: no se borró nada. Repetí con --confirmar para borrarlo.");
  process.exit(0);
}

// Primero las fotos: si después fallara el borrado de la fila, el reporte sigue visible y se reintenta.
const publicCopy = await admin.storage.from("reports-public").remove([report.photo_public_path]);
const original = await admin.storage.from("reports-originals").remove([report.storage_path]);
const row = await admin.from("reports").delete().eq("id", id);
console.log(`Copia pública: ${publicCopy.error ? "error" : "borrada"}`);
console.log(`Foto original: ${original.error ? "error" : "borrada"}`);
console.log(`Fila y confirmaciones: ${row.error ? "error" : "borradas"}`);
process.exitCode = publicCopy.error || original.error || row.error ? 1 : 0;

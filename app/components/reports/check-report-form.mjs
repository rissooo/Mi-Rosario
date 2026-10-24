// Compila solo el grafo de tests del formulario de reporte y de las confirmaciones en un directorio
// temporal aislado. Mismo enfoque que scripts/check-contracts.mjs; se corre con
// `node app/components/reports/check-report-form.mjs`.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
// node --test corre cada archivo en su propio proceso, así el estado en memoria de las fuentes no se mezcla.
const testFiles = [
  "app/components/reports/report-form.test",
  "app/components/reports/confirmations.test",
  "app/components/reports/api-sources.test",
];
const output = await mkdtemp(join(tmpdir(), "mi-rosario-report-form-"));
try {
  const program = ts.createProgram(testFiles.map((file) => join(root, `${file}.ts`)), {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    rootDir: root, outDir: output, strict: true, esModuleInterop: true,
    skipLibCheck: true, noEmitOnError: true, types: ["node"],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => root,
      getCanonicalFileName: (name) => name,
      getNewLine: () => "\n",
    }));
    process.exitCode = 1;
  } else {
    const emitted = program.emit();
    if (emitted.emitSkipped) throw new Error("No se pudieron compilar los tests del formulario de reporte.");
    // El modo de ejemplo queda activo; api-sources.test lo apaga para probar las fuentes reales.
    const result = spawnSync(process.execPath, ["--test", ...testFiles.map((file) => join(output, `${file}.js`))], {
      stdio: "inherit", cwd: root, env: { ...process.env, NEXT_PUBLIC_REPORTS_SAMPLE_MODE: "1" },
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} finally {
  // output es un directorio generado por el sistema para esta ejecución, no una ruta del repo.
  if (dirname(output) !== resolve(tmpdir()) || !basename(output).startsWith("mi-rosario-report-form-")) {
    throw new Error("No se borra un directorio que está fuera del alcance temporal de los tests del formulario de reporte.");
  }
  await rm(output, { recursive: true, force: true });
}

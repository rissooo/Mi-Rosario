// Compile only the map data test graph into an isolated temporary directory.
// Same approach as scripts/check-contracts.mjs; run with `node app/components/map/check-map-data.mjs`.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const testFile = "app/components/map/map-data.test";
const output = await mkdtemp(join(tmpdir(), "mi-rosario-map-data-"));
try {
  const program = ts.createProgram([join(root, `${testFile}.ts`)], {
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
    if (emitted.emitSkipped) throw new Error("Map data tests could not be compiled.");
    const result = spawnSync(process.execPath, ["--test", join(output, `${testFile}.js`)], { stdio: "inherit", cwd: root });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} finally {
  // output is an OS-generated directory scoped to this invocation, not a repo path.
  if (dirname(output) !== resolve(tmpdir()) || !basename(output).startsWith("mi-rosario-map-data-")) {
    throw new Error("Refusing to remove a directory outside the map data test temporary scope.");
  }
  await rm(output, { recursive: true, force: true });
}

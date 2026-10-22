// Compile only the contract test graph into an isolated temporary directory.
// Uses the installed TypeScript and Node test runner; no network or Next build.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = await mkdtemp(join(tmpdir(), "mi-rosario-contracts-"));
try {
  const program = ts.createProgram([join(root, "tests/contracts.test.ts")], {
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
    if (emitted.emitSkipped) throw new Error("Contract tests could not be compiled.");
    const result = spawnSync(process.execPath, ["--test", join(output, "tests/contracts.test.js")], { stdio: "inherit", cwd: root });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} finally {
  // output is an OS-generated directory scoped to this invocation, not a repo path.
  if (dirname(output) !== resolve(tmpdir()) || !basename(output).startsWith("mi-rosario-contracts-")) {
    throw new Error("Refusing to remove a directory outside the contract-test temporary scope.");
  }
  await rm(output, { recursive: true, force: true });
}

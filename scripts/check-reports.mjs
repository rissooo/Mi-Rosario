// Compile and run reports unit tests in an isolated temporary directory.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = await mkdtemp(join(tmpdir(), "mi-rosario-reports-"));
try {
  const testFiles = [
    join(root, "tests/photos.test.ts"),
    join(root, "tests/idempotency.test.ts"),
    join(root, "tests/confirmations.test.ts"),
    join(root, "tests/service.test.ts"),
  ];

  const program = ts.createProgram(testFiles, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    rootDir: root,
    outDir: output,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmitOnError: true,
    types: ["node"],
  });

  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    process.stderr.write(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => root,
        getCanonicalFileName: (name) => name,
        getNewLine: () => "\n",
      })
    );
    process.exitCode = 1;
  } else {
    const emitted = program.emit();
    if (emitted.emitSkipped) throw new Error("Report tests could not be compiled.");
    const compiledTests = testFiles.map((file) => {
      const rel = file.slice(root.length + 1).replace(/\.ts$/, ".js");
      return join(output, rel);
    });
    const result = spawnSync(process.execPath, ["--test", ...compiledTests], {
      stdio: "inherit",
      cwd: root,
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} finally {
  if (dirname(output) !== resolve(tmpdir()) || !basename(output).startsWith("mi-rosario-reports-")) {
    throw new Error("Refusing to remove a directory outside temporary scope.");
  }
  await rm(output, { recursive: true, force: true });
}

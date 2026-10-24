// Test del router en una carpeta temporal sin conexiones a APIs.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = await mkdtemp(join(tmpdir(), "mi-rosario-router-"));
try {
  const program = ts.createProgram([join(root, "tests/vision-router.test.ts")], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    rootDir: root, outDir: output, strict: true, esModuleInterop: true,
    skipLibCheck: true, noEmitOnError: true, types: ["node"],
  });
  const errors = ts.getPreEmitDiagnostics(program);
  if (errors.length) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext(errors, {
      getCurrentDirectory: () => root,
      getCanonicalFileName: (name) => name,
      getNewLine: () => "\n",
    }));
    process.exitCode = 1;
  } else {
    const emitted = program.emit();
    if (emitted.emitSkipped) throw new Error("Router tests could not be compiled.");
    // preview.ts y groq.ts importan "server-only": se resuelve como en el servidor de Next.
    const result = spawnSync(process.execPath,
      ["--conditions=react-server", "--test", join(output, "tests/vision-router.test.js")], {
        stdio: "inherit", cwd: root, env: { ...process.env, NODE_PATH: join(root, "node_modules") },
      });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} finally {
  if (dirname(output) !== resolve(tmpdir()) || !basename(output).startsWith("mi-rosario-router-")) {
    throw new Error("Refusing to remove data outside the test temp folder.");
  }
  await rm(output, { recursive: true, force: true });
}

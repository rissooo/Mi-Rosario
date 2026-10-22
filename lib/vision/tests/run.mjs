import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const output = await mkdtemp(join(tmpdir(), "mi-rosario-vision-"));
try {
  const program = ts.createProgram([join(root, "lib/vision/tests/vision.test.ts")], {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10, baseUrl: root, paths: { "@/*": ["./*"] },
    rootDir: root, outDir: output, strict: true, esModuleInterop: true,
    skipLibCheck: true, noEmitOnError: true, types: ["node"],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => root, getCanonicalFileName: (name) => name, getNewLine: () => "\n",
    }));
    process.exitCode = 1;
  } else {
    if (program.emit().emitSkipped) throw new Error("No se pudieron compilar las pruebas de visión.");
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--import",
      new URL("./no-network.mjs", import.meta.url).href, "--test", join(output, "lib/vision/tests/vision.test.js")], {
      stdio: "inherit", cwd: root,
      env: { ...process.env, NODE_PATH: join(root, "node_modules"), VISION_TEST_OUTPUT: output },
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} finally {
  if (dirname(output) !== resolve(tmpdir()) || !basename(output).startsWith("mi-rosario-vision-")) throw new Error("Directorio temporal inesperado.");
  await rm(output, { recursive: true, force: true });
}

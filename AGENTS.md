<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


<!-- BEGIN:mi-rosario-team-rules -->

## Arquitectura compartida de Mi Rosario

Antes de trabajar, leé explícitamente este archivo, las instrucciones anidadas que
correspondan, `openspec/config.yaml`, la proposal, el design, las tasks y las specs
del change elegido, y `docs/contracts.md` / `docs/development.md`. No supongas que
otro asistente ya los cargó. Conservá el bloque generado de Next.js de arriba (lo
regenera `next dev` y queda en inglés) y los flujos existentes de Codex y Claude;
si hay instrucciones en conflicto, informalo en lugar de reemplazarlas.

- Valen: IA en `feature/gemini-vision`. El análisis solo sugiere campos editables;
  nunca publica, ni registra confirmaciones, ni guarda fotos.
- Agus: backend/Supabase en `feature/reports-backend`. Es responsable de guardar
  los reportes, el Storage de originales, la presentación segura, los permisos, la
  idempotencia, la recuperación y la limpieza.
- Fran: interfaz/mapas en `feature/interface-map`. Consume los contratos y las APIs
  públicas; no importa clientes de proveedores, repositorios ni del servidor, ni
  escribe directamente en las tablas del producto.
- Los DTO compartidos, los validadores puros y los fixtures sintéticos están en
  `lib/contracts/`. Los cambios en esos límites necesitan la revisión de quienes
  los proveen y de quienes los consumen.
- Las categorías activas iniciales son exactamente `pothole`, `missing-light`,
  `damaged-sidewalk` y `faulty-traffic-light`. Conservá las etiquetas en español y
  los IDs existentes. Usá "falta de luz"; nunca infieras inseguridad. Una foto fija
  puede no demostrar cómo funciona un semáforo.
- La gravedad es `low | medium | high` (baja/media/alta). Gemini puede devolver
  null; el vecino revisa y corrige todos los campos y publica explícitamente con
  una foto original.
- El umbral ciudadano inicial es de 3 confirmaciones de cuentas autenticadas
  distintas que no sean el autor; el backend devuelve el umbral y el estado
  efectivos y es responsable de la transición atómica. Ni las confirmaciones ni la
  gravedad implican una verificación municipal.
- Las cuatro etapas son pending, citizen-verification, municipal-verification y
  resolved. Las operaciones institucionales reales quedan fuera del MVP. Las
  simulaciones aisladas llevan la etiqueta "Simulación - sin aval municipal"; nunca
  se afirma un aval oficial.
- Los límites del título y las decisiones de retención de fotos que no están
  aprobados se muestran claramente como provisorios. No se amplía el catálogo de
  incidentes ni el alcance institucional sin un change revisado.
- Esta base implementa contratos e instrucciones, no endpoints, llamadas a Gemini,
  migraciones, pantallas ni mapas. Eso requiere changes funcionales de OpenSpec
  aparte. Marcá una tarea como completa solo con la evidencia que pide, incluidas
  las revisiones de los compañeros.
- Usá `openspec.cmd` en PowerShell; si no lo encontrás, ubicalo con
  `npm.cmd config get prefix`. Primero proponer y revisar, después aplicar; nunca
  supongas que hay autorización para commit, push, merge o archive.
- Idioma: todo en español (interfaz, mensajes de commit, PRs, documentación,
  artefactos de OpenSpec y comentarios del código). Los identificadores del código
  y del contrato (variables, funciones, tipos, campos e IDs como `pothole`) se
  mantienen como están para no romper el contrato compartido.
- Enlazá los PRs con OpenSpec, incluí las dependencias y las verificaciones, y
  asigná un solo editor por PR para los archivos compartidos.
- Cada uno usa su propia cuenta de asistente. Nunca compartas ni commitees archivos
  de entorno privados, tokens, secretos de service-role o de proveedores, cachés de
  autenticación ni historiales privados.

Verificaciones locales: `npm.cmd run check:contracts`, `npm.cmd run lint`,
`npm.cmd exec -- tsc --noEmit --incremental false`,
`openspec.cmd validate establish-team-architecture --strict`, `git diff --check`.
Los fixtures de contrato no son evidencia de seguridad en ejecución, de atomicidad
en la base de datos ni de verificación oficial.

<!-- END:mi-rosario-team-rules -->

# Proposal

## Why

Fran, Agus y Valen trabajan juntos en la misma compu y ahora son responsables de toda la app, front y back. Las instrucciones compartidas todavía reparten módulos por persona: IA para Valen, backend para Agus, interfaz y mapas para Fran. Además piden la revisión del "proveedor" y del "consumidor" para cada cambio de límites. Esto hace que los asistentes pidan permiso o frenen por tocar archivos "de otro", y contradice cómo trabaja el equipo hoy.

## What Changes

- **`AGENTS.md`**, bloque `mi-rosario-team-rules`:
  - Se reemplaza la lista de responsables por módulo por un equipo de tres personas, responsables en conjunto de toda la app.
  - Las reglas de arquitectura que no dependen de una persona se conservan y se reescriben por capa. Por ejemplo: el código del navegador no importa clientes del servidor ni de proveedores, ni escribe directamente en las tablas; la IA solo sugiere.
  - La regla de revisión pasa a ser esta: Claude revisa el diff completo de cada PR (incluidos contratos, migraciones, RLS o políticas de Storage, el proxy y las instrucciones compartidas) y Fran autoriza el merge. No hace falta esperar a otra persona del equipo.
  - El bloque generado de Next.js no se toca.
- **`CLAUDE.md` y `GEMINI.md`**: se mantiene qué asistente usa cada persona (Fran con Claude, Agus con Gemini/Antigravity y, según `docs/development.md`, Valen con Codex). Se quita la responsabilidad por módulo y la frase que exige la revisión de proveedores y consumidores.
- **`docs/contracts.md`**:
  - Las columnas "Responsable" de la tabla del límite HTTP pasan a "Área".
  - La tabla "Ramas, PRs y próximos changes" describe las ramas por área, sin dueño.
  - Se actualizan las frases sobre quién revisa y quién prueba.
- **`docs/development.md`**: "Revisiones pendientes" deja de asignar revisiones por persona. Se mantiene la cuenta de asistente individual de cada uno.
- **READMEs de módulos** (`lib/reports/`, `lib/vision/`, `app/components/map/`, `app/components/reports/`): el título pasa de "Límite de X — Persona" a "Límite de X", y las menciones "de Agus" o "de Fran" pasan a referirse al área.
- **Spec `team-collaboration` del change en curso `establish-team-architecture`**: se editan los requisitos "Módulos con responsable y contratos comunes", "Evolución revisable del contrato", "Ramas y revisiones trazables" y "Acceso individual a asistentes y recursos" para que coincidan con lo anterior. Es una edición de un artefacto de planificación ajeno a este change; no cambia código.

No cambia:
- Las reglas de producto (catálogo, gravedad, umbral, etapas, "falta de luz").
- Las cuentas individuales y el manejo de secretos.
- La autorización del usuario para commit, push, merge, deploy y archive.
- Los nombres de las ramas existentes.

Fuera de alcance:
- Los documentos históricos de operación (`docs/report-form-vision-assist.md`, `docs/vision-vercel-*.md`, `lib/vision/README.md` línea 182) y los changes archivados. Registran quién hizo o revisó algo en su momento y se dejan como están.
- Los artefactos de `integrate-gemini-vision`.

## Capabilities

### New Capabilities
<!-- Ninguna. -->

### Modified Capabilities
<!-- Ninguna en openspec/specs. El change declara skip_specs: true porque solo cambia instrucciones y documentación. La spec team-collaboration vive en el change en curso establish-team-architecture y se edita como tarea (ver design.md). -->

## Impact

- Instrucciones de asistentes: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`. Se conservan `.claude/commands/opsx/`, `.claude/skills/` y `.agents/skills/`.
- Documentación: `docs/contracts.md`, `docs/development.md` y cuatro READMEs de módulos.
- OpenSpec: `openspec/changes/establish-team-architecture/specs/team-collaboration/spec.md`. Sus tareas 1.x quedan como están; dejan de tener sentido como "revisión de Agus/Fran" y se reconcilian cuando se archive o actualice ese change.
- Sin cambios en código, tests ni comportamiento de la app.

# Tasks

## 1. Instrucciones de asistentes

- [x] 1.1 En `AGENTS.md`, dentro del bloque `mi-rosario-team-rules`: reemplazar las tres viñetas de responsables por una que diga que Fran, Agus y Valen son responsables en conjunto de toda la app, con las áreas como orientación (interfaz y mapas, backend y Supabase, IA de visión). Reescribir por capa las reglas que dependían de una persona (decisión 2 del design) y cambiar la regla de revisión a "Claude revisa el diff completo y Fran autoriza el merge", también para contratos, migraciones/RLS/Storage, `proxy.ts` e instrucciones compartidas, conservando "un solo editor por PR". Verificar con `git diff AGENTS.md` que el bloque `nextjs-agent-rules` quedó idéntico y que `grep -n "Fran\|Agus\|Valen" AGENTS.md` solo devuelve la línea del equipo.
- [x] 1.2 En `CLAUDE.md` y `GEMINI.md`: conservar el título con la persona que usa ese asistente y la lista de lecturas; reemplazar el párrafo del módulo por "responsable, junto con el resto del equipo, de toda la app" y la frase de revisión cruzada por la regla nueva; conservar las reglas de autenticación, secretos y límites entre planificar y aplicar. Verificar releyendo ambos archivos y con `grep -n "revisión de quienes" CLAUDE.md GEMINI.md`, que no tiene que devolver nada.

## 2. Documentación

- [x] 2.1 En `docs/contracts.md`: la línea 3 pasa a ser trabajo por áreas del equipo; las líneas 22 y 62 dejan de pedir revisiones por persona; las columnas "Responsable" de la tabla HTTP y "Responsable / rama" pasan a "Área" y "Área / rama"; las líneas 158-162 describen las reglas de PR y las pruebas en ejecución por área. Verificar con `grep -n "Fran\|Agus\|Valen" docs/contracts.md`, que solo puede devolver menciones históricas justificadas, y con `git diff --check`.
- [x] 2.2 En `docs/development.md`: conservar la línea 23 (cuenta de asistente de cada uno) y reescribir "Revisiones pendientes" (líneas 40-41) sin asignar revisiones por persona: cada persona demuestra que su asistente lee las instrucciones compartidas, y los DTO/fixtures los revisa al menos otra persona antes de integrar. Verificar releyendo la sección.
- [x] 2.3 En los READMEs de `lib/reports/`, `lib/vision/`, `app/components/map/` y `app/components/reports/`: sacar "— Persona" del título y cambiar "PR #6 de Agus" por "PR #6 del backend". No tocar `lib/vision/README.md:182` (registro histórico). Verificar con `grep -n "^# " lib/reports/README.md lib/vision/README.md app/components/map/README.md app/components/reports/README.md`.

## 3. Spec del change en curso

- [x] 3.1 En `openspec/changes/establish-team-architecture/specs/team-collaboration/spec.md`, reescribir los requisitos "Módulos con responsable y contratos comunes", "Evolución revisable del contrato", "Ramas y revisiones trazables" y "Acceso individual a asistentes y recursos" según la decisión 4, conservando sus encabezados y el formato WHEN/THEN. No tocar `tasks.md` ni `design.md` de ese change. Verificar con `openspec validate establish-team-architecture --strict`.

## 4. Verificación integral

- [x] 4.1 Correr `npm run check:contracts`, `npm run lint`, `npx tsc --noEmit --incremental false`, `openspec validate update-team-ownership --strict`, `openspec validate establish-team-architecture --strict` y `git diff --check`; todas tienen que pasar. Correr `grep -rn "Fran\|Agus\|Valen" AGENTS.md CLAUDE.md GEMINI.md docs/contracts.md docs/development.md lib/*/README.md app/components/*/README.md` y justificar cada resultado que quede en el resumen del PR.
- [x] 4.2 Que Claude revise el diff completo del PR, según la regla nueva, y que Fran autorice el merge; registrar la revisión en el PR.

## Workflow follow-up

- Commit, push y PR solo con autorización de Fran, como rissooo.
- Cada persona abre una sesión nueva de su asistente después del merge.
- Archivar después de la revisión.

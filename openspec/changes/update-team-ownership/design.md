# Design

## Context

Ver proposal.md (Why). Estado observado en `main` (`baa2aab`):

- `AGENTS.md`, bloque `mi-rosario-team-rules`: tres viñetas de responsables por persona y rama, "Los cambios en esos límites necesitan la revisión de quienes los proveen y de quienes los consumen", "asigná un solo editor por PR para los archivos compartidos". El bloque `nextjs-agent-rules` lo regenera `next dev` y queda en inglés.
- `CLAUDE.md` ("— Fran", interfaz/mapas en `feature/interface-map`) y `GEMINI.md` ("— Agus", backend/Supabase en `feature/reports-backend`): punto de entrada por asistente, con módulo asignado y regla de revisión cruzada.
- `docs/contracts.md`:
  - Línea 3: "trabajo independiente de Valen (IA), Agus (backend) y Fran (frontend)".
  - Línea 22: revisiones de Agus y Fran pendientes.
  - Línea 62: "pendiente de revisión de Agus y Valen".
  - Tabla del límite HTTP con columna "Responsable".
  - Tabla "Ramas, PRs y próximos changes" con columna "Responsable / rama".
  - Líneas 158-162: reglas de PR y "Más adelante, Agus tiene que probar…".
- `docs/development.md` líneas 23 y 40-41: cuentas de asistente por persona (se mantienen) y revisiones por persona (cambian).
- Los READMEs de módulos se titulan "Límite de … — Persona". `app/components/reports/README.md:36` dice "PR #6 de Agus".
- La spec `team-collaboration` de `establish-team-architecture` (change sin archivar) define la división por persona en cuatro requisitos.
- La memoria de esta sesión ya registra que los tres trabajan en la misma compu, sin permisos por módulo.

## Goals / Non-Goals

**Goals:**
- Que ningún asistente frene o pida permiso por tocar un archivo de "otra persona".
- Que se mantengan las garantías que sí importan: revisión de los límites compartidos, autorización del usuario y separación de capas.

**Non-Goals:**
- Reescribir el historial: los changes archivados y los documentos de operación con fecha conservan los nombres.
- Cambiar qué asistente o qué cuenta usa cada persona.

## Decisions

### 1. Áreas en lugar de dueños

Las ramas `feature/interface-map`, `feature/reports-backend` y `feature/gemini-vision` siguen existiendo. Se describen como áreas (interfaz y mapas, backend y Supabase, IA de visión) en las que cualquiera de los tres puede trabajar. Así no se rompen PRs, enlaces ni referencias.

Alternativa descartada: borrar toda mención de áreas. Se pierde la orientación sobre dónde vive cada cosa.

### 2. Las reglas de arquitectura se conservan, reescritas por capa

"Fran no importa clientes de proveedores ni del servidor…" no es una regla sobre Fran: es una regla del código del navegador. Se reescribe como "El código del navegador (`app/components/`) consume los contratos y las APIs públicas; no importa repositorios, clientes del servidor ni de proveedores, ni escribe directamente en las tablas". Lo mismo con "la IA solo sugiere" y "el backend es responsable de la transición atómica".

Alternativa descartada: borrarlas junto con los nombres. Se perdería una garantía de seguridad real.

### 3. Regla de revisión: otra persona del equipo

Elegida por el usuario. Un PR que toca `lib/contracts/`, `supabase/migrations/`, RLS o políticas de Storage, `proxy.ts` o las instrucciones compartidas (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) necesita la revisión de al menos otra persona del equipo, sin importar el área. Se mantiene "un solo editor por PR para archivos compartidos", que evita pisarse cuando trabajan en paralelo en la misma compu. Esta regla no reemplaza la autorización explícita del usuario para commit, push, merge, deploy y archive.

Alternativas descartadas por el usuario: no exigir revisión, o mantenerla entre proveedor y consumidor por área.

### 4. Cómo se edita la spec de `establish-team-architecture`

La spec `team-collaboration` no existe en `openspec/specs`, solo como delta "ADDED" de un change abierto. Este change:
- No puede llevar un "MODIFIED" sobre una spec que no existe.
- No debe llevar un "ADDED" de la misma capability, porque chocaría al archivar `establish-team-architecture`.

Por eso este change declara `skip_specs: true` y edita directamente el archivo de spec de ese change, como tarea con su propia verificación (`openspec validate establish-team-architecture --strict`). Es lo que hace `/opsx:update` sobre un change. Se reescriben los cuatro requisitos afectados, conservando sus encabezados para no romper referencias:
- "Módulos con responsable y contratos comunes": áreas y equipo conjunto; los escenarios hablan del área, no de la persona.
- "Evolución revisable del contrato": la revisión la hace al menos otra persona del equipo.
- "Ramas y revisiones trazables": ramas por área y revisión de otra persona en los PRs de límites.
- "Acceso individual a asistentes y recursos": "Cada persona del equipo usa su propia autenticación…", en lugar de solo Agus.

Las tareas de `establish-team-architecture/tasks.md` no se editan: describen trabajo y evidencia de ese change y se reconcilian cuando se lo cierre.

### 5. Conflictos de instrucciones

`CLAUDE.md` y `AGENTS.md` dicen "Informá las instrucciones en conflicto; no las reemplaces". Este change las reemplaza con autorización explícita del usuario y a través de un change revisado, que es lo que esas reglas buscan evitar que pase en silencio. Se conserva la regla misma para el futuro.

## Risks / Trade-offs

- [Un asistente con contexto viejo sigue la regla anterior] → Los puntos de entrada piden leer `AGENTS.md` explícitamente en cada sesión. La memoria de Claude ya está alineada.
- [Revisión "de otra persona" sin trazabilidad] → Los PRs de límites dicen quién revisó, igual que antes.
- [Texto residual con nombres en docs históricos] → Fuera de alcance a propósito. Un grep en la verificación lista lo que queda para que sea una decisión consciente.

## Migration Plan

Mergear el PR. Cada persona abre una sesión nueva de su asistente para que lea las instrucciones actualizadas. Rollback: revertir el commit.

# Proposal

## Why

El backend de reportes ya está en `main` y sus migraciones están aplicadas en el Supabase de producción, pero la interfaz sigue usando fuentes falsas: el mapa muestra reportes de ejemplo, publicar guarda en memoria y las fotos apuntan a `example.invalid`. Para que los vecinos usen la app de verdad, el mapa, el formulario y las confirmaciones tienen que hablar con la API real.

## What Changes

- Las tres fuentes de la interfaz pasan a llamar a la API del contrato:
  - `app/components/map/report-source.ts`: `GET /api/reports` (bbox y cursor);
  - `app/components/reports/report-publisher.ts`: `POST /api/reports` multipart (`report` en JSON, `image` y `Idempotency-Key`);
  - `app/components/reports/confirmation-source.ts`: `GET /api/reports/{id}/confirmations/me` y `POST /api/reports/{id}/confirmations`, sin caché.
- Cada respuesta exitosa se valida con los validadores de `lib/contracts/`; una respuesta que no cumple el contrato se muestra como falla temporal.
- Los errores del servidor se muestran con su mensaje en español: sesión (401), otro origen (403), publicación en curso (409), foto o datos inválidos (413, 415, 422), cuota (429) y Storage caído (503). El borrador y la clave de idempotencia se conservan para reintentar.
- El modo de ejemplo queda detrás de `NEXT_PUBLIC_REPORTS_SAMPLE_MODE=1`, para desarrollar o probar sin backend. Sin esa variable se usa la API real y no se muestra el aviso de "datos de ejemplo" ni `?simular=`.

Fuera de alcance: la página de inicio, la moderación, la IA y cambios en el backend o en los contratos.

## Capabilities

### New Capabilities
<!-- Ninguna. -->

### Modified Capabilities
- `report-map`: el mapa y el detalle usan reportes reales de la API.
- `report-form`: la publicación usa `POST /api/reports`.
- `report-confirmations`: las confirmaciones usan la API real.

## Impact

- Código: las tres fuentes, sus tests y `app/components/reports/README.md`.
- Sin cambios en `lib/contracts/`, el backend, las migraciones ni `package.json`.
- Variable nueva opcional: `NEXT_PUBLIC_REPORTS_SAMPLE_MODE` (solo para desarrollo). En Vercel no se carga.
- Las pruebas en local y en las previews escriben en el Supabase de producción (decisión del equipo): usar reportes identificables y borrarlos después.

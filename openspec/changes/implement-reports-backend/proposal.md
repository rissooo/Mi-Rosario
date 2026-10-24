# Propuesta

## Motivo

El proyecto ya comparte contratos y validadores para reportes, pero necesita persistencia segura, publicación recuperable, un catálogo público y confirmaciones ciudadanas atómicas. El backend se mantiene dentro de su módulo y no modifica los contratos compartidos.

## Cambios

- Crear cinco migraciones ordenadas para reportes MVP, direcciones, confirmaciones, idempotencia, cuotas configurables y Storage privado/público.
- Publicar reportes por RPC transaccional con un `report_id` reservado, clave idempotente y límites de tres claims activos y diez reportes por usuario cada 24 horas.
- Guardar la original recibida en un bucket privado y una copia saneada sin metadatos en un bucket público; limitar cada imagen a 4 MiB.
- Implementar endpoints multipart, lista, detalle y confirmaciones, con límites de carga, validación de respuestas y mensajes sin datos internos.
- Preparar evidencia unitaria y estática, más integración para un proyecto de pruebas en la nube. Las migraciones y la integración aún no se probaron contra una base.
- Devolver `Photo.expiresAt` en `null` para la copia pública, que no vence, y responder las cuotas con `RATE_LIMITED` (429), según el contrato ajustado en `adjust-photo-expiry-and-rate-limit` (PR #18).

## Dependencias y orden de integración

- El PR #3 de Fran (`add-report-address`) ya está integrado en `main`; el backend consume `Location.address` directamente.
- El PR de `feature/reports-backend` depende de ese contrato ya mergeado y debe integrarse después de las revisiones del equipo.
- El contrato nullable de `Photo.expiresAt` y el código `RATE_LIMITED` llegaron en el PR #18 (`adjust-photo-expiry-and-rate-limit`); este backend los consume desde la rama `fix/backend-contrato-fotos-cuotas`.

## Capacidades

### Capacidades nuevas

- `reports-backend`: publicación autenticada, almacenamiento y presentación segura de fotos, idempotencia, cuotas, catálogo público, confirmaciones y controles de base de datos.

### Capacidades modificadas

- Ninguna.

## Impacto

- Código y pruebas bajo `lib/reports/`, `app/api/reports/`, `tests/`, `scripts/` y cinco migraciones de Supabase.
- Se consumen `lib/contracts/` y `utils/supabase/` sin modificarlos ni agregar dependencias.
- Fran debe conectar el formulario existente al multipart acordado; el formulario actual publica en memoria.
- Las fotos públicas son copias derivadas; las originales permanecen privadas. Moderación, retención y limpieza de huérfanas quedan fuera del MVP.

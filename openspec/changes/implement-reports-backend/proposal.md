# Propuesta

## Motivo

La base compartida define los contratos y validadores, pero todavía falta una persistencia de reportes segura, recuperable y verificable. Este cambio completa la publicación, la presentación pública de fotos saneadas, las confirmaciones ciudadanas y las lecturas públicas sin exponer identidad ni datos internos.

## Cambios

- Crear el esquema y las migraciones de Supabase para reportes MVP, direcciones, confirmaciones, idempotencia, almacenamiento privado de originales y copias públicas sin metadatos.
- Publicar reportes mediante una RPC transaccional que consume el `report_id` reservado por la clave de idempotencia; agregar una RPC para marcar fallas definitivas.
- Restringir el catálogo público a `pending` y `citizen-verification`, y exponer solo una proyección segura con dirección, conteo/umbral de confirmaciones y ruta de la foto pública.
- Implementar endpoints de publicación, lista, detalle y confirmaciones siguiendo los contratos compartidos, con reintentos recuperables y sin secretos de servicio. La falta de `Photo.expiresAt` en lista y detalle queda como incumplimiento conocido hasta un PR separado del contrato.
- Preparar pruebas unitarias y estáticas, además de un script de integración para un proyecto de pruebas en la nube; ejecutar autorización, políticas, atomicidad y concurrencia allí, nunca contra producción.

## Dependencias y orden de integración

- Depende del PR #3 de Fran (`add-report-address`), ya integrado a `main`; el backend consume directamente `Location.address` desde el contrato compartido.
- El orden acordado es PR #3 primero y PR `feature/reports-backend` después de las revisiones. Esta rama no modifica `lib/contracts/` ni `docs/contracts.md`.

## Capacidades

### Capacidades nuevas

- `reports-backend`: publicación autenticada, almacenamiento y presentación segura de fotos, idempotencia, catálogo público, confirmaciones y controles de base de datos.

### Capacidades modificadas

- Ninguna.

## Impacto

- Código en `lib/reports/`, `app/api/reports/` y migraciones de Supabase.
- Endpoints existentes `/api/reports`, `/api/reports/{id}` y rutas de confirmación.
- La propuesta consume `lib/contracts/` y `utils/supabase/` sin modificarlos ni agregar dependencias.
- Las copias públicas de fotos son derivadas sin metadatos; las originales permanecen en un bucket privado. La política de retención todavía es provisoria.

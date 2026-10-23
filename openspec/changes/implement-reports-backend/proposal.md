# Propuesta

## Motivo

La base compartida define los contratos y validadores, pero todavía falta una persistencia de reportes segura, recuperable y verificable. Este cambio completa la publicación, la presentación pública de fotos saneadas, las confirmaciones ciudadanas y las lecturas públicas sin exponer identidad ni datos internos.

## Cambios

- Crear el esquema y las migraciones de Supabase para reportes MVP, direcciones, confirmaciones, idempotencia, almacenamiento privado de originales y copias públicas sin metadatos.
- Publicar reportes mediante una RPC transaccional que consume el `report_id` reservado por la clave de idempotencia; agregar una RPC para marcar fallas definitivas.
- Restringir el catálogo público a `pending` y `citizen-verification`, y exponer solo una proyección segura con dirección, conteo/umbral de confirmaciones y ruta de la foto pública.
- Implementar endpoints de publicación, lista, detalle y confirmaciones con DTOs compatibles con los contratos compartidos, reintentos recuperables y sin secretos de servicio.
- Probar autorización, políticas, atomicidad y concurrencia en el proyecto Supabase de pruebas `rsvtchefnydihokivaqg`; no ejecutar verificaciones contra producción.

## Dependencias y orden de integración

- Depende del PR #3 de Fran (`add-report-address`), abierto y sin mergear al iniciar este trabajo. El backend puede avanzar con un adaptador local de dirección, sin modificar `lib/contracts/`.
- Integrar primero el PR #3 a `main`; después actualizar únicamente el adaptador local para usar el contrato compartido y recién entonces integrar el PR del backend. Si el PR #3 cambia, revisar los límites antes de integrar.

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

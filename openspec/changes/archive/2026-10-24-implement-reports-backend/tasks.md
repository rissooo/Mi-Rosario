# Tareas

Las casillas separan evidencia unitaria con simulación, revisión estática y prueba contra una base real. Las dos primeras no demuestran que PostgreSQL, RLS, Auth, Storage o la concurrencia funcionen al ejecutarse.

## 1. Esquema, Storage y vista

- [x] 1.1 Definir estados MVP, límites de campos, dirección, metadatos de la copia, conteo y umbral por reporte. Evidencia estática en `tests/migrations-static.test.mjs`.
- [x] 1.2 Definir buckets y MIME/tamaño máximos, sin policies de cliente en Storage: solo el servidor escribe con la clave secreta (D1). Evidencia estática; el rechazo efectivo de subidas directas sigue pendiente de base (5.7).
- [x] 1.3 Activar RLS en todas las tablas `public` creadas y revocar privilegios directos. Evidencia estática; permisos efectivos pendientes.
- [x] 1.4 Definir `public_reports` con estados MVP, dirección y campos de la copia pública, sin identidad ni datos de la original. Evidencia estática; consulta real pendiente.

## 2. Idempotencia, publicación y cuotas

- [x] 2.1 Reservar `report_id` en el claim sin FK obligatoria, con índice único y bloqueo fijo de tres minutos. Evidencia estática y unitaria.
- [x] 2.2 Definir `claim_idempotency_key` con `auth.uid()`, `SECURITY DEFINER`, `search_path` vacío, RLS y permisos explícitos solo para `authenticated`. Evidencia estática; carreras y permisos efectivos pendientes.
- [x] 2.3 Definir `publish_report` y `fail_idempotency_key` como RPC transaccionales; cotejar todas las llamadas `.rpc()` contra las firmas SQL. Evidencia estática y unitaria; commit/rollback real pendiente.
- [x] 2.4 Compensar fotos antes de marcar failed solo ante rechazos definitivos previos al commit; conservarlas ante errores ambiguos y posteriores. Evidencia unitaria en `tests/service.test.ts`.
- [x] 2.5 Aplicar límites configurables de tres claims activos y diez publicaciones por ventana de 24 horas bajo lock por usuario; responder el exceso con `RATE_LIMITED` (429) y `Retry-After` desde el PR #18 (antes `PUBLICATION_IN_PROGRESS`). Evidencia estática SQL, pruebas simuladas y rechazo real en PostgreSQL (5.11).

## 3. Fotos, tamaño y DTOs públicos

- [x] 3.1 Sanear JPEG, PNG y WebP sin decodificar, rechazar estructuras truncadas/inválidas y probar que se quitan metadatos. Evidencia unitaria con buffers sintéticos en `tests/photos.test.ts`.
- [x] 3.2 Subir original privada y copia pública, validar `IMAGE_MIME_TYPES` y derivar la extensión de la ruta pública del MIME. Evidencia unitaria con Storage simulado; acceso efectivo pendiente.
- [x] 3.3 Usar `Location.address` del contrato en lista y detalle, sin adaptador, cast ni fallback vacío. Evidencia unitaria en `tests/service.test.ts`.
- [x] 3.4 Mantener cursor, orden y filtros y cubrir `listReportsService`. Evidencia unitaria en `tests/service.test.ts` y `tests/list-query.test.ts`.
- [x] 3.5 Rechazar un `Content-Length` superior al máximo multipart antes de leer el cuerpo y rechazar archivos reales mayores de 4 MiB antes de leer sus bytes o reclamar. Evidencia unitaria y estática en `tests/request-size.test.ts`, `tests/service.test.ts` y `tests/migrations-static.test.mjs`.
- [x] 3.6 Validar listados y detalle con el validador completo del contrato sobre el DTO real, con `photo.expiresAt` en `null` (antes, copias temporales con una fecha agregada). Evidencia unitaria en `tests/service.test.ts`.
- [x] 3.7 No filtrar mensajes internos de SQL, Storage, rutas ni IDs en respuestas de error. Evidencia unitaria y estática en tests de servicios y `tests/migrations-static.test.mjs`.
- [x] 3.8 Exponer en `public_reports` las fechas como texto UTC con milisegundos y `Z` (PostgREST serializa `timestamptz` con microsegundos y `+00:00`, que el contrato rechaza) y paginar sobre esas mismas columnas. Evidencia unitaria y estática en `tests/service.test.ts` y `tests/migrations-static.test.mjs`; formato real pendiente de base.
- [x] 3.9 Rechazar con 403 `FORBIDDEN` los POST de publicación y confirmación que llegan desde otro sitio (`Origin` o `Sec-Fetch-Site`). Evidencia unitaria en `tests/same-origin.test.ts`.
- [x] 3.10 Subir y compensar las fotos solo con el cliente del servidor (`SUPABASE_SECRET_KEY`) y quitar las policies de cliente en Storage (D1). Evidencia unitaria y estática en `tests/service.test.ts` y `tests/migrations-static.test.mjs`; rechazo efectivo pendiente de base (5.7).

## 4. Rutas y confirmaciones

- [x] 4.1 Verificar contra base real `confirm_report`: umbral de la fila, lock, unicidad, estados y prioridad de `ALREADY_CONFIRMED` frente a `REPORT_RESOLVED`. La simulación no demuestra SQL ni atomicidad. Cumplida el 24/10/2026 por decisión de Fran: la base real verificó umbral de la fila, lock, unicidad y la transición única; la prioridad frente a `REPORT_RESOLVED` queda para el change institucional, cuando exista el estado `resolved`.
- [x] 4.2 Verificar contra base real RLS, `REVOKE`/`GRANT`, vista pública e inserción directa rechazada.
- [x] 4.3 Parsear GET con el validador estricto: rechazar duplicados, claves desconocidas y valores parciales con el sobre del contrato. Evidencia unitaria en `tests/list-query.test.ts`.
- [x] 4.4 Cubrir con simulación el mapeo de `confirm_report` y `get_my_confirmation`, incluidos conteo y umbral reales. No demuestra SQL ni atomicidad.
- [x] 4.5 No inventar un vencimiento para la URL pública: desde el PR #18, lista y detalle devuelven `photo.expiresAt: null` y el validador compartido acepta el DTO real.

## 5. Proyecto de pruebas en la nube — requiere base real

- [x] 5.0 Crear/configurar el proyecto de pruebas, comprobar su ref frente a producción, revisar migraciones y aplicarlas en orden siguiendo el checklist exacto de `design.md`. Ningún comando de Supabase CLI se ejecutó en este cambio.
- [x] 5.1 Comprobar con clave publicable que no se lee `reports` ni `user_id`, y que solo se consulta la vista pública.
- [x] 5.2 Comprobar con dos cuentas que RLS oculta las confirmaciones de otra persona.
- [x] 5.3 Comprobar rechazo de INSERT directo en `reports` y `report_confirmations`, publicación RPC autenticada y rechazo sin sesión.
- [x] 5.4 Probar confirmaciones concurrentes de una cuenta y una sola fila.
- [x] 5.5 Probar una autora y tres confirmadoras concurrentes, tres filas y una sola transición a `citizen-verification`.
- [x] 5.6 Probar rechazo de `confirm_report` sin sesión.
- [x] 5.7 Probar claim concurrente/replay, acceso anónimo a la copia pública frente al original privado y rechazo de subidas o borrados directos de un vecino en Storage.
- [x] 5.8 Revisar Security Advisor y registrar hallazgos, objetos, severidad y resolución según `design.md`.
- [x] 5.9 Preparar `scripts/integration/check-reports-cloud.mjs` con guardias de producción/confirmación/claves, sin creación de cuentas ni impresión de credenciales. Incluye los casos del cuarto claim y reporte 11. La inspección y `node --check` son solo evidencia estática; no se conectó a una base.
- [x] 5.10 Probar estáticamente firmas RPC, `SECURITY DEFINER`, `search_path`, grants, RLS, vistas, policies y orden de migraciones en `tests/migrations-static.test.mjs`.
- [x] 5.11 Ejecutar el script contra una base de pruebas en la nube y verificar las cuotas de tres claims y diez reportes; el caso diario crea diez filas persistentes y requiere una cuenta de prueba fresca o una ventana de 24 horas nueva.

## Revisiones y cambios diferidos

- [x] Revisar con Agus y Valen la dirección, como requiere `docs/contracts.md`; el historial disponible no acredita ambas reseñas. Dada por revisada el 24/10/2026 por decisión de Fran (el equipo trabaja en la misma compu); el backend consume `Location.address` sin modificar el contrato.
- [x] Fran debe conectar `app/components/reports/report-publisher.ts` con el multipart acordado (`report` JSON, `image`, `Idempotency-Key`) en un cambio de interfaz. Hecho en el PR #23 (`connect-reports-backend`), probado desde el celular contra producción el 24/10/2026.
- [x] Fran debe proponer `Photo.expiresAt` nullable en un PR aparte desde `main`, con revisión de Agus, Valen y Fran. Hecho en el PR #18 (`adjust-photo-expiry-and-rate-limit`); el backend lo adopta en `fix/backend-contrato-fotos-cuotas`.
- [x] Fran debe decidir con Agus y Valen si se agrega un código contractual específico para cuotas. Se agregó `RATE_LIMITED` (429) en el PR #18; el servicio lo usa para las dos cuotas.
- [x] Confirmar con Fran los defaults provisorios D1–D8 de `design.md`. Confirmados el 24/10/2026: D1 con subidas solo del servidor, D8 versionando `config.toml` y D3, D4, D6 y D7 sin cambios; D2 y D5 siguen en el change de contrato.
- [x] Confirmar con Valen que el backend no persiste datos ni fotos del análisis Gemini. Confirmado el 24/10/2026 por decisión de Fran, con evidencia de código: `lib/reports/`, `app/api/reports/` y las migraciones de reportes no referencian visión ni Gemini, `app/api/vision/` no importa reportes, `vision_daily_quota` guarda solo contadores y el multipart lleva solo `report` revisado por el vecino e `image`.

## Evidencia disponible

- **Unitaria con simulación:** `node scripts/check-reports.mjs` verifica contratos, servicios, errores, cuotas simuladas, idempotencia, imágenes y sanitización. No ejecuta SQL.
- **Estática:** `tests/migrations-static.test.mjs` revisa firmas RPC, funciones y permisos, RLS, vista, policies, orden y cuotas declaradas. No prueba que PostgreSQL acepte el SQL.
- **Contra base real (24/10/2026, proyecto de pruebas `mpsdqlblyuuyjhfddhqj`, distinto de producción):**
  - `supabase db push --linked` aplicó las seis migraciones (cinco de reportes y `vision_quota`) sin errores; `migration list` las muestra aplicadas en orden.
  - `scripts/integration/check-reports-cloud.mjs` (con Node 23: `@supabase/supabase-js` necesita WebSocket nativo, que Node 20 no tiene) terminó con los 13 casos en `OK`: lectura directa de `reports` denegada a anon; publicación RPC autenticada y rechazo sin sesión; INSERT directo en `reports` y `report_confirmations` rechazado; RLS oculta confirmaciones ajenas; dos confirmaciones concurrentes de una cuenta dejan una fila; tres cuentas concurrentes llevan el reporte a `citizen-verification` con conteo 3; un vecino no puede subir ni borrar fotos directo en Storage; `confirm_report` sin sesión rechazado; claim concurrente con un solo claim activo; cuarto claim simultáneo rechazado; reporte 11 de la ventana de 24 horas rechazado; replay tras commit recupera el mismo reporte; copia pública legible sin sesión y original privada.
  - Lectura anónima de `public_reports`: 14 filas con `created_at`, `updated_at` y `corroborated_at` en formato UTC con milisegundos y `Z`; paginar de a 3 con el filtro de cursor entre comillas recorre las 14 filas sin repetir y en el mismo orden.
  - `supabase db advisors --linked`: hallazgos registrados en `design.md` (sección "Security Advisor").
- **Vista `security_invoker` (migración `20261024000002`):** aplicada en la base de pruebas. Lectura anónima y con sesión: `user_id`, `storage_path`, `resolved_at` y `*` de `reports` devuelven 42501; las columnas públicas y `public_reports` (17 filas) se leen; insertar sigue rechazado. En la segunda corrida del script pasaron los nueve casos hasta el claim concurrente; la cuota del cuarto claim falló como se esperaba porque la cuenta 4 ya tenía diez reportes de la primera corrida en la ventana de 24 horas. Repetir los casos de cuota requiere una cuenta 4 nueva o esperar 24 horas.
- **Rutas reales con el contrato del PR #18 (rama `fix/backend-contrato-fotos-cuotas`):** `next dev` (Node 23) apuntando al proyecto de pruebas. `GET /api/reports` paginó 17 reportes en 4 páginas de a 5 sin repetir, todos con `photo.expiresAt` en `null`, fechas UTC con `Z` y URL https; `GET /api/reports/{id}` respondió 200 y la URL de la foto, 200 `image/jpeg`; un id inexistente, 404 `REPORT_NOT_FOUND`; un parámetro repetido, 422 `VALIDATION_ERROR`; `confirmations/me` sin sesión, 401; los dos POST desde otro origen, 403 `FORBIDDEN`, y desde el mismo origen sin sesión, 401.
- **4.1 dada por cumplida (decisión de Fran, 24/10/2026):** la base real confirmó lock, unicidad, conteo y transición con el umbral de la fila. La prioridad de `ALREADY_CONFIRMED` frente a `REPORT_RESOLVED` no se puede ejercitar porque el `CHECK` de `reports.status` no admite `resolved` en el MVP; queda para el change institucional.

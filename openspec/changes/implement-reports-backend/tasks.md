# Tareas

Las casillas separan evidencia unitaria con simulación, revisión estática y prueba contra una base real. Las dos primeras no demuestran que PostgreSQL, RLS, Auth, Storage o la concurrencia funcionen al ejecutarse.

## 1. Esquema, Storage y vista

- [x] 1.1 Definir estados MVP, límites de campos, dirección, metadatos de la copia, conteo y umbral por reporte. Evidencia estática en `tests/migrations-static.test.mjs`.
- [x] 1.2 Definir buckets, MIME/tamaño máximos y policies de Storage ligadas a helpers que exigen claim activo del mismo usuario. Evidencia estática; la policy efectiva sigue pendiente de base.
- [x] 1.3 Activar RLS en todas las tablas `public` creadas y revocar privilegios directos. Evidencia estática; permisos efectivos pendientes.
- [x] 1.4 Definir `public_reports` con estados MVP, dirección y campos de la copia pública, sin identidad ni datos de la original. Evidencia estática; consulta real pendiente.

## 2. Idempotencia, publicación y cuotas

- [x] 2.1 Reservar `report_id` en el claim sin FK obligatoria, con índice único y bloqueo fijo de tres minutos. Evidencia estática y unitaria.
- [x] 2.2 Definir `claim_idempotency_key` con `auth.uid()`, `SECURITY DEFINER`, `search_path` vacío, RLS y permisos explícitos solo para `authenticated`. Evidencia estática; carreras y permisos efectivos pendientes.
- [x] 2.3 Definir `publish_report` y `fail_idempotency_key` como RPC transaccionales; cotejar todas las llamadas `.rpc()` contra las firmas SQL. Evidencia estática y unitaria; commit/rollback real pendiente.
- [x] 2.4 Compensar fotos antes de marcar failed solo ante rechazos definitivos previos al commit; conservarlas ante errores ambiguos y posteriores. Evidencia unitaria en `tests/service.test.ts`.
- [x] 2.5 Aplicar límites configurables de tres claims activos y diez publicaciones por ventana de 24 horas bajo lock por usuario; mapear el exceso al código existente `PUBLICATION_IN_PROGRESS` (409). Evidencia estática SQL y pruebas simuladas; rechazo en PostgreSQL pendiente.

## 3. Fotos, tamaño y DTOs públicos

- [x] 3.1 Sanear JPEG, PNG y WebP sin decodificar, rechazar estructuras truncadas/inválidas y probar que se quitan metadatos. Evidencia unitaria con buffers sintéticos en `tests/photos.test.ts`.
- [x] 3.2 Subir original privada y copia pública, validar `IMAGE_MIME_TYPES` y derivar la extensión de la ruta pública del MIME. Evidencia unitaria con Storage simulado; acceso efectivo pendiente.
- [x] 3.3 Usar `Location.address` del contrato en lista y detalle, sin adaptador, cast ni fallback vacío. Evidencia unitaria en `tests/service.test.ts`.
- [x] 3.4 Mantener cursor, orden y filtros y cubrir `listReportsService`. Evidencia unitaria en `tests/service.test.ts` y `tests/list-query.test.ts`.
- [x] 3.5 Rechazar un `Content-Length` superior al máximo multipart antes de leer el cuerpo y rechazar archivos reales mayores de 4 MiB antes de leer sus bytes o reclamar. Evidencia unitaria y estática en `tests/request-size.test.ts`, `tests/service.test.ts` y `tests/migrations-static.test.mjs`.
- [x] 3.6 Validar listados y detalle con validadores del contrato sobre copias temporales que agregan una fecha solo para la comprobación; mantener el DTO real sin `expiresAt` y los tests que muestran su rechazo contractual. Evidencia unitaria en `tests/service.test.ts`.
- [x] 3.7 No filtrar mensajes internos de SQL, Storage, rutas ni IDs en respuestas de error. Evidencia unitaria y estática en tests de servicios y `tests/migrations-static.test.mjs`.

## 4. Rutas y confirmaciones

- [ ] 4.1 Verificar contra base real `confirm_report`: umbral de la fila, lock, unicidad, estados y prioridad de `ALREADY_CONFIRMED` frente a `REPORT_RESOLVED`. La simulación no demuestra SQL ni atomicidad.
- [ ] 4.2 Verificar contra base real RLS, `REVOKE`/`GRANT`, vista pública e inserción directa rechazada.
- [x] 4.3 Parsear GET con el validador estricto: rechazar duplicados, claves desconocidas y valores parciales con el sobre del contrato. Evidencia unitaria en `tests/list-query.test.ts`.
- [x] 4.4 Cubrir con simulación el mapeo de `confirm_report` y `get_my_confirmation`, incluidos conteo y umbral reales. No demuestra SQL ni atomicidad.
- [x] 4.5 Mantener visible la desviación de `Photo.expiresAt`: lista/detalle omiten el campo y el validador compartido rechaza el DTO real. No se inventa fecha ni se cambia el contrato.

## 5. Proyecto de pruebas en la nube — requiere base real

- [ ] 5.0 Crear/configurar el proyecto de pruebas, comprobar su ref frente a producción, revisar migraciones y aplicarlas en orden siguiendo el checklist exacto de `design.md`. Ningún comando de Supabase CLI se ejecutó en este cambio.
- [ ] 5.1 Comprobar con clave publicable que no se lee `reports` ni `user_id`, y que solo se consulta la vista pública.
- [ ] 5.2 Comprobar con dos cuentas que RLS oculta las confirmaciones de otra persona.
- [ ] 5.3 Comprobar rechazo de INSERT directo en `reports` y `report_confirmations`, publicación RPC autenticada y rechazo sin sesión.
- [ ] 5.4 Probar confirmaciones concurrentes de una cuenta y una sola fila.
- [ ] 5.5 Probar una autora y tres confirmadoras concurrentes, tres filas y una sola transición a `citizen-verification`.
- [ ] 5.6 Probar rechazo de `confirm_report` sin sesión.
- [ ] 5.7 Probar claim concurrente/replay y acceso anónimo a la copia pública frente al original privado.
- [ ] 5.8 Revisar Security Advisor y registrar hallazgos, objetos, severidad y resolución según `design.md`.
- [x] 5.9 Preparar `scripts/integration/check-reports-cloud.mjs` con guardias de producción/confirmación/claves, sin creación de cuentas ni impresión de credenciales. Incluye los casos del cuarto claim y reporte 11. La inspección y `node --check` son solo evidencia estática; no se conectó a una base.
- [x] 5.10 Probar estáticamente firmas RPC, `SECURITY DEFINER`, `search_path`, grants, RLS, vistas, policies y orden de migraciones en `tests/migrations-static.test.mjs`.
- [ ] 5.11 Ejecutar el script contra una base de pruebas en la nube y verificar las cuotas de tres claims y diez reportes; el caso diario crea diez filas persistentes y requiere una cuenta de prueba fresca o una ventana de 24 horas nueva.

## Revisiones y cambios diferidos

- [ ] Revisar con Agus y Valen la dirección, como requiere `docs/contracts.md`; el historial disponible no acredita ambas reseñas.
- [ ] Fran debe conectar `app/components/reports/report-publisher.ts` con el multipart acordado (`report` JSON, `image`, `Idempotency-Key`) en un cambio de interfaz.
- [ ] Fran debe proponer `Photo.expiresAt` nullable en un PR aparte desde `main`, con revisión de Agus, Valen y Fran.
- [ ] Fran debe decidir con Agus y Valen si se agrega un código contractual específico para cuotas; hoy se usa `PUBLICATION_IN_PROGRESS`.
- [ ] Confirmar con Fran los defaults provisorios D1–D8 de `design.md`.
- [ ] Confirmar con Valen que el backend no persiste datos ni fotos del análisis Gemini.

## Evidencia disponible

- **Unitaria con simulación:** `node scripts/check-reports.mjs` verifica contratos, servicios, errores, cuotas simuladas, idempotencia, imágenes y sanitización. No ejecuta SQL.
- **Estática:** `tests/migrations-static.test.mjs` revisa firmas RPC, funciones y permisos, RLS, vista, policies, orden y cuotas declaradas. No prueba que PostgreSQL acepte el SQL.
- **Contra base real:** 4.1, 4.2 y 5.0–5.8/5.11 siguen sin marcar. Las cinco migraciones no se aplicaron en ningún entorno y el script cloud no se ejecutó.

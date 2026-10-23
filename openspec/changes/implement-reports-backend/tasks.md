# Tareas

Las casillas distinguen evidencia unitaria con simulación, inspección estática y ejecución contra base real. Las pruebas simuladas y estáticas no demuestran el comportamiento de PostgreSQL, RLS, Auth, Storage ni concurrencia.

## 1. Esquema, Storage y vista

- [x] 1.1 Definir en migraciones el estado MVP, límites de campos, dirección, metadatos de la copia, conteo y umbral por reporte. Evidencia estática en `tests/migrations-static.test.mjs`; falta aplicarlo en el proyecto de pruebas en la nube.
- [x] 1.2 Definir buckets, límites MIME/tamaño y policies de Storage ligadas a helpers que validan el claim activo del mismo usuario. Evidencia estática del SQL; falta verificar las policies efectivas en Storage.
- [x] 1.3 Activar RLS en las tablas `public` creadas y limitar privilegios directos. Evidencia estática del SQL; falta consultar permisos y RLS efectivos en la nube.
- [x] 1.4 Definir `public_reports` sin identidad, ruta original ni etapas institucionales, y con la ruta y metadatos de la copia pública. Evidencia estática del SQL; falta consultarla con `anon` y `authenticated`.

## 2. Idempotencia y publicación

- [x] 2.1 Reservar `report_id` en `claim_idempotency_key`, sin FK obligatoria, con índice único y bloqueo fijo de tres minutos. Evidencia estática en `tests/migrations-static.test.mjs` y pruebas simuladas de RPC.
- [x] 2.2 Definir `claim_idempotency_key` con `auth.uid()`, `SECURITY DEFINER`, `search_path` vacío, RLS y permisos explícitos. Evidencia estática; falta probar permisos y carreras en la base.
- [x] 2.3 Definir `publish_report` y `fail_idempotency_key` como RPC transaccionales; cotejar todas las claves de argumentos `.rpc()` contra las firmas SQL. Evidencia estática y simulada; falta probar commit, rollback y reintentos en PostgreSQL.
- [x] 2.4 Publicar por RPC y compensar fotos antes de marcar la clave fallida solo ante errores definitivos previos al commit; conservarlas ante errores ambiguos o posteriores. Evidencia unitaria con simulación en `tests/service.test.ts`.

## 3. Fotos y DTOs

- [x] 3.1 Sanear JPEG, PNG y WebP sin decodificar, rechazar estructuras truncadas o inválidas y comprobar que se quitan metadatos. Evidencia unitaria con buffers sintéticos en `tests/photos.test.ts`.
- [x] 3.2 Subir original privada y copia pública, validar `IMAGE_MIME_TYPES` y derivar la extensión de la ruta pública del MIME de la copia. Evidencia unitaria con cliente de Storage simulado; falta verificar el acceso real.
- [x] 3.3 Usar `Location.address` del contrato en lista y detalle, sin adaptador, cast ni fallback vacío. Evidencia unitaria en `tests/service.test.ts`.
- [x] 3.4 Mantener cursor, orden y filtros; cubrir `listReportsService`. Evidencia unitaria en `tests/service.test.ts` y `tests/list-query.test.ts`.
- [x] 3.5 Limpiar advertencias de lint y verificar TypeScript. Evidencia de `npm run lint` y `npx tsc --noEmit` de este bloque.

## 4. Rutas, confirmaciones y límites del contrato

- [ ] 4.1 Verificar contra base real `confirm_report`: umbral de la fila, lock, una confirmación por usuario, estados permitidos y prioridad de resultados. Hay pruebas simuladas del mapeo de respuesta, pero no prueban SQL ni atomicidad.
- [ ] 4.2 Probar contra base real RLS, `REVOKE`/`GRANT`, acceso a la vista e inserción directa rechazada.
- [x] 4.3 Validar consultas GET con el validador estricto y el sobre de error del contrato. Evidencia unitaria en `tests/list-query.test.ts`.
- [x] 4.4 Cubrir con simulación el mapeo de resultados de `confirm_report` y `get_my_confirmation`, incluidos conteo y umbral efectivos. No demuestra el SQL ni la atomicidad.
- [x] 4.5 Mantener visible la desviación conocida de `Photo.expiresAt`: lista y detalle omiten el campo y el validador compartido los rechaza. Ningún test presenta las respuestas como válidas; cambio nullable pendiente de un PR separado del contrato.

## 5. Integración en el proyecto de pruebas en la nube — pendiente de base real

- [ ] 5.0 Aplicar las cinco migraciones en orden con el checklist de `design.md`: `npx.cmd supabase init`, `login`, `link`, `migration list --linked`, `db push --dry-run --linked`, `db push --linked` y `migration list --linked`. Después de cada comando, verificar los resultados indicados allí; detenerse ante ref o historial inesperado. No ejecutar `db reset --linked`.
- [ ] 5.1 Verificar que la clave publicable no puede leer directamente `reports` ni `user_id`; consultar únicamente la vista pública.
- [ ] 5.2 Con dos cuentas, verificar que RLS de confirmaciones oculta las filas de la otra persona.
- [ ] 5.3 Verificar rechazo de `INSERT` directo en `reports` y `report_confirmations`; probar `publish_report` con sesión y rechazo sin sesión.
- [ ] 5.4 Enviar confirmaciones concurrentes de la misma cuenta y reporte; verificar una sola fila y resultados válidos.
- [ ] 5.5 Con una autora y tres confirmadoras distintas, confirmar concurrentemente un reporte y verificar tres filas y una sola transición a `citizen-verification`.
- [ ] 5.6 Invocar `confirm_report` sin sesión y verificar el rechazo de autenticación.
- [ ] 5.7 Verificar claim concurrente (un resultado `CLAIMED` y otro `IN_PROGRESS` con el mismo `report_id`), replay tras perder la respuesta del commit, copia pública accesible sin sesión e inaccesibilidad de la original privada. El `409`/`Retry-After` de la ruta se cubre solo con pruebas unitarias simuladas.
- [ ] 5.8 Ejecutar Security Advisor en el proyecto de pruebas y registrar objeto, severidad y resolución de cada hallazgo, siguiendo el checklist de `design.md`.
- [x] 5.9 Preparar `scripts/integration/check-reports-cloud.mjs` con guardias para URL de producción, confirmación explícita y claves secretas; requiere `.env.test.local` y cuatro cuentas creadas manualmente. La inspección estática no es evidencia de integración ejecutada.
- [x] 5.10 Agregar pruebas estáticas para firmas RPC, seguridad de funciones, RLS declarativa, proyección pública, policies de Storage y orden de objetos entre migraciones. Evidencia: `tests/migrations-static.test.mjs`; no sustituye aplicar el SQL.

## Revisión del equipo

- [ ] Revisar con Agus y Valen la dirección, como pide `docs/contracts.md`. El snapshot de `.context/prs.json` no muestra reseñas para los PR #5 y #8.
- [ ] Acordar con Fran (también llamado Francisco) bucket público, orientación EXIF, retención, limpieza de huérfanas, cuota por usuario, tamaño del multipart y versionado de `supabase/config.toml`.
- [ ] Resolver `Photo.expiresAt` nullable en un PR separado desde `main`, con revisión de Agus, Valen y Fran.
- [ ] Confirmar con Valen que el backend no debe persistir datos ni fotos de análisis Gemini.

## Evidencia disponible

- **Unitaria con simulación:** `node scripts/check-reports.mjs` cubre contratos, rutas, servicios, RPC simuladas, saneamiento y fallas de Storage/publicación. No ejecuta SQL ni acredita permisos efectivos o concurrencia en PostgreSQL.
- **Estática:** `tests/migrations-static.test.mjs` coteja llamadas RPC contra firmas SQL y revisa declaraciones de seguridad y dependencias. No comprueba que PostgreSQL acepte o ejecute las migraciones.
- **Contra base real:** ninguna tarea de la sección 5 está completada. Las migraciones siguen sin aplicarse y el script cloud no se ejecutó.

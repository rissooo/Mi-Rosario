# Tareas

## 1. Esquema y Storage

- [ ] 1.1 Ajustar migración de `reports` para estados MVP, threshold y count por reporte, validación de calle/número y rutas original/pública; verificar DDL e índices contra el esquema esperado.
- [ ] 1.2 Configurar buckets privado/público con límites MIME/tamaño, política de carga pública ligada a clave propia activa y borrado de original solo antes de publicar; verificar políticas en Supabase local.
- [ ] 1.3 Asegurar RLS de `reports`, confirmaciones e idempotencia, revocar acceso directo y otorgar `SELECT` solo a la vista pública; inspeccionar roles/policies en Supabase local.
- [ ] 1.4 Crear `public_reports` sin identidad, ruta privada, MIME, tamaño ni campos institucionales, y con solo estados MVP; probar columnas y permisos con `anon` y `authenticated` locales.

## 2. Idempotencia y publicación transaccional

- [ ] 2.1 Ajustar `idempotency_keys` para reservar y guardar `report_id` sin FK que impida reservar antes de insertar el reporte; verificar constraints e índices en Postgres local.
- [ ] 2.2 Rehacer `claim_idempotency_key` con `auth.uid()`, `SECURITY DEFINER`, `search_path` vacío, permisos solo `authenticated`, RLS activa y bloqueo fijo de tres minutos; probar claims y carreras en Postgres local.
- [ ] 2.3 Implementar `publish_report` y `fail_idempotency_key` con bloqueo de clave, validaciones de usuario/hash y actualización atómica; probar publicación, replay, propiedad y rollback en Postgres local.
- [ ] 2.4 Cambiar el servicio para publicar por RPC y compensar solo ante errores definitivos pre-commit; probar reintento con `report_id` estable y conservar fotos ante timeout simulado.

## 3. Fotos y mapeo de DTOs

- [ ] 3.1 Generar en TypeScript la copia sin metadatos para JPEG/PNG/WebP sin decodificar la imagen; probar buffers mínimos con EXIF/texto y rechazo de formatos no analizables.
- [ ] 3.2 Subir original y copia a rutas separadas, validar `IMAGE_MIME_TYPES` y construir `photo.url` desde la copia pública; probar privacidad de la original y URL pública.
- [ ] 3.3 Crear `lib/reports/address.ts` con tipo local y mapear siempre `location.address` en lista/detalle sin cast ni fallback vacío; cubrir la forma del DTO sin editar contratos compartidos.
- [ ] 3.4 Mantener cursor `{ version, createdAt, id, filters }`, filtros y orden actual; agregar tests de `listReportsService` para dirección, campos de foto y paginación.
- [ ] 3.5 Resolver las seis advertencias de lint de variables sin usar sin cambiar el comportamiento; verificar lint y TypeScript.

## 4. Confirmaciones y rutas

- [ ] 4.1 Actualizar `confirm_report` para leer el threshold del reporte, mantener el count bajo lock y quitar `get_confirmation_threshold()`; probar duplicado, autoría y precedencia de errores contra Postgres local.
- [ ] 4.2 Implementar RLS y proyección pública conforme a la spec, incluyendo `REVOKE ALL` en `reports` y `GRANT SELECT` solo en la vista; verificar que inserción directa falla y la consulta pública funciona localmente.
- [ ] 4.3 Actualizar publicación/lista/detalle para usar RPC y URL de foto pública, conservando contrato, cursor y respuestas; correr tests de servicios y rutas.
- [ ] 4.4 Mantener rutas de confirmaciones alineadas con resultados de `confirm_report`; verificar estados HTTP y envelopes en pruebas.

## 5. Pruebas de seguridad y concurrencia en Supabase local

- [ ] 5.1 Probar consulta directa a `/rest/v1/reports?select=user_id` con clave publicable y sin sesión; confirmar rechazo o lista vacía.
- [ ] 5.2 Con dos usuarios autenticados, comprobar que cada persona solo lee sus propias confirmaciones.
- [ ] 5.3 Probar `INSERT` directo de cliente en `reports` y `report_confirmations`; confirmar rechazo.
- [ ] 5.4 Enviar dos confirmaciones concurrentes de la misma cuenta/reporte; comprobar una fila única y respuestas válidas.
- [ ] 5.5 Enviar confirmaciones concurrentes de tres cuentas distintas a un reporte pendiente; comprobar tres filas y una sola transición a `citizen-verification`.
- [ ] 5.6 Invocar `confirm_report` sin sesión; comprobar el error de autenticación.
- [ ] 5.7 Reclamar concurrentemente la misma clave; comprobar un procesamiento y un `409 PUBLICATION_IN_PROGRESS` con `Retry-After`.
- [ ] 5.8 Probar inserción directa en `reports` rechazada y `publish_report` con sesión y sin sesión; conservar los resultados reproducibles.
- [ ] 5.9 Simular timeout tras el envío de `publish_report` y reintentar la misma clave; comprobar que se recupera el mismo reporte sin borrar fotos.
- [ ] 5.10 Comprobar acceso anónimo a la copia pública y rechazo de acceso anónimo a la original privada.
- [ ] 5.11 Hacer que cada script de integración rechace URLs distintas de `localhost` y `127.0.0.1`; probar la guardia sin conectarse a un entorno remoto.
- [ ] 5.12 Revisar Security Advisor en Studio local y registrar hallazgos; no marcarlo completo si Studio local o el análisis no están disponibles.

## Seguimiento de equipo

- Revisar los DTO comunes y la integración de `Location.address` con Fran cuando se integre el PR #3.
- Confirmar con Fran la presentación de copias públicas saneadas, los límites de carga, retención y estrategia futura de huérfanas.
- Confirmar con Valen que la visión no requiere persistir fotos ni metadatos de análisis.
- Confirmar el rol de Francisco y si requiere una revisión antes de integrar.
- Ejecutar todas las verificaciones de seguridad solo en Supabase local; nunca contra producción.

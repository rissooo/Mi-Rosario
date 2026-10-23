# Diseño

## Contexto

Ver `proposal.md` para el objetivo y `specs/reports-backend/spec.md` para el comportamiento exigido. La rama contiene handlers, servicios y cinco migraciones aún no aplicadas en ningún entorno, según confirmó Agus. No hay Supabase local configurado. `Location.address` ya forma parte del contrato que llegó a `main` con el PR #3.

## Objetivos / Fuera de alcance

**Objetivos:** publicación recuperable y transaccional; separación entre original privada y copia pública saneada; exposición pública mínima; confirmación atómica bajo el umbral efectivo del reporte; verificación reproducible en el proyecto Supabase de pruebas `rsvtchefnydihokivaqg`, nunca en producción.

**Fuera de alcance:** operaciones institucionales, moderación municipal, IA/visión, cambios a contratos compartidos, cambios al cliente Supabase compartido, limpieza automática de huérfanas y cualquier operación contra una base remota.

## Decisiones

### 1. Orden de publicación y recuperación

1. Reclamar la clave autenticada. La RPC fija el bloqueo en tres minutos y genera y persiste un `report_id` UUID en la misma fila; las repeticiones recuperan ese ID. `report_id` no lleva FK obligatoria porque la reserva precede al reporte; `publish_report` valida y materializa esa relación en la misma transacción.
2. Validar y sanear la imagen, subir la original al bucket privado y la copia derivada al bucket público.
3. Invocar `publish_report`. La RPC vuelve a validar la propiedad y el hash, bloquea la fila de idempotencia con `FOR UPDATE`, inserta el reporte `pending` usando el ID reservado y completa la clave en una transacción. Si ya existe el mismo ID para el mismo usuario, completa la clave y devuelve el reporte existente. Un ID perteneciente a otro usuario o una carga incompatible falla sin exponer datos.

`fail_idempotency_key` es la RPC autenticada análoga para un error definitivo anterior al commit. El servicio compensa ambos objetos y marca la clave como fallida solo ante un error definitivo de base anterior al commit. Un timeout o error de red deja intactos los objetos y el estado para que el reintento resuelva el resultado. Ningún error posterior al commit borra fotos ni marca la clave como fallida.

### 2. Fotos originales y públicas

- **D1 — pendiente de confirmar con Fran:** “original” es exactamente el archivo que recibe el servidor, incluso si el navegador ya lo comprimió o le quitó metadatos. El backend no confía en el saneamiento del navegador: revalida el tipo, conserva esa entrada en `reports-originals` privado y genera una copia saneada para publicar.
- `reports-originals` es privado. La ruta de la original puede incluir el usuario, pero nunca sale en una vista o DTO. La política de inserción permite el objeto solo si la ruta corresponde a una clave `in_progress` del usuario; la política de borrado solo permite retirar una original que aún no pertenece a un reporte publicado. Ambas comprobaciones usan helpers `SECURITY DEFINER` con `search_path` vacío.
- Para reintentar sobre las mismas rutas con `upsert`, Storage también requiere permisos `SELECT` y `UPDATE`; quedan limitados por el mismo helper al claim propio `in_progress`.
- `reports-public` es público, tiene límites de tamaño y MIME y recibe la copia sin metadatos con ruta `{report_id}.{ext}`, sin identificador de usuario. La política de inserción exige una clave propia en estado `in_progress`. La URL de lectura se arma con `getPublicUrl`; no se generan URLs firmadas para visitantes anónimos.
- **D2 — pendiente de confirmar con Fran:** `Photo.url` apunta a la copia pública. `mimeType` y `byteSize` describen esa copia, se almacenan en columnas propias y se proyectan en la vista pública. No se inventa un vencimiento para una URL pública que no vence.
- El saneamiento se hace en TypeScript puro, sin decodificar la imagen: quita segmentos APP0–APP15 y comentarios COM en JPEG (incluye EXIF, XMP e IPTC), chunks `eXIf` y de texto en PNG y chunks EXIF/XMP en WebP. En JPEG se descartan los bytes posteriores a EOI; en WebP se recalcula el tamaño RIFF. Si la estructura no se puede analizar con seguridad, se rechaza como error de validación. Se valida el contenido y MIME contra `IMAGE_MIME_TYPES`.
- El saneamiento elimina la orientación EXIF pero no rota ni vuelve a codificar los píxeles. Una foto tomada en orientación vertical podría verse girada en la copia pública; queda pendiente acordar con Fran cómo resolverlo sin agregar dependencias.
- **Bloqueo de contrato:** `Photo.expiresAt` es obligatorio y debe ser una fecha UTC en `lib/contracts/reports.ts` y `docs/contracts.md`, mientras que `getPublicUrl` no tiene vencimiento. Lista y detalle hoy omiten ese campo; los tests verifican que `validateReport` rechaza ambas respuestas. La propuesta abierta es aceptar `expiresAt: null` en un PR separado creado desde `main`, con revisión de Agus, Valen y Fran. Este cambio no inventa una fecha, no modifica contratos compartidos y no presenta el DTO como válido.
- La elección de bucket público para la copia saneada es provisoria y debe confirmarse con Fran. La original nunca se hace pública. La política/retención de originales sigue siendo provisoria según el contrato.
- No se implementa limpieza SQL de huérfanas. Borrar objetos exige Storage API con credencial de servidor; queda pendiente definir una limpieza segura que no agregue `service_role` al flujo normal.

### 3. Idempotencia

- `idempotency_keys` mantiene RLS activa y no permite lectura directa del cliente. Las RPC `claim_idempotency_key`, `publish_report` y `fail_idempotency_key` obtienen el usuario de `auth.uid()`, son `SECURITY DEFINER` con `search_path = ''`, revocan ejecución a `public` y `anon`, y conceden ejecución solo a `authenticated`.
- `claim_idempotency_key` recibe clave y hash, sin parámetro de duración. `locked_until` usa un intervalo fijo de tres minutos, separado de `expires_at`; el claim es atómico con `INSERT ... ON CONFLICT` y recuperación condicional de locks vencidos.
- El hash cubre SHA-256 de bytes originales y JSON canónico, incluida `location.address`, con texto normalizado, coordenadas normalizadas y claves ordenadas. Se almacena `report_id`, no un cuerpo de respuesta. Una repetición completada reconstruye el DTO desde la base y vuelve a obtener la URL pública.

### 4. Esquema, RLS y confirmaciones

- `reports.status` acepta solo `pending` y `citizen-verification` en el MVP. Tiene `confirmation_threshold` por fila con default 3 y `confirmation_count` mantenido por `confirm_report` bajo el lock de la fila. Las columnas `street` y `street_number` validan calle de 2 a 80 caracteres sin espacios exteriores y número opcional de 1 a 99999. Se guardan por separado la ruta privada original y `photo_public_path`.
- Se revocan todos los privilegios directos sobre `reports` a `anon` y `authenticated`; solo `public_reports` recibe `SELECT`. No hay políticas de mutación de clientes. La vista incluye solo estados MVP y expone `photo_public_path`, `confirmation_count`, `confirmation_threshold`, dirección y campos públicos. Excluye `user_id`, ruta original, MIME, tamaño y campos institucionales `resolved`/`resolved_at`.
- La vista usa `security_invoker = false` con privilegios de propietario acotados para proyectar filas, y recibe permisos `SELECT` solo para `anon` y `authenticated`. Revisar en el proyecto de pruebas el propietario de la vista y sus permisos efectivos.
- `confirm_report` toma usuario de `auth.uid()`, usa `SECURITY DEFINER`, `search_path` vacío y `FOR UPDATE`; no acepta conteos del cliente. Lee el umbral de la fila, inserta con unicidad por reporte/usuario y actualiza el conteo/transición dentro de la operación.
- La precedencia es: validar existencia y autoría; si ya hay una confirmación de esa cuenta, responder `ALREADY_CONFIRMED` idempotentemente; si no existe y la etapa ya no admite nuevas confirmaciones, responder `REPORT_RESOLVED`; en caso contrario insertar y contar. Así, el replay existente se distingue de un intento nuevo en una etapa cerrada.
- Se elimina `get_confirmation_threshold()` inmutable. El cliente no puede escribir `confirmation_count` ni cambiar el umbral.

### 5. API, dirección y cursor

- Los servicios publican solo mediante `publish_report`; el `INSERT` directo de la clave publicable queda prohibido. Para listas y detalle, se mapea `photo.url` desde la URL pública de `photo_public_path`.
- La rama recibe la dirección mediante un adaptador pequeño local en `lib/reports/`, con tipo local `{ street, number }`; no se modifica `lib/contracts/`. Lista y detalle siempre devuelven `location.address`, sin cast ni calle vacía de fallback. Al integrarse el PR #3, el único archivo que debe reemplazarse para ese límite es el adaptador.
- Se conserva la forma de cursor `{ version, createdAt, id, filters }`, el orden estable y los filtros existentes. `resolvedAt` del DTO se resuelve como `null` en el MVP; no se lee ni publica `resolved_at`.

### 6. Migraciones y proyecto de pruebas en la nube

- Las migraciones `20261023000001` a `20261023000005` están en orden cronológico y preparadas para aplicarse a un proyecto Supabase vacío. No se han aplicado en ningún entorno.
- El proyecto de prueba acordado es `rsvtchefnydihokivaqg`. No usar producción ni información real. Agus correrá los comandos; este trabajo no ejecuta login, link, push ni ninguna operación remota.
- `supabase/config.toml` todavía no existe. `npx supabase init` lo genera y es requisito para el flujo de `db push`. Queda pendiente decidir con Fran si se versiona; hasta acordarlo, revisar el `git status` después de `init` y no incluir el archivo en un commit.
- Los scripts de integración solo aceptan la URL exacta `https://rsvtchefnydihokivaqg.supabase.co`, requieren `TEST_PROJECT_CONFIRMED=true`, rechazan claves `service_role`/`sb_secret` y no cargan archivos `.env` automáticamente.
- Las tareas que necesitan Postgres, Auth, Storage o Security Advisor reales siguen sin marcar hasta que se ejecuten allí y se guarde evidencia. No se ejecuta `reset --linked` ni se envían datos de producción.

## Checklist para aplicar y verificar en el proyecto de prueba

Antes de iniciar, confirmar en el panel que el proyecto `rsvtchefnydihokivaqg` es un proyecto separado de pruebas, está vacío y no contiene datos que deban conservarse. Si el ref o el estado no coinciden, detenerse.

1. Desde la raíz del repo, Agus ejecuta `npx supabase init`. Verificar que aparece `supabase/config.toml`, que no cambió ningún archivo de migración y que el archivo no contiene secretos. Acordar con Fran si se commitea; no asumirlo.
2. Ejecutar `npx supabase login`. Verificar que la CLI confirma la sesión de Agus. No copiar el token a archivos, logs compartidos ni commits.
3. Ejecutar `npx supabase link --project-ref rsvtchefnydihokivaqg`. Verificar que el ref enlazado coincide exactamente con el proyecto de pruebas y no con producción.
4. Ejecutar `npx supabase migration list --linked`. Verificar que el remoto no registra ninguna de estas cinco migraciones y que las locales aparecen en orden `20261023000001` a `20261023000005`. Si el remoto tiene una migración o historial inesperado, detenerse antes de aplicar.
5. Ejecutar `npx supabase db push --dry-run --linked`. Verificar que el plan contiene únicamente esas cinco migraciones, en orden, sin seed ni cambios de otros módulos. Si muestra cualquier otro cambio, detenerse.
6. Solo tras confirmar que el proyecto está vacío y el dry run coincide, ejecutar `npx supabase db push --linked`. Verificar el resultado exitoso y que la CLI informa aplicar las cinco migraciones. No agregar `--include-seed`.
7. Ejecutar otra vez `npx supabase migration list --linked`. Verificar que las cinco versiones aparecen aplicadas tanto local como remotamente y no hay diferencias.
8. En SQL Editor del proyecto de prueba, verificar estructura y permisos:
   ```sql
   SELECT version
   FROM supabase_migrations.schema_migrations
   WHERE version IN ('20261023000001', '20261023000002', '20261023000003', '20261023000004', '20261023000005')
   ORDER BY version;

   SELECT c.relname, c.relrowsecurity
   FROM pg_class AS c
   JOIN pg_namespace AS n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('reports', 'idempotency_keys', 'report_confirmations');

   SELECT column_name
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'public_reports'
   ORDER BY ordinal_position;
   ```
   Esperar cinco versiones, RLS activa en las tres tablas y una vista con `photo_public_path`, `confirmation_count`, `confirmation_threshold`, `street` y `street_number`; no deben aparecer `user_id`, `storage_path`, `mime_type`, `byte_size` ni `resolved_at` en la vista. Revisar también en Table Editor que `reports-originals` sea privado y `reports-public` público.
9. Crear cuatro cuentas sintéticas de prueba en Auth y configurar en el entorno de la terminal `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (o `SUPABASE_ANON_KEY`) y `REPORTS_TEST_USER_1_EMAIL/PASSWORD` hasta `REPORTS_TEST_USER_4_EMAIL/PASSWORD`. El script no carga `.env`. Solo después de revisar el ref, Agus establece `$env:TEST_PROJECT_CONFIRMED = 'true'` y ejecuta `node scripts/integration/check-reports-cloud.mjs`. Verificar los resultados individuales de RLS, RPC, concurrencia y visibilidad de fotos; si una prueba falla, guardar el error sin incluir tokens.
10. En el panel del proyecto de prueba, abrir Security Advisor y revisar hallazgos para tablas, vistas, funciones y Storage. Registrar cada advertencia con su objeto; no marcar 5.12 como completa solo porque no haya errores en tests.

`npx supabase db push`, el SQL Editor y el script de integración apuntan únicamente al proyecto de prueba; no ejecutar `npx supabase db reset --linked`.

## Riesgos y compensaciones

- **[Riesgo]** Una copia públicamente accesible se comparte por URL. **→ Mitigación:** solo se expone la copia derivada, saneada y sin ruta de usuario; mantener la decisión provisoria hasta revisión de Fran.
- **[Riesgo]** Sin credencial de servidor no se puede enumerar ni borrar huérfanas con garantías. **→ Mitigación:** no usar SQL directo sobre `storage.objects`; dejar la limpieza pendiente y diseñar una Storage API segura.
- **[Riesgo]** Límites de cuerpo en el hosting pueden rechazar fotos multipart válidas. **→ Mitigación:** acordar con Fran tamaño máximo de cliente compatible con 4 MiB de archivo más el resto del request y verificar el límite real del despliegue antes de integrar.
- **[Riesgo]** Fixtures y clientes simulados no prueban RLS ni concurrencia. **→ Mitigación:** scripts con guardia del ref de pruebas y casos contra Auth, Postgres y Storage alojados; sin marcar evidencia que no se haya ejecutado.

## Plan de migración y merge

1. Revisar los cuatro artefactos y el estado real del código; mantener las cinco migraciones editables en su lugar mientras no haya evidencia de aplicación.
2. Implementar y probar los bloques de esquema/RPC, servicios/fotos y rutas; ejecutar la integración contra el proyecto de pruebas únicamente después del checklist anterior.
3. Integrar primero PR #3 (`add-report-address`) a `main`; después actualizar únicamente `lib/reports/address.ts` para importar el contrato compartido y correr las verificaciones de integración.
4. Integrar el PR de `feature/reports-backend` después del PR #3 y sus revisiones. No hacer push ni merge desde este trabajo.

## Decisiones abiertas

### Fran (también llamado Francisco) — interfaz y mapas

- Confirmar que `reports-public` con copias saneadas y URL pública satisface el consumo de lista/detalle y el tratamiento de caché.
- Resolver si se acepta `Photo.expiresAt: null` para URLs públicas sin vencimiento mediante un PR separado desde `main`; revisión requerida de Agus, Valen y Fran. Hasta que se mergee, lista y detalle siguen incumpliendo el contrato y no se marcan como terminados.
- Revisar la orientación de fotos JPEG: hoy se elimina EXIF sin rotar los píxeles y no se añade tratamiento de orientación.
- Confirmar el límite de tamaño del multipart desde cliente considerando el límite del hosting, y si el cliente comprimirá antes de enviar.
- Revisar e integrar PR #3 antes que el backend; luego cambiar solamente el adaptador de dirección.
- Definir con qué mecanismo autorizado se limpiarán huérfanas mediante Storage API; no se implementa en SQL.
- Confirmar la política provisoria de retención de originales y copias.
- Definir la acción de moderación para copias públicas de reportes ocultos o rechazados; la URL sigue accesible mientras el objeto exista.

### Valen — visión

- Confirmar que análisis de visión permanece en memoria y que el flujo de reportes no necesita persistir resultados ni metadatos de análisis. El backend no recibe ni almacena datos de visión en este cambio.

## Pedidos a otros módulos

- **Fran / PR #3 (`add-report-address`):** integrar primero el contrato `Location.address` compartido. No editar `lib/contracts/**`, `docs/contracts.md` ni `package.json` desde este cambio. Hasta el merge, el backend mantiene su adaptador local.
- **Fran / Storage:** revisar la decisión provisoria de lectura pública de copias saneadas y acordar consumo/cache, tamaño de request y limpieza por Storage API.
- **Fran / configuración Supabase:** decidir si `supabase/config.toml`, generado por `npx supabase init`, se commitea en esta rama o se mantiene local. `db push` requiere que exista, pero no presupone que se versiona.
- **Valen / visión:** confirmar el límite de datos en memoria, sin pedir cambios en `lib/vision/**` dentro de este cambio.
- **Agus / seguridad de fotos públicas:** las políticas pueden vincular una carga a un claim propio `in_progress`, pero Postgres/Storage no pueden comprobar que el contenido público perdió sus metadatos. Como el RPC y Storage usan el rol `authenticated`, un cliente puede invocarlos directamente y omitir el saneamiento del handler. Acordar la amenaza aceptable y una forma de impedirlo antes de habilitar el bucket público; no hay una comprobación de bytes en estas migraciones.

## Límites conocidos de publicación y moderación

- La clave publicable permite que un cliente autenticado invoque Storage y las RPC directamente; `SECURITY DEFINER` no convierte esas llamadas en operaciones exclusivas del servidor. Las policies de Storage atan cada ruta al `report_id` reservado en una clave `in_progress` del mismo usuario. `publish_report` comprueba `auth.uid()`, propiedad y estado de la clave, coincidencia del hash recibido, rutas original/pública coherentes con el usuario, ID y MIME, existencia de ambos objetos, MIME/tamaño declarados en los metadatos de Storage y que el tamaño de la copia coincida con el argumento. Los `CHECK` de `reports` limitan título (5–120), descripción (10–1000), categoría, gravedad, estados MVP, latitud/longitud, calle (2–80 sin espacios exteriores), altura (1–99999 o nula), MIME de la copia, tamaño (1–4 MiB), conteo no negativo y umbral positivo.
- Esas comprobaciones no leen los bytes del objeto: un cliente puede subir contenido que no coincida con el MIME declarado o una copia que conserve metadatos y después llamar directamente a `publish_report`. El saneamiento del handler no es una garantía frente a un cliente hostil. La metadata de Storage tampoco prueba la firma ni el contenido real de la imagen.
- Si una moderación futura oculta o rechaza un reporte, quitarlo de la vista no revoca su URL pública. La copia permanece accesible hasta que se elimine mediante Storage API; definir el borrado y la invalidación de caché queda abierto con Fran. El MVP no implementa estados de ocultamiento o rechazo.

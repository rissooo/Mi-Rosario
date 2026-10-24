# Diseño

## Contexto

Ver `proposal.md` para el objetivo y `specs/reports-backend/spec.md` para el comportamiento exigido. La rama contiene handlers, servicios y cinco migraciones que Agus confirmó que no se aplicaron en ningún entorno. La verificación SQL requiere un proyecto de pruebas en la nube separado de producción. `Location.address` forma parte del contrato que llegó a `main` con el PR #3.

## Objetivos / Fuera de alcance

**Objetivos:** publicación recuperable y transaccional; separación entre original privada y copia pública saneada; exposición pública mínima; confirmación atómica bajo el umbral efectivo del reporte; verificación reproducible en un proyecto de pruebas en la nube cuyo ref sea distinto de producción.

**Fuera de alcance:** operaciones institucionales, moderación municipal, IA/visión, cambios a contratos compartidos, cambios al cliente Supabase compartido y limpieza automática de huérfanas. La verificación remota se limita al proyecto de pruebas en la nube; producción está bloqueada.

## Cambios diferidos: requieren archivos ajenos o decisiones ajenas

- **`Photo.expiresAt` nullable.** Archivos: `lib/contracts/**`, `docs/contracts.md`, `app/components/reports/ReportDetail.tsx:21` y `app/components/reports/report-publisher.ts:75`. El contrato de `main` exige una fecha y cambiarlo a nullable rompe `tsc` en los dos consumidores de Fran. Responsable: Fran; el cambio debe salir en un PR aparte desde `main`, con revisión de Agus, Valen y Fran. Cerrar adaptando el contrato y ambos consumidores en ese PR; hasta entonces el backend omite el campo y las pruebas conservan visible el rechazo del validador compartido.
- **Multipart del formulario.** Archivo: `app/components/reports/report-publisher.ts`. El backend espera `report` como JSON, `image` como archivo e `Idempotency-Key`; el publisher actual guarda en memoria. Responsable: Fran. Cerrar conectándolo al endpoint real y probando el flujo con la misma clave al reintentar.
- **Código específico de cuota.** Archivo: `lib/contracts/errors.ts`, fuera de esta zona. Responsable: Fran como editor del contrato, con revisión de Agus y Valen. Mientras tanto las cuotas responden `PUBLICATION_IN_PROGRESS` (409) con mensaje en español. Cerrar agregando y revisando un código contractual específico y luego actualizar el mapeo backend.
- **Revisión de dirección.** Archivo: `docs/contracts.md`. La hoja compartida pide revisión de Agus y Valen; los artefactos disponibles no acreditan ambas revisiones. Responsables: Agus y Valen. Cerrar registrando sus reseñas por el canal de revisión del contrato; este change solo consume `Location.address`.
- **Decisiones D1 a D8.** Responsable de confirmarlas: Fran. Los defaults se aplican provisionalmente en este change y se pueden revertir según se detalla abajo; no se espera esa confirmación para terminar el backend.
- **Persistencia de pruebas reales.** Las tareas 4.1, 4.2 y 5.0–5.8 requieren un proyecto de pruebas en la nube y cuentas sintéticas. Responsable: Agus. Cerrar aplicando las migraciones y registrando la ejecución del checklist; no se ejecuta desde este trabajo.
- **Saneamiento frente a clientes hostiles.** Sin credencial de servidor, un cliente autenticado puede invocar directamente Storage y RPC. SQL comprueba usuario, claim, rutas, metadatos declarados y límites, pero no puede leer los bytes para demostrar que el MIME coincide con la firma o que la copia perdió metadatos. Responsables: Agus y Fran. Cerrar con una decisión revisada sobre el límite de confianza y un flujo de carga que impida publicar una copia no saneada; no agregar `service_role` a este change.

## Decisiones provisorias de Agus, a confirmar con Fran

- **D1 — original privada y copia pública saneada.** La original es exactamente el archivo que recibe el servidor, aunque el navegador ya lo haya comprimido o limpiado. El backend revalida tipo y contenido y vuelve a sanear; guarda la entrada en `reports-originals` privado y publica la copia en `reports-public` usando `getPublicUrl`. Motivo: preservar el archivo recibido sin exponerlo y entregar una representación pública sin metadatos. Para revertir: acordar con Fran otra política de acceso y cambiar conjuntamente buckets, vista, DTO y consumidor antes de habilitarla.
- **D2 — sin vencimiento inventado.** El contrato actual exige `Photo.expiresAt` como fecha UTC, mientras que `getPublicUrl` no vence. El backend sigue omitiendo esa propiedad; sus tests deben mostrar que el validador compartido rechaza la respuesta real. Motivo: no afirmar una expiración falsa ni tocar archivos compartidos o del frontend. Para cerrar/revertir: PR de contrato nullable desde `main` que también adapte `ReportDetail.tsx` y `report-publisher.ts`; luego eliminar la excepción temporal de validación del backend.
- **D3 — orientación EXIF.** El saneador elimina EXIF, no conserva la orientación y no rota ni recodifica píxeles; se asume provisionalmente que el navegador normaliza la imagen. Motivo: evitar dependencias y decodificación en el servidor. Para revertir: acordar una transformación con Fran y Valen que rote píxeles sin reexponer EXIF y agregar evidencia de imágenes orientadas.
- **D4 — máximo de imagen.** Cada imagen puede ocupar como máximo 4 MiB y el cliente la comprime antes de enviarla. El servidor rechaza un `Content-Length` que supera el máximo de multipart contractual antes de leer el cuerpo y vuelve a validar el tamaño real del archivo. Motivo: limitar memoria y Storage sin confundir el tamaño del multipart con el del archivo. Para revertir: revisar con Fran el límite del hosting y actualizar juntos el límite de cliente y servidor.
- **D5 — cuota por usuario.** Se permiten como máximo 3 claims `in_progress` simultáneos y 10 reportes publicados en una ventana móvil de 24 horas. Los valores viven en una fila de configuración SQL restringida, y las comprobaciones se serializan con un lock transaccional por usuario tanto en el claim como al publicar. Motivo: limitar abuso sin agregar un rol de servicio ni un código fuera del contrato. Para revertir: después de revisar con Fran el uso real, cambiar los límites en SQL o retirar la cuota en una migración nueva antes de aplicarla a cualquier entorno.
- **D6 — sin limpieza automática de huérfanas.** No se borran objetos mediante SQL ni se incorpora una credencial de servidor. Como diagnóstico de solo lectura, luego de aplicar el esquema en el proyecto de pruebas en la nube, se puede ejecutar:
  ```sql
  SELECT o.bucket_id, o.name, o.created_at
  FROM storage.objects AS o
  WHERE o.bucket_id IN ('reports-originals', 'reports-public')
    AND o.created_at < now() - interval '1 hour'
    AND NOT EXISTS (
      SELECT 1
      FROM public.reports AS r
      WHERE (o.bucket_id = 'reports-originals' AND r.storage_path = o.name)
         OR (o.bucket_id = 'reports-public' AND r.photo_public_path = o.name)
    )
  ORDER BY o.created_at;
  ```
  Motivo: `storage.objects` no es una API de borrado y los objetos pueden quedar huérfanos tras fallas. Para revertir: acordar un proceso de limpieza por Storage API con credencial de servidor y retención antes de implementarlo.
- **D7 — moderación y retención fuera del MVP.** Una copia pública de un reporte oculto o rechazado seguirá accesible por su URL mientras exista el objeto, incluso si deja de aparecer en `public_reports`. Motivo: el MVP no tiene un flujo de moderación ni borrado por Storage API. Para revertir: definir con Fran la acción de moderación, retención e invalidación de caché y añadir el flujo autorizado de borrado.
- **D8 — configuración local de Supabase.** `supabase/config.toml` no se commitea. Motivo: se genera para el proyecto de pruebas y no está acordado como configuración compartida. Para ignorarlo solo en esta copia, agregar `/supabase/config.toml` a `.git/info/exclude` y comprobarlo con `git check-ignore -v supabase/config.toml`; no editar `.gitignore`. Para revertir: acordar con Fran versionarlo, revisar el diff y retirarlo de la exclusión local antes de agregarlo conscientemente.

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
- `GET .../confirmations/me` usa `get_my_confirmation`, una RPC `SECURITY DEFINER` con `search_path` vacío, identidad desde `auth.uid()` y ejecución concedida solo a `authenticated`. En una sola consulta obtiene el estado, la confirmación propia y el conteo/umbral efectivos de esa misma fila; el servicio no consulta `reports` ni `report_confirmations` directamente.
- Se elimina `get_confirmation_threshold()` inmutable. El cliente no puede escribir `confirmation_count` ni cambiar el umbral.

### 5. API, dirección y cursor

- Los servicios publican solo mediante `publish_report`; el `INSERT` directo de la clave publicable queda prohibido. Para listas y detalle, se mapea `photo.url` desde la URL pública de `photo_public_path`.
- Lista y detalle usan `Location.address` del contrato compartido y siempre devuelven `location.address`, sin cast ni calle vacía de fallback. El PR #3 ya está integrado en `main`; no queda un adaptador propio por reemplazar.
- Se conserva la forma de cursor `{ version, createdAt, id, filters }`, el orden estable y los filtros existentes. `resolvedAt` del DTO se resuelve como `null` en el MVP; no se lee ni publica `resolved_at`.

### 6. Migraciones y proyecto de pruebas en la nube

- Las cinco migraciones están ordenadas para un proyecto Supabase vacío y no se han aplicado en ningún entorno. La revisión actual es estática; solo la aplicación en el proyecto de pruebas en la nube aportará evidencia de ejecución.
- El ref de producción `rsvtchefnydihokivaqg` está bloqueado por el script. El proyecto de pruebas debe ser otro proyecto y Agus debe confirmar visualmente su ref antes de ejecutar comandos o pruebas.
- `supabase/config.toml` todavía no existe. Agus ejecutará `npx.cmd supabase init` cuando el proyecto de pruebas esté acordado. Sigue abierta con Fran la decisión de versionar ese archivo; revisar `git status` después de `init` y no incluirlo hasta acordarlo.
- El script de integración lee `SUPABASE_URL` y la clave publicable desde `.env.test.local`, exige `TEST_PROJECT_CONFIRMED=true`, rechaza el ref de producción y claves `service_role`/`sb_secret`, no crea cuentas por API, no imprime claves y solo corre al ejecutarse directamente. El archivo está ignorado por Git y no contiene valores en este cambio.
- Las pruebas unitarias y estáticas no acreditan RLS, permisos efectivos de Storage, atomicidad ni concurrencia. Esas tareas siguen sin marcar hasta ejecutarlas en el proyecto de pruebas en la nube. No usar `db reset --linked` ni datos de producción.

## Checklist para aplicar y verificar en el proyecto de pruebas en la nube

Antes de iniciar, confirmar en el panel que el proyecto elegido es un proyecto separado de pruebas, está vacío y su ref no contiene `rsvtchefnydihokivaqg`. Si el ref o el estado no coinciden, detenerse.

1. Desde la raíz del repositorio, ejecutar `npx.cmd supabase init`. Verificar que aparece `supabase/config.toml`, que no cambió ninguna migración y que no contiene secretos. Acordar con Fran si se versiona; no incluirlo en un commit antes de resolverlo.
2. Ejecutar `npx.cmd supabase login`. Verificar que la CLI confirma la sesión de Agus. No copiar el token a archivos, logs compartidos ni commits.
3. Ejecutar `npx.cmd supabase link --project-ref REF_DEL_PROYECTO_DE_PRUEBAS`. Verificar que el ref coincide con el proyecto de pruebas abierto en el panel y es distinto de `rsvtchefnydihokivaqg`.
4. Ejecutar `npx.cmd supabase migration list --linked`. Verificar que el proyecto no registra estas migraciones y que las locales aparecen en orden `20261023000001` a `20261023000005`. Si el remoto tiene un historial inesperado, detenerse.
5. Ejecutar `npx.cmd supabase db push --dry-run --linked`. Verificar que el plan contiene únicamente esas cinco migraciones, en orden, sin seed ni cambios de otros módulos. Si aparece otro cambio, detenerse.
6. Tras confirmar que el proyecto está vacío y el dry run coincide, ejecutar `npx.cmd supabase db push --linked`. Verificar que la CLI aplica las cinco migraciones sin error. No agregar `--include-seed`.
7. Ejecutar otra vez `npx.cmd supabase migration list --linked`. Verificar que las cinco versiones aparecen aplicadas y que no hay diferencias pendientes.
8. En SQL Editor del proyecto de pruebas, verificar estructura y permisos:
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
   Esperar cinco versiones y RLS activa en `reports`, `idempotency_keys` y `report_confirmations`. La vista debe incluir `photo_public_path`, metadatos de la copia, `confirmation_count`, `confirmation_threshold`, `street` y `street_number`; no debe incluir `user_id`, `storage_path`, `resolved` ni `resolved_at`. Revisar que `reports-originals` sea privado y `reports-public` público.
9. En Supabase Studio, abrir **Authentication → Users** y crear cuatro cuentas sintéticas con email confirmado y contraseñas de prueba independientes. No usar cuentas personales ni datos reales. Copiar sus emails y contraseñas únicamente a `.env.test.local`, que Git ignora. Completar allí `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (o `SUPABASE_ANON_KEY`) y `REPORTS_TEST_USER_1_EMAIL/PASSWORD` hasta `REPORTS_TEST_USER_4_EMAIL/PASSWORD` con valores del proyecto elegido.
10. Después de volver a verificar el ref del panel y el URL en `.env.test.local`, abrir PowerShell y ejecutar `$env:TEST_PROJECT_CONFIRMED = 'true'` y luego `node scripts/integration/check-reports-cloud.mjs`. Verificar los resultados individuales; guardar errores sin incluir claves ni contraseñas. El script usa cuatro cuentas porque el umbral de 3 necesita autor y tres confirmadores distintos.
11. Para el chequeo manual 5.8, abrir **Security Advisor** en el panel del proyecto de pruebas, ejecutar el análisis y registrar cada hallazgo con objeto y severidad. Revisar RLS desactivada en tablas expuestas, funciones `SECURITY DEFINER` sin `search_path` seguro o con grants amplios, políticas de Storage que permitan acceso a originales y el bucket público esperado `reports-public`. Confirmar que las advertencias esperadas por la copia pública se distinguen de fallas y que no hay exposición del bucket `reports-originals`.

`npx.cmd supabase db push`, el SQL Editor y el script de integración apuntan únicamente al proyecto de pruebas en la nube; no ejecutar `npx.cmd supabase db reset --linked`.

## Riesgos y compensaciones

- **[Riesgo]** Una copia públicamente accesible se comparte por URL. **→ Mitigación:** solo se expone la copia derivada, saneada y sin ruta de usuario; mantener la decisión provisoria hasta revisión de Fran.
- **[Riesgo]** Sin credencial de servidor no se puede enumerar ni borrar huérfanas con garantías. **→ Mitigación:** no usar SQL directo sobre `storage.objects`; dejar la limpieza pendiente y diseñar una Storage API segura.
- **[Riesgo]** Límites de cuerpo en el hosting pueden rechazar fotos multipart válidas. **→ Mitigación:** acordar con Fran tamaño máximo de cliente compatible con 4 MiB de archivo más el resto del request y verificar el límite real del despliegue antes de integrar.
- **[Riesgo]** Fixtures y clientes simulados no prueban RLS ni concurrencia. **→ Mitigación:** scripts con guardia del ref de pruebas y casos contra Auth, Postgres y Storage alojados; sin marcar evidencia que no se haya ejecutado.

## Plan de migración y merge

1. Revisar los cuatro artefactos y el estado real del código; mantener las cinco migraciones editables en su lugar mientras no haya evidencia de aplicación.
2. Implementar y probar los bloques de esquema/RPC, servicios/fotos y rutas; ejecutar la integración contra el proyecto de pruebas únicamente después del checklist anterior.
3. PR #3 (`add-report-address`) ya está integrado a `main`; esta rama usa directamente `Location.address` del contrato compartido.
4. Integrar el PR de `feature/reports-backend` después de las revisiones de sus responsables. No hacer push ni merge desde este trabajo.

## Decisiones abiertas

### Fran (también llamado Francisco) — interfaz y mapas

- Confirmar que `reports-public` con copias saneadas y URL pública satisface el consumo de lista/detalle y el tratamiento de caché.
- Proponer `Photo.expiresAt` nullable mediante un PR separado desde `main`, con revisión de Agus, Valen y Fran. Las respuestas actuales de lista y detalle omiten el campo y los tests demuestran que el validador del contrato las rechaza; ninguna prueba las presenta como válidas.
- Resolver el tratamiento de orientación con Fran: el saneador elimina EXIF sin rotar los píxeles; si el navegador no recomprime ni orienta la imagen antes de enviarla, puede mostrarse girada.
- Definir un límite de reportes o claims por usuario. Hoy una cuenta autenticada puede crear muchos claims y subir hasta 4 MiB por objeto en cada uno; no hay cuota ni rate limit por usuario.
- Confirmar el límite de tamaño del multipart desde cliente considerando el límite del hosting, y si el cliente comprimirá antes de enviar.
- Confirmar que la dirección integrada por PR #3 se usa sin un adaptador adicional.
- Definir con qué mecanismo autorizado se limpiarán huérfanas mediante Storage API; no se implementa en SQL.
- Confirmar la política provisoria de retención de originales y copias.
- Definir la acción de moderación para copias públicas de reportes ocultos o rechazados; la URL sigue accesible mientras el objeto exista.

### Valen — visión

- Confirmar que análisis de visión permanece en memoria y que el flujo de reportes no necesita persistir resultados ni metadatos de análisis. El backend no recibe ni almacena datos de visión en este cambio.

### Revisión compartida de dirección

- `docs/contracts.md` todavía pide revisión de Agus y Valen para la dirección. `Location.address` ya llegó a `main` con el PR #3 y este cambio lo consume sin modificar el contrato. El snapshot disponible de `.context/prs.json` para los PR #5 y #8 no incluye reseñas; no se toma como evidencia de esas revisiones.

## Pedidos a otros módulos

- **Fran / PR #3 (`add-report-address`):** PR #3 ya está integrado a `main`; revisar el consumo de `Location.address` en el backend. No editar `lib/contracts/**`, `docs/contracts.md` ni `package.json` desde este cambio.
- **Fran / Storage:** revisar la decisión provisoria de lectura pública de copias saneadas y acordar consumo/cache, tamaño de request y limpieza por Storage API.
- **Fran / configuración Supabase:** decidir si `supabase/config.toml`, generado por `npx supabase init`, se commitea en esta rama o se mantiene local. `db push` requiere que exista, pero no presupone que se versiona.
- **Valen / visión:** confirmar el límite de datos en memoria, sin pedir cambios en `lib/vision/**` dentro de este cambio.
- **Agus / seguridad de fotos públicas:** las políticas pueden vincular una carga a un claim propio `in_progress`, pero Postgres/Storage no pueden comprobar que el contenido público perdió sus metadatos. Como el RPC y Storage usan el rol `authenticated`, un cliente puede invocarlos directamente y omitir el saneamiento del handler. Acordar la amenaza aceptable y una forma de impedirlo antes de habilitar el bucket público; no hay una comprobación de bytes en estas migraciones.

## Límites conocidos de publicación y moderación

- La clave publicable permite que un cliente autenticado invoque Storage y las RPC directamente; `SECURITY DEFINER` no convierte esas llamadas en operaciones exclusivas del servidor. Las policies de Storage atan cada ruta al `report_id` reservado en una clave `in_progress` del mismo usuario. `publish_report` comprueba `auth.uid()`, propiedad y estado de la clave, coincidencia del hash recibido, rutas original/pública coherentes con el usuario, ID y MIME, existencia de ambos objetos, MIME/tamaño declarados en los metadatos de Storage y que el tamaño de la copia coincida con el argumento. Los `CHECK` de `reports` limitan título (5–120), descripción (10–1000), categoría, gravedad, estados MVP, latitud/longitud, calle (2–80 sin espacios exteriores), altura (1–99999 o nula), MIME de la copia, tamaño (1–4 MiB), conteo no negativo y umbral positivo.
- La RPC compara el hash recibido con el guardado en el claim, pero no puede recalcularlo a partir de los campos y bytes originales. Esas comprobaciones tampoco leen los bytes del objeto: un cliente autenticado puede elegir el hash al reclamar, subir contenido que no coincida con el MIME declarado o una copia que conserve metadatos y después llamar directamente a `publish_report`. El saneamiento del handler no es una garantía frente a un cliente hostil. La metadata de Storage tampoco prueba la firma ni el contenido real de la imagen.
- Si una moderación futura oculta o rechaza un reporte, quitarlo de la vista no revoca su URL pública. La copia permanece accesible hasta que se elimine mediante Storage API; definir el borrado y la invalidación de caché queda abierto con Fran. El MVP no implementa estados de ocultamiento o rechazo.

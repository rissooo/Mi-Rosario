# Diseño

## Contexto

Ver `proposal.md` para el objetivo y `specs/reports-backend/spec.md` para el comportamiento exigido. La rama contiene handlers, servicios y cinco migraciones aún no aplicadas en ningún entorno, según confirmó Agus. No hay Supabase local configurado todavía. Los contratos compartidos no incluyen `location.address` en esta rama; el PR #3 de Fran está abierto y sin mergear.

## Objetivos / Fuera de alcance

**Objetivos:** publicación recuperable y transaccional; separación entre original privada y copia pública saneada; exposición pública mínima; confirmación atómica bajo el umbral efectivo del reporte; verificación reproducible solo en Supabase local.

**Fuera de alcance:** operaciones institucionales, moderación municipal, IA/visión, cambios a contratos compartidos, cambios al cliente Supabase compartido, limpieza automática de huérfanas y cualquier operación contra una base remota.

## Decisiones

### 1. Orden de publicación y recuperación

1. Reclamar la clave autenticada. La RPC fija el bloqueo en tres minutos y genera y persiste un `report_id` UUID en la misma fila; las repeticiones recuperan ese ID. `report_id` no lleva FK obligatoria porque la reserva precede al reporte; `publish_report` valida y materializa esa relación en la misma transacción.
2. Validar y sanear la imagen, subir la original al bucket privado y la copia derivada al bucket público.
3. Invocar `publish_report`. La RPC vuelve a validar la propiedad y el hash, bloquea la fila de idempotencia con `FOR UPDATE`, inserta el reporte `pending` usando el ID reservado y completa la clave en una transacción. Si ya existe el mismo ID para el mismo usuario, completa la clave y devuelve el reporte existente. Un ID perteneciente a otro usuario o una carga incompatible falla sin exponer datos.

`fail_idempotency_key` es la RPC autenticada análoga para un error definitivo anterior al commit. El servicio compensa ambos objetos y marca la clave como fallida solo ante un error definitivo de base anterior al commit. Un timeout o error de red deja intactos los objetos y el estado para que el reintento resuelva el resultado. Ningún error posterior al commit borra fotos ni marca la clave como fallida.

### 2. Fotos originales y públicas

- `reports-originals` es privado. La ruta de la original puede incluir el usuario, pero nunca sale en una vista o DTO. La política de inserción permite el objeto solo si la ruta corresponde a una clave `in_progress` del usuario; la política de borrado solo permite retirar una original que aún no pertenece a un reporte publicado. Ambas comprobaciones usan helpers `SECURITY DEFINER` con `search_path` vacío.
- `reports-public` es público, tiene límites de tamaño y MIME y recibe la copia sin metadatos con ruta `{report_id}.{ext}`, sin identificador de usuario. La política de inserción exige una clave propia en estado `in_progress`. La URL de lectura se arma con `getPublicUrl`; no se generan URLs firmadas para visitantes anónimos.
- El saneamiento se hace en TypeScript puro, sin decodificar la imagen: quitar segmentos APP en JPEG, chunks `eXIf` y de texto en PNG y chunk EXIF en WebP. Si la estructura no se puede analizar con seguridad, se rechaza como error de validación. Se valida el contenido y MIME contra `IMAGE_MIME_TYPES`.
- La elección de bucket público para la copia saneada es provisoria y debe confirmarse con Fran. La original nunca se hace pública. La política/retención de originales sigue siendo provisoria según el contrato.
- No se implementa limpieza SQL de huérfanas. Borrar objetos exige Storage API con credencial de servidor; queda pendiente definir una limpieza segura que no agregue `service_role` al flujo normal.

### 3. Idempotencia

- `idempotency_keys` mantiene RLS activa y no permite lectura directa del cliente. Las RPC `claim_idempotency_key`, `publish_report` y `fail_idempotency_key` obtienen el usuario de `auth.uid()`, son `SECURITY DEFINER` con `search_path = ''`, revocan ejecución a `public` y `anon`, y conceden ejecución solo a `authenticated`.
- `claim_idempotency_key` recibe clave y hash, sin parámetro de duración. `locked_until` usa un intervalo fijo de tres minutos, separado de `expires_at`; el claim es atómico con `INSERT ... ON CONFLICT` y recuperación condicional de locks vencidos.
- El hash cubre SHA-256 de bytes originales y JSON canónico, incluida `location.address`, con texto normalizado, coordenadas normalizadas y claves ordenadas. Se almacena `report_id`, no un cuerpo de respuesta. Una repetición completada reconstruye el DTO desde la base y vuelve a obtener la URL pública.

### 4. Esquema, RLS y confirmaciones

- `reports.status` acepta solo `pending` y `citizen-verification` en el MVP. Tiene `confirmation_threshold` por fila con default 3 y `confirmation_count` mantenido por `confirm_report` bajo el lock de la fila. Las columnas `street` y `street_number` validan calle de 2 a 80 caracteres sin espacios exteriores y número opcional de 1 a 99999. Se guardan por separado la ruta privada original y `photo_public_path`.
- Se revocan todos los privilegios directos sobre `reports` a `anon` y `authenticated`; solo `public_reports` recibe `SELECT`. No hay políticas de mutación de clientes. La vista incluye solo estados MVP y expone `photo_public_path`, `confirmation_count`, `confirmation_threshold`, dirección y campos públicos. Excluye `user_id`, ruta original, MIME, tamaño y campos institucionales `resolved`/`resolved_at`.
- La vista usa `security_invoker = false` con privilegios de propietario acotados para proyectar filas, y recibe permisos `SELECT` solo para `anon` y `authenticated`. Revisar en Supabase local el propietario de la vista y sus permisos efectivos.
- `confirm_report` toma usuario de `auth.uid()`, usa `SECURITY DEFINER`, `search_path` vacío y `FOR UPDATE`; no acepta conteos del cliente. Lee el umbral de la fila, inserta con unicidad por reporte/usuario y actualiza el conteo/transición dentro de la operación.
- La precedencia es: validar existencia y autoría; si ya hay una confirmación de esa cuenta, responder `ALREADY_CONFIRMED` idempotentemente; si no existe y la etapa ya no admite nuevas confirmaciones, responder `REPORT_RESOLVED`; en caso contrario insertar y contar. Así, el replay existente se distingue de un intento nuevo en una etapa cerrada.
- Se elimina `get_confirmation_threshold()` inmutable. El cliente no puede escribir `confirmation_count` ni cambiar el umbral.

### 5. API, dirección y cursor

- Los servicios publican solo mediante `publish_report`; el `INSERT` directo de la clave publicable queda prohibido. Para listas y detalle, se mapea `photo.url` desde la URL pública de `photo_public_path`.
- La rama recibe la dirección mediante un adaptador pequeño local en `lib/reports/`, con tipo local `{ street, number }`; no se modifica `lib/contracts/`. Lista y detalle siempre devuelven `location.address`, sin cast ni calle vacía de fallback. Al integrarse el PR #3, el único archivo que debe reemplazarse para ese límite es el adaptador.
- Se conserva la forma de cursor `{ version, createdAt, id, filters }`, el orden estable y los filtros existentes. `resolvedAt` del DTO se resuelve como `null` en el MVP; no se lee ni publica `resolved_at`.

### 6. Migraciones y verificación local

- Como las migraciones `20261023000001` a `20261023000005` no fueron aplicadas en ningún entorno, se editan en su lugar. Si antes de editarlas aparece evidencia de aplicación, detener el bloque y avisar para crear migraciones nuevas.
- No ejecutar `supabase link`, `db push` ni `reset --linked`. Usar únicamente Supabase local si Docker y Supabase CLI ya funcionan; no instalar herramientas. Los scripts de integración deben abortar salvo que la URL configurada sea `localhost` o `127.0.0.1`.
- Si no existe entorno local, quedan sin marcar las pruebas que dependen de Postgres, Auth o Storage reales, con la limitación documentada.

## Riesgos y compensaciones

- **[Riesgo]** Una copia públicamente accesible se comparte por URL. **→ Mitigación:** solo se expone la copia derivada, saneada y sin ruta de usuario; mantener la decisión provisoria hasta revisión de Fran.
- **[Riesgo]** Sin credencial de servidor no se puede enumerar ni borrar huérfanas con garantías. **→ Mitigación:** no usar SQL directo sobre `storage.objects`; dejar la limpieza pendiente y diseñar una Storage API segura.
- **[Riesgo]** Límites de cuerpo en el hosting pueden rechazar fotos multipart válidas. **→ Mitigación:** acordar con Fran tamaño máximo de cliente compatible con 4 MiB de archivo más el resto del request y verificar el límite real del despliegue antes de integrar.
- **[Riesgo]** Fixtures y clientes simulados no prueban RLS ni concurrencia. **→ Mitigación:** scripts con guardia de URL local y pruebas contra Auth, Postgres y Storage locales; sin marcar evidencia que no se haya ejecutado.

## Plan de migración y merge

1. Revisar los cuatro artefactos y el estado real del código; mantener las cinco migraciones editables en su lugar mientras no haya evidencia de aplicación.
2. Implementar y probar los bloques de esquema/RPC, servicios/fotos y rutas; ejecutar cada bloque de integración solo si Supabase local está disponible.
3. Integrar primero PR #3 (`add-report-address`) a `main`; después actualizar únicamente `lib/reports/address.ts` para importar el contrato compartido y correr las verificaciones de integración.
4. Integrar el PR de `feature/reports-backend` después del PR #3 y sus revisiones. No hacer push ni merge desde este trabajo.

## Decisiones abiertas

### Fran (también llamado Francisco) — interfaz y mapas

- Confirmar que `reports-public` con copias saneadas y URL pública satisface el consumo de lista/detalle y el tratamiento de caché.
- Confirmar el límite de tamaño del multipart desde cliente considerando el límite del hosting, y si el cliente comprimirá antes de enviar.
- Revisar e integrar PR #3 antes que el backend; luego cambiar solamente el adaptador de dirección.
- Definir con qué mecanismo autorizado se limpiarán huérfanas mediante Storage API; no se implementa en SQL.
- Confirmar la política provisoria de retención de originales y copias.

### Valen — visión

- Confirmar que análisis de visión permanece en memoria y que el flujo de reportes no necesita persistir resultados ni metadatos de análisis. El backend no recibe ni almacena datos de visión en este cambio.

## Pedidos a otros módulos

- **Fran / PR #3 (`add-report-address`):** integrar primero el contrato `Location.address` compartido. No editar `lib/contracts/**`, `docs/contracts.md` ni `package.json` desde este cambio. Hasta el merge, el backend mantiene su adaptador local.
- **Fran / Storage:** revisar la decisión provisoria de lectura pública de copias saneadas y acordar consumo/cache, tamaño de request y limpieza por Storage API.
- **Valen / visión:** confirmar el límite de datos en memoria, sin pedir cambios en `lib/vision/**` dentro de este cambio.
- **Agus / seguridad de fotos públicas:** las políticas pueden vincular una carga a un claim propio `in_progress`, pero Postgres/Storage no pueden comprobar que el contenido público perdió sus metadatos. Como el RPC y Storage usan el rol `authenticated`, un cliente puede invocarlos directamente y omitir el saneamiento del handler. Acordar la amenaza aceptable y una forma de impedirlo antes de habilitar el bucket público; no hay una comprobación de bytes en estas migraciones.

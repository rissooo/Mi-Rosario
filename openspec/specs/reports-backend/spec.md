# reports-backend Specification

## Purpose
Permitir publicar y consultar reportes ciudadanos con persistencia controlada, fotos derivadas sin metadatos, reintentos idempotentes y confirmaciones atómicas, con permisos definidos en la base de datos (RLS y Storage solo del servidor).

## Requirements

### Requirement: Publicación autenticada y límite de carga

El backend SHALL aceptar en `POST /api/reports` una sesión autenticada, `Idempotency-Key`, el campo multipart `report` como cadena JSON y `image` como archivo. SHALL validar los campos revisados y la imagen JPEG, PNG o WebP antes de reclamar o publicar.

#### Scenario: Límite de tamaño declarado

- **WHEN** `Content-Length` supera `MAX_MULTIPART_BYTES`
- **THEN** el handler responde HTTP 413 antes de leer el cuerpo o llamar a `request.formData()`

#### Scenario: Límite del archivo real

- **WHEN** el tamaño del archivo recibido supera `MAX_IMAGE_BYTES` (4 MiB)
- **THEN** el servicio responde HTTP 413 antes de leer sus bytes, reclamar la clave o subir objetos

#### Scenario: Publicación válida

- **WHEN** una persona autenticada envía un reporte JSON válido, una foto admisible y una clave nueva
- **THEN** el backend vuelve a validar y sanear la imagen en TypeScript sin decodificar sus píxeles
- **THEN** guarda la entrada recibida en `reports-originals` privado y la copia saneada en `reports-public`, con ruta `{report_id}.{ext}`
- **THEN** invoca `publish_report`, que inserta el reporte `pending` con el ID reservado y completa la clave en una transacción
- **THEN** la respuesta incluye dirección y URL pública de la copia, con `Photo.expiresAt` en `null` porque esa URL no vence

#### Scenario: JSON del reporte mal formado

- **WHEN** el campo `report` contiene JSON inválido
- **THEN** el backend responde HTTP 400 con el sobre de error del contrato
- **THEN** no reclama una clave ni sube fotos

#### Scenario: Error interno

- **WHEN** Storage, SQL o el handler devuelve un error inesperado
- **THEN** el mensaje HTTP no incluye rutas de Storage, identificadores de usuario ni nombres de funciones SQL

### Requirement: Idempotencia durable y cuotas por cuenta

El backend SHALL delimitar la clave por usuario autenticado, reservar y persistir un `report_id` en `claim_idempotency_key`, usar un lock fijo de tres minutos y serializar por usuario el conteo de cuotas. Los valores de cuota SHALL ser configurables en SQL, con valores iniciales de tres claims `in_progress` y diez reportes publicados por ventana móvil de 24 horas. La cuota diaria SHALL comprobarse también en `publish_report`.

#### Scenario: Repetición de publicación completada

- **WHEN** la misma cuenta reintenta una clave completada con los mismos datos
- **THEN** recibe el reporte existente con el mismo `report_id`, sin duplicar fila ni objetos

#### Scenario: Cuarto claim activo

- **WHEN** una cuenta ya tiene tres claims `in_progress` con lock vigente e intenta un cuarto
- **THEN** el claim se rechaza con `RATE_LIMITED` (HTTP 429) y `Retry-After` en segundos
- **THEN** no se reserva un ID para el claim rechazado ni se sube una foto

#### Scenario: Reporte 11 dentro de 24 horas

- **WHEN** una cuenta ya publicó diez reportes en la ventana móvil de 24 horas e intenta reclamar el reporte 11
- **THEN** el claim se rechaza con `RATE_LIMITED` (HTTP 429) y `Retry-After` en segundos
- **THEN** `publish_report` vuelve a aplicar el límite antes de insertar por si el conteo cambió después del claim

#### Scenario: Clave reutilizada con contenido distinto o lock activo

- **WHEN** la clave tiene otro hash o sigue bloqueada para una publicación en curso
- **THEN** la API responde `IDEMPOTENCY_CONFLICT` o `PUBLICATION_IN_PROGRESS`, según corresponda, con HTTP 409

#### Scenario: Resultado ambiguo o error posterior al commit

- **WHEN** un timeout o error de red impide conocer el resultado del commit
- **THEN** el backend conserva las fotos y no marca el claim como fallido para permitir el replay con la misma clave
- **WHEN** el commit terminó, pero falla la lectura o preparación de la respuesta
- **THEN** conserva reporte y fotos y no marca la clave como fallida

#### Scenario: Error definitivo anterior al commit

- **WHEN** una RPC confirma un rechazo definitivo anterior al commit
- **THEN** el backend elimina las fotos subidas y luego marca la clave como fallida

### Requirement: Copias públicas saneadas y catálogo MVP

El catálogo SHALL leer solo `public_reports`, con estados `pending` y `citizen-verification`. SHALL exponer dirección y metadatos de la copia pública, nunca la identidad del autor ni la ruta o los metadatos de la original.

#### Scenario: Lectura pública paginada

- **WHEN** una persona solicita reportes anónimos con filtros válidos
- **THEN** recibe orden estable, cursor y dirección `location.address`
- **THEN** `photo.url` se deriva de `photo_public_path` mediante `getPublicUrl`; la copia es accesible sin sesión
- **THEN** la vista expone `photo_public_path`, `photo_public_mime_type`, `photo_public_byte_size`, conteo y umbral efectivos
- **THEN** no expone `user_id`, `storage_path`, metadatos de la original, `resolved` ni `resolved_at`

#### Scenario: Parámetros GET inválidos

- **WHEN** la consulta de lista repite una clave, incluye una clave desconocida o contiene un valor parcial/mal formado
- **THEN** responde con el sobre de error y el código HTTP del validador estricto del contrato

#### Scenario: DTO de base inválido

- **WHEN** la fila mapeada para lista o detalle no cumple otra regla del DTO
- **THEN** el servicio responde con error interno genérico sin filtrar el error de base
- **THEN** el validador compartido se ejecuta sobre el DTO real, sin copias ni fechas agregadas

### Requirement: Foto pública sin vencimiento

El backend SHALL devolver `Photo.expiresAt` en `null` para la copia pública, porque `getPublicUrl` no vence, y SHALL NOT inventar un vencimiento. Lista y detalle SHALL pasar el validador completo del contrato.

#### Scenario: Respuesta pública sin vencimiento

- **WHEN** lista o detalle crea el DTO desde `photo_public_path`
- **THEN** `photo.expiresAt` es `null` y `validateReport` acepta la respuesta real

### Requirement: Confirmaciones ciudadanas atómicas

La base SHALL determinar la cuenta mediante `auth.uid()`, impedir que el autor confirme su reporte, aceptar solo una confirmación por usuario/reporte y mantener el conteo y la transición bajo lock de la fila. El umbral SHALL leerse de la fila `reports.confirmation_threshold`.

#### Scenario: Primera confirmación

- **WHEN** una cuenta distinta del autor confirma por primera vez un reporte `pending` o `citizen-verification`
- **THEN** la base registra como máximo una fila por usuario y reporte y devuelve conteo y umbral reales
- **THEN** al alcanzar el umbral de esa fila transiciona a `citizen-verification`

#### Scenario: Confirmación repetida o etapa no confirmable

- **WHEN** la cuenta ya había confirmado
- **THEN** recibe `ALREADY_CONFIRMED` sin una fila nueva, con prioridad frente al rechazo por etapa cerrada
- **WHEN** no existía confirmación y el reporte ya no admite confirmaciones
- **THEN** recibe `REPORT_RESOLVED` y no se inserta una fila

#### Scenario: Consulta de la confirmación propia

- **WHEN** una cuenta autenticada consulta `GET .../confirmations/me`
- **THEN** el handler usa `get_my_confirmation` y devuelve confirmación, conteo y umbral de esa fila sin leer tablas cerradas desde el cliente

### Requirement: Privilegios, RLS y límites de Storage

Las tablas públicas creadas SHALL activar RLS. Las funciones `SECURITY DEFINER` SHALL fijar `search_path` vacío, revocar la ejecución por defecto a `PUBLIC` y `anon`, y concederla solo a `authenticated` cuando corresponda. No SHALL haber escritura directa de clientes en `reports`.

#### Scenario: Lectura o escritura directa de tablas

- **WHEN** `anon` o `authenticated` accede directamente a `reports`
- **THEN** no recibe filas ni permisos directos; la lectura pública se concede solo sobre la vista
- **WHEN** una cuenta intenta insertar directamente un reporte o una confirmación
- **THEN** la operación es rechazada

#### Scenario: Solo el servidor escribe en Storage

- **WHEN** el handler sube las fotos de un claim propio
- **THEN** usa el cliente del servidor con la clave secreta, después de sanear la copia y de que el claim devolvió el `report_id` de esa cuenta
- **THEN** la original permanece privada y la copia pública no contiene el ID de usuario en su ruta
- **WHEN** una cuenta autenticada intenta subir, reemplazar o borrar un objeto de reportes directamente con la clave publicable
- **THEN** Storage lo rechaza porque no existe ninguna policy de cliente sobre esos buckets

#### Scenario: Límites de verificación en SQL

- **WHEN** una cuenta autenticada invoca directamente una RPC con clave publicable
- **THEN** las comprobaciones SQL validan identidad, ownership, claim, estado, rutas, existencia de los objetos subidos por el servidor, hash guardado, metadatos declarados, cuotas y restricciones `CHECK`
- **THEN** sin fotos subidas por el servidor para ese claim, `publish_report` rechaza la publicación

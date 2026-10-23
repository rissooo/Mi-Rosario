# Spec Delta

## Purpose

Permite publicar y consultar reportes ciudadanos con persistencia segura, fotos presentables sin metadatos, reintentos idempotentes y corroboraciones atómicas en la base de datos.

## ADDED Requirements

### Requirement: Publicación autenticada con foto segura y dirección
El backend SHALL aceptar publicaciones multipart autenticadas con los campos revisados, una foto original válida y una clave de idempotencia. SHALL mantener la original privada y exponer únicamente una copia pública sin metadatos; la dirección SHALL incluir calle y número opcional.

#### Scenario: Publicación exitosa
- **WHEN** una persona autenticada publica un reporte válido con una clave UUID nueva y una foto admitida
- **THEN** el sistema guarda la original en almacenamiento privado y una copia saneada en almacenamiento público
- **THEN** crea el reporte en estado `pending`, con la dirección y el `report_id` reservado para esa clave
- **THEN** responde HTTP 201 con un DTO que incluye `location.address` y una URL pública de la copia saneada

#### Scenario: Solicitud sin clave válida
- **WHEN** una publicación no tiene `Idempotency-Key` o contiene una clave mal formada
- **THEN** el sistema responde HTTP 400 y no escribe en la base ni en Storage

#### Scenario: Tipo de imagen inválido o formato no analizable
- **WHEN** el contenido no coincide con un JPEG, PNG o WebP admitido, o no puede analizarse para quitar metadatos
- **THEN** el sistema rechaza la publicación como error de validación y no publica el reporte

#### Scenario: Fallo de Storage antes de persistir
- **WHEN** Storage no puede guardar cualquiera de las dos copias antes de publicar el reporte
- **THEN** el sistema no crea el reporte y responde con el error de disponibilidad correspondiente

#### Scenario: Error definitivo de base anterior al commit
- **WHEN** la RPC de publicación devuelve un error definitivo antes de confirmar la transacción
- **THEN** el sistema elimina los objetos subidos y marca la clave como fallida

#### Scenario: Resultado ambiguo por timeout
- **WHEN** la solicitud pierde conexión o vence el tiempo de espera durante la publicación
- **THEN** el sistema conserva los objetos y la clave sin marcar como fallida
- **THEN** un reintento con la misma clave y el mismo contenido reutiliza el mismo `report_id` y resuelve si la publicación se confirmó

#### Scenario: Error posterior a una publicación confirmada
- **WHEN** ocurre un error al reconstruir o devolver la respuesta después del commit
- **THEN** el sistema conserva el reporte y ambas fotos, y no marca la clave como fallida

### Requirement: Idempotencia durable de publicación
El backend SHALL delimitar la idempotencia por usuario y clave, reservar un `report_id` al reclamarla y distinguir operaciones activas, completadas y fallidas.

#### Scenario: Repetición de publicación completada
- **WHEN** el mismo usuario reintenta una clave completada con el mismo contenido
- **THEN** el sistema devuelve HTTP 200 con el reporte existente y la misma identidad de reporte
- **THEN** no crea otro reporte ni otros objetos de Storage

#### Scenario: Repetición concurrente durante el bloqueo
- **WHEN** llega otro request con la misma clave mientras el primer request conserva el bloqueo de tres minutos
- **THEN** el sistema responde HTTP 409 con `PUBLICATION_IN_PROGRESS` y `Retry-After`

#### Scenario: Reutilización de clave con contenido distinto
- **WHEN** una clave existente se presenta con un hash de contenido diferente
- **THEN** el sistema responde HTTP 409 con `IDEMPOTENCY_CONFLICT`

### Requirement: Catálogo público de reportes MVP
El catálogo público SHALL consultar una proyección que omita identidad del autor y rutas privadas, y solo SHALL incluir los estados MVP `pending` y `citizen-verification`.

#### Scenario: Consulta pública de reportes
- **WHEN** una persona anónima lista reportes con filtros geográficos, de categoría o estado
- **THEN** recibe páginas estables con cursor y DTOs que incluyen coordenadas, `address`, estado y datos efectivos de confirmación
- **THEN** cada foto usa la URL pública de la copia saneada, accesible sin sesión
- **THEN** la proyección no expone `user_id`, ruta original, MIME ni tamaño de archivo

#### Scenario: Exclusión de etapas fuera del MVP
- **WHEN** una persona consulta el catálogo público
- **THEN** solo se devuelven reportes `pending` o `citizen-verification`
- **THEN** no se exponen reportes ocultos, rechazados ni etapas institucionales futuras

### Requirement: Confirmación ciudadana y transición atómica
El backend SHALL aceptar confirmaciones autenticadas de personas distintas del autor, con una por cuenta y reporte, y SHALL mantener el conteo y la transición bajo control transaccional de la base.

#### Scenario: Confirmación válida
- **WHEN** una persona autenticada distinta del autor confirma por primera vez un reporte `pending`
- **THEN** la base registra una sola confirmación para esa cuenta y reporte
- **THEN** devuelve el conteo y umbral efectivos, y cambia a `citizen-verification` cuando se alcanza el umbral del reporte

#### Scenario: El autor intenta confirmarse
- **WHEN** el autor confirma su propio reporte
- **THEN** el sistema responde con `AUTHOR_CANNOT_CONFIRM` y no inserta una confirmación

#### Scenario: Repetición de una confirmación existente
- **WHEN** una cuenta repite una confirmación que ya registró
- **THEN** el sistema responde con `ALREADY_CONFIRMED` sin duplicar la fila, incluso si la etapa ya no admite nuevas confirmaciones

#### Scenario: Nueva confirmación en una etapa no confirmable
- **WHEN** una cuenta intenta agregar una confirmación nueva a una etapa no confirmable, incluida `resolved` si existiera en una evolución posterior
- **THEN** el sistema responde con `REPORT_RESOLVED` y no inserta una fila

#### Scenario: Confirmaciones concurrentes alcanzan el umbral
- **WHEN** tres cuentas válidas confirman concurrentemente un reporte con umbral efectivo 3
- **THEN** la base serializa el conteo, registra una fila por cuenta y transiciona el reporte una sola vez

### Requirement: Límites de seguridad de base y almacenamiento
La base SHALL aplicar permisos y RLS; las mutaciones de reportes e idempotencia SHALL realizarse solo mediante RPC autenticadas, y los objetos originales SHALL permanecer privados.

#### Scenario: Lectura directa de tabla interna
- **WHEN** una clave publicable consulta `reports` directamente como `anon` o `authenticated`
- **THEN** no obtiene filas ni columnas de la tabla
- **THEN** puede leer únicamente las columnas otorgadas de `public_reports`

#### Scenario: Inserción directa de reporte
- **WHEN** un cliente autenticado intenta insertar directamente en `reports`
- **THEN** PostgreSQL rechaza la operación

#### Scenario: Publicación RPC sin sesión
- **WHEN** un cliente anónimo invoca la RPC de publicación o de reclamo de idempotencia
- **THEN** la base rechaza la llamada por falta de sesión autenticada

#### Scenario: Lectura de confirmaciones de otra cuenta
- **WHEN** una cuenta consulta confirmaciones de otra cuenta
- **THEN** RLS no revela esas filas

#### Scenario: Acceso a fotos
- **WHEN** una persona anónima solicita la URL de una foto pública
- **THEN** solo accede a la copia saneada
- **THEN** la original privada no es accesible sin autorización

# Spec Delta

## Purpose

Define entregables verificables del contrato compartido de reportes, para que las futuras funcionalidades de backend y mapa se puedan especificar por separado sin afirmar que ya existen.

## ADDED Requirements

### Requirement: Alcance del contrato de arquitectura
La base SHALL aportar DTO, validadores, fixtures y documentación de reportes. El comportamiento en ejecución de endpoints, base de datos, Storage e interfaz SHALL especificarse y verificarse en changes funcionales futuros aparte, y no presentarse como entregado por esta base.

#### Scenario: Revisión de finalización de la arquitectura
- **WHEN** el equipo evalúa si este change está completo o se puede archivar
- **THEN** revisa los entregables del paquete de contratos y las tareas de colaboración
- **THEN** no se afirma ninguna capacidad de reportes desplegada solo porque esos artefactos pasen

### Requirement: Definiciones ampliadas del reporte y del detalle del mapa
El paquete de contratos SHALL definir foto, título, descripción, categoría del catálogo, gravedad informada por el vecino, etapa, ubicación, fechas y datos de confirmaciones ciudadanas para el detalle público del mapa, sin referencias privadas a cuentas ni a Storage.

#### Scenario: Fixture de detalle
- **WHEN** Fran valida un fixture sintético del detalle del mapa
- **THEN** el DTO compartido representa todos los campos del detalle, incluida la URL de presentación de la foto y su vencimiento
- **THEN** el fixture no incluye email, identidad del autor ni rutas de objetos privados

### Requirement: Definiciones revisadas del catálogo y la validación
El paquete SHALL definir exactamente cuatro categorías iniciales activas del MVP: pothole, missing-light, damaged-sidewalk y faulty-traffic-light, conservando los IDs existentes. SHALL permitir elegir a mano las cuatro, validar contra el catálogo activo y sumar extensiones futuras revisadas, junto con las restricciones de gravedad aprobadas y los límites de título propuestos.

#### Scenario: Fixtures de categorías manuales aprobadas
- **WHEN** los fixtures de contrato prueban la selección manual de cada categoría inicial
- **THEN** el catálogo asocia pothole con Baches, missing-light con Falta de luz, damaged-sidewalk con Veredas dañadas y faulty-traffic-light con Semáforos defectuosos
- **THEN** la publicación acepta cada ID activo revisado sin exigir una sugerencia de Gemini y rechaza categorías nulas, desconocidas o inactivas

#### Scenario: Compatibilidad de identificadores
- **WHEN** se revisa el catálogo inicial de cuatro entradas
- **THEN** pothole y missing-light conservan sus identificadores y los nuevos usan kebab-case en inglés y en minúsculas
- **THEN** no hay activa una quinta categoría ni una opción implícita "otro"

#### Scenario: Revisión de una ampliación de categorías
- **WHEN** alguien propone una categoría además de las cuatro aprobadas
- **THEN** la documentación exige aprobar el alcance y revisar en conjunto el catálogo, los validadores, la IA y los fixtures antes de activarla

#### Scenario: Conciliación del contexto del proyecto
- **WHEN** el equipo revisa si está listo para implementar
- **THEN** la documentación registra que la actualización de openspec/config.yaml, autorizada aparte, ya coincide con las cuatro categorías aprobadas
- **THEN** la decisión de producto de cuatro categorías sigue aprobada y la implementación de la base conserva config.yaml

#### Scenario: Entrada de contrato inválida
- **WHEN** las verificaciones del contrato prueban campos desconocidos, categorías inactivas, coordenadas incorrectas o publicaciones sin revisar
- **THEN** los validadores las rechazan con los errores de campo documentados

### Requirement: Contrato de la foto original a cargo del backend
El paquete SHALL definir la publicación explícita en multipart con campos revisados, una foto original y una clave de idempotencia estable. La documentación SHALL asignar al backend guardar el original, asociarlo al reporte, el acceso privado, la presentación segura, la recuperación y la limpieza.

#### Scenario: Fixture de referencia de publicación
- **WHEN** Agus revisa el contrato de publicación y los ejemplos de falla
- **THEN** exigen un original guardado y asociado a cada reporte publicado, y prohíben que la IA guarde algo
- **THEN** las operaciones incompletas quedan sin publicar y los reintentos no pueden crear otro reporte ni borrar una foto ya confirmada

### Requirement: Definiciones de reintentos de publicación
El paquete SHALL documentar la idempotencia por cuenta con huellas del contenido, detección de conflictos y manejo de concurrencia. SHALL distinguir las repeticiones de operaciones completadas, las operaciones en curso, los errores temporales de almacenamiento y las publicaciones nuevas intencionales.

#### Scenario: Casos de publicación repetida
- **WHEN** los fixtures de contrato prueban la misma clave con el mismo contenido, con contenido distinto y con un request concurrente
- **THEN** describen, respectivamente, 200 con el mismo reporte, 409 IDEMPOTENCY_CONFLICT y 409 PUBLICATION_IN_PROGRESS
- **THEN** la primera finalización es 201 y la falta temporal de Storage es 503 STORAGE_UNAVAILABLE

### Requirement: Definiciones de corroboración ciudadana independiente
El paquete SHALL definir el umbral inicial aprobado de 3 confirmaciones válidas de usuarios autenticados distintos que no sean el autor, configurable en el backend sin cambios en la interfaz. Los contratos SHALL definir una transición automática y atómica de pending a citizen-verification al llegar al umbral efectivo, independiente de la evidencia institucional.

#### Scenario: Fixture del umbral inicial aprobado
- **WHEN** un fixture de reporte pendiente llega a 3 confirmaciones válidas de 3 usuarios autenticados distintos que no son el autor, con el umbral inicial de 3
- **THEN** muestra umbral 3, policyStatus approved, corroborated true y la etapa citizen-verification
- **THEN** por debajo del umbral sigue pending, y la cantidad no produce verificación municipal ni resolución

#### Scenario: Corroboraciones inválidas y repetidas
- **WHEN** los ejemplos de contrato incluyen al autor, requests sin sesión, requests repetidos o requests concurrentes de la misma cuenta
- **THEN** solo cuenta una confirmación aceptada por cada cuenta autenticada distinta que no sea el autor
- **THEN** las referencias de aceptación del backend exigen actualizar la cantidad y la etapa de forma atómica, sin transiciones repetidas

#### Scenario: Umbral configurado en el backend
- **WHEN** un fixture de contrato devuelve un umbral positivo T del backend distinto de 3
- **THEN** usa T como límite entre pending y citizen-verification y le entrega a la interfaz el umbral efectivo y el estado según el servidor
- **THEN** no hace falta una nueva versión del frontend ni un umbral fijo en el código

### Requirement: Contrato de gravedad aprobado
El paquete SHALL definir Severity como low, medium o high, con las etiquetas baja, media o alta. SHALL documentar los criterios de impacto aprobados, las sugerencias de Gemini editables y que pueden ser nulas, y una gravedad válida obligatoria al publicar. La gravedad SHALL NOT otorgar automáticamente una verificación municipal.

#### Scenario: Fixtures de criterios de gravedad
- **WHEN** se revisan las definiciones compartidas de gravedad
- **THEN** baja significa molestia o deterioro menor, media significa que puede dificultar la circulación o el uso del espacio público, y alta significa riesgo importante para personas o vehículos
- **THEN** los validadores de publicación rechazan null, unassessed y los valores fuera de la escala de tres niveles

#### Scenario: Gravedad alta no es autoridad municipal
- **WHEN** un fixture de contrato representa una gravedad alta
- **THEN** su verificación institucional sigue siendo independiente y no se infiere ninguna etapa municipal a partir de la gravedad

### Requirement: Definición de la consulta de confirmación de la cuenta actual
El paquete SHALL definir GET /api/reports/{id}/confirmations/me con sesión, con status, confirmed, confirmedAt, canConfirm, reason y los datos de verificación ciudadana, incluido el umbral efectivo del backend. SHALL mantener esta respuesta privada y separada del detalle público del reporte.

#### Scenario: Fixtures del estado de confirmación
- **WHEN** las verificaciones de fixtures cubren una cuenta sin confirmar, una cuenta que ya confirmó, al autor y un reporte resuelto
- **THEN** cada caso tiene un resultado de elegibilidad documentado sin revelar otra cuenta
- **THEN** los ejemplos sin sesión y de reporte inexistente usan 401 y 404, respectivamente

### Requirement: Definición del orden de la mutación de confirmación
El paquete SHALL definir la exclusión del autor, la unicidad en la base de datos y las confirmaciones nuevas atómicas. Las confirmaciones existentes SHALL documentarse como repeticiones exitosas, incluso después de la resolución; las confirmaciones nuevas en reportes resueltos SHALL rechazarse.

#### Scenario: Casos límite de confirmación
- **WHEN** la verificación del contrato valida los ejemplos de mutación
- **THEN** la confirmación del autor es 403 AUTHOR_CANNOT_CONFIRM, la primera inserción válida es 201 y un duplicado es 200
- **THEN** una confirmación existente en un reporte resuelto sigue siendo 200, mientras que una nueva es 409 REPORT_RESOLVED

### Requirement: Presentación de cuatro etapas y límite institucional
El paquete SHALL definir pendiente, verificación ciudadana, verificación municipal y resuelto, con datos ciudadanos e institucionales independientes. Las operaciones municipales SHALL quedar fuera del MVP, y los registros institucionales sintéticos SHALL identificarse como simulaciones no oficiales.

#### Scenario: Fixture real del MVP
- **WHEN** el paquete valida un ejemplo del MVP con forma de producción
- **THEN** la verificación institucional no está disponible, sin evidencia ni fecha de resolución
- **THEN** la presentación de cuatro pasos no marca como completados los pasos municipal o resuelto, que no están disponibles

#### Scenario: Documentación de la autoridad futura
- **WHEN** el equipo revisa la hoja de ruta institucional
- **THEN** la verificación municipal queda reservada para cuentas institucionales autorizadas, y el cierre además requiere un permiso de moderador o de cierre otorgado en la base de datos
- **THEN** este MVP no incluye permisos de rol, endpoints de mutación municipal ni controles operativos

### Requirement: Documentación de los límites de base de datos y transporte
El paquete SHALL documentar RLS, unicidad, proyecciones privadas, políticas de Storage, la finalización atómica de la publicación y el sobre de error en español. Las restricciones SHALL aplicarse más allá de la interfaz en los tests de aceptación de las funcionalidades futuras.

#### Scenario: Traspaso al backend
- **WHEN** Agus toma el traspaso de la arquitectura
- **THEN** identifica las verificaciones de base de datos y Storage para suplantación, autoconfirmación, reintentos concurrentes, acceso a objetos privados y futuras condiciones de carrera con la resolución
- **THEN** las migraciones reales y los tests en ejecución siguen siendo tareas del change funcional de backend aparte

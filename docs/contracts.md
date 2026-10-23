# Hoja de arquitectura y contratos compartidos

Este paquete prepara el trabajo independiente de Valen (IA), Agus (backend) y Fran (frontend). Aporta DTO de TypeScript, validadores puros y ejemplos sintéticos. **No se implementa ningún handler HTTP, tabla de base de datos, operación de Storage, integración con Gemini, mapa ni pantalla.** Que un test de fixtures pase no prueba el comportamiento del servicio, la idempotencia, la concurrencia ni la autorización.

## Registro de decisiones

El usuario aprobó la implementación de la arquitectura, las cuatro categorías, los criterios de gravedad, una foto original al publicar, el umbral ciudadano inicial de 3 y el modelo de cuatro etapas. `openspec/config.yaml` ya contiene las cuatro categorías y una regla de proposal entre comillas; las referencias anteriores a un defecto más acotado de contexto o de YAML quedaron resueltas sin cambiar la configuración en esta implementación.

| Decisión | Estado |
| --- | --- |
| Cuatro IDs de categorías activas iniciales y selección manual | Aprobada |
| Gravedad low/medium/high con sugerencias de Gemini editables | Aprobada |
| Foto original guardada solo por el backend al publicar explícitamente | Aprobada; implementación futura |
| Tres confirmaciones de cuentas autenticadas distintas que no sean el autor | Aprobada; umbral configurable en el backend |
| Paso automático de pending a citizen-verification al llegar al umbral efectivo | Aprobada; implementación atómica futura en la base de datos |
| Evidencia institucional independiente; sin operaciones municipales en el MVP | Límite de alcance aprobado |
| Largo del título de 5 a 120 code points Unicode | Provisorio; solo para evaluar el contrato hasta que se apruebe en producto |
| Retención de fotos originales y borrado de cuentas | Decisión de producción pendiente |
| Versionado de la política y tratamiento retroactivo al cambiar el umbral | Decisión operativa pendiente; el umbral inicial de 3 está aprobado |
| Mapeo de identidad y roles institucionales y alcance futuro compatible | Decisión pendiente para después del MVP |

No se da por hecha ninguna aprobación ni revisión de Agus o Fran a partir de la aprobación del usuario o de los archivos generados. Sus revisiones del contrato y sus verificaciones individuales de incorporación siguen pendientes.

## Puntos de entrada del paquete

| Archivo | Exporta / para qué sirve |
| --- | --- |
| `lib/contracts/categories.ts` | `CategoryId` extensible, `InitialMvpCategoryId` explícito, catálogo y verificación de categoría activa |
| `lib/contracts/reports.ts` | Gravedad y criterios, etapas y etiquetas, publicación, archivo original, presentación segura de la foto, DTO de reporte, consulta y lista, y de confirmación privada |
| `lib/contracts/vision.ts` | Sugerencia que puede ser nula, request/response del análisis, constante de tiempo límite |
| `lib/contracts/errors.ts` | Códigos de error compartidos, mapeo a status HTTP y sobre exclusivo `ApiResult<T>` |
| `lib/contracts/validation.ts` | Validación y parseo puros en ejecución; sin dependencias de red, sesión, base de datos ni proveedores |
| `lib/contracts/fixtures.ts` | Ejemplos sintéticos válidos y de error, y simulaciones institucionales aisladas |

Importá las exportaciones con nombre de estos archivos. El código del navegador no debe importar repositorios, adaptadores de proveedores ni clientes de Supabase del servidor. No hace falta ningún SDK para usar los contratos.

## Catálogo y gravedad

| ID | Etiqueta | Manual / sugerencia de IA |
| --- | --- | --- |
| `pothole` | Baches | Ambas |
| `missing-light` | Falta de luz | Ambas |
| `damaged-sidewalk` | Veredas dañadas | Ambas |
| `faulty-traffic-light` | Semáforos defectuosos | Ambas, según los límites de la evidencia |

Exactamente estas cuatro entradas están activas. Los IDs se mantienen en inglés, en minúsculas y kebab-case, y los IDs existentes no cambian. Un catálogo futuro revisado puede agregar entradas; un string de TypeScript por sí solo nunca habilita una categoría. Los validadores rechazan IDs desconocidos o inactivos. No existe una categoría genérica "otro".

Gemini puede devolver `categoryId: null` cuando no está seguro. Las cuatro opciones manuales siguen disponibles; para publicar hace falta una categoría activa. Una foto no necesariamente prueba que un semáforo funcione mal: los fixtures inciertos devuelven null e invitan al vecino a describir lo que observó en la descripción editable. Esas observaciones no son una prueba fotográfica ni un aval municipal. Usá "falta de luz"; no infieras inseguridad a partir de imágenes de alumbrado.

| Valor | Etiqueta | Criterio |
| --- | --- | --- |
| `low` | Baja | Molestia o deterioro menor. |
| `medium` | Media | Puede dificultar la circulación o el uso del espacio público. |
| `high` | Alta | Riesgo importante para personas o vehículos. |

La gravedad sugerida por la IA puede ser nula; el vecino la corrige o la elige antes de publicar. La gravedad publicada es obligatoria y tiene exactamente esos tres valores. La gravedad nunca implica verificación ni resolución.

## Contratos de entrada y salida

`ReportFields` exige título, descripción, categoryId, gravedad, ubicación `{ latitude, longitude, address }` y `reviewed: true`. `PublishReportRequest` agrega un `File` original: los campos del reporte se serializan en el campo JSON `report` del multipart, el archivo va en `image` y hace falta el header `Idempotency-Key` con un UUID. En el futuro backend, la clave tiene alcance por cuenta y operación.

**Dirección (change `add-report-address`, pendiente de revisión de Agus y Valen).** `address` es `{ street, number }`. `street` es la calle: se le quitan los espacios sobrantes y debe tener de 2 a 80 caracteres. `number` es la altura: un entero de 1 a 99999, o `null` cuando el lugar no tiene altura (un parque o una plaza). Las coordenadas ubican el marcador en el mapa; la dirección es lo que leen los vecinos. El contrato no verifica que las dos describan el mismo lugar. `Report` devuelve la ubicación con la misma forma.

`Report` agrega el ID asignado por el servidor, el estado, la foto, las fechas UTC de creación y actualización, los datos de verificación ciudadana, la disponibilidad y la evidencia institucional y la fecha de resolución, que puede ser nula. No incluye email, identidad privada del autor, ruta del objeto original ni datos internos de la publicación. `Photo` contiene el ID, la URL HTTPS autorizada para ver la foto, el vencimiento de esa URL, el MIME y el tamaño en bytes. La URL apunta a una versión segura para ver; el original sin cambios sigue siendo privado. Las URLs sintéticas usan `example.invalid` y, a propósito, no apuntan a fotos reales.

`CitizenVerification` devuelve `confirmationCount`, el `threshold` efectivo (entero positivo), `policyStatus: 'approved'` y `corroborated`. El frontend muestra los datos que define el servidor; no debe calcular transiciones a partir de la constante exportada del umbral inicial.

`MyConfirmation` contiene reportId, el estado según el servidor, confirmed/confirmedAt, canConfirm/reason y citizenVerification. Esta respuesta es privada y no se cachea. La prioridad de los motivos para mostrar es: resolved, author, already-confirmed y, por último, null. La respuesta de la mutación además garantiza confirmed en true.

## Límite HTTP planificado — sin implementar

| Responsable | Método / ruta | Entrada | Éxito |
| --- | --- | --- | --- |
| Valen | POST `/api/vision/analyze` | Imagen multipart con sesión | 200 `{ data: { suggestion } }` |
| Agus | POST `/api/reports` | Multipart con sesión + header de idempotencia | 201 la primera vez, 200 al repetir una ya completada, `{ data: Report }` |
| Agus | GET `/api/reports` | Público: categoryId/status/bbox/limit/cursor | 200 `{ data: { items, nextCursor } }` |
| Agus | GET `/api/reports/{id}` | Público: UUID | 200 `{ data: Report }` |
| Agus | GET `/api/reports/{id}/confirmations/me` | UUID con sesión | 200 `{ data: MyConfirmation }` |
| Agus | POST `/api/reports/{id}/confirmations` | UUID con sesión y `{}` | 201 la primera inserción, 200 si ya existía, `{ data: ConfirmationResult }` |

Los errores usan `{ error: { code, message, fieldErrors? } }`; los mensajes están en español. `ERROR_STATUS` define qué status HTTP corresponde a cada error. Las respuestas 405 que genera el framework son excepciones del transporte. El futuro límite HTTP tiene que verificar la identidad y proteger las mutaciones con verificación de mismo origen, en lugar de aceptar campos de identidad enviados por quien llama.

Los errores de archivo y de campos se clasifican en el futuro límite del transporte:

| HTTP | Código | Significado |
| --- | --- | --- |
| 413 | PAYLOAD_TOO_LARGE | El archivo original supera los 4 MiB o el request total supera el límite que corresponde |
| 415 | UNSUPPORTED_MEDIA_TYPE | El formato del request o del archivo no está soportado, o el contenido de la imagen no coincide con el formato declarado |
| 422 | VALIDATION_ERROR | Entrada soportada y de tamaño aceptable con campos inválidos, sin foto, con categoría o coordenadas inválidas, o con una imagen soportada que no se puede decodificar |

Un JSON mal formado sigue siendo 400 INVALID_JSON. `validatePublishReportRequest` es un validador puro y genérico de campos y metadatos: hoy sus fallas usan VALIDATION_ERROR, incluidas las de tamaño y MIME. No traduzcas a ciegas todas las fallas de esa función a 422 en un handler. El futuro adaptador HTTP tiene que controlar primero el tamaño del request y del archivo y el tipo soportado, y devolver el 413 o 415 que corresponda; después, usar la validación de campos para el 422. Los límites reales de streaming, las firmas y la decodificación quedan para las funcionalidades de backend y visión. Estas notas y fixtures no implementan un adaptador de transporte.

## Validación implementada acá

- Formas estrictas de objetos, campos obligatorios y rechazo de campos desconocidos anidados; texto recortado y medido en code points Unicode. Título provisorio de 5 a 120, descripción de 10 a 1000.
- Categorías activas, tres gravedades, tipo de cuatro etapas, rangos finitos de coordenadas (no el polígono del municipio de Rosario), UUID y fechas UTC de calendario válidas.
- Dirección obligatoria en la ubicación: calle de 2 a 80 caracteres sin espacios sobrantes, altura entera de 1 a 99999 o `null`, sin campos adicionales.
- `File` original obligatorio, MIME permitido y metadatos de 1 byte a 4 MiB. **Estas verificaciones no decodifican la imagen ni verifican su firma.** Los límites reales del contenido y de la imagen decodificada y el tamaño total del multipart quedan para el futuro transporte. Las constantes documentan los límites de 4 MiB + 64 KiB para el multipart total y de 16 KiB para el JSON.
- Campos de IA que pueden ser nulos, hasta cinco aclaraciones de 1 a 200 code points, y sugerencias sin campos de ubicación, estado ni identidad. Los validadores revisan la estructura, no la veracidad del texto, la confianza, el idioma ni la evidencia visual.
- Formas de los DTO públicos, sintaxis de la URL HTTPS de la foto, coherencia entre umbral, cantidad y corroboración, y rechazo por defecto de datos institucionales en los ejemplos de reportes del MVP. Validar una URL nunca autoriza el acceso a ella.
- Formas de la confirmación privada y coherencia de la elegibilidad, sobres exclusivos de éxito y error, y códigos y mensajes de error de ejemplo.
- Consulta de lista: claves permitidas, repeticiones, límites numéricos (de 1 a 100, 50 por defecto), rangos y orden del bounding box, versión/UUID/fecha del cursor opaco y vinculación con los filtros normalizados. `parseReportListQuery` recibe URLSearchParams; `validateReportListQuery` recibe límites numéricos tipados. Tanto el bbox del request como el del cursor se validan y se normalizan como números de JavaScript separados por comas. Escrituras decimales, espacios, notación exponencial y cero negativo que representan los mismos números comparten cursor (por ejemplo, 0,0,1,1 y 0.0,-0,1e0,1). No se redondea ni se usa tolerancia: se siguen rechazando límites numéricos distintos, cambios de categoría o estado, bbox ausente frente a presente, rangos inválidos y campos desconocidos o repetidos. Usá el bbox normalizado que se devuelve al armar un cursor en el futuro backend. Decodificar un cursor no es autorizar ni ejecutar la paginación.

`validateApiResult(value, validator)` valida el sobre de una respuesta; `validateReport`, `validateAnalyzeImageResponse`, `validateMyConfirmation` y `validateReportList` validan su contenido. La validación devuelve `{ valid: true, value }` o `{ valid: false, error }`. La normalización de requests devuelve los campos recortados sin modificar la entrada. Los validadores puros no deben confundirse con verificaciones de sesión, RLS ni mutaciones de negocio.

## Casos de contrato de confirmaciones y reintentos

Las confirmaciones ciudadanas son únicas por cuenta autenticada (que no sea el autor) y por reporte. Al llegar al umbral efectivo T (inicialmente 3), el futuro backend verifica y registra la inserción de forma atómica y pasa el reporte de pending a citizen-verification. La evidencia municipal sigue sin estar disponible en el MVP. Las inserciones duplicadas no deben aumentar la cantidad ni repetir transiciones. Los ejemplos incluyen un umbral de 5 devuelto por el servidor para que el frontend no dependa del 3.

| Caso de publicación | Resultado planificado |
| --- | --- |
| Primera operación completada | 201, reporte nuevo |
| Misma clave y cuenta, y mismos campos validados y huella de la foto | 200, mismo ID de reporte; la URL para ver puede renovarse |
| Clave reutilizada con otro contenido | 409 IDEMPOTENCY_CONFLICT |
| La misma operación sigue en curso | 409 PUBLICATION_IN_PROGRESS; Retry-After |
| Falla temporal del almacenamiento de la foto | 503 STORAGE_UNAVAILABLE; conservar archivo, borrador y clave |

El futuro backend guarda huellas y bloqueos de las operaciones, publica solo cuando la referencia al original y la versión segura para ver están listas, y reconcilia fallas parciales entre la base de datos y Storage. La limpieza nunca debe borrar un original ya confirmado. Este paquete no implementa esas operaciones.

Orden de la mutación de confirmación: autenticar, buscar el reporte publicado, rechazar al autor (403), repetir una confirmación existente (200, incluso después de la resolución), rechazar una confirmación nueva en un reporte resuelto (409) y, si no, insertar sin duplicar (201; duplicados concurrentes, 200). Sin sesión es 401; reporte inexistente o no publicado, 404. Las futuras transacciones de la base de datos tienen que serializar la inserción frente a la resolución. Este MVP no incluye ningún endpoint real de resolución.

El vocabulario completo de cuatro etapas no cambia. `MVP_REPORT_STAGES` / `MvpReportStage` contienen solo pending y citizen-verification. `FUTURE_INSTITUTIONAL_STAGES` / `FutureInstitutionalStage` contienen municipal-verification y resolved, reservadas para una futura funcionalidad institucional autorizada. Los reportes reales del MVP mantienen la disponibilidad institucional como no disponible y las fechas de evidencia y resolución en null.

`validateReport`, `validateMyConfirmation` y `validateConfirmationResult` rechazan los estados institucionales por defecto. Solo las verificaciones aisladas y bien identificadas de simulaciones futuras pasan `{ allowInstitutionalSimulation: true }`; un request nunca debe controlar esa opción. Es una validación de datos de ejemplo, no un permiso de rol ni un interruptor de funcionalidad municipal. El comportamiento documentado de repetir una confirmación después de la resolución se mantiene en casos de contrato futuros identificados y se verifica explícitamente con esa opción de simulación. El vocabulario de estados de la consulta sigue describiendo las cuatro etapas; consultar una etapa futura no habilita ninguna mutación ni inventa registros institucionales.

## Hoja de revisión de fixtures

Abrí este documento en una pantalla de celular con Fran; no hace falta ninguna pantalla de la aplicación para revisar la base. Compará los objetos de fixtures exportados con los DTO:

Cada ejemplo exportado es independiente de los demás, incluidas las ubicaciones, fotos, datos de verificación y cuerpos de respuesta anidados. Usá `cloneFixture(example)` para tener un borrador editable propio en cada consumidor o test, en lugar de editar el objeto exportado. Las copias usan structuredClone, que mantiene el comportamiento de un borrador editable sin compartir referencias; esto no cambia los DTO. Los tests verifican el aislamiento del grafo de objetos y las ediciones directas de datos anidados, además de las copias independientes de cada consumidor.

| Ejemplo | Qué revisar |
| --- | --- |
| `REPORT_FIELDS_FIXTURES` / `REPORT_FIXTURES` | Uno por categoría, campos editables, presentación obligatoria de la foto y todos los campos del detalle del marcador |
| `SUGGESTION_FIXTURES` | Cuatro sugerencias válidas; la categoría incierta y el funcionamiento del semáforo devuelven null con una aclaración |
| `ANALYSIS_ERROR_CASES` | Sobres de error en español: ANALYSIS_FAILED/502, ANALYSIS_UNAVAILABLE/503 y ANALYSIS_TIMEOUT/504; no se llama a ningún proveedor ni se espera un tiempo límite real |
| `VERIFICATION_FIXTURES` | Por debajo de 3 y en 3, umbral alternativo de 5, gravedad alta sin evidencia institucional |
| `MY_CONFIRMATION_FIXTURES` | Habilitado, autor excluido, ya confirmado, en el umbral |
| `PUBLICATION_CASES` / `CONFIRMATION_CASES` | Formas documentadas de status y sobres, duplicados y fallas; no son servicios ejecutados |
| `INSTITUTIONAL_SIMULATIONS` | Aisladas y con la etiqueta "Simulación - sin aval municipal"; no son datos iniciales de producción ni datos oficiales |

**La revisión en celular y la aceptación de los compañeros están pendientes.** Los tests validan solo la estructura y la coherencia de los datos. Ningún backend selecciona marcadores, muestra imágenes, ejecuta acciones municipales ni cuenta identidades de vecinos.

## Ramas, PRs y próximos changes

| Responsable / rama | Próxima funcionalidad y dependencias |
| --- | --- |
| Valen / `feature/gemini-vision` | Escribir las specs funcionales de visión; adaptador de Gemini validado y solo en el servidor, y transporte del análisis; depende del catálogo, los errores y la autenticación compartidos; no escribe reportes ni en Storage |
| Agus / `feature/reports-backend` | Escribir las specs funcionales del backend; revisar el esquema real; migraciones y RLS que solo agregan, Storage del original y su versión para ver, publicación y recuperación, lista y detalle, y corroboraciones; depende de los contratos y fixtures compartidos |
| Fran / `feature/interface-map` | Escribir las specs funcionales de la interfaz; categorías manuales, sugerencias revisadas, flujo de foto y reintentos, y mapa y detalle; empieza con fixtures e integra cuando los proveedores pasen la aceptación en ejecución |
| Todos / futura propuesta institucional | Primero aprobar el alcance y la autoridad; en el MVP no hay cuentas municipales, controles de acción ni rutas de mutación |

Se trabaja sobre la rama base revisada `chore/team-architecture`; el destino de integración propuesto es `main`. Cada responsable actualiza su propia rama de funcionalidad a partir de la base mergeada. Usá Conventional Commits enfocados y en español, y PRs enlazados con OpenSpec que expliquen el alcance, las dependencias, los contratos modificados y los resultados de las verificaciones. Los PRs de funcionalidades de interfaz incluyen evidencia en celular. Este pedido de implementación de la base no autorizó commits, creación de PRs, pushes, merges ni archive.

Quienes proveen y quienes consumen revisan juntos los cambios en los límites. Asigná un solo editor por PR para contratos compartidos, archivos de paquetes, el proxy o las instrucciones. Conservá los cambios de los demás; no hagas force-push en sus ramas. No se afirma que haya protección de ramas configurada. Los archive se hacen solo cuando se cumplen los requisitos, las tareas y la revisión de cada change. Archivar la base nunca afirma que se entregaron endpoints, RLS, Storage ni el mapa.

Más adelante, Agus tiene que probar la autorización real, el rechazo de la autoconfirmación, los requests únicos y concurrentes, la recuperación de la publicación y el acceso privado a los objetos. Valen prueba la decodificación real de imágenes, los errores del proveedor y que no se guarde nada. Fran prueba la revisión real en celular, el acceso y la renovación de las fotos, los reintentos y la elegibilidad para confirmar. Ninguna de esas evidencias puede salir de los ejemplos sintéticos de este paquete.

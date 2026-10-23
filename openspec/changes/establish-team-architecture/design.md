# Design

## Context

El repositorio usa `app/` en la raíz, `utils/supabase/{client,server,middleware}.ts`, `proxy.ts`, el login con Google y `/auth/callback`. Una inspección previa encontró Next.js 16.4.2, React 19.3, TypeScript estricto, el alias de raíz `@/*`, Cache Components, una página de demo `/todos` y ningún módulo de reportes, visión o mapa ni migraciones versionadas. Durante la propuesta inicial se revisaron las guías de Next.js instaladas y el generador de archivos para agentes. El esquema alojado, RLS, la configuración de Storage y los límites del despliegue siguen sin verificarse. Esta planificación no necesita el contenido de ningún secreto.

Se conservan los comandos y skills existentes de Claude y el bloque generado en AGENTS.md. CLAUDE.md y GEMINI.md no existían en la inspección inicial y hay que volver a revisarlos antes de cualquier edición futura que solo agregue.

## Goals / Non-Goals

**Goals:** Producir DTO compartidos revisables, validación pura en ejecución, fixtures sintéticos y documentación de responsables e instrucciones. Dejar registrados los contratos de los servicios futuros con el detalle suficiente para evitar implementaciones divergentes. Mantener independientes la corroboración ciudadana, la autoridad institucional y los datos internos de la publicación.

**Non-Goals:** Implementar endpoints, interfaz del mapa, llamadas a Gemini, migraciones de base de datos, buckets de Storage, integración municipal o roles institucionales operativos. El usuario autorizó solo aplicar la base de contratos e instrucciones. No se autorizan funcionalidades de la aplicación en ejecución, cambios de configuración, commits, push, merge ni archive.

## Decisions

### 1. Separar los requisitos de la base de las funcionalidades futuras

Las tres delta specs existentes describen resultados observables de la base de arquitectura: un paquete de contratos usable, ejemplos de validación y reglas de colaboración. Sus escenarios revisan ese paquete, los fixtures y la documentación, no el comportamiento de endpoints desplegados. Se conservan las rutas para no crear ni mover artefactos en esta actualización.

Las secciones 3 a 8 de abajo son **referencias de contratos de funcionalidades futuras**, no requisitos en ejecución entregados por este change. Cada responsable de una implementación tiene que crear un change funcional aparte, con requisitos en ejecución y tests de aceptación, antes de implementar. El trabajo institucional futuro necesita su propio change de alcance aprobado. Archivar esta base no debe implicar que las rutas HTTP, RLS, Storage o la interfaz estén implementadas.

Que la base esté completa significa que los tipos, validadores, fixtures y guías que solo agregan se entregaron y verificaron, después de un pedido de aplicación aparte. Completar la planificación por sí sola no completa esas tareas. Ningún endpoint ni migración de una funcionalidad es requisito para archivar la base.

### 2. Conservar rutas y responsables

Estructura futura propuesta, que esta actualización no crea:

```text
app/
  api/
    vision/analyze/route.ts                      Valen
    reports/route.ts                             Agus: POST y GET
    reports/[id]/route.ts                        Agus: detalle
    reports/[id]/confirmations/route.ts          Agus: POST
    reports/[id]/confirmations/me/route.ts       Agus: GET privado
  components/
    reports/                                     Fran: formulario, revisión y detalle del mapa
    map/                                         Fran: límite del mapa en el navegador
  page.tsx, layout.tsx, globals.css               Fran
  auth/, auth-buttons.tsx, todos/                 existentes, se conservan
lib/
  contracts/
    categories.ts, reports.ts, vision.ts          coordina Agus, revisan todos
    errors.ts, validation.ts                      Agus con Valen
    fixtures.ts                                  Fran, solo sintéticos
  reports/service.ts, repository.ts               Agus
  reports/photos.ts, publication.ts               Agus: Storage y reintentos
  vision/service.ts, provider.ts                  Valen: solo en el servidor
utils/supabase/                                  existente, lo mantiene Agus
supabase/migrations/                             Agus, solo en la funcionalidad futura
types/database.ts                               Agus, tipos generados en el futuro
docs/contracts.md                               Fran, Valen coordina los traspasos
docs/development.md                             Agus con Valen
```

No se mueve nada a src/, ni se arma un monorepo ni un backend aparte. El código del navegador importa solo DTO públicos y validadores puros, y llama a las APIs del producto; la autenticación existente en el navegador sigue siendo válida. Nunca importa clientes de repositorios, proveedores o del servidor, ni tiene credenciales de service-role o de proveedores. El análisis de Valen no escribe reportes ni en Storage. Agus se encarga de todo el guardado de fotos originales. Fran conserva el File original en el borrador hasta la publicación explícita, aunque se achique una copia para el análisis.

Las implementaciones con Next.js tienen que volver a leer la documentación instalada que corresponda. Conservar los patrones asíncronos de sesión y cookies y el comportamiento del proxy. Las respuestas personales nunca se cachean de forma compartida; las APIs del mapa en el navegador quedan detrás de un límite de cliente adecuado.

### 3. Categorías, gravedad y DTO compartidos ampliados

Usar valores de CategoryId estables respaldados por el catálogo, y un único catálogo revisado para la validación del frontend, el backend y la IA. El catálogo inicial activo aprobado del MVP contiene exactamente estas cuatro entradas:

| ID | Etiqueta en español | Activa / alcance |
| --- | --- | --- |
| pothole | Baches | true / mvp |
| missing-light | Falta de luz | true / mvp |
| damaged-sidewalk | Veredas dañadas | true / mvp |
| faulty-traffic-light | Semáforos defectuosos | true / mvp |

Los IDs originales pothole y missing-light no cambian. Los IDs nuevos siguen la convención existente de kebab-case en inglés y en minúsculas (letras separadas por un solo guion, sin espacios ni guiones bajos); damaged-sidewalk y faulty-traffic-light la cumplen. Este catálogo extensible no es una taxonomía cerrada y permanente de cuatro valores: los agregados futuros requieren revisar el alcance y el catálogo. En el MVP no hay activa una quinta categoría ni un valor genérico "otro". Los validadores en ejecución revisan la pertenencia exacta al catálogo activo, no solo la sintaxis del identificador. La base no necesita un endpoint de categorías; los módulos comparten el paquete revisado.

Las cuatro entradas se pueden elegir a mano sin que el análisis de IA haya funcionado. Gemini puede sugerir cualquier entrada activa, pero tiene que devolver categoryId null cuando la imagen no sostiene una sugerencia con suficiente confianza; no se define ningún umbral numérico de confianza. Los valores desconocidos o inactivos del proveedor son salidas inválidas, no entradas nuevas del catálogo. Para publicar hace falta una categoría activa elegida por el vecino, aunque la sugerencia sea null.

Usar falta de luz para el alumbrado y nunca inferir inseguridad a partir de una foto. Una foto fija puede mostrar un semáforo sin probar si funciona: cuando no hay certeza, el análisis devuelve categoryId null y una aclaración que invita a elegir a mano y a que el vecino describa lo que observó. La descripción editable existente registra esas observaciones; no se agrega una falla inventada, ni un campo obligatorio nuevo, ni un endpoint nuevo. Distinguir el comportamiento declarado por el vecino de los hechos visibles en la foto; el texto del vecino no es evidencia municipal.

La conciliación de la configuración está completa: la actualización de openspec/config.yaml, autorizada aparte, lista las cuatro categorías aprobadas y conserva todas las demás restricciones de alcance. Esta base no necesita editar la configuración.

La gravedad usa la escala aprobada `low | medium | high` y describe el impacto del incidente revisado por el vecino, no una urgencia oficial ni una verificación municipal:

| Valor | Etiqueta | Criterio aprobado |
| --- | --- | --- |
| low | Baja | Molestia o deterioro menor. |
| medium | Media | Puede dificultar la circulación o el uso del espacio público. |
| high | Alta | Riesgo importante para personas o vehículos. |

Gemini puede sugerir uno de estos niveles y el vecino puede corregirlo antes de publicar. La IA puede devolver null cuando no hay certeza; el vecino tiene que elegir un nivel válido antes de publicar. No existe una gravedad publicada "sin evaluar". La gravedad, incluida la alta, nunca cambia automáticamente la verificación ciudadana o municipal ni resuelve un reporte.

Solo texto de contrato propuesto; todos los campos son obligatorios salvo los marcados con ?:

```ts
type UUID = string;           // validación de UUID en ejecución
type IsoDateTime = string;    // ISO-8601 en UTC
type CategoryId = string;     // pertenencia al catálogo en ejecución
type InitialMvpCategoryId =
  | 'pothole'
  | 'missing-light'
  | 'damaged-sidewalk'
  | 'faulty-traffic-light';   // categorías iniciales aprobadas, no un dominio cerrado a futuro
type CategoryDefinition = {
  id: CategoryId;
  label: string;
  active: boolean;
  scope: 'mvp' | 'future';
};
type Severity = 'low' | 'medium' | 'high';
type Location = { latitude: number; longitude: number };
type ReportStage =
  | 'pending'
  | 'citizen-verification'
  | 'municipal-verification'
  | 'resolved';

type ReportFields = {
  title: string;
  description: string;
  categoryId: CategoryId;
  severity: Severity;
  location: Location;
  reviewed: true;
};
type PublishReportRequest = {
  report: ReportFields;       // campo JSON serializado del multipart
  image: File;               // exactamente una foto original, obligatoria
};
// Header HTTP: Idempotency-Key, UUID obligatorio, con alcance por cuenta + operación
type Photo = {
  id: UUID;
  url: string;               // URL temporal y autorizada para mostrar
  expiresAt: IsoDateTime;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  byteSize: number;
};
type CitizenVerification = {
  confirmationCount: number;
  threshold: number;          // umbral efectivo del backend, valor inicial 3
  policyStatus: 'approved';
  corroborated: boolean;
};
type InstitutionalVerification = {
  availability: 'unavailable' | 'enabled';
  verifiedAt: IsoDateTime | null;
};
type Report = {
  id: UUID;
  title: string;
  description: string;
  categoryId: CategoryId;
  severity: Severity;
  photo: Photo;
  status: ReportStage;
  location: Location;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  citizenVerification: CitizenVerification;
  institutionalVerification: InstitutionalVerification;
  resolvedAt: IsoDateTime | null;
};
type ReportListQuery = {
  categoryId?: CategoryId;
  status?: ReportStage;
  bbox?: string;             // oeste,sur,este,norte
  limit?: number;
  cursor?: string;
};
type ReportList = { items: Report[]; nextCursor: string | null };
type MyConfirmation = {
  reportId: UUID;
  status: ReportStage;        // etapa según el backend después de la confirmación
  confirmed: boolean;
  confirmedAt: IsoDateTime | null;
  canConfirm: boolean;
  reason: 'author' | 'resolved' | 'already-confirmed' | null;
  citizenVerification: CitizenVerification;
};
type ConfirmReportRequest = Record<string, never>;
type ConfirmationResult = MyConfirmation & { confirmed: true };
type AnalyzeImageRequest = { image: File };
type ImageSuggestion = {
  title: string | null;
  description: string | null;
  categoryId: CategoryId | null;
  severity: Severity | null;
  warnings: string[];
};
type AnalyzeImageResponse = { suggestion: ImageSuggestion };
type ApiError = {
  code: ErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
};
type ApiResult<T> = { data: T } | { error: ApiError };
```

Valores de ErrorCode: INVALID_JSON, VALIDATION_ERROR, UNAUTHENTICATED, FORBIDDEN, REPORT_NOT_FOUND, REPORT_RESOLVED, AUTHOR_CANNOT_CONFIRM, PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE, ANALYSIS_FAILED, ANALYSIS_UNAVAILABLE, ANALYSIS_TIMEOUT, PUBLICATION_IN_PROGRESS, IDEMPOTENCY_CONFLICT, STORAGE_UNAVAILABLE, INTERNAL_ERROR.

Título propuesto: de 5 a 120 code points Unicode, sin espacios sobrantes. Descripción: de 10 a 1000, sin espacios sobrantes. Coordenadas: números finitos, latitud en [-90,90], longitud en [-180,180]; se rechazan los strings numéricos en los campos JSON. Los UUID y las fechas UTC se validan en ejecución. Los contadores son enteros no negativos. Se rechazan los campos JSON o multipart desconocidos o repetidos, y la identidad, el estado, las cantidades o las rutas de Storage enviados por el usuario. Un campo de IA no nulo cumple su validador correspondiente. Aclaraciones: como máximo 5 textos en español de 200 code points. La IA no aporta ubicación definitiva, etapa, afirmación institucional ni instrucción de publicar.

No se afirma ninguna verificación contra el polígono del municipio. Los cuerpos de los reportes omiten IDs privados de autores, emails, el estado interno de la publicación, prompts y diagnósticos del proveedor. Las referencias estables a buckets y objetos de Storage quedan en el servidor; las URLs firmadas son valores de presentación y nunca se guardan como la referencia permanente en la base de datos. La funcionalidad futura tiene que verificar la autorización y el cacheo de las URLs con las políticas reales de Storage.

### 4. Contratos HTTP futuros y comportamiento preciso de las repeticiones

Son objetivos para specs funcionales aparte. Hace falta protección de mismo origen en las mutaciones y autenticación de sesión verificada; la identidad nunca se lee de un campo del cuerpo.

| Método / ruta | Entrada | Acceso / responsable | Éxito |
| --- | --- | --- | --- |
| POST /api/vision/analyze | imagen multipart | Sesión / Valen | 200 ApiResult<AnalyzeImageResponse> |
| POST /api/reports | JSON del reporte en multipart + imagen original; header Idempotency-Key con UUID | Sesión / Agus | 201 la primera finalización; 200 al repetir una completada, ApiResult<Report> |
| GET /api/reports | ReportListQuery | Público / Agus | 200 ApiResult<ReportList> |
| GET /api/reports/{id} | UUID | Público / Agus | 200 ApiResult<Report> |
| GET /api/reports/{id}/confirmations/me | UUID, sin cuerpo | Sesión / Agus | 200 ApiResult<MyConfirmation> |
| POST /api/reports/{id}/confirmations | UUID y objeto JSON vacío | Sesión / Agus | 201 la primera inserción; 200 si ya existía, ApiResult<ConfirmationResult> |

El contrato del MVP no agrega endpoints institucionales, de cierre, de borrado de confirmaciones ni de edición de reportes.

Transporte: JSON del reporte mal formado -> 400 INVALID_JSON; campos, UUID, consulta o clave inválidos -> 422 VALIDATION_ERROR; formato incorrecto -> 415 UNSUPPORTED_MEDIA_TYPE; sin sesión -> 401 UNAUTHENTICATED; origen o permiso denegado -> 403 FORBIDDEN; reporte inexistente o no publicado -> 404 REPORT_NOT_FOUND. Falla inesperada -> 500 INTERNAL_ERROR. Las respuestas que maneja la aplicación usan el sobre; el 405 que genera el framework es una excepción del transporte. Los mensajes y errores de campo están en español y nunca exponen SQL ni secretos.

Metadatos JSON y cuerpos de confirmación: como máximo 16 KiB. Fotos: JPEG, PNG o WebP, con verificación del MIME declarado más la firma y la decodificación, y como máximo 4 MiB del original. Límite propuesto para el request multipart: 4 MiB + 64 KiB, incluidos metadatos y overhead. Superar el tamaño -> 413 PAYLOAD_TOO_LARGE. Verificar los límites de memoria del despliegue y de imagen decodificada en los changes funcionales de visión y backend antes de producción. No comprimir ni reemplazar en silencio el original guardado para que entre en el límite de un proveedor.

Análisis: tiempo límite de 20 segundos del proveedor -> 504 ANALYSIS_TIMEOUT; proveedor no disponible o sin configuración -> 503 ANALYSIS_UNAVAILABLE; estructura inválida del proveedor -> 502 ANALYSIS_FAILED. Forma de imagen inválida -> 422; contenido no soportado -> 415. Los errores del análisis conservan el borrador y el original y permiten completar a mano; la foto sigue siendo obligatoria al publicar.

Idempotencia de la publicación:
- Misma cuenta + clave + campos del reporte validados y canónicos + huella SHA-256 de la imagen representan una única operación. Se guarda la primera huella aceptada; reutilizar la clave con otro contenido -> 409 IDEMPOTENCY_CONFLICT, sin otra subida ni otro reporte.
- La primera finalización -> 201. Repetir una operación completada -> 200 con el mismo ID de reporte y una URL de foto recién autorizada. No exigir que las URLs firmadas vencidas coincidan byte a byte.
- Mismo contenido mientras un proceso está activo -> 409 PUBLICATION_IN_PROGRESS con Retry-After; reintentar con la misma clave y el mismo contenido.
- Falla temporal de Storage -> 503 STORAGE_UNAVAILABLE; otra falla de publicación inesperada y reintentable -> 500 INTERNAL_ERROR. El cliente conserva el original, la clave y el borrador, y reintenta la misma operación, no con una clave nueva.
- Después de la aceptación inicial, los cambios de contenido rechazados no pueden reemplazar una operación parcial. Un reporte nuevo intencional usa una clave nueva. Claves distintas pueden crear reportes parecidos; no se afirma ninguna deduplicación semántica.
- Conservar las asociaciones de claves completadas durante toda la vida del reporte. Conservar las reservas de operaciones fallidas hasta que se completen o se abandonen y limpien explícitamente; borrarlas no debe volver reutilizable, en silencio, una clave que ya se completó.

La consulta de confirmación de la cuenta actual está separada del detalle público. Devuelve false/null cuando no hay fila, true/fecha cuando la hay, más la cantidad, la política y la elegibilidad. Es privada, no se cachea y nunca revela otra cuenta. Sin sesión -> 401; reporte inexistente -> 404. Para el motivo que se muestra, resolved tiene prioridad sobre author y already-confirmed; si no, author va antes que already-confirmed.

Orden de la mutación de confirmación: autenticar y autorizar, buscar el reporte publicado, rechazar al autor con 403 AUTHOR_CANNOT_CONFIRM, devolver una confirmación existente con 200 aunque ahora esté resuelto, y después rechazar una confirmación nueva en un reporte resuelto con 409 REPORT_RESOLVED. Si no, insertar de forma atómica con unicidad; la primera -> 201, duplicados concurrentes -> 200. Una confirmación existente en un reporte resuelto se devuelve con canConfirm false y reason resolved; la cantidad nunca vuelve a aumentar. Un reporte inexistente siempre da 404 después de autenticar. El orden de las transacciones tiene que serializar la inserción nueva frente a una resolución futura. En el MVP no existe ninguna operación de resolución en producción.

Filtros de la lista: categoryId del catálogo, status de cuatro etapas, bbox válido (oeste < este, sur < norte), limit entero de 1 a 100 (50 por defecto) y cursor opaco. Rechazar con 422 los parámetros desconocidos o repetidos, los filtros de categoría inválidos o inactivos fuera del alcance aprobado y los cursores mal formados o que no coinciden. Orden estable por createdAt DESC/id DESC, cursor con versión + última tupla, vinculado a los filtros normalizados, y limit+1 para detectar la página siguiente. Si se omite status, se incluyen todas las etapas reales disponibles; no se fabrican registros municipales ni resueltos. La lista vacía es items []/nextCursor null; no se garantiza una foto instantánea de los datos.

### 5. Guardado de la foto original y modelo de base de datos propuesto

Agus se encarga de orquestar la publicación, los permisos de almacenamiento, la asociación permanente, la compensación, la limpieza y los reintentos. La foto queda solo en la memoria del navegador o del request del servidor hasta que el vecino elige Publicar; Gemini no tiene forma de subirla. Los reportes publicados requieren exactamente un original guardado, aunque el análisis se haya salteado o haya fallado.

Modelo futuro (acá no se crea SQL ni migraciones):

| Entidad | Columnas y relaciones propuestas |
| --- | --- |
| report_categories | id PK text, label, active, scope; categorías iniciales activas del MVP: exactamente pothole, missing-light, damaged-sidewalk y faulty-traffic-light con sus etiquetas aprobadas en español |
| reports | id UUID PK, author_id FK auth.users, title, description, category_id FK report_categories, severity, latitude, longitude, status, publication_state interno, created_at, updated_at, resolved_at que puede ser nulo |
| report_photos | id UUID PK, report_id unique FK reports, bucket/object_path privado del original (unique), MIME/byte_size/sha256 del original, bucket/object_path de la versión para ver (unique) y su MIME/byte_size, created_at; un original y su versión segura para ver por cada reporte publicado |
| report_confirmations | report_id FK reports, user_id FK auth.users, created_at; PK compuesta/unique(report_id,user_id) |
| report_publications | id UUID PK, author_id FK auth.users, idempotency_key, fingerprint, report_id unique FK reports, state, bloqueo del proceso, metadatos de error y limpieza; unique(author_id,idempotency_key) |
| citizen_verification_policy | versión, umbral efectivo (entero positivo) inicialmente 3, metadatos de la política aprobada; solo la puede escribir la administración autorizada del backend |

La foto pertenece al autor del reporte. Las rutas de los objetos usan IDs opacos generados por el servidor, nunca emails ni rutas arbitrarias del cliente. Las membresías de moderadores e instituciones y las tablas de evidencia de verificación **no son entidades del MVP**; su esquema corresponde a un change institucional futuro aprobado.

Los datos internos de la publicación están separados del ciclo de vida visible. Crear una reserva sin publicar con un ID estable de reporte y de foto y un bloqueo de la operación; subir el original a una clave determinística privada de Storage después de validar; y después confirmar la referencia a la foto más la finalización de la publicación y el estado publicado en una sola transacción de la base de datos. Las lecturas públicas exponen solo filas publicadas con una foto lista. Si la subida falla, la reserva queda reintentable; si la finalización en la base de datos falla después de subir, se reconcilia con la huella de la operación y la identidad del objeto. Los bloqueos y los locks de filas evitan que procesos concurrentes suban o borren los objetos de otro.

Storage y la base de datos no comparten una transacción atómica. Un proceso de recuperación y limpieza reintenta o reconcilia las operaciones viejas y borra los objetos abandonados sin referencias; tiene que volver a revisar el estado con el mismo control de concurrencia y nunca borrar una foto confirmada. Los tiempos de limpieza y el presupuesto de reintentos son configuración del despliegue que se documenta en el change de backend. No se suponen políticas de borrado de reportes ni de cuentas; no borrar evidencia en cascada sin una decisión de retención revisada.

El original se guarda sin cambios en un bucket privado. El detalle público recibe una URL de imagen autorizada y de corta duración (se proponen 5 minutos, renovada a través del detalle del reporte); los EXIF del original pueden incluir metadatos privados, así que la entrega pública tiene que usar una versión para ver sin metadatos. Guardar esa versión aparte, a cargo del backend, conservando el original privado. El DTO de la foto representa el recurso autorizado para ver. La publicación queda oculta hasta que estén listos tanto la referencia al original como el recurso seguro para ver. Si no se puede entregar una versión sin metadatos, la publicación falla en lugar de exponer el original privado. Esto agrega un requisito de procesamiento y limpieza en el backend, no un guardado por parte de la IA.

RLS, más privilegios por columna o RPCs acotadas y auditadas, impiden autores falsificados, confirmaciones del autor, etapas o cantidades falsificadas y lecturas de referencias privadas, incluido el acceso directo a la REST de Supabase o a Storage. Los clientes del navegador no pueden subir ni borrar originales por su cuenta, ni manipular el estado de la publicación. El código que atiende requests usa autenticación con alcance de sesión; cualquier capacidad privilegiada necesaria para un proceso es solo del servidor, acotada y auditada explícitamente. Las proyecciones públicas de los reportes excluyen la identidad privada y las rutas de los objetos. Nunca depender solo de restricciones de la interfaz ni suponer que una vista con definer conserva RLS.

### 6. Cuatro etapas visibles sin verificación oficial inventada

| Etapa de la API | Etiqueta en español | Significado / disponibilidad |
| --- | --- | --- |
| pending | Pendiente | Publicado; la cantidad de confirmaciones ciudadanas válidas está por debajo del umbral efectivo |
| citizen-verification | Verificación ciudadana | Se cumple el criterio de corroboración ciudadana; no es un aval institucional |
| municipal-verification | Verificación municipal | Reservada para evidencia institucional real y autorizada; no disponible en el MVP |
| resolved | Resuelto | Reservada para el cierre institucional autorizado; no disponible en el MVP |

Mostrar el recorrido de cuatro pasos en el detalle del mapa, con los pasos futuros claramente no disponibles. Que un paso aparezca en el recorrido no significa que la verificación esté completa. No pasar un reporte de producción a municipal-verification o resolved por un contador, un resultado de IA, una demo de moderador o un fixture.

Los datos ciudadanos son independientes de la evidencia institucional. El umbral inicial aprobado es de 3 confirmaciones válidas de 3 cuentas autenticadas distintas, sin contar al autor del reporte. Cada cuenta aporta como máximo una confirmación por reporte; los envíos repetidos, sin sesión y del autor nunca aumentan la cantidad. El backend define el umbral efectivo (un entero positivo) y lo devuelve junto con confirmationCount, corroborated y status en los DTO que corresponden; el frontend no debe fijar el 3 en el código ni calcular una transición definitiva.

Cuando una inserción válida llega al umbral efectivo T (inicialmente 3), el backend pasa automáticamente el reporte de pending a citizen-verification y pone corroborated en true. La validación de la cantidad, la unicidad y la actualización de la etapa pendiente tienen que ser atómicas y seguras frente a condiciones de carrera. Por debajo de T, el estado sigue pending y corroborated es false. Los reintentos de confirmación no repiten transiciones. Ni la cantidad ni la gravedad pueden establecer evidencia municipal ni resolución, y las confirmaciones posteriores no pueden hacer retroceder ni reemplazar etapas posteriores.

La configuración autorizada del backend puede cambiar T sin una nueva versión de la interfaz; los clientes muestran el umbral devuelto y el estado que define el servidor. Los umbrales inválidos o nulos se rechazan, no se exponen como un modo de aprobación pendiente. Los tests tienen que probar un T distinto del predeterminado para demostrar que el contrato de la interfaz no depende del 3. El versionado de la política y el tratamiento retrospectivo de los reportes existentes cuando cambia T siguen siendo una decisión operativa aparte antes de desplegar ese cambio; eso no posterga la aprobación ni la activación inicial de T=3 en la implementación funcional futura.

InstitutionalVerification está como no disponible, con verifiedAt null y resolvedAt null, en las respuestas reales del MVP. Las cantidades ciudadanas no completan ninguno de los dos. Las futuras cuentas institucionales autorizadas necesitan una autoridad de verificación otorgada en la base de datos, y el cierre además requiere autoridad de moderador o de cierre. Esto conserva la restricción existente de que solo un moderador cierra como condición necesaria, y propone una condición institucional adicional; el mapeo de identidad y roles no está resuelto y no se puede habilitar sin revisar el alcance y la configuración.

Este módulo institucional futuro choca con la exclusión actual de los roles institucionales si se activa ahora. Mantenerlo solo en la hoja de ruta, sin registro, permisos de rol, botones de acción ni rutas de mutación. Los ejemplos simulados municipales o resueltos son fixtures aislados con la etiqueta Simulación - sin aval municipal, nunca registros iniciales de producción, insignias oficiales ni afirmaciones de actividad oficial.

### 7. Detalle del mapa y límite de la IA editable

Al elegir un marcador se muestran la foto, el título, la descripción, la etiqueta de la categoría, la gravedad informada por el vecino, el recorrido visible de etapas y el estado actual, la latitud y longitud, la fecha de creación y la cantidad de confirmaciones ciudadanas. Pedir el detalle del reporte cuando haga falta para renovar las URLs de las imágenes, y pedir /confirmations/me solo después de autenticar. Cuando una imagen vence o no está disponible, se muestra un estado honesto de carga o de error y se renueva el detalle, no una foto inventada. La paginación de la lista cubre un área visible sin descartar en silencio las páginas restantes.

La IA sugiere título, descripción, categoryId y gravedad, que pueden ser nulos, más aclaraciones, a partir del catálogo y la escala revisados. Nunca devuelve una ubicación definitiva, una verificación oficial ni un estado final de publicación. Fran permite que el vecino edite todos los campos del reporte y ajuste la ubicación; reviewed true es una confirmación, no una prueba de atención humana. La publicación es una acción explícita aparte que envía el original más los campos revisados y una clave de idempotencia estable. No hay publicación automática cuando termina el análisis.

### 8. Ramas del equipo, instrucciones y acceso individual

| Responsable | Rama | Límite |
| --- | --- | --- |
| Valen / Codex | feature/gemini-vision | Transporte del análisis, sugerencias validadas, proveedor |
| Agus / Gemini o Antigravity | feature/reports-backend | Base de datos, RLS, publicación, fotos y recuperación, corroboraciones, coordinación del contrato |
| Fran / Claude Code | feature/interface-map | Borrador, revisión, visualización de fotos, detalle, mapa, interfaz de confirmación privada |
| Valen coordina, revisan todos | chore/team-architecture | Contratos base, fixtures y documentación de instrucciones |

El destino de integración propuesto sigue siendo main. Mergear la base revisada antes de integrar funcionalidades; las ramas de funcionalidad existentes se actualizan a partir de ella bajo el control de su responsable. Usar Conventional Commits enfocados y en español, y PRs que enlacen OpenSpec, los contratos afectados, las dependencias y las verificaciones o la evidencia en celular. Quienes proveen y quienes consumen revisan los cambios en los límites. Asignar un solo editor por PR para contratos compartidos, archivos de paquetes, el proxy o las instrucciones; no sobrescribir la resolución de conflictos de otro responsable ni hacer force-push en su rama. La protección de ramas es una convención propuesta, no se afirma que esté configurada.

Agregar una sección de equipo delimitada fuera del bloque generado de Next.js en AGENTS.md, conservando ese bloque y las instrucciones anidadas. CLAUDE.md y GEMINI.md hacen referencia a la fuente compartida y al change elegido: crearlos solo si no existen después de volver a revisar; si existen, agregar una guía sin conflictos e informar los conflictos. Conservar las skills y comandos de .claude y .agents; no regenerar la configuración. Verificar que cada asistente lea de verdad la guía compartida, en lugar de suponer que todos importan los archivos igual.

Agus usa su propio login del asistente; la autenticación del asistente es independiente de la GEMINI_API_KEY en ejecución. Los fixtures de contrato del backend no necesitan el login de Valen ni su clave del proveedor. Invitar cuentas individuales a los recursos de prueba alojados cuando haga falta; usar un canal de secretos aprobado para los secretos de entorno entregados por separado. Nada de contraseñas, claves de service-role, tokens, .env.local, cachés de asistentes ni historiales privados en Git, instrucciones o PRs. Las variables existentes NEXT_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY siguen siendo configuración pública y nunca reemplazan RLS. Documentar los valores de ejemplo en docs/development.md en lugar de saltear la regla existente que ignora .env*.

En PowerShell se usa openspec.cmd (si hace falta, ubicarlo con npm.cmd config get prefix). El ciclo es proponer y revisar, aplicar con un pedido explícito aparte, verificar, y después sincronizar y archivar cuando los entregables propios de la base estén completos. La funcionalidad futura se especifica en changes aparte antes de implementarla, no se agrega en silencio a las tareas de arquitectura.

## Risks / Trade-offs

- Fallas parciales entre Storage y la base de datos -> reservas sin publicar, idempotencia duradera, recuperación con bloqueos y limpieza probada.
- Privacidad de los metadatos del original -> original privado sin cambios, versión de presentación sin metadatos y ninguna URL pública del original.
- La diferencia entre categorías y contexto se resolvió con la actualización autorizada de la configuración a cuatro categorías -> conservar esos IDs y rechazar cualquier quinta categoría activa hasta que se revise. Los criterios de gravedad siguen aprobados.
- Las fotos fijas no siempre permiten establecer el estado del alumbrado o el funcionamiento de un semáforo -> sugerencias que pueden ser nulas, aclaraciones honestas y observaciones declaradas por el vecino en la descripción editable; nunca inferir inseguridad ni verificación oficial.
- Confirmaciones concurrentes o umbrales fijos en el código -> inserción, cantidad y transición de etapa atómicas y con unicidad, configuración solo en el backend y fixtures con un umbral distinto del predeterminado.
- La hoja de ruta institucional choca con el alcance actual del MVP -> ninguna acción municipal operativa ni afirmación oficial simulada.
- La base podría confundirse con un producto implementado -> los requisitos apuntan a artefactos de contrato; specs y tests funcionales aparte se encargan de la entrega en ejecución.
- El esquema, las políticas y el despliegue alojados no se revisaron -> los responsables futuros verifican los entornos reales antes de migraciones que solo agregan o de llamadas a proveedores.
- Los rangos de coordenadas no prueban que un punto esté dentro del municipio de Rosario -> documentar la limitación y revisar el geovallado por separado.
- El defecto de entrecomillado del YAML en la regla de proposal se corrigió con una autorización aparte -> conservar su sentido original y no cambiar la configuración en esta implementación.

## Migration Plan

1. Terminar la revisión y validar estos artefactos existentes; no se despliega la aplicación.
2. La conciliación de la configuración y la autorización explícita para aplicar la base están completas. Entregar solo contratos de arquitectura, validadores puros, fixtures, instrucciones que solo agregan y documentación de desarrollo y contratos.
3. Verificar los escenarios de la base con fixtures locales sin credenciales, verificaciones estáticas y la revisión de los responsables. Archivar solo los requisitos de la base cuando sus tareas estén completas, no el comportamiento HTTP futuro.
4. Crear changes aparte de backend, visión e interfaz. Cada uno escribe specs de ejecución a partir de los contratos de referencia, agrega los tests de implementación que correspondan y obtiene una nueva autorización para aplicar.
5. El backend prueba la consistencia de Storage, la idempotencia y las políticas directas de la base de datos y de Storage; visión prueba que no publica ni guarda nada; el frontend prueba la revisión en celular, el detalle con fotos reales y el estado de confirmación del usuario.
6. La integración institucional es una propuesta aparte, después del MVP, que requiere una aprobación explícita de roles y alcance, y ninguna autoridad simulada. La reversión y la retención de datos corresponden al plan de migración de cada funcionalidad; nunca reiniciar una base de datos compartida.

## Decisiones pendientes y condiciones de diseño futuras

Son decisiones de producción explícitamente bloqueadas, no valores por defecto aprobados por esta base:
- Versionado operativo de la política y reevaluación retroactiva antes de cambiar el umbral inicial aprobado de 3 en el backend; la regla inicial y la transición ciudadana automática están aprobadas.
- El contexto de la configuración ya coincide con el MVP aprobado de cuatro categorías. Solo las categorías además de esas cuatro requieren una nueva revisión.
- Los valores por defecto del largo del título antes de usarlos en producción; la gravedad low/medium/high y sus criterios están aprobados y ya no son una condición de revisión.
- El mapeo futuro de identidad y roles institucionales y una revisión compatible del alcance y la configuración; no hay operaciones de ese tipo en el MVP.
- La política de retención de fotos originales y de borrado de cuentas, antes de un flujo de retención de datos en producción. Los intervalos de limpieza del despliegue del backend y la elección del modelo del proveedor se verifican en sus changes funcionales.

El paquete de arquitectura registra las reglas aprobadas de umbral y gravedad y deja explícitas las condiciones no relacionadas de la lista. Archivar esta base no implementa el comportamiento en ejecución aprobado ni aprueba ninguna condición pendiente; los changes funcionales aparte se encargan de la implementación y la aceptación.

# Spec Delta

## Purpose

Permitir que un vecino autenticado obtenga sugerencias revisables a partir de una fotografía urbana, sin publicar reportes ni guardar la imagen mediante el módulo de análisis.

## ADDED Requirements

### Requirement: Diagnóstico temporal seguro exclusivamente local
El módulo SHALL emitir diagnóstico únicamente con VISION_LOCAL_DIAGNOSTICS=1 en development fuera de Vercel, apagado por defecto. SHALL usar UUID aleatorio por solicitud, etapas y categorías cerradas, tiempos aproximados y estados HTTP numéricos. SHALL NOT registrar secretos, identidad, cookies, headers sensibles, imágenes, prompts, respuestas completas ni excepciones crudas, ni ampliar el contrato público.

#### Scenario: Diagnóstico local autorizado
- **WHEN** una solicitud local se procesa con diagnóstico habilitado
- **THEN** registra las etapas alcanzadas con el mismo UUID solo en servidor y conserva controles, límite de tiempo y respuestas públicas
- **THEN** generate ok solo indica devolución del SDK; la aceptación requiere validación y resultado exitosos

#### Scenario: Diagnóstico apagado o entorno bloqueado
- **WHEN** falta el flag o se ejecuta en producción o Vercel
- **THEN** no emite estos registros ni habilita llamadas al proveedor

#### Scenario: Fallo sin contenido privado
- **WHEN** falla autenticación, admisión, imagen, construcción del cliente o proveedor
- **THEN** registra categorías permitidas y estado numérico cuando existe, sin filtrar el error original ni cambiar la respuesta pública
- **THEN** network no demuestra fallo de red y generate failed sin generate started no demuestra llamada a Google

### Requirement: Modos locales sin exposición pública
El endpoint SHALL operar solo en development fuera de Vercel con un único modo explícito: simulación o Gemini real local. Sin flag o con ambos modos activos SHALL responder 503 antes de autenticar o leer el body. El simulador SHALL conservarse sin clave ni red de Gemini. La habilitación pública SHALL quedar pendiente de controles distribuidos y revisión.

#### Scenario: Entorno no autorizado
- **WHEN** se invoca en producción, Vercel o sin habilitación local
- **THEN** devuelve 503 ANALYSIS_UNAVAILABLE antes de autenticar o procesar el body

#### Scenario: Simulación explícita
- **WHEN** una sesión válida usa el endpoint local con solo el modo simulación habilitado
- **THEN** recibe campos nulos y una aclaración de simulación, sin atribuir análisis visual real al resultado

### Requirement: Conexión real exclusivamente local
El modo real SHALL requerir VISION_LOCAL_GEMINI_REAL=1 y GEMINI_API_KEY privada del servidor, reutilizar createGeminiProvider y el SDK oficial, y admitir solo gemini-3.8-flash. El cliente SHALL crearse después de las validaciones de origen, sesión, admisión e imagen, sin fallback a otro modelo o al simulador.

#### Scenario: Sin clave o modelo no permitido
- **WHEN** se activa el modo real sin una clave no vacía o con modelo fuera de la allowlist
- **THEN** responde 503 ANALYSIS_UNAVAILABLE sin construir cliente ni hacer llamadas reales, sin exponer configuración sensible

#### Scenario: Conexión local autorizada
- **WHEN** el modo real tiene configuración válida y una solicitud supera todos los controles existentes
- **THEN** llama al SDK con una representación normalizada temporal, schema cerrado, plazo restante, cancelación y un único intento
- **THEN** valida el resultado con contratos compartidos y devuelve solo sugerencias editables, sin publicar ni persistir fotografías

#### Scenario: Pruebas de conexión sin consumo
- **WHEN** la suite verifica el modo real con configuración sintética
- **THEN** usa fábrica/transporte SDK falsos con red bloqueada, sin credenciales ni solicitudes reales

### Requirement: Sesión autenticada y origen permitido
El endpoint SHALL validar la identidad mediante la sesión Supabase existente antes de procesar la imagen o consultar Gemini, y SHALL rechazar orígenes distintos del permitido sin modificar el login existente.

#### Scenario: Sesión ausente o inválida
- **WHEN** se recibe un POST sin identidad verificable
- **THEN** devuelve 401 UNAUTHENTICATED sin decodificar ni consultar al proveedor

#### Scenario: Indisponibilidad de autenticación
- **WHEN** Supabase devuelve 429, 503, un error temporal o la consulta de sesión lanza una excepción inesperada
- **THEN** devuelve 503 ANALYSIS_UNAVAILABLE sin afirmar que la sesión sea inválida ni exponer diagnósticos internos

#### Scenario: Origen cruzado
- **WHEN** una solicitud incluye un Origin diferente al origen permitido o Fetch Metadata indica cross-site
- **THEN** devuelve 403 FORBIDDEN sin analizar la fotografía
- **THEN** el handler rechaza antes de consultar la sesión; esta garantía no modifica ni abarca el proxy previo existente

### Requirement: Entrada multipart acotada
POST /api/vision/analyze SHALL aceptar exactamente un archivo image JPEG, PNG o WebP de 1 byte a 4 MiB en multipart/form-data, con un total máximo de 4 MiB + 64 KiB. SHALL limitar los bytes efectivamente recibidos aunque Content-Length falte o sea incorrecto, y rechazar campos o archivos adicionales.

#### Scenario: Entrada válida
- **WHEN** una sesión válida envía una única imagen soportada dentro de los límites
- **THEN** el endpoint continúa a la validación del contenido sin depender del nombre del archivo

#### Scenario: Tamaño excesivo
- **WHEN** el archivo supera 4 MiB o la lectura supera el límite total
- **THEN** detiene la lectura y devuelve 413 PAYLOAD_TOO_LARGE sin llamar a Gemini

#### Scenario: Formato incompatible
- **WHEN** el request no es multipart soportado o el MIME de imagen no está permitido
- **THEN** devuelve 415 UNSUPPORTED_MEDIA_TYPE

#### Scenario: Multipart inválido
- **WHEN** falta image, está vacío, hay duplicados, campos extra o un multipart mal formado
- **THEN** devuelve 422 VALIDATION_ERROR sin invocar al proveedor

### Requirement: Recepción fragmentada con memoria acotada
El lector multipart SHALL ignorar fragmentos vacíos y acumular bytes en una reserva de tamaño máximo fijo, sin retener un objeto por fragmento. SHALL ceder periódicamente el event loop para atender el plazo y la cancelación, y comprobar el límite real antes de copiar cada fragmento.

#### Scenario: Miles de fragmentos
- **WHEN** un multipart válido llega en miles de fragmentos pequeños intercalados con vacíos
- **THEN** conserva exactamente el archivo y la reserva del lector no crece con la cantidad de fragmentos

#### Scenario: Cancelación durante la recepción
- **WHEN** se cancela una lectura pendiente o un stream que devuelve fragmentos vacíos
- **THEN** cancela el lector y devuelve 504 ANALYSIS_TIMEOUT a la conexión de prueba abierta, sin continuar leyendo ni iniciar el proveedor

### Requirement: Comprobación real y procesamiento limitado
El endpoint SHALL contrastar MIME, firma y formato detectado y decodificar la imagen completa con límites de memoria, dimensiones y tiempo. SHALL rechazar archivos corruptos, animados o excedidos en dimensiones sin ejecutar contenido ni seguir referencias externas.

#### Scenario: Firma discordante
- **WHEN** los bytes identifican un formato distinto del MIME declarado o uno no admitido
- **THEN** devuelve 415 UNSUPPORTED_MEDIA_TYPE

#### Scenario: Imagen no decodificable o peligrosa
- **WHEN** una imagen identificada como soportada está truncada, excede 24 millones de píxeles o 8192 píxeles por lado, contiene varias imágenes o no se puede decodificar con seguridad
- **THEN** devuelve 422 VALIDATION_ERROR y no envía sus bytes al proveedor

### Requirement: Consulta privada y sin persistencia propia
El adaptador de Gemini SHALL ser exclusivo del servidor y recibir una representación temporal validada sin metadatos. El simulador y el modo real local SHALL NOT crear reportes, objetos de Storage, archivos persistentes ni registros con fotografías, credenciales, cookies o respuestas crudas del proveedor.

#### Scenario: Análisis exitoso o fallido
- **WHEN** finaliza cualquier intento
- **THEN** no existen escrituras de reportes o Storage ni archivos temporales propios y se liberan los recursos temporales
- **THEN** la respuesta nunca incluye claves ni diagnósticos privados

### Requirement: Plazo y cancelación
El servicio SHALL aplicar un presupuesto total de 20 segundos desde la entrada al handler, propagar cancelación y rechazar resultados tardíos. El adaptador SHALL recibir el tiempo restante sin reintentos. SHALL documentar que cancelar la espera no garantiza detener inmediatamente código nativo, fetch interno de sesión ni procesamiento remoto.

#### Scenario: Proveedor lento
- **WHEN** se agota el presupuesto con el cliente conectado
- **THEN** cancela la operación y devuelve 504 ANALYSIS_TIMEOUT sin aceptar respuestas tardías

#### Scenario: Plazo vencido durante validación o diagnóstico
- **WHEN** el reloj supera el presupuesto durante validación, sus eventos diagnósticos o serialización de respuesta
- **THEN** la comprobación final devuelve 504 ANALYSIS_TIMEOUT sin aceptar HTTP 200 ni emitir result ok
- **THEN** el registro final de éxito solo se agenda después de la decisión de aceptación, fuera del tramo síncrono entre comprobación final y retorno

#### Scenario: Parseo pendiente tras timeout
- **WHEN** vence el plazo mientras la promesa de recepción o formData sigue pendiente
- **THEN** devuelve 504 y conserva el cupo hasta finalizar el parseo y cualquier procesamiento/proveedor pendiente
- **THEN** libera una sola vez cuando las promesas terminan, incluso si rechazan, sin iniciar el proveedor después del timeout

#### Scenario: Cliente desconectado
- **WHEN** el cliente cancela la solicitud
- **THEN** se propaga la cancelación, se libera la capacidad reservada y no se inicia otro intento ni se garantiza una respuesta a la conexión cerrada

### Requirement: Controles de capacidad sin alterar errores compartidos
El servicio SHALL aplicar límites configurables de concurrencia y consumo antes de llamar al proveedor. Ante capacidad agotada o indisponibilidad del control necesario SHALL devolver 503 ANALYSIS_UNAVAILABLE con Retry-After cuando corresponda, sin agregar códigos al contrato. El despliegue público SHALL NOT depender solo de contadores locales entre réplicas.

#### Scenario: Capacidad agotada
- **WHEN** un usuario supera la capacidad admitida o el proveedor informa cuota agotada
- **THEN** no se reintenta y se informa indisponibilidad temporal sin revelar cuotas o diagnósticos privados

#### Scenario: Configuración local validada
- **WHEN** se inicia la admisión local con configuración ausente, válida o inválida
- **THEN** usa defaults de cinco intentos por minuto, un activo por cuenta, dos por proceso y 10.000 entradas cuando falta configuración
- **THEN** permite reducir intentos, concurrencia y entradas, o ampliar la ventana hasta una hora, dentro de rangos validados; rechaza con 503 valores inválidos sin desactivar controles ni habilitar producción

### Requirement: Sugerencias validadas y editables
El éxito SHALL devolver 200 con { data: { suggestion } }, compatible con los tipos compartidos. suggestion SHALL incluir title, description, categoryId y severity como valores válidos o null, y warnings como arreglo. SHALL rechazar campos desconocidos o categorías fuera del catálogo activo.

#### Scenario: Categorías y gravedad
- **WHEN** existe evidencia suficiente para sugerir una categoría o gravedad
- **THEN** categoryId solo usa pothole, missing-light, damaged-sidewalk o faulty-traffic-light y severity solo low, medium o high
- **THEN** los textos están en español y todos los campos siguen sujetos a revisión del vecino

#### Scenario: Evidencia insuficiente
- **WHEN** no puede sostenerse un campo, la foto no muestra un incidente o hay ambigüedad
- **THEN** el campo correspondiente es null con aclaraciones pertinentes y sigue siendo posible completar el reporte manualmente

#### Scenario: Alumbrado y semáforos
- **WHEN** la foto muestra alumbrado o un semáforo cuyo funcionamiento no se demuestra
- **THEN** no infiere inseguridad, usa falta de luz cuando corresponde y devuelve categoryId null para una falla de semáforo no sustentada
- **THEN** pide al vecino describir lo observado sin atribuirlo a evidencia fotográfica ni aval municipal

### Requirement: Errores de proveedor y salida no confiable
El endpoint SHALL traducir fallas, bloqueos y salidas inválidas a 502 ANALYSIS_FAILED, indisponibilidad a 503 ANALYSIS_UNAVAILABLE y vencimiento a 504 ANALYSIS_TIMEOUT. SHALL validar estructura y límites en el servidor aunque el proveedor use JSON estructurado, sin confundir fallas del proveedor con 422 del usuario.

#### Scenario: Salida inválida o bloqueada
- **WHEN** Gemini devuelve JSON mal formado, campos adicionales, categoría inventada, salida truncada, sin candidatos o bloqueada
- **THEN** devuelve 502 ANALYSIS_FAILED con mensaje en español y sin contenido crudo

### Requirement: Compatibilidad verificable sin servicios reales
Las pruebas de aceptación automatizadas SHALL usar sesión y Gemini simulados, imágenes sintéticas y contratos locales, sin claves reales, red, Storage ni dependencia del PR #3. SHALL cubrir el transporte, límites, cancelación, privacidad y preservación del contrato sin afirmar calidad visual real por aprobar un doble.

#### Scenario: Flujo de integración aislado
- **WHEN** se ejecuta la suite con servicios externos inaccesibles
- **THEN** prueba solicitud multipart, validación, proveedor simulado y sobre público y detecta cualquier acceso de red no autorizado
- **THEN** no requiere el formulario de Fran ni el backend funcional de Agus

#### Scenario: Entorno de pruebas sin credenciales heredadas
- **WHEN** el runner inicia el proceso hijo desde una terminal con configuración privada
- **THEN** transmite solo variables permitidas del sistema y configuración propia de tests, sin claves, tokens, flags reales o NODE_OPTIONS, sin modificar la terminal padre

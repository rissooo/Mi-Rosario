# Design

## Context

Ver proposal.md para la motivación. Se inspeccionaron AGENTS.md, openspec/config.yaml, docs/contracts.md, docs/development.md, lib/contracts/{vision,reports,errors,validation}.ts, lib/vision/README.md, el callback y los clientes SSR de Supabase, y las guías instaladas de Route Handlers de Next.js 16.4.2. Solo existe el README de visión; no hay endpoint ni SDK instalado. La rama es feature/gemini-vision y no se presupone ningún cambio del PR #3. La protección de archivos acordada en la conversación se respeta aunque esta rama todavía no contiene aquella sección de instrucciones.

## Goals / Non-Goals

**Goals:** aislar transporte, validación binaria, coordinación y proveedor; verificar el recorrido con dobles; mantener el contrato y el flujo manual del vecino.

**Non-Goals:** publicar reportes, guardar imágenes en Storage o Files API, cambiar login/proxy/clientes SSR, crear tablas/RLS, construir formulario/mapa, cambiar DTO, activar operaciones municipales o acreditar precisión real con fixtures.

## Decisions

### 1. Recorrido del endpoint

1. Iniciar un presupuesto monotónico total de 20 segundos al entrar al handler Node.js y combinarlo con request.signal. El tiempo de red anterior al handler no está bajo control del servicio.
2. Antes de consultar sesión, validar URL local, Origin cuando esté presente y Fetch Metadata. Rechazar cross-site u orígenes diferentes al configurado con 403 sin llamar a la autenticación del handler. No habilitar CORS abierto ni confiar en Host/X-Forwarded-Host como configuración del origen permitido.
3. Resolver cookies mediante el cliente existente y verificar identidad con auth.getUser(), sin confiar en getSession() ni en cuentas del body. Sesión ausente, 401 o códigos conocidos de sesión inválida: 401. Respuestas 429/503, errores desconocidos y excepciones inesperadas: 503 ANALYSIS_UNAVAILABLE. Los errores temporales tienen precedencia sobre códigos contradictorios de sesión. No registrar ni devolver diagnósticos de Supabase; conservar el refresco existente.
4. Aplicar la admisión de capacidad por ID verificado antes de lectura/decodificación costosa, reservando y liberando cupos en finally. Identidad, origen y admisión tienen precedencia sobre errores del archivo.
5. Verificar multipart/form-data y boundary. Reservar un único buffer de MAX_MULTIPART_BYTES (4 MiB + 64 KiB), ignorar vacíos y contar bytes antes de copiar cada fragmento, sin conservar un arreglo de fragmentos. Cada 256 lecturas ceder el event loop para atender abort/timeout incluso con vacíos. Content-Length solo permite rechazo temprano. Cancelar lectura al exceso/plazo y verificar abort antes/después de parsear con FormData nativo. El parser puede crear copias acotadas por bytes; no se promete un techo duro de toda la memoria del proceso. Content-Encoding no soportado: 415.
6. Exigir una sola entrada image de tipo File, sin duplicados ni campos extra. No aceptar URLs, rutas, JSON/base64 del cliente, modelo ni prompt. Validar tamaño real del archivo; nombres/extensiones no determinan el formato. Multipart roto, vacío o campos inválidos: 422; request/formato incompatible: 415; exceso de bytes: 413.
7. Validar y normalizar la imagen en memoria, según la siguiente sección. Solo después iniciar una llamada al proveedor.
8. Validar el objeto desconocido que devuelve el proveedor mediante validateImageSuggestion y validateAnalyzeImageResponse. Las fallas del validador en datos del proveedor se traducen a 502 ANALYSIS_FAILED, no a 422. Emitir solo el sobre ApiResult<AnalyzeImageResponse>.
9. Responder con Cache-Control: no-store y textos en español. Cancelar tareas y liberar buffers, temporizadores y cupos. No registrar contenido de fotos, cookies ni texto crudo del proveedor.

### 2. Imagen real y recursos

Se propone sharp como dependencia directa de producción, no un import de dependencias transitivas de Next.js. Detectar JPEG por firma, PNG por cabecera y WebP por RIFF/WEBP; contrastar MIME declarado, firma y formato identificado por el decoder. Una firma no acredita seguridad: hacer decodificación completa, no solo metadata().

Valores propuestos para revisión: máximo 24.000.000 píxeles, 8192 por lado, una sola imagen/página, hasta cuatro canales, 3 segundos para procesamiento de imagen y 2 MiB para la representación enviada. Rechazar animación/APNG/WebP multipágina antes de extraer el primer frame; comprobar metadata y contenedores, no asumir que pages:1 detecta animación. Mantener limitInputPixels, limitInputChannels, failOn:'warning' y unlimited:false. Truncamientos, límites dimensionales y fallas de decodificación: 422. MIME/firma/formato discordantes: 415. Exceso de tamaño del archivo/request: 413.

Decodificar completamente a píxeles en un pipeline nativo acotado y reencodificar JPEG o PNG según transparencia, aplicar orientación y retirar EXIF/GPS/perfiles/textos no necesarios. Reducir proporcionalmente hasta 2048 por lado sin ampliar; si no cabe en el límite normalizado devolver 422 sin compresión ilimitada. El original queda disponible para Fran/Agus y no se sustituye por esta representación temporal. No hay escritura de temporales ni persistencia propia. Limitar concurrencia/píxeles no constituye aislamiento de memoria; verificar memoria real antes de producción.

Alternativa: decoder manual o solo firma. Se descarta porque no valida el contenido. El pipeline usa procesamiento nativo acotado; una expiración responde 504 y corrupción/límites inválidos responden 422. La cancelación nativa es de mejor esfuerzo y no se presenta como garantía de aislamiento.

### 3. Modelo, SDK y salida

Gemini 3.8 Flash es una decisión confirmada por el usuario, con pruebas anteriores en Google AI Studio. Su identificador queda configurable exclusivamente en servidor (GEMINI_MODEL), sin selección del cliente ni fallback silencioso. Las pruebas anteriores no validan este endpoint. En Etapa 1 se prepara el adaptador SDK y solo se ejecuta un proveedor simulado, sin consultar credenciales reales.

Usar @google/genai, SDK oficial actual, detrás de un adaptador inyectable. Alternativa REST con fetch: menos dependencia, pero obliga a mantener errores y protocolo; se recomienda SDK por soporte de tipos, schema y AbortSignal. No usar el paquete legado @google/generative-ai. Fijar versiones compatibles y auditadas al momento de autorizar la instalación; no instalar en este change de planificación.

Llamada generateContent no streaming: una representación inlineData base64, sin Files API, herramientas, grounding, búsqueda, ejecución, URL context ni cache explícita. Configurar responseMimeType application/json y responseJsonSchema con objeto cerrado y cinco campos obligatorios: title, description, categoryId, severity, warnings. Los primeros cuatro admiten null; categoryId se deriva del catálogo activo y severity de las constantes comunes. warnings tiene hasta cinco textos de 1 a 200 code points. Los límites de título (5 a 120) siguen provisorios; descripción 10 a 1000. No promoverlos a política de producto aprobada.

Usar thinking low y maxOutputTokens propuesto de 2048 para acotar trabajo; comprobar compatibilidad real de esa configuración con la versión fijada. No interpretar truncamiento como éxito. Limitar el JSON de respuesta del proveedor a 16 KiB al procesarlo; comprobar en la versión elegida el control del transporte y no afirmar que maxOutputTokens limita bytes de red maliciosos. Schema no reemplaza los validadores locales ni acredita veracidad. Rechazar respuestas vacías, bloqueadas, truncadas, múltiples candidatos inesperados, JSON roto y propiedades extra con 502. Sin reparación automática ni segundo llamado facturable.

### 4. Instrucciones y evidencia

Mantener prompt versionado en español dentro del módulo, separado del archivo y del nombre aportado por el cliente. Delimitar la imagen y todo texto visible como datos no confiables: no obedecer instrucciones embebidas, no revelar secretos, no identificar personas, matrículas ni domicilios y no inferir ubicación, estado institucional o publicación. El proveedor solo propone los campos existentes.

Incluir descripciones de las cuatro categorías y de low/medium/high según el contrato. La incertidumbre se evalúa por campo y produce null con aclaraciones; no exponer un porcentaje inventado ni agregar confidence al DTO. Un semáforo presente no demuestra falla; devolver categoryId null si no hay evidencia visual y pedir descripción de lo observado. Alumbrado: falta de luz, nunca inseguridad. No fabricar incidentes a partir de fotos ajenas al catálogo; una foto sin evidencia puede devolver todos los campos nulos. Fran siempre permite revisión y selección manual; renderizar texto como texto, no HTML ejecutable. Las pruebas del prompt verifican configuración y ejemplos, no garantizan razonamiento real.

### 5. Plazos, errores y cancelación

El presupuesto total de 20 segundos es una restricción adicional conservadora al máximo de proveedor de ANALYSIS_DEADLINE_MS. La llamada recibe min(20 segundos, tiempo restante), AbortSignal y timeout HTTP. Desactivar reintentos SDK y continuaciones automáticas; probarlo con transporte simulado. Desconexión cancela el lector y propaga abort al pipeline/proveedor; ignorar resultados tardíos y limpiar recursos cuando terminen las operaciones pendientes. Cancelar la espera no interrumpe necesariamente código nativo ni el fetch interno de getUser. El event loop puede demorar el temporizador. No se garantiza detener procesamiento/facturación remotos.

El proxy global existente alcanza esta ruta y puede verificar o refrescar sesión antes del handler. Por eso su guardia 503 y su rechazo temprano de origen no garantizan ausencia de procesamiento previo de sesión. El presupuesto empieza dentro del handler y excluye proxy, cola de Next.js y transporte previo. Esta corrección no cambia proxy ni autenticación compartida.

| Situación | HTTP y código |
| --- | --- |
| Sin identidad válida | 401 UNAUTHENTICATED |
| Origen rechazado | 403 FORBIDDEN |
| Archivo/request excesivo | 413 PAYLOAD_TOO_LARGE |
| Media type o firma discordante | 415 UNSUPPORTED_MEDIA_TYPE |
| Multipart/campos/decodificación inválidos | 422 VALIDATION_ERROR |
| Salida inválida, bloqueo de seguridad o falla no transitoria del proveedor | 502 ANALYSIS_FAILED |
| Configuración ausente, autenticación de infraestructura caída, capacidad agotada, cuota/429 del proveedor o caída transitoria | 503 ANALYSIS_UNAVAILABLE |
| Plazo total/proveedor agotado con cliente conectado | 504 ANALYSIS_TIMEOUT |
| Falla inesperada propia | 500 INTERNAL_ERROR |

Mensajes públicos estables y genéricos, fieldErrors solo sobre entrada del usuario. No reflejar errores internos, URLs, claves o instrucciones del proveedor. No hay JSON de entrada, por lo que INVALID_JSON no corresponde al multipart ni a JSON inválido de Gemini. El formulario mantiene borrador y foto frente a cualquier error; esta responsabilidad de integración se revisa con Fran, no se implementa acá.

### 6. Abuso y producción

Defaults locales: un activo por cuenta, cinco intentos por ventana de 60 segundos, dos activos por proceso sin cola y máximo 10.000 entradas. Configuración exclusiva del servidor: VISION_LOCAL_MAX_ATTEMPTS (1–5), VISION_LOCAL_WINDOW_MS (60000–3600000), VISION_LOCAL_MAX_ACTIVE (1–2) y VISION_LOCAL_MAX_ENTRIES (1–10000). Solo enteros decimales positivos seguros; valores ausentes usan defaults y valores inválidos fallan cerrados con 503, sin fallback silencioso. Rangos conservadores permiten endurecer los defaults; no elevar sus techos. Un activo por cuenta es invariable.

Leer configuración al primer POST local habilitado y reiniciar para cambiarla. Expirar entradas inactivas sin expulsar contadores activos para eludir límites. El ID procede de sesión verificada, no de IP/headers. Rechazos usan 503 ANALYSIS_UNAVAILABLE y Retry-After igual a la ventana en segundos redondeada hacia arriba; por defecto 60. No agregar 429 público sin revisión del contrato. Los controles locales no limitan la autenticación previa ni otras instancias.

Un contador en memoria no impone límites globales en Vercel: antes de exposición pública exigir protección gestionada de plataforma y cuota dura del proyecto proveedor, o autorizar un adaptador de admisión distribuido. Recomendación: habilitación inicial privada de prueba con control local; producción bloqueada hasta aprobar y verificar el control entre instancias y la cuota. El adaptador tiene interfaz interna inyectable, sin base de datos propia en este cambio. Si un control obligatorio no está disponible, fallar cerrado con 503. La elección y configuración del recurso externo se autorizan aparte; no se atribuye eficacia global al test local.

### 7. Privacidad y credenciales

Todavía no se configuró API key de Gemini en Next.js, .env.local ni Vercel, según la aclaración del usuario. Etapa 1 no la crea, lee ni requiere: las pruebas anteriores fueron en Google AI Studio. Una eventual GEMINI_API_KEY será solo del servidor, nunca NEXT_PUBLIC_, repositorio, errores o logs. Usar barrera server-only; no enviar cookies, ID, email ni nombres de archivo. Etapa 2 debe revisar condiciones de tratamiento, región y cuenta antes de fotos reales: sin persistencia propia no implica retención cero del proveedor. No se habilitan logs con imágenes, secretos ni diagnósticos privados.

### 8. Archivos futuros y coordinación

- app/api/vision/analyze/route.ts: transporte delgado Node.js, cabeceras y mapeo.
- lib/vision/service.ts: orquestación y dependencias inyectables.
- lib/vision/provider.ts y prompt.ts: SDK, schema derivado y reglas.
- lib/vision/image.ts: validación binaria y normalización nativa acotada; sin worker en Etapa 1.
- lib/vision/admission.ts: interfaz interna y control acotado para pruebas.
- lib/vision/tests/: pruebas y recursos sintéticos propios, sin tocar tests compartidos.
- lib/vision/README.md: instrucciones futuras con variables ficticias y comando de prueba.

La instalación autorizada afecta package.json y package-lock.json: @google/genai 2.30.0, sharp 0.35.5 y server-only 0.0.1. No se modifica utils/supabase, proxy, contratos, scripts compartidos ni archivos de Fran/Agus. Revisan Valen (proveedor), Fran (campos nulos, errores y formulario) y Agus (sesión, seguridad y compatibilidad). Sus aprobaciones siguen pendientes. El PR #3 no es requisito técnico de los tests; antes de merge se debe conciliar el baseline aprobado sin simular aceptación conjunta.

## Risks / Trade-offs

- Rechazo de plataforma antes del handler: Vercel documenta límite de 4,5 MB; 4 MiB + 64 KiB entra nominalmente, pero probar multipart real y límites del plan. Un 413 de plataforma puede no tener el sobre de la aplicación; Fran debe reconocerlo por status. No usar uploads persistentes para saltear ese límite.
- Decodificación y base64 elevan memoria: acotar píxeles, bytes y concurrencia; medir antes de habilitar producción. Sharp no es un sandbox completo.
- Incertidumbre y alucinación: null, revisión humana y evaluación con fotos autorizadas antes de producción; ninguna métrica visual real se afirma con mocks.
- Protección local insuficiente entre instancias: mantener el despliegue público bloqueado hasta controles externos revisados.
- Lecturas actuales muestran solo reglas comunes previas en AGENTS.md de esta rama: conservarlas y respetar la política aprobada sin modificar ni importar silenciosamente archivos de otra rama.

## Migration Plan

1. El usuario autorizó Etapa 1 y dependencias necesarias; registrar tareas solo con evidencia local, manteniendo abierta Etapa 2.
2. Implementar y probar sin red ni claves con dobles y lectura de contratos locales.
3. Habilitar un entorno privado de prueba con cuenta propia y credenciales por canal seguro, sujeto a aprobación de uso de datos y modelo. Revisar con Fran/Agus.
4. Validar memoria, límite multipart, duración y cancelación en el runtime del despliegue; activar exposición pública solo con admisión global y cuota verificadas.
5. Rollback: deshabilitar análisis (503), conservar formulario manual y contrato; no existen migraciones de datos ni fotos propias que revertir.

## Decisiones propuestas para aprobación

La Etapa 1 fue autorizada, incluidas dependencias necesarias en package.json y lockfile. Se mantienen los valores locales de imagen/admisión y 503 sin cambiar contratos. No se infiere aprobación de Agus/Fran ni de gasto o producción.

## Etapa 1: decisiones que actualizan el diseño anterior

- La ruta opera solo con NODE_ENV=development, sin VERCEL y VISION_LOCAL_SIMULATION=1; de otro modo devuelve 503 antes de autenticar o leer el body. Exige URL/origen loopback y usa exclusivamente el simulador, que devuelve campos nulos y una aclaración de simulación. Los tests inyectan sesiones; nunca se habilita un usuario ficticio en la ruta.
- El presupuesto total es de 20 segundos desde la entrada al handler. Se propaga la cancelación y se ignoran resultados tardíos, pero no se garantiza interrupción inmediata del fetch interno de getUser sin modificar el cliente compartido. Tampoco se garantiza responder físicamente a los 20 segundos si el event loop se bloquea. El SDK usa abortSignal, timeout restante y retryOptions.attempts=1.
- Etapa 1 usa sharp con timeout nativo de 3 segundos y pipeline acotado. Se decodifica a píxeles completos antes de normalizar (JPEG calidad 80, PNG con transparencia), se destruye el pipeline al cancelar y se conserva el cupo hasta que termine la promesa. Una expiración devuelve 504; corrupción comprobada devuelve 422. No se promete aislamiento de memoria ni borrado físico inmediato. Medición/aislamiento de producción quedan en Etapa 2.
- La admisión usa la configuración validada y los defaults descritos arriba; cuenta archivos inválidos tras admisión y no controla réplicas. La corrección autorizada agrega pruebas de configuración y fragmentación sin ampliar la Etapa 1.
- La salida JSON se acota a 16 KiB antes de parsear, no antes de que el SDK reciba el transporte. Se prueba schema y configuración con transporte falso, no compatibilidad real con Google.
- Etapa 2 conserva controles distribuidos, integración real, tratamiento de datos, presupuesto, producción y revisión conjunta pendientes. La autorización explícita permite actualizar este change y luego aplicar solo Etapa 1.

## Referencias verificadas el 22/10/2026

- Modelo y capacidades: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
- SDK oficial: https://ai.google.dev/gemini-api/docs/libraries
- Salida estructurada: https://ai.google.dev/gemini-api/docs/structured-output
- Opciones de cancelación: https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html
- Entrada inline: https://ai.google.dev/gemini-api/docs/image-understanding
- Decoder y límites: https://sharp.pixelplumbing.com/api-constructor/
- Sesión SSR: https://supabase.com/docs/guides/auth/server-side/nextjs
- Límite de plataforma: https://vercel.com/docs/errors/function_payload_too_large

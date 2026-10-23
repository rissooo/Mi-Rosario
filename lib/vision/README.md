# Límite de visión — Valen

Módulo de `feature/gemini-vision`. La Etapa 1 simulada está guardada en 069f7e1. La Etapa 2 implementa la conexión real exclusivamente local, con clave configurada privadamente por el usuario y prueba manual autorizada HTTP 200. Producción y Vercel siguen bloqueados.

Consumí `../contracts/vision.ts`, el catálogo compartido de categorías activas, las definiciones de errores y los validadores. `service.ts` y `provider.ts`, solo del servidor, preparan las sugerencias validadas. El transporte local es `POST /api/vision/analyze`; no se habilita en producción ni Vercel.

El análisis nunca publica, ni registra confirmaciones, ni sube archivos a Storage, ni guarda fotos originales. Devolvé null cuando no se pueda inferir la categoría o la gravedad; conservá la carga manual. Una foto fija no demuestra cómo funciona un semáforo. Usá "falta de luz" y nunca infieras inseguridad. Ningún secreto del proveedor puede estar en imports del navegador, fixtures ni instrucciones.

Ver `../../docs/contracts.md` para los límites, las decisiones provisorias y las responsabilidades de aceptación de cada funcionalidad.

## Etapa 1 implementada: solo simulación local

La ruta POST `/api/vision/analyze` está deshabilitada por defecto. Responde 503 en
producción, Vercel, sin habilitación o con ambos modos activos, antes de leer
cookies/body dentro del handler. El simulador sigue disponible con su flag propio;
el modo real local requiere el flag y la clave descritos abajo. El runtime es Node.js por defecto;
la configuración Cache Components existente impide exportar `runtime` en la ruta.

La afirmación anterior se limita al handler: el proxy existente puede verificar
o refrescar la sesión antes de ejecutar la ruta. No se modificó ese proxy ni la
autenticación compartida. El presupuesto del handler no incluye el proxy previo.

Gemini 3.8 Flash fue elegido inicialmente en Google AI Studio. El usuario luego
configuró privadamente la clave del servidor local y confirmó una prueba real
exitosa del endpoint. La clave no se muestra ni se incorpora al repositorio.
El simulador no la necesita; sin clave, el modo real sigue devolviendo 503.
Esta etapa no configura ni habilita Gemini en Vercel o producción.

Para probar localmente con una sesión real ya iniciada en la aplicación:

```powershell
$env:VISION_LOCAL_GEMINI_REAL = '0'
$env:VISION_LOCAL_SIMULATION = '1'
$env:VISION_LOCAL_ORIGIN = 'http://localhost:3000'
npm.cmd run dev -- --hostname 127.0.0.1
```

Abrí la aplicación en `http://localhost:3000` e iniciá sesión con el mecanismo
existente. Desde esa misma sesión podés enviar un FormData con exactamente un
campo File `image`; no agregues manualmente Content-Type, el navegador define el
boundary. No existe un bypass de sesión ni un formulario nuevo. El éxito devuelve
`{ data: { suggestion } }`, con campos nulos y un warning que identifica la
simulación. No se analiza evidencia visual ni se llama a Google.

Las variables anteriores son configuración local, no se escriben en archivos.
El dev server debe escuchar solo en loopback, no exponerse por túneles ni en LAN.
La guardia de entorno es adicional; Host/origin no prueban la dirección física
del cliente. Para desactivar: quitá VISION_LOCAL_SIMULATION del entorno.

## Pruebas automatizadas sin credenciales

```powershell
node lib/vision/tests/run.mjs
npm.cmd run check:contracts
npm.cmd run lint
npm.cmd exec -- tsc --noEmit --incremental false
npm.cmd run build
openspec.cmd validate integrate-gemini-vision --strict
git diff --check
```

El runner usa Node y TypeScript instalados y compila a un directorio temporal
del sistema que limpia al terminar. El preloader bloquea fetch y conexiones de
red; el único transporte SDK es un fetch falso explícito. Las sesiones de prueba
solo se inyectan en el handler; la ruta real siempre usa Supabase. Los recursos
gráficos se crean sintéticamente en memoria. No se leen claves Gemini ni se usan
cuentas reales en las pruebas. El build normal de Next puede leer la configuración
local existente de la aplicación; no es una prueba de integración con servicios.

## Límites y separación de responsabilidades

- Multipart: límite real de 4 MiB + 64 KiB antes de parsear; un solo archivo
  JPEG/PNG/WebP de 1 byte a 4 MiB. Se contrastan MIME, firma y decoder y se
  rechazan contenedores animados, truncados o con bytes anexados.
  El lector tiene una reserva fija de ese tamaño, ignora fragmentos vacíos y
  copia fragmentos sin acumular referencias. Cede el event loop cada 256 lecturas
  para atender abort/timeout. El parser nativo y el File resultante pueden crear
  copias adicionales acotadas por los bytes; la reserva no es un límite duro de
  toda la memoria del proceso ni un parser multipart incremental.
- Sharp: lectura estricta, máximo 24 millones de píxeles, 8192 por lado, cuatro
  canales y una imagen. Se decodifica a píxeles completos, orienta y reduce sin
  ampliar hasta 2048 por lado; JPEG calidad 80 o PNG con transparencia, hasta
  2 MiB. Se eliminan metadatos; no se modifica ni persiste el original.
- Plazo total 20 segundos desde entrada al handler, incluido auth y upload.
  Sharp recibe timeout nativo de 3 segundos; expiraciones son 504. Abort cancela
  lectura, destruye pipelines y propaga señal al proveedor, pero no garantiza
  interrupción inmediata de memoria nativa, fetch interno de Supabase o trabajo
  remoto. Resultados tardíos se ignoran; cupos quedan reservados hasta que la
  recepción/parseo, el procesamiento y el proveedor pendientes terminen, incluso
  si ya se respondió 504. No hay reintentos.
- Admisión local: ventana fija de un minuto, cinco intentos (también archivos
  inválidos después de admitir), un activo por usuario, dos activos por proceso,
  tabla máxima 10.000 entradas. 503 con Retry-After:60 al saturar. No cubre varias
  instancias; no constituye protección de producción ni presupuesto monetario.
  El handler verifica URL/origen y Fetch Metadata antes de consultar la sesión.
  La identidad se obtiene con getUser existente; 401 o códigos conocidos de sesión
  inválida devuelven 401, mientras que 429/503, errores desconocidos y excepciones
  inesperadas de autenticación devuelven 503 sin revelar diagnósticos.
- SDK: `createGeminiProvider` requiere un transporte explícito compatible con
  `client.models.generateContent.bind(client.models)`. La selección local reutiliza
  ese adaptador: el cliente real solo se construye al analizar después de todas las
  validaciones, nunca por importar el módulo ni ante una solicitud rechazada.
  Los tests inyectan fábrica/fetch falsos. Modelo servidor GEMINI_MODEL,
  predeterminado `gemini-3.8-flash`. La allowlist admite únicamente ese ID: otros
  identificadores, incluidos `latest` y `preview`, se rechazan con 503. JSON
  cerrado, señal, plazo restante y attempts=1. La salida
  se valida con los contratos existentes; los límites del título siguen provisorios.
- Los errores 413/415/422 distinguen tamaño, formato y datos inválidos. Salida
  inválida del proveedor es 502; indisponibilidad es 503; plazo es 504. Se devuelven
  mensajes en español, no diagnósticos privados, y Cache-Control: no-store.

## Configuración validada de admisión local

Se lee exclusivamente en servidor en el primer POST local habilitado. Reiniciá
el servidor después de cambiarla; no hay cambios de límites en caliente. Si una
variable no está definida se usa su default; si está definida con valor inválido,
la ruta falla cerrada con 503. No se escriben archivos de entorno.

| Variable | Default | Rango entero admitido |
| --- | --- | --- |
| VISION_LOCAL_MAX_ATTEMPTS | 5 | 1–5 |
| VISION_LOCAL_WINDOW_MS | 60000 | 60000–3600000 |
| VISION_LOCAL_MAX_ACTIVE | 2 | 1–2 |
| VISION_LOCAL_MAX_ENTRIES | 10000 | 1–10000 |

Los rangos permiten endurecer los defaults, sin aumentar el consumo máximo
aprobado. Un activo por usuario sigue siendo obligatorio. Se rechazan cero,
vacíos, decimales, infinitos, notación exponencial y valores fuera de rango.
Retry-After usa la duración de la ventana en segundos, redondeada hacia arriba;
es una espera conservadora. Estos controles continúan siendo solo por proceso.

## Etapa 2 local: conexión real validada manualmente

El usuario confirmó una prueba manual real autorizada exitosa. Esta preparación
no ejecuta nuevas llamadas. No pegues claves en el chat, código, PRs ni
comandos que queden en el historial. La clave debe llegar al proceso servidor por
un mecanismo privado. No se toma GOOGLE_API_KEY ni credenciales de asistentes como
alternativa. Este trabajo no creó ni editó archivos `.env*` ni configuró Vercel.

| Variable del servidor | Configuración necesaria |
| --- | --- |
| GEMINI_API_KEY | Clave privada ya configurada localmente por el usuario; obligatoria para modo real |
| VISION_LOCAL_GEMINI_REAL | `1` para habilitar llamadas reales locales |
| VISION_LOCAL_SIMULATION | Ausente o `0` al usar modo real; si ambos flags están en `1`, responde 503 |
| GEMINI_MODEL | `gemini-3.8-flash`; también es el default y único valor permitido |
| VISION_LOCAL_ORIGIN | `http://localhost:3000` si abrís la aplicación con esa URL |
| NODE_ENV | `development`, establecido normalmente por `npm.cmd run dev` |
| VERCEL | Debe estar ausente; no se permite usar este modo en Vercel |

Para futuras pruebas autorizadas, con la clave privada en el entorno del proceso
o en tu `.env.local` ignorado, prepará la terminal de desarrollo con lo siguiente
(son solo flags y valores no secretos):

```powershell
Remove-Item Env:VISION_LOCAL_SIMULATION -ErrorAction SilentlyContinue
$env:VISION_LOCAL_GEMINI_REAL = '1'
$env:GEMINI_MODEL = 'gemini-3.8-flash'
$env:VISION_LOCAL_ORIGIN = 'http://localhost:3000'
npm.cmd run dev -- --hostname 127.0.0.1
```

Revisá también cualquier configuración local de Next para que el flag de simulación
no siga en `1`. Abrí `http://localhost:3000`, iniciá sesión con Supabase y enviá un
FormData con un único File `image` al mismo endpoint desde esa sesión, sin fijar
Content-Type manualmente. Usá una imagen sintética o autorizada. La prueba manual
ya tiene evidencia de éxito; los tests automáticos por sí solos no demuestran que
una clave funcione. No repetirla sin autorización.

Solo después de las validaciones se construye el SDK con Gemini Developer API,
vertexai:false, base HTTPS fija de Google y el modelo permitido. No hay fallback a
simulador ni a otro modelo. Schema cerrado, validadores locales, admisión, plazo
restante y attempts=1 son los mismos de Etapa 1. No se publican reportes ni se guardan
imágenes. El texto devuelto siempre requiere revisión humana antes de publicar.

Para detener llamadas reales, quitá o desactivá VISION_LOCAL_GEMINI_REAL y reiniciá
el servidor. Para volver a simular, desactivá el flag real y habilitá solo
VISION_LOCAL_SIMULATION=1. Deshabilitar el flag no garantiza cancelar una solicitud
que ya recibió Google; siguen aplicando los límites de cancelación documentados.

## Habilitación pública y validación real pendientes

Controles distribuidos y presupuesto con Agus, revisiones reales con Fran y Agus,
integración con formulario/backend, condiciones de tratamiento
de datos, mediciones de calidad/memoria/cancelación y pruebas en Vercel. Las
pruebas anteriores en Google AI Studio no se vuelven a pedir para elegir modelo y tampoco
prueban esta implementación. No se habilita producción ni se modifica Storage,
publicación, RLS, login, mapa o formulario en esta etapa.

## Diagnóstico temporal seguro (solo desarrollo local)

Activá `VISION_LOCAL_DIAGNOSTICS=1` en la terminal que inicia Next y reiniciá el
servidor. Es independiente del flag real: no habilita Gemini ni hace solicitudes.
Solo registra con NODE_ENV=development y VERCEL ausente; por defecto está apagado.
No se modifica ni se imprime la clave. Para desactivar, quitá el flag (también de
cualquier configuración local donde lo hayas definido) y reiniciá Next.

Cada línea JSON del servidor tiene source=vision-local, requestId aleatorio,
stage, category, elapsedMs, stepMs y opcionalmente status HTTP numérico.
No se adjunta el ID al navegador. Agrupá las líneas por requestId. elapsedMs mide
desde la entrada a la ruta; stepMs es el intervalo desde el evento anterior,
no una medición exclusiva de CPU. La salida de consola añade un costo pequeño.
El proxy previo sigue fuera del presupuesto y de esta instrumentación.

Etapas: configuration, origin, authentication, admission, image, client, generate,
validation y result. started/ok delimitan avances; failed y timeout indican fallo.
configuration puede precisar flags_invalid, key_missing, model_rejected o
limits_invalid. authentication puede registrar el estado numérico de Supabase.
provider_http con status indica un error HTTP del SDK; network identifica un
TypeError, que es una clasificación aproximada, no prueba de fallo de red.
client failed confirma un fallo de construcción; started sin cierre no basta por
sí solo. generate failed sin generate started no demuestra llamada a Google:
también puede surgir al construir el cliente. generate started marca
la invocación del SDK, no demuestra que Google haya recibido la solicitud.
Un evento generate ok indica que el SDK devolvió; validation/result determinan
si la respuesta fue aceptada. Un resultado tardío puede quedar después del timeout
con el mismo ID y nunca cambia la respuesta ya emitida.

La aceptación se comprueba nuevamente después de validar, registrar validation ok
y construir la respuesta JSON. El evento result ok se agenda como microtarea tras
esa decisión, sin ejecutar un logger síncrono entre la comprobación final y el
retorno. Su elapsedMs puede incluir esa demora posterior y no representa el
instante exacto de aceptación. Una excepción de ese evento no altera la respuesta.

Para una única prueba manual: iniciá Next en loopback con los flags reales ya
configurados y el flag de diagnóstico, iniciá sesión en localhost:3000 y usá una
sola vez el formulario temporal de consola acordado. No agregues reintentos.
Observá el HTTP/JSON en el navegador y las líneas vision-local en la terminal.
No hace falta compartir la terminal completa ni mensajes de otros componentes.
Esta instrumentación no registra imágenes, prompts, respuestas, identidad, cookies,
headers ni excepciones crudas. Las pruebas usan valores canario y transporte falso.

Para retirarla: desactivá el flag primero; luego eliminá diagnostics.ts, sus imports,
el parámetro diagnostic y los eventos en route, service, local, provider y el
adaptador authentication de visión; retirá las pruebas exclusivas y esta sección.
Conservá intactos el control de acceso, límites, try/catch, mapeos y proveedor real.
Volvé a ejecutar las verificaciones del módulo. No uses git restore sobre archivos
enteros porque contienen cambios anteriores que deben conservarse.

## Evidencia manual local comunicada por el usuario — 23/10/2026

POST autenticado en localhost:3000: HTTP 200; navegador 10670 ms. Sugerencia válida
pothole/high, título y descripción coherentes según revisión del usuario y dos
advertencias. Eventos del mismo requestId: configuration ok, origin ok,
authentication ok (404 ms), admission ok, image ok (24 ms), client ok (2 ms),
generate started y generate ok (9738 ms), validation ok y result ok HTTP 200 con
elapsedMs=10176. No se conserva imagen, respuesta completa ni valor del UUID.
Son tiempos aproximados de una muestra; no establecen percentiles, precisión
general, costos ni garantías de memoria/cancelación. El asistente no repitió la
llamada. La causa del primer 503 (5220 ms de navegador) permanece sin confirmar y
no se atribuye a Google o Supabase. No hay autorización de producción o Vercel.

## Correcciones acotadas de auditoría previas al commit

- Deadline: las regresiones avanzan un reloj controlado durante validation started,
  validation ok y serialización. Todos los casos vencidos devuelven 504 sin evento
  result ok. La comprobación original aceptaba HTTP 200 en estos casos.
- Recursos: se conserva la promesa de readImage, incluido el formData pendiente,
  junto con imagen/proveedor. Las regresiones retienen un parser después del
  timeout, verifican cupo ocupado y comprueban liberación única cuando termina o
  rechaza, sin continuar al proveedor. Antes se liberaba prematuramente.
- Runner: el proceso de pruebas hereda solo variables permitidas del sistema y
  configuración propia de tests. No transmite GEMINI_API_KEY, credenciales de
  otros servicios, flags reales ni NODE_OPTIONS. La terminal padre no se modifica.
  La red sigue bloqueada y los transportes siguen siendo falsos.

Se conserva el presupuesto de 20 segundos. El parser o trabajo nativo que no
termine mantiene su cupo; no se promete cancelación forzada ni un límite duro de
memoria. El proxy previo y la imposibilidad de interrumpir síncronamente el event
loop conservan sus límites documentados. No hay nuevas llamadas reales.

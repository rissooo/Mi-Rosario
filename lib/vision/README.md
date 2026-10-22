# Límite de visión — Valen

Módulo de `feature/gemini-vision`. La base original reservó este límite; el change `integrate-gemini-vision` implementa ahora únicamente la Etapa 1 local simulada que se documenta abajo.

Consumí `../contracts/vision.ts`, el catálogo compartido de categorías activas, las definiciones de errores y los validadores. `service.ts` y `provider.ts`, solo del servidor, preparan las sugerencias validadas. El transporte local es `POST /api/vision/analyze`; la conexión real con Gemini queda para Etapa 2.

El análisis nunca publica, ni registra confirmaciones, ni sube archivos a Storage, ni guarda fotos originales. Devolvé null cuando no se pueda inferir la categoría o la gravedad; conservá la carga manual. Una foto fija no demuestra cómo funciona un semáforo. Usá "falta de luz" y nunca infieras inseguridad. Ningún secreto del proveedor puede estar en imports del navegador, fixtures ni instrucciones.

Ver `../../docs/contracts.md` para los límites, las decisiones provisorias y las responsabilidades de aceptación de cada funcionalidad.

## Etapa 1 implementada: solo simulación local

La ruta POST `/api/vision/analyze` está deshabilitada por defecto. Responde 503 en
producción, Vercel o sin habilitación explícita, antes de leer cookies/body. No
hay selección del proveedor real desde la ruta. El runtime es Node.js por defecto;
la configuración Cache Components existente impide exportar `runtime` en la ruta.

La afirmación anterior se limita al handler: el proxy existente puede verificar
o refrescar la sesión antes de ejecutar la ruta. No se modificó ese proxy ni la
autenticación compartida. El presupuesto del handler no incluye el proxy previo.

Gemini 3.8 Flash fue elegido y probado en Google AI Studio. Todavía no se
configuró ninguna API key de Gemini en Next.js, `.env.local` ni Vercel; esta etapa
no crea, agrega ni requiere esas credenciales.

Para probar localmente con una sesión real ya iniciada en la aplicación:

```powershell
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
  remoto. Resultados tardíos se ignoran; cupos quedan reservados hasta que el
  procesamiento/proveedor pendientes terminen. No hay reintentos.
- Admisión local: ventana fija de un minuto, cinco intentos (también archivos
  inválidos después de admitir), un activo por usuario, dos activos por proceso,
  tabla máxima 10.000 entradas. 503 con Retry-After:60 al saturar. No cubre varias
  instancias; no constituye protección de producción ni presupuesto monetario.
  El handler verifica URL/origen y Fetch Metadata antes de consultar la sesión.
  La identidad se obtiene con getUser existente; 401 o códigos conocidos de sesión
  inválida devuelven 401, mientras que 429/503, errores desconocidos y excepciones
  inesperadas de autenticación devuelven 503 sin revelar diagnósticos.
- SDK preparado: `createGeminiProvider` requiere un transporte explícito compatible
  con `client.models.generateContent.bind(client.models)`. En Etapa 1 solo los tests
  suministran ese transporte y nunca uno real. Modelo servidor GEMINI_MODEL,
  predeterminado `gemini-3.8-flash`; no se usa una clave ni se construye cliente
  real desde la ruta. La allowlist admite únicamente `gemini-3.8-flash`: otros
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

## Etapa 2 pendiente

Controles distribuidos y presupuesto con Agus, revisiones reales con Fran y Agus,
conexión real al SDK y credenciales por canal seguro, condiciones de tratamiento
de datos, mediciones de calidad/memoria/cancelación y pruebas en Vercel. Las
pruebas anteriores en Google AI Studio no se vuelven a pedir para elegir modelo y tampoco
prueban esta implementación. No se habilita producción ni se modifica Storage,
publicación, RLS, login, mapa o formulario en esta etapa.

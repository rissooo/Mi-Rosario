# Vision de Mi Rosario — router experimental local

## Orden de proveedores

1. **Groq / Qwen**: principal, hasta 5 segundos.
2. **OpenAI / GPT-6 Luna**: respaldo opcional, hasta 12 segundos y **apagado por defecto**.
3. **Formulario manual**: si ambas APIs fallan, no se inventan datos; la interfaz de reportes final permite completarlo a mano.

Se respeta el deadline global de 20 segundos incluyendo sesión, recepción, normalización y análisis. Las APIs se invocan secuencialmente, no en paralelo. Cada resultado pasa por la validación estricta del contrato existente.

**Gemini no forma parte del router ni recibe solicitudes en este modo**, aunque `GEMINI_API_KEY` permanezca en `.env.local`. El código Gemini legacy se mantiene sin usar, para no borrar trabajo histórico ni modificar el endpoint antiguo sin revisión del equipo.

## Configuración local

```dotenv
GROQ_API_KEY=tu_clave_que_ya_tenes
OPENAI_API_KEY=tu_clave_que_ya_tenes

VISION_LOCAL_ROUTER_REAL=1
VISION_LOCAL_GEMINI_REAL=0
VISION_LOCAL_SIMULATION=0
VISION_LOCAL_OPENAI_REAL=0
VISION_LOCAL_TEST_GROQ_FAILURE=0
VISION_LOCAL_ROUTER_TRACE=1
```

No dupliques variables ni subas `.env.local` a GitHub. La clave de OpenAI puede estar presente sin que se invoque la API: solo se usa si `VISION_LOCAL_OPENAI_REAL=1` y Groq falla.

**Cuando el equipo active la facturación de OpenAI y compruebe la cuota disponible**, cambiar `VISION_LOCAL_OPENAI_REAL=1` y reiniciar `npm run dev`. El modelo está configurado como `gpt-6-luna`; puede requerir saldo y habilitación de acceso según la cuenta. Antes de esa decisión, debe permanecer en `0`.

`VISION_BENCHMARK_OPENAI` es la configuración de **otro programa**, el benchmark del PR #10; no habilita OpenAI en este router.

## Probar

```bash
node scripts/check-vision-router.mjs
npx tsc --noEmit
npm run dev
```

Iniciá sesión en `http://localhost:3000` y abrí `http://localhost:3000/vision-test`. Con `VISION_LOCAL_ROUTER_TRACE=1`, la terminal registra solo nombre de proveedor, duración y resultado, nunca fotos, credenciales ni texto devuelto por las APIs.

Para probar la caída de Groq sin hacer solicitudes a Groq, cambia temporalmente `VISION_LOCAL_TEST_GROQ_FAILURE=1` y reiniciá el servidor. Mientras OpenAI esté desactivada, esta prueba **debe** terminar con un error controlado; cuando OpenAI esté activada y con saldo, intentará el respaldo. **Después restaurá `VISION_LOCAL_TEST_GROQ_FAILURE=0`.**

## Alcance y seguridad

El router está autorizado solo en **desarrollo local**. No habilita IA en Vercel y no publica reportes ni fotografías. El endpoint conserva login, comprobación del origen local, cuotas de admisión, normalización, límite total y validación de respuesta. El formulario definitivo y el merge a `main` requieren revisión con el equipo.

La pantalla `/vision-test` es una herramienta de desarrollo y no sustituye el formulario definitivo de reportes.

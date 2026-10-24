# Integración de IA al formulario de reportes (desarrollo local)

Esta rama nace de `main` y suma el asistente opcional de Groq al formulario de Fran. No cambia la publicación simulada, los contratos ni el mapa.

## Flujo

1. Iniciar sesión en `http://localhost:3000`.
2. Abrir `http://localhost:3000/mapa` → **Reportar** → elegir punto.
3. Subir una foto. La interfaz prepara JPEG y elimina metadatos EXIF.
4. Pulsar **Analizar foto con IA**. Groq completa **solo** los campos vacíos de título, descripción, categoría y gravedad; no toca ubicación, calle ni número.
5. Revisar y corregir las sugerencias. Si el servicio falla, el formulario manual sigue funcionando.

Al cambiar la foto, se cancela la espera anterior; no se debe aplicar una respuesta vieja al nuevo borrador. Las advertencias de la IA se muestran al ciudadano.

## Variables de .env.local

Conservar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `GROQ_API_KEY` existentes.

```dotenv
VISION_LOCAL_GEMINI_REAL=0
VISION_LOCAL_SIMULATION=0
VISION_LOCAL_ROUTER_REAL=1
VISION_LOCAL_OPENAI_REAL=0
VISION_LOCAL_TEST_GROQ_FAILURE=0
VISION_LOCAL_ROUTER_TRACE=1
VISION_LOCAL_DIAGNOSTICS=1
VISION_LOCAL_ORIGIN=http://localhost:3000
```

OpenAI queda deshabilitado de forma explícita hasta que exista saldo y una decisión del equipo. Gemini no participa del router en este modo.

## Verificaciones locales

```bash
npm ci
node scripts/check-vision-router.mjs
node app/components/reports/check-report-form.mjs
npx tsc --noEmit
npm run lint
npm run dev
```

Comprobar en `/mapa` tanto el flujo de IA como el de carga manual, incluyendo fallos controlados. La publicación sigue siendo simulada.

## Pendientes antes de merge / demo en Vercel

- Revisar cambios de interfaz con Fran.
- El endpoint de visión **continúa cerrado en Vercel** por diseño. No habilitar claves ni trasladar este modo de desarrollo a producción sin autenticación, cuotas persistentes y controles de gasto.
- Probar el respaldo OpenAI solo luego de cargar saldo y habilitarlo expresamente.
- Conectar publicación real del backend de Agus por separado.

El PR #11 conserva la exploración previa; esta rama contiene los archivos necesarios del router y no requiere fusionar #10 ni #11 antes.

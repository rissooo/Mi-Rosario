# Router experimental local de visión — Mi Rosario

Esta rama implementa un enrutador secuencial de proveedores **solo para desarrollo local**. El endpoint conserva autenticación, origen local, admisión, normalización de imágenes, contratos y límite global de 20 segundos. No habilita visión en Vercel ni despliega claves.

## Orden y tiempos

1. Groq (Qwen, 5 s máximos).
2. Gemini (9 s máximos; solo si `GEMINI_API_KEY` está configurada).
3. OpenAI (4 s máximos; solo si `VISION_LOCAL_OPENAI_REAL=1` y hay clave).

Se valida el JSON tras cada intento; JSON incorrecto, errores o timeout hacen probar la siguiente API. Al agotar las opciones, el endpoint devuelve error, y la persona completa manualmente el formulario. No se emiten varias solicitudes a la vez. No hay retries automáticos ni persistencia de fotos o respuestas de IA.

## Configurar .env.local

Mantener tus API keys existentes. **Nunca las pegues en GitHub**.

```dotenv
VISION_LOCAL_GEMINI_REAL=0
VISION_LOCAL_SIMULATION=0
VISION_LOCAL_ROUTER_REAL=1
VISION_LOCAL_OPENAI_REAL=0
```

`GROQ_API_KEY` es obligatoria para el router; `GEMINI_API_KEY` es opcional. Aunque `OPENAI_API_KEY` exista, OpenAI no recibe solicitudes hasta cambiar el flag explícitamente a `1`. Hacelo solo después de activar facturación y revisar costos. `VISION_BENCHMARK_OPENAI` es **otra configuración**, exclusiva del benchmark, y no habilita el router. Para volver al modo antiguo, configurar `VISION_LOCAL_ROUTER_REAL=0` y `VISION_LOCAL_GEMINI_REAL=1`.

Si todas las APIs fallan, el endpoint responde `ANALYSIS_UNAVAILABLE` o `ANALYSIS_TIMEOUT`; el formulario manual debe seguir disponible. El endpoint no publica reportes automáticamente.

## Verificación

```bash
node scripts/check-vision-router.mjs
npx tsc --noEmit
npm run dev
```

Con sesión iniciada y origen `http://localhost:3000`, probá la carga de una foto a través del formulario. Con Groq disponible debe devolver el mismo contrato de sugerencias de antes. Probá luego deshabilitar temporalmente la clave de Groq para verificar el comportamiento de error (no subir variables).

**Fuera de alcance:** fallback en producción/Vercel, métricas de precisión, integración con Supabase de informes y cambios de front. El PR se deja en Draft hasta probar localmente.

## Diagnóstico local del fallback real (sin tocar las claves)

**Primero**, con el router habilitado, agregá estas variables a `.env.local`:

```dotenv
VISION_LOCAL_ROUTER_TRACE=1
VISION_LOCAL_TEST_GROQ_FAILURE=0
```

Reiniciá `npm run dev`, iniciá sesión y abrí `http://localhost:3000/vision-test`. Al analizar la foto, la pantalla muestra la duración total desde el navegador, y la terminal del servidor muestra solo metadatos como:

```json
{"source":"vision-router-local","provider":"groq","outcome":"success","durationMs":1200}
```

**Luego**, para simular la caída de Groq sin realizar ninguna llamada a Groq, cambiá únicamente:

```dotenv
VISION_LOCAL_TEST_GROQ_FAILURE=1
```

Reiniciá `npm run dev` y analizá la misma foto de prueba. En la terminal se debe ver `groq / failed` con `testFailure:true`, seguido de `gemini / success` **si Gemini responde a tiempo** o `gemini / timeout` si excede su límite de 9 segundos. La interfaz puede mostrar error cuando ningún proveedor cumple el presupuesto global, y eso también prueba el flujo de error controlado.

**Al terminar, restaurá siempre `VISION_LOCAL_TEST_GROQ_FAILURE=0` y reiniciá el servidor.** Con `1`, la web nunca llama a Groq y podría verse lenta por el fallback a Gemini. Esta simulación funciona únicamente en desarrollo local, no en Vercel, no modifica `main` y no requiere borrar ninguna clave.

Los logs excluyen contenido de imágenes, respuestas, mensajes de error, claves y datos personales; el navegador solo recibe el tiempo total, no el nombre del proveedor. El registro por proveedor se habilita explícitamente con `VISION_LOCAL_ROUTER_TRACE=1`.

Tests offline actualizados:

```bash
node scripts/check-vision-router.mjs
npx tsc --noEmit
```

## Diagnóstico opcional del HTTP 400 de Gemini

Si el fallback devuelve `provider_http 400`, activá temporalmente en `.env.local`:

```dotenv
VISION_LOCAL_GEMINI_HTTP_400_DETAIL=1
```

Reiniciá el servidor y analizá una imagen de prueba. La terminal imprimirá una línea `gemini-local-400` con el código y una razón abreviada y filtrada del error de Google, sin imprimir el request, la imagen ni la API key. **Revisá igualmente el texto antes de compartirlo**, porque los errores de servicios externos pueden incluir información inesperada.

Al terminar, restaurá `VISION_LOCAL_GEMINI_HTTP_400_DETAIL=0`. Es una herramienta exclusiva de desarrollo local; no habilita visión en producción.

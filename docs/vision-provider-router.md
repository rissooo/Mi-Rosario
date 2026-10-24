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

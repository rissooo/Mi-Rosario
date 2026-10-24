# Benchmark de Vision para Mi Rosario

El script `scripts/benchmark-vision.mjs` compara Gemini, OpenAI y Groq con las mismas fotografias y el mismo formato JSON. Es independiente de la app y no modifica el endpoint actual.

## Uso local

1. En tu equipo: `git fetch origin` y `git switch experiment/vision-provider-benchmark-20261024`.
2. Instala dependencias con `npm ci`.
3. Configura las variables `GEMINI_API_KEY`, `OPENAI_API_KEY` y/o `GROQ_API_KEY` en tu archivo local `.env.local`. El archivo esta excluido de Git.
4. Ejecuta `node --env-file=.env.local scripts/benchmark-vision.mjs ./fotos/bache.jpg ./fotos/vereda.jpg`.

El script corre solo los proveedores con variable configurada. Limita cada solicitud a 20 segundos, procesa una imagen a la vez y registra latencia, estado HTTP, JSON valido, categoria y tokens cuando estan disponibles. El reporte JSON se guarda en la carpeta temporal de tu sistema.

Opcional: crea `casos-locales.json` para medir categorias esperadas:

```json
[
  {"file":"./fotos/bache.jpg","expectedCategory":"pothole"},
  {"file":"./fotos/semaforo-normal.jpg","expectedCategory":null}
]
```

Ejecuta `node --env-file=.env.local scripts/benchmark-vision.mjs --cases ./casos-locales.json`.

Usa solo imagenes de prueba sin datos personales. Las fotografias se envian a los servicios externos que hayas configurado. No compartas credenciales ni fotografias sensibles. Los resultados no prueban funcionamiento en Vercel o Supabase; tampoco constituyen un respaldo automatico en la app.

Documentacion: Google https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash ; OpenAI https://developers.openai.com/api/docs/models/gpt-5.6-luna ; Groq https://console.groq.com/docs/models .

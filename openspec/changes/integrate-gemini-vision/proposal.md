# Proposal

## Why

Valen necesita analizar fotos sin acoplarse al guardado de reportes de Agus ni al formulario de Fran. La base inicial aportó contratos y fixtures; este cambio implementa el análisis y la conexión real exclusivamente local, con una prueba manual autorizada exitosa informada por el usuario.

## What Changes

- Proponer POST `/api/vision/analyze` con sesión Supabase existente, una imagen multipart y sugerencias editables compatibles con los DTO actuales.
- Validar bytes, formato declarado, firma y decodificación con recursos acotados antes de llamar al proveedor.
- Integrar Gemini únicamente desde el servidor, con respuesta estructurada, incertidumbre explícita, plazo de 20 segundos y cancelación.
- Definir controles de origen, concurrencia, consumo, errores públicos y pruebas sin credenciales con proveedor simulado.
- Conservar las cuatro categorías y las gravedades; no publicar, persistir fotografías, implementar interfaz ni habilitar acciones institucionales.
- Separar las decisiones técnicas propuestas de las aprobaciones necesarias para dependencias y controles de producción. Crear estos artefactos no autoriza implementarlos.

## Capabilities

### New Capabilities

- `urban-image-analysis`: comportamiento en ejecución del análisis autenticado, seguro y temporal de imágenes urbanas y sus sugerencias revisables.

### Modified Capabilities

Ninguna. No existen capacidades consolidadas en `openspec/specs/`. El delta `image-analysis` de `establish-team-architecture` describe entregables de contratos, no una integración funcional; se conserva sin modificar ni duplicar sus requisitos de archivo.

## Impact

Implementación de Etapa 1 exclusivamente en `lib/vision/` y `app/api/vision/`, con pruebas propias. Consume `lib/contracts/` y `utils/supabase/server.ts` sin modificarlos. El usuario autorizó dependencias necesarias en `package.json` y lockfile: SDK oficial, sharp y barrera server-only. El multipart se analiza con la API nativa solo después de acotar los bytes recibidos.

No depende de fusionar el PR #3: se diseña contra los contratos presentes en esta rama y dobles de prueba. No se inspeccionó el contenido remoto de ese PR ni se presupone que sus cambios estén disponibles. La aceptación de interfaces por Agus y Fran continúa pendiente; un cambio futuro en contratos requiere conciliación y aprobación separadas.

## Etapas autorizadas

Etapa 1 autorizada: implementación local con proveedor simulado inyectable, adaptador preparado para @google/genai y sharp, pruebas sin credenciales ni llamadas reales. Se permite modificar package.json y package-lock.json para dependencias necesarias. Se conservan contratos y autenticación. Gemini 3.8 Flash ya fue elegido y probado en Google AI Studio según el usuario; no se repite selección ni se atribuye aquella prueba a este endpoint.

Etapa 2 local implementada: SDK existente mediante createGeminiProvider, con GEMINI_API_KEY exclusivamente del entorno servidor y flag VISION_LOCAL_GEMINI_REAL=1, solo en development fuera de Vercel. El simulador conserva su flag separado; activar ambos modos produce 503 sin fallback. El único modelo permitido sigue siendo gemini-3.8-flash. El usuario confirmó una prueba real local autorizada HTTP 200. Esta preparación para commit no realiza nuevas llamadas.

Habilitación pública pendiente: revisiones de Agus/Fran, controles distribuidos, presupuesto definitivo, condiciones de datos y pruebas reales en Vercel/producción. La implementación local no completa esas tareas ni autoriza despliegue.

El usuario configuró privadamente GEMINI_API_KEY en el entorno local del servidor. Su valor no se documenta ni se incorpora al repositorio. No se configura ni habilita esta integración en Vercel o producción. Las correcciones de Etapa 1 conservan sus límites, proxy y contratos.

La prueba manual devolvió pothole/high, título y descripción coherentes según revisión del usuario y dos advertencias; navegador 10670 ms, resultado del servidor 10176 ms. No se guarda imagen ni respuesta completa. El primer 503 permanece sin causa confirmada y no se atribuye a Google o Supabase. Una prueba exitosa no acredita precisión general, presupuesto ni seguridad de producción.

La Etapa 1 está guardada en 069f7e1 y se conserva. Esta ampliación modifica solo el módulo de visión, su ruta/pruebas/documentación y los artefactos de este change; reutiliza dependencias, contratos, validaciones, sesión, admisión y presupuesto existentes.

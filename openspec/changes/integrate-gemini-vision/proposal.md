# Proposal

## Why

Valen necesita implementar el análisis de fotos sin acoplarlo al guardado de reportes de Agus ni al formulario de Fran. La base actual aporta contratos y fixtures, pero no valida imágenes reales ni consulta Gemini; este cambio define esa funcionalidad para revisión antes de implementarla.

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

Etapa 2 pendiente: integración real, revisión de Agus/Fran, datos, producción, admisión distribuida y presupuesto definitivo. La ruta solo se habilita en development sin VERCEL y con activación local explícita; nunca selecciona el proveedor real.

No existe API key de Gemini configurada en Next.js, .env.local ni Vercel según el estado confirmado por el usuario. No se crea ni agrega ninguna credencial. Las correcciones autorizadas de Etapa 1 acotan la recepción multipart, validan configuración local, distinguen errores temporales de sesión y rechazan origen antes de la consulta de sesión del handler; no cambian el proxy previo ni los contratos.

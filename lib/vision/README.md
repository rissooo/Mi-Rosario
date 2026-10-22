# Límite de visión — Valen

Reservado para el change aparte de `feature/gemini-vision`. Acá no se implementa ningún proveedor ni endpoint.

Consumí `../contracts/vision.ts`, el catálogo compartido de categorías activas, las definiciones de errores y los validadores. Los futuros `service.ts` y `provider.ts`, solo del servidor, se encargan de las sugerencias validadas de Gemini. El futuro transporte es `POST /api/vision/analyze`.

El análisis nunca publica, ni registra confirmaciones, ni sube archivos a Storage, ni guarda fotos originales. Devolvé null cuando no se pueda inferir la categoría o la gravedad; conservá la carga manual. Una foto fija no demuestra cómo funciona un semáforo. Usá "falta de luz" y nunca infieras inseguridad. Ningún secreto del proveedor puede estar en imports del navegador, fixtures ni instrucciones.

Ver `../../docs/contracts.md` para los límites, las decisiones provisorias y las responsabilidades de aceptación de cada funcionalidad.

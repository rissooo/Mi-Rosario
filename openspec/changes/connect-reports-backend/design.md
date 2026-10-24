# Design

## Contexto

Las fuentes falsas ya devuelven la misma forma que la API (`{ status, body }` con `ApiResult<T>`), y `ReportPanel`, `ConfirmationAction` y `ReportsMap` consumen esa forma. Por eso alcanza con cambiar la implementación de cada fuente sin tocar los componentes.

## Decisiones

- **Un interruptor, dos implementaciones.** Cada fuente decide en cada llamada con `usingSampleData()`, que lee `process.env.NEXT_PUBLIC_REPORTS_SAMPLE_MODE === "1"`. Next.js reemplaza la variable al compilar; los tests la fijan antes de llamar. `USING_SAMPLE_DATA` sigue existiendo para el aviso de la página y vale lo mismo.
- **El modo de ejemplo no se borra.** Los tests de la interfaz siguen usándolo, y sirve para trabajar sin backend. Las funciones de ejemplo (`isSampleAuthor`, `findSampleReport`, `updateSampleReport`, `addPublishedSampleReport`) quedan solo para ese modo.
- **Validación de las respuestas.** Las exitosas pasan por `validateApiResult` con el validador del DTO (`validateReportList`, `validateReport`, `validateMyConfirmation`, `validateConfirmationResult`). Si fallan, la interfaz muestra "Recibimos una respuesta inesperada" en vez de datos incoherentes. Los errores del servidor se respetan si tienen la forma `{ error: { code, message } }`; si no, se muestra un error genérico con el status HTTP.
- **Sin caché.** Todas las llamadas usan `cache: "no-store"`: la lista cambia cuando alguien publica o confirma, y las confirmaciones son privadas.
- **Multipart.** `report` va como texto JSON con los campos ya validados; `image` es el `File` preparado en el navegador (JPEG de hasta 4 MiB); `Idempotency-Key` va en el header. No se fija `Content-Type`: el navegador agrega el boundary.
- **Errores de red.** Si `fetch` falla, `publishReport` y las confirmaciones dejan que el componente muestre "Revisá tu conexión y reintentá", como hoy. `listReports` lanza `ReportSourceError` con `INTERNAL_ERROR` para que el mapa muestre su estado de error.

## Riesgos

- Las pruebas escriben en el Supabase de producción. Se mitiga con reportes de prueba identificables y borrándolos desde el panel.
- Node 20 no tiene WebSocket nativo y `@supabase/supabase-js` lo necesita en el servidor: `npm run dev` requiere Node 22 o más.

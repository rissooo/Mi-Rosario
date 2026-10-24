# Límite de la interfaz de reportes — Fran

Reservado para `feature/interface-map`. Acá no se implementa ningún componente ni pantalla; un README no expone una ruta de Next.js.

Usá los contratos y fixtures públicos de `lib/contracts/`. Los futuros formularios permiten elegir a mano las cuatro categorías, editar las sugerencias de Gemini (que pueden ser nulas) y que el vecino revise la gravedad y la ubicación. Conservá el archivo original en el dispositivo hasta la publicación explícita en multipart, mantené una sola clave de idempotencia entre reintentos y recuperá el borrador después de un error.

El futuro detalle del marcador muestra foto, título, descripción, categoría, gravedad, estado, ubicación, fecha y cantidad de confirmaciones. Pedí `/confirmations/me` solo con sesión. Mostrá el estado y el umbral que devuelve el servidor en lugar de fijar transiciones en el código. No importes repositorios, clientes del servidor ni código de proveedores, ni escribas directamente en las tablas del producto. Conservá el comportamiento existente del login, el logout y el callback.

## Confirmaciones ("Yo también lo vi")

La sección de confirmación del detalle es `ConfirmationAction.tsx`. Recibe si hay sesión y muestra lo que informa la fuente: el botón, "Ya confirmaste este reporte", "No podés confirmar tu propio reporte" o el login, que vuelve con `/mapa?reporte=<id>`. Nunca calcula la elegibilidad ni la etapa. `ReportsMap` aplica `status` y `citizenVerification` de la respuesta en la lista y en el detalle abierto.

La única fuente es `confirmation-source.ts`, con dos funciones:

- `getMyConfirmation(reportId)` tiene la forma de `GET /api/reports/{id}/confirmations/me`.
- `confirmReport(reportId)` tiene la forma de `POST /api/reports/{id}/confirmations`.

Las dos devuelven `{ status, body }` y validan cada respuesta exitosa con `validateMyConfirmation` o `validateConfirmationResult`. Una respuesta que no cumple el contrato se muestra como falla temporal.

**Modo de ejemplo.** Hoy la fuente es falsa:

- Guarda las confirmaciones en memoria hasta recargar la página.
- Toma como autor a quien publicó el reporte en esa sesión (`isSampleAuthor` en `map/report-source.ts`).
- Guarda el reporte actualizado con `updateSampleReport`.

Los ejemplos "Falta de luz en Plaza 25 de Mayo" y "Bache sobre avenida en Alberdi" están a 2 de 3, así que con una sola cuenta se puede probar el paso a "Verificación ciudadana".

Errores que se simulan en la confirmación (solo en el POST) con `?simular=`:

| Valor | Respuesta |
| --- | --- |
| `UNAUTHENTICATED` | 401, pide volver a iniciar sesión. También simula el error de la publicación, que usa el mismo parámetro. |
| `REPORT_NOT_FOUND` | 404, sin opción de confirmar |
| `INTERNAL_ERROR` | 500, con "Reintentar" |

**Para conectar el backend** (PR #6 de Agus):

1. Reemplazar el cuerpo de `getMyConfirmation` y `confirmReport` por un `fetch` a esos endpoints con `cache: "no-store"`, porque la respuesta es privada.
2. Conservar la validación del contrato.
3. Cuando `USING_SAMPLE_DATA` pase a `false`, borrar `isSampleAuthor`, `findSampleReport` y `updateSampleReport`.

Los permisos reales (autor excluido, una confirmación por cuenta y reporte, transición atómica) los aplica la base de datos con RLS, no la interfaz.

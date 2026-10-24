# Proposal

## Why

Hoy el detalle de un reporte muestra "N de T confirmaciones ciudadanas", pero ningún vecino puede sumarse. Sin confirmaciones, ningún reporte puede pasar de "Pendiente" a "Verificación ciudadana", que es el paso que distingue un reporte suelto de uno respaldado por la comunidad. El contrato (`MyConfirmation`, `CONFIRMATION_CASES`) y los endpoints del backend de Agus (PR #6) ya definen la forma, así que la interfaz se puede construir ahora sobre una fuente falsa y conectarse después cambiando un solo archivo.

## What Changes

- Botón **"Yo también lo vi"** en el detalle del reporte en `/mapa`, debajo de las confirmaciones.
- Según la elegibilidad que devuelve el servidor (`MyConfirmation`), el detalle muestra:
  - el botón habilitado;
  - "Ya confirmaste este reporte";
  - "No podés confirmar tu propio reporte", si sos quien lo publicó.
- Sin sesión, el detalle muestra "Entrá con Google para confirmar". Después del login, se vuelve a `/mapa` con el detalle de ese reporte abierto (`?reporte=<id>`).
- Al confirmar, el contador, la etapa y el recorrido de etapas se actualizan con la respuesta del servidor, en el detalle y en el mapa, sin recargar. Con la confirmación que llega al umbral, el reporte pasa a "Verificación ciudadana".
- Fuente de confirmaciones falsa con la forma de:
  - `GET /api/reports/{id}/confirmations/me`;
  - `POST /api/reports/{id}/confirmations`.
- Comportamiento de la fuente falsa:
  - guarda las confirmaciones en memoria hasta recargar;
  - reconoce como autor a quien publicó el reporte en esta sesión;
  - simula errores con `?simular=`.
- Los reportes de ejemplo cubren con una sola cuenta los casos de a una confirmación del umbral, en el umbral, umbral 5 y autor.
- Errores en español (sesión vencida, reporte inexistente, falla temporal) sin perder el detalle abierto.

Fuera de alcance:
- La conexión con el backend real.
- Retirar una confirmación.
- La resolución o moderación de reportes.
- Cambios en `lib/contracts/`.

## Capabilities

### New Capabilities
- `report-confirmations`: confirmación ciudadana de un reporte desde su detalle. Cubre la elegibilidad según el servidor, la confirmación única por cuenta, la actualización del contador y la etapa con la respuesta, el login para confirmar, los errores y el modo de ejemplo.

### Modified Capabilities
<!-- Ninguna: el detalle, el contador según el umbral recibido y el recorrido de etapas de `report-map` no cambian de requisito; solo pasan a mostrar los datos actualizados que devuelve la confirmación. -->

## Impact

- **Código de Fran:**
  - `app/components/reports/ReportDetail.tsx`: la sección de confirmación.
  - `app/components/map/ReportsMap.tsx`: la sesión, `?reporte=` y la actualización del reporte en la lista y en el detalle.
  - `app/components/map/report-source.ts`: la autoría en el modo de ejemplo y la actualización de reportes en memoria.
  - Nuevos `app/components/reports/confirmation-source.ts` y `ConfirmationAction.tsx`, con sus tests.
  - Si hace falta, `app/components/map/sample-reports.ts`.
- **Contratos:** solo se consumen `MyConfirmation`, `ConfirmationResult`, `validateMyConfirmation`, `validateConfirmationResult`, `CONFIRMATION_CASES` y `ERROR_STATUS`. No se modifica `lib/contracts/`.
- **Archivos protegidos:** ninguno. Se reutilizan `LoginPrompt` y el callback de login aprobado en `add-report-form`.
- **Dependencias:** ninguna nueva.
- **Integración futura:** reemplazar las dos funciones de `confirmation-source.ts` por llamadas a los endpoints del PR #6 de Agus. La elegibilidad real (autor, cuenta única, umbral atómico) la garantiza la base de datos con RLS, no la interfaz.
- **Rama:** `feature/interface-map` está atrasada respecto de `main` (incluye cambios de Valen en `ReportPanel.tsx`). Hay que traer `main` antes de implementar.

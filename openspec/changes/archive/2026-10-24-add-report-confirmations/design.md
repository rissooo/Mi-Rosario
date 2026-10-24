# Design

## Context

- `ReportsMap` maneja los reportes del área visible (`reports`), el reporte elegido (`selected`) y el detalle (`ReportDetail`, con `key={selected.id}`). Ya tiene `hasSession()` con `createClient().auth.getClaims()` y lee parámetros de la dirección una sola vez (`?reportar=1`, `?simular=`) con un `ref` de guarda y `history.replaceState`.
- `ReportDetail` hoy solo muestra `confirmationCount de threshold` y el recorrido de etapas (`StageTrack`) a partir del `Report` que recibe.
- La fuente del mapa (`report-source.ts`) sirve los `SAMPLE_REPORTS`, que son inmutables, más los reportes publicados en memoria (`addPublishedSampleReport`). La publicación falsa (`report-publisher.ts`) devuelve `{ status, body: ApiResult<T> }` con la forma del endpoint y simula errores con `?simular=`.
- El contrato define `MyConfirmation` y `ConfirmationResult`, los validadores `validateMyConfirmation` y `validateConfirmationResult`, `CONFIRMATION_CASES` y los códigos `UNAUTHENTICATED` (401), `AUTHOR_CANNOT_CONFIRM` (403), `REPORT_NOT_FOUND` (404) y `REPORT_RESOLVED` (409). `Report` no trae el autor: la elegibilidad solo se conoce con `GET /api/reports/{id}/confirmations/me`.
- Los reportes de ejemplo ya incluyen dos a 2 de 3 (`VERIFICATION_FIXTURES[0]`), dos en 3 de 3 y uno en 5 de 5.

## Goals / Non-Goals

**Goals:**
- Que conectar el backend real sea reemplazar las dos funciones de `confirmation-source.ts`.
- Que la interfaz nunca calcule la etapa ni la elegibilidad: muestra lo que responde la fuente.
- Probar todos los casos con una sola cuenta en el modo de ejemplo.

**Non-Goals:**
- Mostrar en el marcador del mapa la etapa o la cantidad de confirmaciones.
- Guardar las confirmaciones falsas entre recargas.
- Que la verificación de sesión en el navegador sea un control de seguridad: el control lo hacen el backend (401) y RLS.
- Mostrar `corroborated`. Hoy es redundante con la etapa y no tiene texto acordado.

## Decisions

### 1. Una fuente de confirmaciones con la forma de los endpoints

`app/components/reports/confirmation-source.ts` exporta dos funciones:
- `getMyConfirmation(reportId, options)`, con la forma de `GET /api/reports/{id}/confirmations/me`;
- `confirmReport(reportId, options)`, con la forma de `POST /api/reports/{id}/confirmations`.

Las dos devuelven `{ status, body: ApiResult<MyConfirmation | ConfirmationResult> }`, igual que `publishReport`. Antes de devolver, cada respuesta exitosa pasa por `validateMyConfirmation` o `validateConfirmationResult`. Así la fuente falsa y la real quedan atadas al mismo contrato, y una respuesta mal formada del backend se trata como error temporal en lugar de romper la pantalla. Los mensajes de error salen de `CONFIRMATION_CASES`.

*Alternativa descartada:* llamar a `fetch` directamente desde el componente. Mezclaría el contrato con la pantalla y la fuente falsa no podría reemplazarse con un solo archivo.

### 2. El modo de ejemplo vive en `report-source.ts`

La fuente falsa necesita tres datos que solo tiene la fuente del mapa:
- qué reportes publicó esta sesión, para el caso del autor;
- el estado actual de cada reporte;
- un lugar donde guardar el reporte actualizado para que una nueva carga del área visible no lo pise.

`report-source.ts` suma:
- `isSampleAuthor(id)`: marca como del autor los reportes que entran por `addPublishedSampleReport`;
- `findSampleReport(id)`;
- `updateSampleReport(id, changes)`: guarda `status` y `citizenVerification` en un mapa de reemplazos en memoria, que `listReports` aplica sobre los `SAMPLE_REPORTS` sin modificarlos.

`confirmation-source.ts` guarda en memoria las confirmaciones de la cuenta actual (`Map<reportId, confirmedAt>`) y aplica las reglas del contrato en este orden:
1. Simulación de error.
2. Reporte inexistente: 404.
3. Autor: 403 en el POST, `reason: "author"` en el GET.
4. Ya confirmado: 200 con los mismos datos.
5. Si no, 201: suma uno y pasa a `citizen-verification` cuando `confirmationCount >= threshold`, con el umbral del propio reporte.

Ese cálculo vive solo en la fuente falsa, porque representa al servidor. La pantalla nunca lo hace.

### 3. La sección de confirmación es un componente aparte

`ConfirmationAction.tsx` se monta dentro de `ReportDetail`, debajo de la lista de datos. Recibe `reportId`, `signedIn: boolean | null` y `onConfirmed(update)`. Sus estados son:

```
signedIn = false  --> LoginPrompt ("Entrá con Google para confirmar", next=/mapa?reporte=<id>)
signedIn = null   --> cargando (todavía no se sabe si hay sesión)
signedIn = true   --> GET me --> cargando
                                 |-- canConfirm    --> [Yo también lo vi] --POST--> enviando
                                 |-- author        --> "No podés confirmar tu propio reporte"
                                 |-- already-conf. --> "Ya confirmaste este reporte"
                                 +-- error         --> mensaje (+ "Reintentar" si es temporal)
```

Mientras se envía, el botón queda deshabilitado y un `ref` evita un segundo envío antes de que React vuelva a renderizar (el doble toque). Al recibir 200 o 201, llama a `onConfirmed({ status, citizenVerification })` con los datos de la respuesta y pasa a "Ya confirmaste este reporte". Ante 401, muestra `LoginPrompt`. Ante 403 o 404, muestra el mensaje sin botón. Ante 5xx, una respuesta inválida o un `fetch` rechazado, muestra el mensaje con "Reintentar".

*Alternativa descartada:* meter la lógica en `ReportDetail`. Ese componente es solo de presentación y hoy no tiene estado de red.

### 4. `ReportsMap` aplica la actualización en un solo lugar

`ReportsMap` guarda `signedIn` (empieza en `null` y se resuelve con `hasSession()` al montarse) y se lo pasa al detalle. `onConfirmed` reemplaza `status` y `citizenVerification` del reporte con ese `id`, tanto en `reports` como en `selected`, con los valores de la respuesta y sin recalcular nada. Como `ReportDetail` usa `key={selected.id}`, actualizar el mismo reporte no lo vuelve a montar. Al cerrar y abrir el detalle, el GET devuelve el nuevo estado.

### 5. `?reporte=<id>` para volver al detalle después del login

`LoginPrompt` usa `next=/mapa?reporte=<id>`, y el callback aprobado en `add-report-form` ya acepta rutas internas. Al montarse, `ReportsMap` lee `reporte` con la misma guarda que `reportar`, lo saca de la dirección con `replaceState` y, en la primera carga del área visible que termina, busca ese `id` en `reports`. Si lo encuentra, lo elige: `PointFocus` lo muestra fuera del panel. Si no, descarta el pedido en silencio.

Limitación: solo encuentra reportes dentro de la vista inicial de Rosario. Hoy alcanza, porque la vista inicial cubre todos los ejemplos. Con el backend real, se puede pedir el reporte con `GET /api/reports/{id}` sin cambiar la spec.

### 6. Simulaciones con `?simular=`

Se reutiliza el mismo parámetro. La fuente de confirmaciones reconoce:
- `UNAUTHENTICATED`, que coincide con el de la publicación y simula las dos cosas;
- `REPORT_NOT_FOUND`;
- `INTERNAL_ERROR`, para la falla temporal con "Reintentar".

La simulación afecta solo al POST, así el GET deja ver el botón antes de provocar el error. Solo vale en el modo de ejemplo.

## Risks / Trade-offs

- [El autor solo se conoce para lo publicado en esta sesión del navegador] → Alcanza para probar el caso. Con el backend real, `reason: "author"` lo decide el servidor.
- [La sesión del navegador puede haber vencido aunque `getClaims()` diga que hay sesión] → El POST responde 401 y se muestra el login. La pantalla no da por hecha la sesión.
- [Una cuenta que ya confirmó, en otra pestaña] → El GET al abrir el detalle trae el estado real. Si igual se envía, la fuente responde 200 sin sumar.
- [`?simular=UNAUTHENTICATED` afecta a la publicación y a las confirmaciones a la vez] → Es aceptable para pruebas manuales y queda escrito en el README de `reports`.
- [Rama atrasada respecto de `main`] → Antes del apply hay que traer `main` (con autorización de Fran) y revisar que `ReportPanel.tsx` y `VisionAssist.tsx` de Valen no choquen. Este change no los toca.

## Migration Plan

Para conectar el backend:
1. Reemplazar el cuerpo de `getMyConfirmation` y `confirmReport` por `fetch` a los endpoints del PR #6, con `cache: "no-store"` porque la respuesta es privada.
2. Mantener la validación del contrato.
3. Borrar `isSampleAuthor`, `findSampleReport` y `updateSampleReport` cuando `USING_SAMPLE_DATA` pase a `false`.

Para volver atrás, alcanza con sacar `ConfirmationAction` de `ReportDetail`.

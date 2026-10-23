# Design

## Context

- `/mapa` es una página estática (`app/mapa/page.tsx`, Server Component) que carga `ReportsMap` solo en el navegador con `MapLoader` (`dynamic`, `ssr: false`). `ReportsMap` maneja los marcadores, la carga por área visible, el panel de detalle (`ReportDetail`, abajo en el celular y al costado en escritorio) y `SelectedMarkerFocus`, que mueve el mapa para que el panel no tape el marcador elegido.
- El login existente (`app/auth-buttons.tsx`) llama a `signInWithOAuth` con `redirectTo` hacia `/auth/callback`. El callback ahora acepta `next` con rutas internas (cambio aprobado por Fran). La sesión se puede leer en el navegador con el cliente de `utils/supabase/client`.
- El contrato (`lib/contracts/`) define `PublishReportRequest` (`report` + `image: File`), `validatePublishReportRequest`, `validatePublicationHeaders` (UUID), los límites (`MAX_IMAGE_BYTES` = 4 MiB, título y descripción), los códigos de error y los casos de publicación (`PUBLICATION_CASES`). Los PRs #5 y #6 respetan esa forma, pero todavía no están mergeados.
- Next 16 con Cache Components no permite valores aleatorios (`crypto.randomUUID()`) durante el render de un Client Component.
- `Photo.url` tiene que ser HTTPS según el validador. El límite de 4 MiB viene del tope de ~4,5 MB por request de Vercel.

## Goals / Non-Goals

**Goals:**
- Reportar sin salir de `/mapa`, marcando el punto en el mapa grande.
- Que conectar el backend real sea reemplazar solo la fuente de publicación.
- Que ninguna falla, ni volver a elegir el punto, haga perder lo que el vecino cargó.

**Non-Goals:**
- Guardar el borrador entre recargas de la página (localStorage o IndexedDB).
- Mostrar la foto del reporte publicado en el detalle del mapa durante el modo de ejemplo.
- Que la verificación de sesión en el navegador sea un control de seguridad: el que manda es el backend (401 y RLS).

## Decisions

### 1. Un modo de reporte dentro de `ReportsMap`

```
              [Reportar]                 [Confirmar ubicación]
  viewing  ---------------->  picking  ------------------------>  filling
     ^     (con sesión)          ^  |                               |  |
     |                           |  +-- [Cancelar] ---> viewing     |  |
     |                           +------- [Cambiar] ----------------+  |
     +------ [Cancelar] / [Ver el reporte] / publicado ---------------+
```

`ReportsMap` suma un estado `mode` (`viewing | picking | filling`). En `picking` y `filling` se ocultan el botón "Reportar" y el detalle, y tocar un marcador no hace nada. Se borran `app/reportar/`, `ReportGate` y `LocationPicker`.

*Alternativa descartada:* una página aparte (`/reportar`), que era el diseño anterior. Fran pidió que se reporte solo desde el mapa.

### 2. Pin fijo en el centro para elegir el punto

En `picking` se superpone un pin con CSS en el centro del contenedor del mapa (`pointer-events: none`). El vecino mueve el mapa, no el pin. En cada `moveend` se calcula `isInsideRosario(map.getCenter())`, y "Confirmar ubicación" se deshabilita fuera de Rosario, con el aviso. Al confirmar se guarda `map.getCenter()`. "Usar mi ubicación" hace `flyTo` a la posición del GPS. Los errores del GPS muestran un aviso y el vecino sigue moviendo el mapa.

Los botones van en una barra fija sobre el mapa, con `L.DomEvent.disableClickPropagation` para que tocarlos no cuente como tocar el mapa (el bug que apareció con el selector anterior).

*Alternativa descartada:* arrastrar un pin. Con el dedo es menos preciso, y el dedo tapa el pin mientras se arrastra.

### 3. Panel del formulario con la misma forma que el detalle

En `filling` se muestra un `Marker` fijo en el punto elegido, y `ReportPanel` usa las mismas clases que `ReportDetail` (abajo, como máximo el 60 % del alto, en el celular; a la derecha, 24 rem, en escritorio). `SelectedMarkerFocus` se generaliza para recibir un punto en lugar de un reporte, así mueve el mapa para que el panel no tape el punto elegido.

El panel tiene el título "Nuevo reporte", "Cancelar", el aviso de modo de ejemplo, "Ubicación elegida · Cambiar" y las secciones Foto, Qué pasó y Dirección.

### 4. El borrador vive en `ReportsMap`, no en el panel

Para que "Cambiar" (que vuelve a `picking` y desmonta el panel) no pierda nada, el borrador (`useReducer`) se sube a `ReportsMap` y se pasa al formulario, que queda controlado. El reducer y `hasDraftData(draft)` (si hay algo cargado, para decidir si "Cancelar" pide confirmación) van en `report-draft.ts`, que es puro y tiene tests. La confirmación usa `window.confirm("¿Descartar el reporte?")`, que es nativo y funciona en el celular.

### 5. Sesión verificada en el navegador al tocar "Reportar"

Al tocar "Reportar", `createClient().auth.getClaims()` decide entre empezar el reporte o mostrar `LoginPrompt` (un aviso flotante sobre el mapa). Así `/mapa` sigue siendo estática y no se agrega `Suspense` ni cookies en el servidor. `LoginPrompt` usa `next=/mapa?reportar=1`. Al montarse, si `?reportar=1` está en la dirección y hay sesión, `ReportsMap` entra en `picking` y saca el parámetro con `history.replaceState`, para que recargar no reabra el reporte.

Es una comodidad de interfaz: si la sesión venció, la publicación igual devuelve 401 y el formulario muestra el login.

### 6. Foto: `createImageBitmap` + `canvas`, sin librerías

1. `createImageBitmap(file, { imageOrientation: "from-image" })` aplica la rotación del EXIF.
2. `fitWithin(ancho, alto, 2560)` (pura) calcula el tamaño sin agrandar.
3. `canvas.toBlob("image/jpeg", 0.85)`, con reintentos a 0,75 y 0,65 si supera `MAX_IMAGE_BYTES`. Rehacer la imagen descarta todos los metadatos EXIF, incluida la ubicación GPS.
4. El resultado es `foto.jpg` y se valida con `validatePublishReportRequest`.

Si el navegador no puede decodificar el archivo, se muestra "No pudimos leer la foto. Probá con otra.".

### 7. Una única fuente de publicación con la forma de la API

`report-publisher.ts` exporta `publishReport({ report, image, idempotencyKey })` y devuelve `{ status, body: ApiResult<Report> }`. En este change es falsa:
- valida con `validatePublishReportRequest` y `validatePublicationHeaders` (422 con `fieldErrors`);
- maneja la idempotencia en memoria: la misma clave y la misma huella dan 200 con el mismo reporte; la misma clave con otra huella da 409 IDEMPOTENCY_CONFLICT;
- tiene una demora de ~800 ms, y `?simular=<código>` en `/mapa` hace fallar la próxima publicación (STORAGE_UNAVAILABLE, PUBLICATION_IN_PROGRESS o UNAUTHENTICATED);
- crea un `Report` válido, con estado `pending`, el umbral inicial del contrato y una URL de foto sintética (`example.invalid`), y lo suma a la lista en memoria de `report-source.ts`.

Al recibir 201 o 200, `ReportsMap` vuelve a cargar el área visible, así aparece el marcador nuevo. "Ver el reporte" abre su detalle con el `Report` devuelto.

### 8. Clave de idempotencia sin valores aleatorios durante el render

La clave se genera la primera vez que se toca "Publicar" (`crypto.randomUUID()`, o un UUID v4 con `crypto.getRandomValues` fuera de contextos seguros, como `http://192.168.x.x`), se guarda en el borrador y se reutiliza en los reintentos. Se descarta con el borrador después de publicar, al cancelar o con "Reportar otro". `reviewed: true` se agrega al tocar "Publicar".

### 9. Errores junto a cada campo

Los `fieldErrors` del contrato (`report.title`, `report.location.address.street`, etc.) se asocian a los campos con una tabla fija (`form-helpers.ts`). Al cambiar un campo se borra su error.

### 10. Tests de la lógica pura sin tocar `package.json`

`report-form.test.ts` y `check-report-form.mjs` (mismo patrón que `check-map-data.mjs`) cubren `fitWithin`, la clave, la fuente falsa, la asociación de `fieldErrors` y el reducer del borrador. `map-data.test.ts` cubre `isInsideRosario` y los reportes publicados. La interfaz, la cámara, el `canvas` y el GPS se verifican en el navegador y en un celular.

## Risks / Trade-offs

- [El callback cambia el login para todos] → Sin `next`, el comportamiento es idéntico al anterior; con `next` solo acepta rutas internas. Lo revisan Agus y Valen en el PR.
- ["Original" pasa a ser la foto achicada] → Lo deciden Agus y Valen en el PR. Si no lo aceptan, el formulario puede enviar el archivo tal cual y rechazar los de más de 4 MiB.
- [En el celular, el panel ocupa hasta el 60 % del alto] → El punto ya está elegido en el paso anterior, y `SelectedMarkerFocus` lo deja visible arriba del panel.
- [La verificación de sesión en el navegador puede estar desactualizada] → Solo decide qué se muestra; la publicación devuelve 401 y el formulario pide el login.
- [El borrador se pierde si se recarga la página] → Fuera de alcance; el login se pide antes de empezar, así que el borrador no depende de una redirección.
- [El GPS no anda por `http` en la red local] → El punto se elige moviendo el mapa; en Vercel con `https` funciona.

## Migration Plan

Solo se agregan componentes y un modo nuevo en `ReportsMap`, más el cambio acotado del callback. Para revertir: sacar el modo de reporte y los componentes nuevos, y volver el callback a su versión anterior. La integración real va en otro change: reemplaza `publishReport` por `fetch("/api/reports", ...)` y saca el aviso de modo de ejemplo.

## Open Questions

- Si Agus y Valen no aceptan la foto achicada, ¿se rechazan las de más de 4 MiB o se discute otro límite? No cambia la estructura de este change.

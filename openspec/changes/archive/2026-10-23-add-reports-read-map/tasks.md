# Tasks

## 1. Entorno y dependencias (archivo protegido: requiere aprobación)

- [x] 1.1 Confirmar con Fran desde qué carpeta se instalan las dependencias (`mi/` o `Mi-Rosario/`), ya que hoy `node_modules` vive en `mi/`; verificar que `npm.cmd run lint` y `npm.cmd exec -- tsc --noEmit --incremental false` corren antes de cualquier cambio.
- [x] 1.2 Presentar a Fran el pedido de modificación de `package.json` y `package-lock.json` (qué se agrega, por qué, impacto en Agus y Valen, pruebas) y esperar su aprobación explícita; verificar que la aprobación quede registrada en la conversación o el PR.
- [x] 1.3 Instalar `leaflet@^1.9.4`, `react-leaflet@^5.0.0` y `@types/leaflet@^1.9` (dev); verificar con `npm.cmd ls react leaflet react-leaflet` que hay una sola copia de `react` y que el diff de `package.json` solo agrega esas tres entradas.

## 2. Capa de datos

- [x] 2.1 Crear `app/components/map/sample-reports.ts` con unos 12 reportes de ejemplo repartidos por Rosario, a partir de `REPORT_FIXTURES` y `VERIFICATION_FIXTURES` con `cloneFixture`: 4 categorías, 3 gravedades, estados `pending` y `citizen-verification`, umbrales 3 y 5 y ninguna simulación institucional. Verificar que cada uno pasa `validateReport`.
- [x] 2.2 Crear `app/components/map/report-source.ts` con `listReports(query)`, que valida con `validateReportListQuery`, filtra por `bbox` y pagina con un cursor opaco, y con `loadAllReportsInBbox(bbox)`, que recorre las páginas hasta `nextCursor === null`. Verificar con los tests de 2.3.
- [x] 2.3 Crear `app/components/map/map-data.test.ts` y `app/components/map/check-map-data.mjs` (mismo patrón que `scripts/check-contracts.mjs`, sin tocar `package.json`), con tests que cubran: datos de ejemplo válidos y sin estados institucionales, filtro por bbox (dentro, fuera, borde), query inválida rechazada, recorrido de varias páginas con `limit` chico sin perder ni duplicar reportes, y área vacía. Verificar que `node app/components/map/check-map-data.mjs` pasa.

## 3. Ruta y mapa

- [x] 3.1 Crear `app/mapa/page.tsx` (Server Component) con título, aviso visible de "Reportes de ejemplo" y `MapLoader`. Verificar que `/mapa` abre sin sesión y que `/`, el login y `/auth/callback` siguen funcionando igual.
- [x] 3.2 Crear `app/components/map/MapLoader.tsx` (`'use client'`, `dynamic(..., { ssr: false })`, con un placeholder del mismo tamaño). Verificar que `npm.cmd run build` no da errores de `window` ni de `ssr: false`.
- [x] 3.3 Crear `app/components/map/ReportsMap.tsx`: mapa centrado en Rosario, tiles de OSM con atribución, `leaflet.css` importado en el componente y marcadores `divIcon` por gravedad y categoría con etiqueta accesible. Verificar en el navegador que aparecen los marcadores del área visible y la atribución.
- [x] 3.4 Recargar en `moveend` con debounce, descartar respuestas viejas, conservar los marcadores mientras carga y mostrar un aviso de error con "Reintentar". Verificar a mano que mover el mapa actualiza los marcadores y, forzando un error temporal en el adaptador, que el reintento funciona.
- [x] 3.5 Limitar la vista a Rosario: guardar el límite municipal simplificado de OpenStreetMap (relación 3594027) en `app/components/map/rosario-boundary.ts`, usar su bounding box como `maxBounds` con viscosidad total, oscurecer lo que queda afuera del límite y marcar el contorno, con un zoom mínimo que deje ver la ciudad entera según el tamaño real del mapa (se recalcula al cambiar el tamaño). Verificar con un test que los reportes de ejemplo están dentro del límite y, en celular y en escritorio, que al alejar el zoom al máximo y arrastrar hacia los bordes las localidades vecinas aparecen oscurecidas.

## 4. Detalle del reporte

- [x] 4.1 Crear `app/components/reports/ReportDetail.tsx` con foto, título, descripción, categoría (`INITIAL_CATEGORIES`), gravedad (`SEVERITY_DETAILS`), ubicación, fecha en formato es-AR y confirmaciones `confirmationCount de threshold`. Verificar con un reporte de umbral 5 que se ve "5 de 5" y que no hay ningún 3 hardcodeado (buscar en el módulo).
- [x] 4.2 Crear el recorrido de cuatro etapas (`STAGE_LABELS`) con la etapa actual marcada y las municipales como "No disponible". Verificar con un reporte `pending` y otro `citizen-verification`.
- [x] 4.3 Mostrar la foto con `<img>` y `onError` → "Foto no disponible" (con un disable de lint justificado en esa línea). Verificar con las URLs `example.invalid` que aparece el estado y el resto del detalle sigue visible.
- [x] 4.4 Mostrar el detalle como panel inferior en celular (máximo 60 % del alto, scroll interno, botón "Cerrar") y como panel lateral en pantallas anchas. Verificar a 360 px que se abre, se cierra y el mapa conserva su posición.
- [x] 4.5 Desplazar el mapa al abrir el detalle cuando el marcador elegido queda tapado por el panel, midiendo el panel real y sin mover el mapa si el marcador ya es visible. Verificar en el navegador, a 360 px y en escritorio, que un marcador de la mitad inferior (o del borde derecho en escritorio) queda visible fuera del panel y que uno ya visible no mueve el mapa.

## 5. Verificación integral

- [x] 5.1 Correr `npm.cmd run lint`, `npm.cmd exec -- tsc --noEmit --incremental false`, `npm.cmd run check:contracts`, `node app/components/map/check-map-data.mjs`, `npm.cmd run build`, `openspec.cmd validate add-reports-read-map --strict` y `git diff --check`. Verificar que todo pasa.
- [x] 5.2 Probar `/mapa` en un celular real o en la emulación de 360 px: sin scroll horizontal, gestos táctiles, marcadores, detalle completo, "Falta de luz" sin lenguaje de inseguridad, aviso de datos de ejemplo. Verificar dejando capturas como evidencia para el PR.
- [x] 5.3 Listar todos los archivos modificados y marcar los compartidos (`package.json` y `package-lock.json`). Verificar que `git status` no muestra cambios en `lib/contracts/`, `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `next.config.ts`, `utils/supabase/` ni en las configuraciones de los asistentes.

## Workflow follow-up

- Commit, push y PR hacia `feature/interface-map`, solo con autorización de Fran. El PR enlaza este change y pide a Agus y Valen que revisen `package.json`.
- Un change posterior reemplaza el adaptador sintético de `report-source.ts` por `GET /api/reports` cuando el backend de Agus pase su aceptación, y quita el aviso de datos de ejemplo.
- Archivar el change cuando las tareas y la revisión estén completas.

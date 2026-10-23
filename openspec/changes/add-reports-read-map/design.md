# Design

## Context

- Next.js 16.4.2 (App Router) con React 19.3. Las páginas son Server Components por defecto. Leaflet necesita `window` al importarse, así que no puede renderizarse en el servidor.
- Según `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`, `dynamic(..., { ssr: false })` solo se puede usar dentro de un Client Component; en un Server Component da error.
- Según `01-getting-started/11-css.md`, el CSS de `node_modules` se puede importar desde cualquier archivo, así que `leaflet/dist/leaflet.css` no necesita `app/globals.css`.
- Los contratos (`lib/contracts/`) definen `Report`, `ReportListQuery` (`bbox` = "oeste,sur,este,norte", `limit` 1–100, `cursor`) y `ReportList` (`items`, `nextCursor`), además de `validateReportListQuery`, `validateReport`, `STAGE_LABELS`, `SEVERITY_DETAILS` e `INITIAL_CATEGORIES`. Son de solo lectura para este change.
- Los fixtures compartidos ubican los 4 reportes en el mismo punto (-32.9468, -60.6393) y usan URLs de foto `example.invalid`, que nunca cargan.
- `next.config.ts` y `package.json` son archivos protegidos. `node_modules` está instalado en la carpeta padre (`mi/`), no en `Mi-Rosario/`.
- No hay runner de tests de UI. `check:contracts` compila solo el grafo de contratos.

## Goals / Non-Goals

**Goals:**
- Que la integración con `GET /api/reports` sea cambiar un solo módulo, sin tocar componentes.
- Que nada de Leaflet llegue al render del servidor.
- No tocar ningún archivo protegido salvo `package.json` y `package-lock.json`, y solo con aprobación.

**Non-Goals:**
- Agrupar marcadores (clustering), filtros, geolocalización del usuario y caché entre visitas.
- Tests automatizados de componentes de React (requerirían un runner nuevo en `package.json`). La capa de datos sí se testea (decisión 9).

## Decisions

### 1. Cadena Server → Client → carga dinámica

```
app/mapa/page.tsx            Server Component: título, aviso de datos de ejemplo
  └─ app/components/map/MapLoader.tsx      'use client'; dynamic(import ReportsMap, { ssr: false })
       └─ app/components/map/ReportsMap.tsx 'use client'; Leaflet, marcadores, carga por viewport
            └─ app/components/reports/ReportDetail.tsx  panel de detalle
```

`MapLoader` existe solo porque `ssr: false` no se permite en la página Server. Mientras carga, muestra un placeholder del mismo tamaño que el mapa para que no salte el layout.

*Alternativa descartada:* marcar toda la página con `'use client'`. Funciona, pero pierde el render en el servidor del contenido que no es el mapa.

### 2. `react-leaflet` 5 sobre Leaflet 1.9

`react-leaflet@5.0.0` declara como peer `react ^19` y `leaflet ^1.9`, que es compatible con el proyecto. Expone hooks (`useMapEvents`) para escuchar `moveend` y leer los bounds, y evita manejar a mano el ciclo de vida del mapa en React.

*Alternativa descartada:* Leaflet sin wrapper con `useEffect` y refs. Son menos dependencias, pero hay que limpiar y sincronizar los marcadores a mano y resulta más frágil con StrictMode.

Dependencias pedidas: `leaflet@^1.9.4` y `react-leaflet@^5.0.0` en `dependencies`, y `@types/leaflet@^1.9` en `devDependencies`.

### 3. Una sola fuente de datos con la forma de la API

`app/components/map/report-source.ts` exporta `listReports(query: ReportListQuery): Promise<ReportList>`. En este change es un adaptador sintético que:

1. valida la query con `validateReportListQuery`;
2. filtra los datos de ejemplo por `bbox`;
3. pagina con `limit` y un cursor con el formato que exige `validateReportListQuery` (base64url de `{ version: 1, createdAt, id, filters }`, orden por `createdAt` descendente e `id`).

Encima de esa función, un helper `loadAllReportsInBbox(bbox)` recorre las páginas hasta que `nextCursor` sea `null`. Los componentes solo ven `listReports` y `loadAllReportsInBbox`. Al integrarse con el backend, se reemplaza el adaptador por `fetch('/api/reports?...')` + `validateApiResult(..., validateReportList)`.

El cursor es opaco para los componentes, que nunca lo interpretan. El adaptador usa el formato de cursor que validan los contratos, porque `validateReportListQuery` rechaza cualquier otro. Los archivos de la capa de datos importan `lib/contracts/` con rutas relativas, no con `@/`, porque el runner de tests compila con resolución Node sin alias.

*Alternativa descartada:* importar los fixtures directamente en los componentes. Es más rápido hoy, pero obliga a reescribir los componentes al integrar y no ejercita la paginación.

### 4. Datos de ejemplo propios en el módulo de Fran

`app/components/map/sample-reports.ts` arma unos 12 reportes repartidos por barrios de Rosario. Toma como base `REPORT_FIXTURES` y `VERIFICATION_FIXTURES` (con `cloneFixture`) y les cambia ubicación, título e id. Así cubre las 4 categorías, las 3 gravedades, los estados `pending` y `citizen-verification`, y los umbrales 3 y 5.

No se incluye `INSTITUTIONAL_SIMULATIONS`. Cada ejemplo se pasa por `validateReport`, que rechaza estados institucionales por defecto, cuando se importa el módulo en desarrollo; si alguno es inválido, se lanza un error claro.

*Alternativa descartada:* agregar fixtures a `lib/contracts/fixtures.ts`. Es un archivo protegido y compartido, y estos datos solo los necesita el mapa.

### 5. Carga por viewport con descarte de respuestas viejas

Cada evento `moveend` dispara `loadAllReportsInBbox` con los bounds actuales, con un debounce de unos 300 ms. Cada carga lleva un id incremental y solo se aplica la respuesta de la carga más reciente, para que una respuesta lenta no pise a una nueva. Mientras se carga se siguen mostrando los marcadores anteriores. Si falla, aparece un aviso con un botón "Reintentar" encima del mapa, que sigue usable.

### 6. Detalle como panel inferior en celular

En pantallas angostas, el detalle es un panel fijo abajo que ocupa como máximo el 60 % del alto, tiene scroll interno y un botón "Cerrar". En pantallas anchas pasa a ser un panel lateral. Se descarta el popup nativo de Leaflet porque en un celular queda chico para foto, descripción y recorrido de etapas, y se corta contra los bordes.

Al abrir el detalle se mide el panel real (su tamaño cambia entre celular y escritorio) y se calcula la zona del mapa que queda libre: arriba del panel en celular, a su izquierda en escritorio. Si el marcador elegido cae fuera de esa zona (con un margen), el mapa se desplaza con `panBy` lo justo para meterlo en la zona libre. No se centra, porque el centro de Rosario está pegado al río (el borde este) y centrar un marcador de ahí chocaría con los límites del mapa. Si ya está visible, el mapa no se mueve, para no desorientar. Ese desplazamiento dispara `moveend` y la recarga normal del área visible.

### 7. Foto con `<img>` y estado de error

Se usa `<img>` con `onError` → "Foto no disponible". `next/image` con URLs remotas requiere `images.remotePatterns` en `next.config.ts`, que es un archivo protegido, y las URLs firmadas que vencen no se benefician del optimizador. La regla de lint `@next/next/no-img-element` se desactiva solo en esa línea, con un comentario que explique por qué.

### 8. Íconos de marcador con `divIcon`

Los íconos por defecto de Leaflet se rompen con bundlers porque resuelven sus imágenes por ruta. Se usa `L.divIcon` con HTML y estilos de Tailwind: el color indica la gravedad (baja, media o alta) y una letra o ícono simple indica la categoría. Así no hace falta configurar assets ni tocar `public/`. Cada marcador tiene una etiqueta accesible con el título del reporte.

### 10. Mapa limitado a Rosario con máscara del límite municipal

Rosario no es rectangular, así que un `maxBounds` rectangular deja ver Pérez, Soldini o Funes en las esquinas. Por eso:

- `app/components/map/rosario-boundary.ts` guarda el límite municipal simplificado (relación OSM 3594027, ODbL, unos 150 puntos) y su bounding box. Es un archivo estático de una sola descarga, sin pedidos en tiempo de ejecución.
- Un polígono del tamaño del mundo, con el límite como agujero, oscurece todo lo de afuera. Encima se dibuja el contorno.
- El `maxBounds` (viscosidad 1) y el área de tiles son la bounding box ampliada un 35 % (`pad(0.35)`). Ese margen cae dentro de la zona oscurecida y permite mover un marcador del borde de la ciudad para que salga de abajo del panel de detalle.
- El zoom mínimo es `getBoundsZoom(bbox)`: la ciudad entera entra en pantalla. Se recalcula con `resize` porque depende del tamaño.

*Alternativa descartada:* un rectángulo más chico que la ciudad. Esconde los bordes reales de Rosario y no permite ver la ciudad entera.

### 9. Tests de la capa de datos sin tocar `package.json`

`report-source.ts` y `sample-reports.ts` son lógica pura, así que se pueden testear sin navegador. Se agrega `app/components/map/check-map-data.mjs`, que sigue el mismo patrón que `scripts/check-contracts.mjs`: compila con el TypeScript instalado `app/components/map/map-data.test.ts` en un directorio temporal y lo corre con `node --test`. Se ejecuta con `node app/components/map/check-map-data.mjs`, sin agregar un script a `package.json`. Los componentes de React se verifican a mano en un celular.

*Alternativa descartada:* sumar Vitest. Agrega dependencias y configuración global para un módulo chico.

## Risks / Trade-offs

- [Dos `node_modules` (`mi/` y `Mi-Rosario/`) → copias duplicadas de React al instalar Leaflet] → La tarea 1.1 confirma desde dónde se instala antes de tocar nada y verifica que exista una sola copia de `react` (`npm ls react`).
- [La política de uso de los tiles de OSM no admite tráfico alto] → Alcanza para el desarrollo y el MVP. La atribución es obligatoria. Elegir un proveedor de tiles para producción es una decisión posterior.
- [Los datos sintéticos no muestran problemas reales: latencia, cientos de marcadores, URLs vencidas] → El adaptador puede simular demora. Clustering y rendimiento quedan para el change de integración.
- [El contrato cambia antes de integrar] → Todo pasa por `report-source.ts` y por los tipos de `lib/contracts/`. Si el contrato cambia, falla `tsc`.
- [Sin tests automáticos de componentes] → La capa de datos tiene tests propios. La UI se verifica con `tsc`, `lint` y una lista manual en celular (grupo 5).

## Migration Plan

Solo se agregan una ruta y componentes nuevos; no hay datos que migrar. Para revertir, alcanza con borrar `app/mapa/`, los componentes nuevos y las tres dependencias. La integración con la API real va en un change aparte, que reemplaza el adaptador de `report-source.ts` y quita el aviso de datos de ejemplo.

## Open Questions

- Proveedor de tiles para producción: no cambia este change.
- Si `/mapa` termina siendo la home: requiere modificar `app/page.tsx` en otro change, con aprobación.

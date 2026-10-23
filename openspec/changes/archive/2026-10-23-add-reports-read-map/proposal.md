# Proposal

## Why

Mi Rosario todavía no tiene ninguna pantalla propia: el núcleo del producto es ver los incidentes reportados sobre un mapa de la ciudad, y el backend de reportes todavía no existe. Un mapa de solo lectura alimentado por datos sintéticos con la forma exacta de los contratos compartidos permite avanzar el frontend ahora, sin depender de Agus ni de Valen, y deja la integración real reducida a cambiar una sola fuente de datos.

## What Changes

- Nueva página pública `/mapa` que muestra un mapa de Rosario (Leaflet + OpenStreetMap) usable en un celular.
- Marcadores para los reportes del área visible, cargados por bounding box y recorriendo todas las páginas de resultados, con la misma forma que `GET /api/reports` (`ReportListQuery` / `ReportList`).
- Panel de detalle al tocar un marcador con: foto (o estado honesto de "foto no disponible"), título, descripción, categoría, gravedad, recorrido de cuatro etapas con las etapas institucionales marcadas como no disponibles, ubicación, fecha de creación y confirmaciones ciudadanas en la forma `cantidad / umbral` devuelto por los datos.
- Una única fuente de datos del mapa dentro del módulo de Fran. En este change devuelve datos sintéticos (los fixtures compartidos más ejemplos propios repartidos por Rosario); en un change posterior se reemplaza por la API real sin tocar los componentes.
- **Requiere aprobación (archivo protegido):** agregar `leaflet`, `react-leaflet` y `@types/leaflet` a `package.json` / `package-lock.json`.

Fuera de alcance: crear reportes, confirmar reportes, `/confirmations/me`, filtros, agrupamiento de marcadores, integración con la API real, cambios en la home (`app/page.tsx`) y cualquier cambio en `lib/contracts/`.

## Capabilities

### New Capabilities
- `report-map`: Visualización pública de los reportes ciudadanos sobre el mapa de Rosario: carga por área visible, marcadores y detalle de cada reporte.

### Modified Capabilities

Ninguna. No hay specs principales todavía; este change consume los contratos de `establish-team-architecture` sin modificarlos.

## Impact

- **Código nuevo, dentro del módulo de Fran:** `app/mapa/` (ruta nueva, aprobada por Fran), `app/components/map/` y `app/components/reports/`.
- **Archivos protegidos:** solo `package.json` y `package-lock.json`, por las tres dependencias nuevas. Requiere aprobación explícita de Fran antes de instalar y revisión de Agus y Valen antes del merge. No se tocan `lib/contracts/`, `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `next.config.ts`, `utils/supabase/` ni la autenticación.
- **Contratos:** solo lectura de `Report`, `ReportList`, `ReportListQuery`, `INITIAL_CATEGORIES`, `SEVERITY_DETAILS`, `STAGE_LABELS`, los validadores y los fixtures.
- **Servicios externos:** tiles públicos de OpenStreetMap, con la atribución que exige su política de uso.
- **Entorno:** las dependencias del proyecto hoy están instaladas en la carpeta padre (`mi/node_modules`), no en `Mi-Rosario/`. Hay que resolverlo antes de instalar nada.
- **Ramas:** se trabaja en `feature/interface-map`, que se mergea ahí primero.

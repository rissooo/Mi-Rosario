# Proposal

## Why

Hoy en Mi Rosario se pueden ver reportes en el mapa, pero no crearlos. El formulario de reporte es lo que convierte la app en algo útil para los vecinos. El contrato de publicación ya está definido, así que el formulario se puede hacer ahora contra una fuente de datos falsa, sin esperar el backend de Agus (PR #6) ni Gemini de Valen (PR #5).

Se reporta **solo desde el mapa**: no hay una página aparte, y la ubicación se marca en el mismo mapa donde se ven los reportes.

## What Changes

- Botón "Reportar" en `/mapa`, que exige sesión. Sin sesión muestra "Entrá con Google para reportar" y, después del login, el vecino vuelve a `/mapa` con el reporte ya iniciado.
- Reporte en dos pasos, dentro de `/mapa`:
  1. **Elegir el punto:** el mapa entra en modo "elegí el punto", con un pin fijo en el centro de la pantalla. El vecino mueve el mapa (o toca "Usar mi ubicación", con el GPS) y toca "Confirmar ubicación". No se puede confirmar un punto fuera de Rosario.
  2. **Completar el reporte:** sube un panel, igual que el del detalle (abajo en el celular, al costado en la compu), con la ubicación elegida y la opción "Cambiar", más:
     - **Foto:** sacar o elegir una. Se achica en el navegador (lado mayor de hasta 2560 px, JPEG) para quedar por debajo de 4 MiB y sin metadatos EXIF.
     - **Qué pasó:** categoría (las 4 del catálogo), gravedad (baja, media o alta, con su descripción), título y descripción.
     - **Dirección:** calle y altura a mano, con la casilla "Sin altura".
     - **Publicar:** validación con los validadores del contrato y errores en español junto a cada campo.
- Publicación a través de una única fuente de datos con la forma de `POST /api/reports` (multipart + `Idempotency-Key`). En este change es falsa: guarda en memoria, respeta la idempotencia y puede simular errores. Si la publicación falla, se conservan el borrador y la clave para reintentar.
- Al publicar con éxito, el panel muestra "¡Reporte publicado!" y el marcador nuevo aparece en el mapa en ese momento. En el modo de ejemplo dura hasta recargar la página.
- **Aprobado por Fran (archivo protegido):** `app/auth/callback/route.ts` redirige después del login a la ruta interna indicada en `next`, en lugar de ir siempre a `/`.
- **Requiere acuerdo de Agus y Valen:** la foto que llega al backend es la versión achicada en el navegador, no el archivo original del celular.

Fuera de alcance: una página aparte para reportar, sugerencias de Gemini, publicación real en Supabase, sugerir la dirección a partir del punto (geocodificación), editar o borrar reportes y cambios en `lib/contracts/`.

## Capabilities

### New Capabilities
- `report-form`: creación de un reporte ciudadano desde el mapa: sesión requerida, elección del punto dentro de Rosario, foto preparada, datos del incidente, dirección, validación, publicación idempotente y manejo de errores.

### Modified Capabilities
- `report-map`: se agrega el botón "Reportar" que inicia el reporte en el mismo mapa y, en el modo de ejemplo, los reportes publicados aparecen en el mapa enseguida.

## Impact

- **Código dentro del módulo de Fran:** `app/components/map/` (modo de reporte en `ReportsMap`, pin central, máscara de Rosario reutilizable, verificación de que un punto esté dentro del municipio, reportes publicados en el modo de ejemplo) y `app/components/reports/` (panel del formulario, foto, login y fuente de publicación). Botón en `app/mapa/page.tsx`.
- **Archivo protegido:** `app/auth/callback/route.ts`, aprobado por Fran. Sin `next`, el login funciona igual que antes; Agus y Valen deberían revisarlo.
- **Sin dependencias nuevas:** el achicado de la foto usa `canvas` del navegador. No se toca `package.json`.
- **Contratos:** solo lectura de `ReportFields`, `PublishReportRequest`, `PublicationHeaders`, `validatePublishReportRequest`, `validatePublicationHeaders`, `INITIAL_CATEGORIES`, `SEVERITY_DETAILS`, los límites y los códigos de error.
- **Entorno:** para el login hace falta `.env.local` en `Mi-Rosario/`. El GPS del navegador solo funciona con `https` o en `localhost`; por la IP de la red local, el punto se marca moviendo el mapa.
- **Rama:** `feature/interface-map`.

# Proposal

## Why

El backend real (PR #6, `feature/reports-backend`) sirve la versión para ver de la foto con `getPublicUrl` del bucket `reports-public`, una URL que no vence. El contrato exige que `Photo.expiresAt` sea una fecha UTC, así que ningún reporte real pasa `validateReport` y el backend tuvo que validar copias con una fecha inventada (`2099-01-01`). Además, las cuotas por cuenta (3 publicaciones en curso, 10 reportes cada 24 h) hoy responden 409 PUBLICATION_IN_PROGRESS, el mismo código que significa "esta misma publicación sigue en curso, reintentá con la misma clave": el frontend no puede distinguir un reintento inmediato de un límite que dura horas.

## What Changes

- **BREAKING (contrato):** `Photo.expiresAt` pasa de `IsoDateTime` a `IsoDateTime | null`. `null` significa que la URL no vence. La clave sigue siendo obligatoria: el backend tiene que mandar `expiresAt: null`, no omitirla. Una fecha sigue siendo válida para una futura URL firmada.
- Nuevo código de error `RATE_LIMITED` → 429, con header `Retry-After` en segundos, para las cuotas por cuenta. `PUBLICATION_IN_PROGRESS` (409) queda solo para la misma clave con una operación activa.
- Fixtures: los reportes sintéticos usan `expiresAt: null`, como el backend real; se agrega a `PUBLICATION_CASES` el caso de cuota alcanzada (429 RATE_LIMITED).
- Tests de contratos: aceptan `null` y fechas UTC válidas, siguen rechazando la clave ausente, fechas mal formadas y otros tipos; verifican el 429.
- Frontend:
  - `ReportDetail.tsx` considera vencida la foto solo si `expiresAt` no es `null` y la fecha ya pasó.
  - `report-publisher.ts` crea la foto simulada con `expiresAt: null` y permite simular `?simular=RATE_LIMITED`.
- `docs/contracts.md`: secciones de `Photo` y de errores/casos de publicación.
- El backend no se toca en este change: se entrega la lista de ajustes para `lib/reports/` en `feature/reports-backend`.

Fuera de alcance:
- Cambiar el bucket público por URLs firmadas, o el proceso de renovación de URLs.
- Pasar las cuotas del análisis de visión (hoy 503 ANALYSIS_UNAVAILABLE) a RATE_LIMITED.
- Mostrar en la interfaz cuánto falta según `Retry-After`.
- Editar el change en curso `establish-team-architecture`.

## Capabilities

### New Capabilities
<!-- Ninguna. -->

### Modified Capabilities
- `report-map`: el requisito "Foto no disponible" deja de tratar como vencida una foto con `expiresAt: null`.
- `report-form`: el requisito "Errores de publicación sin perder el borrador" agrega la respuesta 429 RATE_LIMITED y acota 409 PUBLICATION_IN_PROGRESS a la misma publicación en curso.

## Impact

- Contrato compartido: `lib/contracts/reports.ts`, `errors.ts`, `validation.ts`, `fixtures.ts`; `tests/contracts.test.ts`.
- Interfaz: `app/components/reports/ReportDetail.tsx`, `report-publisher.ts`, `report-form.test.ts`.
- Documentación: `docs/contracts.md`.
- Backend (PR #6): tiene que adoptar `expiresAt: null` y `RATE_LIMITED` después de que este change llegue a `main`; mientras tanto, sus validaciones temporales siguen funcionando porque una fecha sigue siendo válida.
- `validateApiError` acepta automáticamente el código nuevo porque se deriva de `ERROR_STATUS`; quien compare códigos con un `switch` exhaustivo tiene que sumar el caso.
- Queda desactualizado el texto del change en curso `establish-team-architecture` (spec `citizen-reports`: "su vencimiento"; design: URL "de corta duración"). Se informa para reconciliarlo aparte.

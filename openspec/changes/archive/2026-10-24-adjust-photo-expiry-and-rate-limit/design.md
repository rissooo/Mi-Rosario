# Design

## Context

Ver proposal.md (Why). Estado actual observado:

- `lib/contracts/reports.ts`: `Photo = { id; url; expiresAt: IsoDateTime; mimeType; byteSize }`. `validation.ts` exige la clave y la valida con `c.date`.
- `lib/contracts/errors.ts`: `ERROR_STATUS` no tiene ningún 429. `validateApiError` deriva los códigos aceptados de `Object.keys(ERROR_STATUS)`.
- Backend (`feature/reports-backend`, solo lectura): `mapRowToReport` omite `expiresAt` y valida copias con `TEMPORARY_PHOTO_EXPIRY_FOR_VALIDATION = "2099-01-01T00:00:00.000Z"`. Las cuotas salen de la RPC como `action: "LIMIT_REACHED"` con `code: "PUBLICATION_IN_PROGRESS"` y `quota: "active_claims" | "published_24h"`, y `publicationQuotaError` responde 409 con `retryAfter`. `app/api/reports/route.ts` ya pone `Retry-After` cuando hay `retryAfter`.
- Frontend: `ReportDetail.tsx` marca la foto como fallida si `Date.parse(photo.expiresAt) <= Date.now()`; con `null` no compila. `report-publisher.ts` crea la foto simulada con `expiresAt: now`, o sea ya vencida.
- El módulo de visión resolvió sus cuotas con 503 ANALYSIS_UNAVAILABLE y dejó escrito "no agregar 429 público sin revisión del contrato". Este change es esa revisión, pero solo para la publicación de reportes.

## Goals / Non-Goals

**Goals:**
- Que un reporte real del backend pase `validateReport` sin copias ni fechas inventadas.
- Que el frontend distinga "misma publicación en curso" de "cuota de la cuenta alcanzada".

**Non-Goals:**
- Decidir entre bucket público y URLs firmadas: el contrato admite las dos formas.
- Leer `Retry-After` en la interfaz (la fuente de publicación falsa no expone headers).

## Decisions

### 1. `expiresAt: IsoDateTime | null`, clave obligatoria

`null` = la URL no vence. Se mantiene la clave obligatoria, igual que `resolvedAt` y `verifiedAt`, que ya usan `IsoDateTime | null`. Con eso el validador estricto sigue detectando a un productor que se olvidó del campo.

Alternativas descartadas:
- Clave opcional (`expiresAt?`): rompe la convención de "nullable pero presente" del contrato y vuelve ambigua la ausencia.
- Quitar el campo: rompería cuando se usen URLs firmadas, que el design de la arquitectura base preveía.
- Una fecha lejana (lo que hace hoy el backend como parche): es un dato falso en el DTO público.

Los fixtures de `REPORT_FIXTURES` pasan a `null`, porque es lo que devuelve el backend real. La forma con fecha queda cubierta por tests explícitos.

### 2. Código nuevo `RATE_LIMITED` → 429 con `Retry-After`

Recomendación: un código propio. Razones:
- **Semántica distinta.** PUBLICATION_IN_PROGRESS le dice al cliente "reintentá en segundos con la misma clave". Una cuota de 24 h no se resuelve reintentando; si se mezclan, una UI que reintente sola va a golpear el límite una y otra vez.
- **Estándar HTTP.** 429 Too Many Requests con `Retry-After` (RFC 6585) es justo este caso. 409 describe un conflicto con el estado del recurso, no un límite de la cuenta.
- **Nombre genérico.** `RATE_LIMITED` y no `PUBLICATION_LIMIT_REACHED`: sirve igual si mañana se limitan las confirmaciones, sin sumar un código por endpoint.
- **Las dos cuotas usan el mismo código.** Se diferencian en el `message` en español que ya arma el backend ("Ya tenés el máximo de publicaciones en curso…" / "Alcanzaste el máximo de reportes para las últimas 24 horas."). No se agrega un campo `quota` al sobre de error: `validateApiError` es estricto y la UI no necesita ramificar por tipo de cuota.
- **`Retry-After` va en el header, en segundos enteros ≥ 1.** No va en el body, igual que con PUBLICATION_IN_PROGRESS y con visión.

Alternativas descartadas:
- Dejar 409 PUBLICATION_IN_PROGRESS con un campo `quota`: extiende el sobre y mantiene la semántica mezclada.
- 403 FORBIDDEN: no es un permiso, es temporal.
- 503: describe una indisponibilidad del servicio, no un límite propio de la cuenta.

La clave de idempotencia se conserva. Con la cuota de reclamos activos la RPC no crea el reclamo, y con la cuota de 24 h el backend libera el slot (`failIdempotencySlot`), así que reintentar más tarde con la misma clave es seguro.

### 3. Frontend mínimo

- `ReportDetail.tsx`: `photo.expiresAt !== null && Date.parse(photo.expiresAt) <= Date.now()`. El comentario sobre "URLs firmadas que vencen" pasa a decir que pueden vencer o no.
- `report-publisher.ts`: la foto simulada usa `expiresAt: null` y se suma `RATE_LIMITED` a `SIMULATED_FAILURES`, con su mensaje tomado de `PUBLICATION_CASES`, para probarlo en el celular con `/mapa?reportar=1&simular=RATE_LIMITED` (`ReportsMap.tsx` lee `simular`; la fuente de confirmaciones ignora el valor nuevo).
- `ReportPanel.tsx` no cambia: ya muestra `error.message` y conserva el borrador para cualquier código que no sea UNAUTHENTICATED.

### 4. Ajustes que tiene que hacer el backend (no se tocan en este change)

En `feature/reports-backend`, después de rebasear sobre `main` con este change:
1. `lib/reports/service.ts`: borrar `TEMPORARY_PHOTO_EXPIRY_FOR_VALIDATION`, `ReportDtoPendingPhotoExpiry` y los dos `validate…TemporarilyWithoutPublicExpiry`. `mapRowToReport` devuelve `Report` con `photo.expiresAt: null` y se valida con `validateReport`/`validateReportList` directamente. Quitar el `TODO Fran`.
2. `lib/reports/service.ts`: `publicationQuotaError` usa `publicationError("RATE_LIMITED", message)` (429 por `ERROR_STATUS`) y conserva `retryAfter`. El chequeo de `published.code === "PUBLICATION_IN_PROGRESS" && quota === "published_24h"` pasa a depender de `quota` (o de `action`), no del código.
3. `lib/reports/idempotency.ts`: el tipo de `LIMIT_REACHED` deja de afirmar `code: "PUBLICATION_IN_PROGRESS"`; lo que importa es `action` + `quota`.
4. SQL (`20261023000003_idempotency.sql`): no hace falta tocarlo. El TS traduce `LIMIT_REACHED` a `RATE_LIMITED`. Si se quiere alinear el `code` del JSON de la RPC, va en una migración nueva con `CREATE OR REPLACE FUNCTION`, no editando la ya aplicada; `tests/migrations-static.test.mjs` sigue pasando sin cambios.
5. `tests/service.test.ts`: invertir los asserts de `photo.expiresAt` (líneas ~159-292): esperar `expiresAt === null` y validación válida. En los casos de cuota (~498-535): esperar `RATE_LIMITED`, 429 y `Retry-After`.
6. `app/api/reports/route.ts`: sin cambios (ya emite `Retry-After`).

## Risks / Trade-offs

- [El backend sigue mandando la clave ausente hasta adaptarse] → El parche actual con fecha 2099 sigue validando con el contrato nuevo. Al integrar, el frontend valida con `validateReport`, que rechaza la clave ausente: hay que mergear el ajuste del backend antes de conectar la fuente real.
- [Una URL pública que no vence no se puede "revocar por tiempo"] → Moderar o borrar un reporte exige borrar o mover el objeto de `reports-public`. Es una decisión de privacidad del backend; se deja anotada en `docs/contracts.md`, no se resuelve acá.
- [Código nuevo en un `switch` exhaustivo] → Hoy nadie hace `switch` exhaustivo sobre `ErrorCode` (se usan `Partial<Record<…>>`); `tsc` lo detectaría igual.
- [Texto desactualizado en `establish-team-architecture`] → Se informa; se reconcilia con `/opsx:update` sobre ese change, aparte.

## Migration Plan

1. Mergear este change en `main` (contrato + frontend + docs). Es compatible hacia atrás para los productores: una fecha sigue siendo válida.
2. Rebasear `feature/reports-backend` y aplicar la lista de la decisión 4.
3. Rollback: revertir el commit. El backend, si ya mandaba `null`, volvería a fallar la validación, así que se revierten juntos.

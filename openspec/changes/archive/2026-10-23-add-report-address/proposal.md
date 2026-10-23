# Proposal

## Why

En el detalle del mapa, la ubicación de un reporte aparece como coordenadas ("-32,9477, -60,6304"), que un vecino no entiende. Hace falta mostrar la calle y la altura. El contrato compartido solo tiene latitud y longitud, y el backend todavía no existe, así que este es el momento más barato para agregar la dirección.

## What Changes

- **BREAKING (contrato):** `Location` en `lib/contracts/reports.ts` suma `address: { street: string; number: number | null }`. Es obligatorio en `ReportFields` (publicación) y en `Report` (lista y detalle).
- Los validadores compartidos exigen `address`: `street` de 2 a 80 caracteres sin espacios sobrantes y `number` entero de 1 a 99999 o `null` cuando no hay altura. Rechazan campos desconocidos dentro de `address`.
- Los fixtures compartidos, los tests de contratos y `docs/contracts.md` incluyen la dirección.
- El detalle del mapa muestra "Calle altura" (o "Calle (sin altura)") en lugar de las coordenadas. Los datos de ejemplo del mapa tienen direcciones reales de Rosario.
- Las coordenadas se mantienen: el mapa las usa para ubicar los marcadores.

Fuera de alcance: sugerir la dirección automáticamente a partir del mapa (geocodificación), verificar que la dirección coincida con las coordenadas, el formulario de publicación y las columnas de la base de datos.

## Capabilities

### New Capabilities
- `report-address`: Dirección legible (calle y altura) de cada reporte ciudadano: forma en el contrato, validación y presentación.

### Modified Capabilities

Ninguna en `openspec/specs/` (todavía no hay specs principales). El change `add-reports-read-map` ajusta en su propia spec cómo se muestra la ubicación en el detalle.

## Impact

- **Archivos protegidos (aprobados por Fran):** `lib/contracts/reports.ts`, `lib/contracts/validation.ts`, `lib/contracts/fixtures.ts`, `tests/contracts.test.ts` y `docs/contracts.md`. **Agus y Valen deben revisarlo antes del merge.**
- **Agus (backend):** tiene que guardar calle y altura, devolverlas en lista y detalle, y validar la publicación con el validador compartido. Sin `address`, una publicación o un reporte ya no pasan la validación.
- **Valen (Gemini):** no cambia su código. Las sugerencias siguen sin ubicación ni dirección.
- **Fran (frontend):** el detalle muestra la dirección. El futuro formulario tendrá que pedir o confirmar calle y altura.
- **Pendiente de acordar con Flequi:** el `design.md` y `specs/citizen-reports/spec.md` de `establish-team-architecture` describen la ubicación solo como latitud y longitud (tabla `reports` y detalle del marcador). Este change no los modifica; hay que reconciliarlos en la revisión.
- **Rama:** `feature/interface-map`, por decisión de Fran, junto con el change del mapa.

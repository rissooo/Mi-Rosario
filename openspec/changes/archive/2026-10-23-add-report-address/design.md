# Design

## Context

`Location` hoy es `{ latitude, longitude }` y lo validan dos caminos de `lib/contracts/validation.ts`: `reportFields` (publicación, devuelve valores normalizados) y `report` (lista y detalle, devuelve el valor tal cual). Los objetos se validan en forma estricta: un campo desconocido falla. No hay backend ni base de datos todavía. Ver proposal.md para la motivación.

## Goals / Non-Goals

**Goals:**
- Un único lugar con la forma de la dirección, que comparten el backend y el frontend.
- Que la calle publicada quede sin espacios sobrantes, igual que el título y la descripción.

**Non-Goals:**
- Geocodificar (de coordenadas a dirección o al revés) y verificar que la dirección coincida con las coordenadas.
- Normalizar nombres de calles (abreviaturas, mayúsculas) o validar contra un callejero de Rosario.

## Decisions

### 1. `address` dentro de `location`, no al nivel del reporte

La dirección y las coordenadas describen el mismo lugar, y un único objeto `location` evita que se actualice uno sin el otro. El cambio también se limita a una sola función de validación (`location`).

*Alternativa descartada:* `report.address` al nivel superior. Separa dos datos del mismo lugar y obliga a tocar las listas de claves de `reportFields` y de `report`.

### 2. Calle y altura separadas, altura nullable

`{ street, number }` asegura que la altura venga como número cuando existe, y `null` cubre plazas y parques. La presentación ("Córdoba 1250") la arma la interfaz.

*Alternativa descartada:* un texto único `address: string`. Es más flexible para esquinas ("Mendoza y Francia"), pero no asegura la altura, que fue lo que se pidió. Si el equipo prefiere esquinas, se puede sumar más adelante un campo opcional `crossStreet`, sin romper el contrato.

### 3. Límites

- `street`: de 2 a 80 caracteres (code points) después de quitar espacios sobrantes. 80 alcanza para "Avenida Presidente Perón" y similares.
- `number`: entero de 1 a 99999. Las alturas de Rosario tienen hasta 5 dígitos en los extremos.

Igual que el título, estos límites quedan sujetos a la revisión de Agus y Valen.

### 4. La normalización vive en `location`

`location()` pasa a devolver la ubicación normalizada (calle sin espacios sobrantes) y `reportFields` la incluye en su valor de retorno, igual que hace con `title` y `description`. `report()` sigue sin normalizar, porque valida respuestas del servidor tal cual llegan.

## Risks / Trade-offs

- [Cambio que rompe compatibilidad para quien ya use `Location`] → Hoy no hay consumidores en ejecución (no hay backend ni formulario). Lo registran los tests y `tsc`.
- [Dirección y coordenadas inconsistentes] → El contrato no puede detectarlo. La responsabilidad es del vecino al confirmar, y se puede sumar una verificación en un change de geocodificación.
- [Documentos del baseline desactualizados] → `establish-team-architecture` sigue diciendo latitud y longitud. Queda señalado en la proposal para reconciliarlo con Flequi en la revisión.

## Migration Plan

No hay datos existentes. El backend de Agus agrega las columnas de calle y altura en su primera migración. Para revertir, alcanza con quitar el campo y los casos de test.

# Spec Delta

## Purpose

Define la dirección legible (calle y altura) que acompaña a cada reporte ciudadano, para que los vecinos ubiquen un incidente sin depender de coordenadas.

## ADDED Requirements

### Requirement: Dirección obligatoria en los reportes
El contrato MUST incluir en la ubicación de cada reporte, junto a latitud y longitud, una dirección con calle y altura. La dirección MUST estar presente tanto en los datos de publicación como en los reportes devueltos en la lista y el detalle.

#### Scenario: Publicación sin dirección
- **WHEN** se validan datos de publicación cuya ubicación no tiene dirección
- **THEN** la validación falla con un error en español sobre la dirección

#### Scenario: Reporte devuelto sin dirección
- **WHEN** se valida un reporte de lista o detalle cuya ubicación no tiene dirección
- **THEN** la validación falla

### Requirement: Formato de calle y altura
La calle MUST tener entre 2 y 80 caracteres, sin contar espacios al principio ni al final. La altura MUST ser un número entero entre 1 y 99999, o nulo cuando el lugar no tiene altura. La dirección MUST NOT aceptar otros campos.

#### Scenario: Dirección válida
- **WHEN** la dirección es calle "Córdoba" y altura 1250
- **THEN** la validación pasa

#### Scenario: Lugar sin altura
- **WHEN** la dirección es calle "Parque Independencia" y altura nula
- **THEN** la validación pasa

#### Scenario: Altura inválida
- **WHEN** la altura es 0, negativa, decimal, mayor a 99999 o un texto
- **THEN** la validación falla con un error en español

#### Scenario: Calle inválida
- **WHEN** la calle está vacía, tiene un solo carácter o supera los 80 caracteres
- **THEN** la validación falla con un error en español

#### Scenario: Espacios sobrantes
- **WHEN** la calle llega como "  Córdoba  " en los datos de publicación
- **THEN** la validación pasa y el valor normalizado es "Córdoba"

### Requirement: Dirección en el detalle del mapa
El detalle de un reporte en el mapa MUST mostrar la ubicación como calle y altura, y MUST NOT mostrar las coordenadas.

#### Scenario: Reporte con altura
- **WHEN** el usuario abre el detalle de un reporte en Córdoba 1250
- **THEN** la ubicación se muestra como "Córdoba 1250"

#### Scenario: Reporte sin altura
- **WHEN** el usuario abre el detalle de un reporte sin altura en "Parque Independencia"
- **THEN** la ubicación se muestra como "Parque Independencia (sin altura)"

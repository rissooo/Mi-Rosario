# Spec Delta

## MODIFIED Requirements

### Requirement: Foto no disponible
El sistema MUST mostrar un estado honesto de "Foto no disponible" cuando la foto del reporte no se puede cargar, sin reemplazarla por una imagen inventada. Una foto con `expiresAt: null` MUST tratarse como una URL que no vence; solo una fecha de vencimiento ya pasada MUST mostrarse como vencida sin intentar cargarla.

#### Scenario: La foto falla
- **WHEN** la URL de la foto no carga o está vencida
- **THEN** el detalle muestra "Foto no disponible" en lugar de la imagen y el resto del detalle sigue visible

#### Scenario: Foto con URL que no vence
- **WHEN** el reporte trae una foto con `expiresAt: null` y la URL carga
- **THEN** el detalle muestra la foto, sin importar cuánto tiempo pasó desde la publicación

#### Scenario: Foto con vencimiento ya pasado
- **WHEN** el reporte trae una foto con `expiresAt` en una fecha anterior a la actual
- **THEN** el detalle muestra "Foto no disponible" sin pedir la imagen

# Spec Delta

## ADDED Requirements

### Requirement: Reportar desde el mapa
La página `/mapa` MUST mostrar un botón "Reportar" que inicia el reporte en el mismo mapa, sin navegar a otra página. Mientras hay un reporte en curso, el botón MUST ocultarse.

#### Scenario: Iniciar un reporte
- **WHEN** un usuario con sesión toca "Reportar" en `/mapa`
- **THEN** la dirección sigue siendo `/mapa` y el mapa entra en el paso de elegir el punto

#### Scenario: Reporte en curso
- **WHEN** hay un reporte en curso
- **THEN** el botón "Reportar" no se muestra hasta que el reporte se publica o se cancela

### Requirement: Reportes publicados en el modo de ejemplo
Mientras el mapa use datos de ejemplo, los reportes publicados en la sesión del navegador MUST aparecer en el mapa apenas se publican, con su detalle completo, hasta que se recargue la página.

#### Scenario: Ver el reporte recién publicado
- **WHEN** el vecino publica un reporte en el modo de ejemplo
- **THEN** el reporte aparece como marcador en el mapa sin recargar la página y su detalle muestra los datos publicados

#### Scenario: Recargar la página
- **WHEN** el vecino recarga la página
- **THEN** el reporte publicado en el modo de ejemplo ya no aparece

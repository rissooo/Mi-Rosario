# Spec Delta

## ADDED Requirements

### Requirement: Reportes reales en el mapa
Fuera del modo de ejemplo, el mapa MUST cargar los reportes del área visible desde `GET /api/reports`, recorriendo todas las páginas del cursor, y MUST mostrar en el detalle la foto pública que devuelve el servidor. Una respuesta que no cumple el contrato MUST mostrarse como error de carga, no como datos.

#### Scenario: Cargar reportes publicados
- **WHEN** una persona abre `/mapa` y hay reportes publicados en el área visible
- **THEN** ve sus marcadores, y al abrir uno ve su foto, título, dirección, etapa y confirmaciones según el servidor

#### Scenario: Respuesta fuera del contrato
- **WHEN** la API responde una lista que no pasa el validador del contrato
- **THEN** el mapa muestra el estado de error con la opción de reintentar

#### Scenario: Sin aviso de ejemplo
- **WHEN** el mapa usa la API real
- **THEN** la página no muestra el aviso de datos de ejemplo

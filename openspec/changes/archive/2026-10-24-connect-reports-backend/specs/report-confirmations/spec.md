# Spec Delta

## ADDED Requirements

### Requirement: Confirmaciones en el backend real
Fuera del modo de ejemplo, el detalle MUST consultar `GET /api/reports/{id}/confirmations/me` y confirmar con `POST /api/reports/{id}/confirmations`, sin caché. La interfaz MUST mostrar la elegibilidad, la etapa y el conteo que devuelve el servidor, y MUST tratar una respuesta fuera del contrato como falla temporal.

#### Scenario: Confirmar un reporte ajeno
- **WHEN** una persona con sesión toca "Yo también lo vi" en un reporte de otra cuenta
- **THEN** el servidor registra la confirmación y el detalle muestra el conteo y la etapa que devolvió

#### Scenario: Reporte propio
- **WHEN** la autora abre el detalle de su reporte
- **THEN** ve "No podés confirmar tu propio reporte", según lo que informó el servidor

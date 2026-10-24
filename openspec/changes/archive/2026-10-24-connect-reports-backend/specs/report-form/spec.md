# Spec Delta

## ADDED Requirements

### Requirement: Publicación en el backend real
Fuera del modo de ejemplo, publicar MUST enviar `POST /api/reports` en multipart con el campo `report` (JSON de los campos revisados), el campo `image` (la foto preparada en el navegador) y el header `Idempotency-Key`, que MUST ser el mismo en cada reintento del mismo borrador. Los errores del servidor MUST mostrarse con su mensaje sin perder el borrador.

#### Scenario: Publicar con foto
- **WHEN** una persona con sesión completa el formulario y publica
- **THEN** el servidor guarda el reporte y la interfaz muestra "¡Reporte publicado!" con el reporte que devolvió el servidor

#### Scenario: Reintento después de un error
- **WHEN** la publicación falla por un error temporal y la persona reintenta
- **THEN** el reintento usa la misma clave de idempotencia y no crea un reporte duplicado

#### Scenario: Cuota alcanzada
- **WHEN** el servidor responde 429 `RATE_LIMITED`
- **THEN** la interfaz muestra el mensaje del servidor y conserva el borrador

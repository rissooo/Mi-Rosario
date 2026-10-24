# Spec Delta

## MODIFIED Requirements

### Requirement: Errores de publicación sin perder el borrador
Si la publicación falla, el formulario MUST mostrar el mensaje en español que corresponde al error y MUST conservar todos los datos cargados, la foto, la ubicación y la clave de idempotencia.

#### Scenario: Falla temporal del almacenamiento
- **WHEN** la publicación responde 503 STORAGE_UNAVAILABLE
- **THEN** se muestra el mensaje del error con un botón "Reintentar" y el formulario conserva todos los datos y la foto

#### Scenario: Publicación todavía en curso
- **WHEN** la publicación responde 409 PUBLICATION_IN_PROGRESS porque la misma clave tiene una operación activa
- **THEN** se muestra que la publicación sigue en curso y el reintento usa la misma clave

#### Scenario: Cuota de publicaciones de la cuenta alcanzada
- **WHEN** la publicación responde 429 RATE_LIMITED porque la cuenta llegó al máximo de publicaciones en curso o de reportes en las últimas 24 horas
- **THEN** se muestra el mensaje del límite en español, distinto del de una publicación en curso, y el formulario conserva todos los datos, la foto y la clave para reintentar más tarde

#### Scenario: Sesión vencida
- **WHEN** la publicación responde 401 UNAUTHENTICATED
- **THEN** se muestra que hay que volver a iniciar sesión, con el botón de login

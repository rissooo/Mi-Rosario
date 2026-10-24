# Spec Delta

## ADDED Requirements

### Requirement: La raíz lleva al mapa
La dirección raíz del sitio (`/`) MUST llevar a `/mapa` con un redirect temporal, sin mostrar contenido de plantilla.

#### Scenario: Entrar a la dirección pública
- **WHEN** una persona abre la dirección raíz del sitio
- **THEN** llega a `/mapa` sin pasar por otra pantalla

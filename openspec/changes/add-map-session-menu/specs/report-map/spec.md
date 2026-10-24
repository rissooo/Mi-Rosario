# Spec Delta

## ADDED Requirements

### Requirement: Menú de sesión en el mapa
La página `/mapa` MUST mostrar un botón de menú en la esquina superior izquierda, arriba de los controles de zoom y sin taparlos. El menú desplegado MUST mostrar la cuenta y "Cerrar sesión" si hay sesión, o "Entrar con Google" si no la hay. Mientras hay un reporte en curso, el menú MUST NOT mostrarse.

#### Scenario: Abrir el menú con sesión
- **WHEN** una persona con sesión toca el botón de menú
- **THEN** ve "Sesión iniciada como" con su email y la opción "Cerrar sesión"

#### Scenario: Abrir el menú sin sesión
- **WHEN** una persona sin sesión toca el botón de menú
- **THEN** ve la opción "Entrar con Google"

#### Scenario: Controles de zoom visibles
- **WHEN** se muestra el mapa
- **THEN** el botón de menú queda arriba de los botones de agrandar y achicar, y los tres se pueden tocar

#### Scenario: Cerrar el menú
- **WHEN** el menú está abierto y la persona toca fuera de él o presiona Escape
- **THEN** el menú se cierra

#### Scenario: Reporte en curso
- **WHEN** el vecino está eligiendo el punto o completando el formulario de un reporte
- **THEN** el botón de menú no se muestra

### Requirement: Cerrar sesión desde el mapa
Al elegir "Cerrar sesión", el sistema MUST cerrar la sesión y la página MUST pasar al estado sin sesión sin recargar ni salir de `/mapa`.

#### Scenario: Cerrar sesión con un detalle abierto
- **WHEN** la persona cierra sesión desde el menú con el detalle de un reporte abierto
- **THEN** sigue en `/mapa` y el detalle muestra "Entrá con Google para confirmar"

#### Scenario: Reportar después de cerrar sesión
- **WHEN** la persona cierra sesión y toca "Reportar"
- **THEN** ve "Entrá con Google para reportar" y el mapa no entra en modo de reporte

### Requirement: Entrar desde el mapa
Al elegir "Entrar con Google" en el menú, el sistema MUST iniciar el login con Google y, al terminar, MUST volver a `/mapa`.

#### Scenario: Iniciar sesión desde el menú
- **WHEN** una persona sin sesión elige "Entrar con Google" en el menú y completa el login
- **THEN** vuelve a `/mapa` con la sesión iniciada y el menú muestra su email

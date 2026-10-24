# Spec Delta

## Purpose

Permite que los vecinos con sesión iniciada confirmen, desde el detalle de un reporte en el mapa, que el problema existe, para que un reporte respaldado por la comunidad pase a "Verificación ciudadana".

## ADDED Requirements

### Requirement: Acción de confirmar en el detalle
El detalle de un reporte en `/mapa` MUST mostrar, debajo de las confirmaciones ciudadanas, una sección de confirmación cuyo contenido depende de la elegibilidad que informa el servidor para la cuenta actual. Mientras se consulta la elegibilidad, MUST mostrarse un estado de carga y el resto del detalle MUST seguir visible.

#### Scenario: Vecino que puede confirmar
- **WHEN** una persona con sesión abre el detalle de un reporte y el servidor informa que puede confirmar
- **THEN** ve el botón "Yo también lo vi" habilitado

#### Scenario: Consultando la elegibilidad
- **WHEN** una persona con sesión abre el detalle y la elegibilidad todavía no llegó
- **THEN** la sección de confirmación muestra un estado de carga y el resto del detalle se ve completo

### Requirement: Elegibilidad según el servidor
La interfaz MUST mostrar el motivo que devuelve el servidor cuando la cuenta no puede confirmar, y MUST NOT decidir la elegibilidad por su cuenta. Los permisos reales (autor excluido, una confirmación por cuenta y reporte) los aplica la base de datos.

#### Scenario: Autor del reporte
- **WHEN** el servidor informa que la cuenta es la autora del reporte
- **THEN** el detalle muestra "No podés confirmar tu propio reporte" y no ofrece el botón de confirmar

#### Scenario: Ya confirmado
- **WHEN** el servidor informa que la cuenta ya confirmó el reporte
- **THEN** el detalle muestra "Ya confirmaste este reporte" y no ofrece el botón de confirmar

### Requirement: Sesión requerida para confirmar
Sin sesión iniciada, la sección de confirmación MUST mostrar "Entrá con Google para confirmar" con el botón de login. Después de iniciar sesión, el vecino MUST volver a `/mapa` con el detalle de ese mismo reporte abierto.

#### Scenario: Visitante sin sesión
- **WHEN** una persona sin sesión abre el detalle de un reporte
- **THEN** ve "Entrá con Google para confirmar" con el botón de login y no ve el botón "Yo también lo vi"

#### Scenario: Vuelta al reporte después del login
- **WHEN** la persona inicia sesión desde ese aviso
- **THEN** vuelve a `/mapa` con el detalle del mismo reporte abierto y su elegibilidad consultada

#### Scenario: Reporte que ya no existe
- **WHEN** después del login el reporte indicado no se encuentra en el mapa
- **THEN** el mapa se muestra sin detalle abierto y sin error bloqueante

### Requirement: Confirmación única por toque
Al tocar "Yo también lo vi", la interfaz MUST enviar una sola confirmación y MUST deshabilitar el botón hasta recibir la respuesta. Repetir la confirmación de una cuenta que ya confirmó MUST NOT aumentar el contador.

#### Scenario: Doble toque
- **WHEN** el vecino toca "Yo también lo vi" dos veces seguidas
- **THEN** se envía una sola confirmación y el contador aumenta en uno

#### Scenario: Confirmación repetida
- **WHEN** el servidor responde que la confirmación ya existía
- **THEN** el detalle muestra "Ya confirmaste este reporte" con el mismo contador que antes

### Requirement: Datos actualizados con la respuesta
Después de confirmar, el contador, el umbral, la etapa y el recorrido de etapas MUST actualizarse con los datos que devuelve el servidor, en el detalle abierto y en el reporte del mapa, sin recargar la página. La interfaz MUST NOT calcular la transición de etapa con un umbral propio.

#### Scenario: Confirmación por debajo del umbral
- **WHEN** un reporte tiene 1 confirmación de 3 y el vecino confirma
- **THEN** el detalle muestra 2 de 3 confirmaciones, "Ya confirmaste este reporte" y la etapa sigue en "Pendiente"

#### Scenario: Confirmación que alcanza el umbral
- **WHEN** un reporte tiene 2 confirmaciones de 3 y el vecino confirma
- **THEN** el detalle muestra 3 de 3 confirmaciones y "Verificación ciudadana" como etapa actual, sin ninguna verificación municipal

#### Scenario: Umbral distinto de 3
- **WHEN** el servidor devuelve un umbral de 5 con 4 confirmaciones después de confirmar
- **THEN** el detalle muestra 4 de 5 y la etapa sigue siendo la que informa el servidor

#### Scenario: Cerrar y volver a abrir
- **WHEN** después de confirmar el vecino cierra el detalle y vuelve a abrir el mismo reporte
- **THEN** el detalle muestra el contador actualizado y "Ya confirmaste este reporte"

### Requirement: Errores al confirmar
Si la confirmación o la consulta de elegibilidad fallan, el detalle MUST seguir abierto y MUST mostrar un mensaje en español que corresponde al error. Ante un error temporal, MUST ofrecer reintentar.

#### Scenario: Sesión vencida
- **WHEN** la confirmación responde 401 UNAUTHENTICATED
- **THEN** el detalle muestra que hay que volver a iniciar sesión, con el botón de login

#### Scenario: Reporte inexistente
- **WHEN** la confirmación responde 404 REPORT_NOT_FOUND
- **THEN** el detalle muestra "No se encontró el reporte." y no ofrece confirmar

#### Scenario: Autor rechazado por el servidor
- **WHEN** la confirmación responde 403 AUTHOR_CANNOT_CONFIRM
- **THEN** el detalle muestra "No podés confirmar tu propio reporte" y no ofrece confirmar

#### Scenario: Falla temporal
- **WHEN** la confirmación falla por un error temporal del servidor o de la red
- **THEN** el detalle muestra un mensaje en español con un botón "Reintentar" y el contador no cambia

### Requirement: Confirmaciones en el modo de ejemplo
Mientras el mapa use datos de ejemplo, las confirmaciones MUST guardarse solo en el navegador hasta recargar la página, y quien publicó un reporte en esa sesión MUST figurar como su autor. Los reportes de ejemplo MUST permitir probar con una sola cuenta la confirmación que alcanza el umbral.

#### Scenario: Recargar la página
- **WHEN** el vecino confirma un reporte de ejemplo y recarga la página
- **THEN** el reporte vuelve a su contador original y se puede confirmar de nuevo

#### Scenario: Reporte propio en el modo de ejemplo
- **WHEN** el vecino abre el detalle de un reporte que publicó en esa sesión
- **THEN** ve "No podés confirmar tu propio reporte"

#### Scenario: Alcanzar el umbral con una cuenta
- **WHEN** el vecino confirma un reporte de ejemplo que está a una confirmación del umbral
- **THEN** el reporte pasa a "Verificación ciudadana"

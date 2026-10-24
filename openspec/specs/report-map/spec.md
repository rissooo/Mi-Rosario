# report-map Specification

## Purpose

Permite que cualquier persona vea los incidentes urbanos reportados en Rosario sobre un mapa y consulte el detalle de cada reporte, sin necesidad de iniciar sesión.

## Requirements

### Requirement: Página pública del mapa
El sistema MUST ofrecer en `/mapa` un mapa interactivo centrado en Rosario, accesible sin sesión, con la atribución de OpenStreetMap visible y usable en un celular (pantalla de 360 px de ancho, sin scroll horizontal).

#### Scenario: Visitante sin sesión abre el mapa
- **WHEN** una persona sin sesión abre `/mapa`
- **THEN** ve un mapa centrado en Rosario con la atribución de OpenStreetMap visible

#### Scenario: Uso en celular
- **WHEN** la página se abre en una pantalla de 360 px de ancho
- **THEN** el mapa ocupa el ancho disponible, se puede desplazar y hacer zoom con gestos táctiles y no aparece scroll horizontal

### Requirement: Mapa limitado a Rosario
El sistema MUST mantener la vista del mapa en la ciudad de Rosario: no se puede desplazar fuera del área de la ciudad ni alejar el zoom más allá del nivel en que la ciudad entera entra en la pantalla. Todo lo que queda fuera del límite municipal MUST verse oscurecido, con el contorno de la ciudad marcado.

#### Scenario: Intento de salir de Rosario
- **WHEN** el usuario arrastra el mapa hacia afuera de Rosario
- **THEN** la vista se detiene en el borde del área de la ciudad

#### Scenario: Alejar el zoom al máximo
- **WHEN** el usuario aleja el zoom todo lo posible, en celular o en escritorio
- **THEN** se ve la ciudad entera con su contorno y las localidades vecinas aparecen oscurecidas

#### Scenario: Borde con una localidad vecina
- **WHEN** la vista incluye parte de una localidad vecina, como Pérez o Funes
- **THEN** esa parte aparece oscurecida y separada de Rosario por el contorno

### Requirement: Reportes del área visible
El sistema MUST mostrar un marcador por cada reporte ubicado dentro del área visible. Debe pedir los reportes por bounding box (oeste,sur,este,norte) con la forma de `ReportListQuery`, recorrer todas las páginas hasta que `nextCursor` sea nulo y volver a pedirlos cuando el área visible cambie.

#### Scenario: Carga inicial
- **WHEN** el mapa termina de mostrarse
- **THEN** aparece un marcador por cada reporte dentro del área visible

#### Scenario: Resultados en varias páginas
- **WHEN** los reportes del área visible ocupan más de una página
- **THEN** se muestran los marcadores de todas las páginas, sin descartar ninguna en silencio

#### Scenario: El usuario mueve el mapa
- **WHEN** el usuario desplaza el mapa o cambia el zoom
- **THEN** se muestran los reportes de la nueva área visible

#### Scenario: Área sin reportes
- **WHEN** el área visible no tiene reportes
- **THEN** el mapa se muestra sin marcadores y sin mensaje de error

### Requirement: Estado de carga y error
El sistema MUST indicar cuando está cargando reportes y, si la carga falla, mostrar un mensaje en español con una opción para reintentar, sin bloquear el uso del mapa.

#### Scenario: Falla la carga
- **WHEN** la obtención de reportes del área visible falla
- **THEN** se muestra un mensaje de error en español con un botón para reintentar y el mapa sigue usable

### Requirement: Detalle del reporte
El sistema MUST mostrar, al tocar un marcador, el detalle del reporte con foto, título, descripción, etiqueta de categoría en español, gravedad con su etiqueta y descripción, recorrido de etapas, ubicación como calle y altura (ver change `add-report-address`), fecha de creación y confirmaciones ciudadanas. En celular, el detalle no debe tapar todo el mapa y se tiene que poder cerrar.

#### Scenario: Abrir el detalle
- **WHEN** el usuario toca un marcador
- **THEN** ve todos los campos del detalle de ese reporte

#### Scenario: Marcador tapado por el panel
- **WHEN** el usuario toca un marcador que quedaría debajo del panel de detalle
- **THEN** el mapa se desplaza para que ese marcador quede visible fuera del panel

#### Scenario: Marcador ya visible
- **WHEN** el usuario toca un marcador que no queda tapado por el panel
- **THEN** el mapa no se mueve

#### Scenario: Cerrar el detalle
- **WHEN** el usuario cierra el detalle
- **THEN** vuelve a ver el mapa completo sin que el mapa se mueva

#### Scenario: Categoría de alumbrado
- **WHEN** el reporte es de categoría `missing-light`
- **THEN** se muestra como "Falta de luz" y ningún texto lo describe como zona insegura

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

### Requirement: Confirmaciones según el umbral recibido
El sistema MUST mostrar las confirmaciones ciudadanas como `confirmationCount` de `threshold`, usando el umbral que viene en los datos del reporte y nunca un valor fijo en la interfaz.

#### Scenario: Umbral por defecto
- **WHEN** un reporte tiene 2 confirmaciones y umbral 3
- **THEN** el detalle muestra 2 de 3 confirmaciones

#### Scenario: Umbral distinto
- **WHEN** un reporte tiene 5 confirmaciones y umbral 5
- **THEN** el detalle muestra 5 de 5 confirmaciones y no hace referencia a 3

### Requirement: Recorrido de cuatro etapas honesto
El sistema MUST mostrar las cuatro etapas (Pendiente, Verificación ciudadana, Verificación municipal, Resuelto) marcando la etapa actual del reporte, y MUST presentar las etapas municipales como no disponibles, sin sugerir aval oficial.

#### Scenario: Reporte pendiente
- **WHEN** el reporte tiene estado `pending`
- **THEN** "Pendiente" aparece como etapa actual y las dos etapas municipales aparecen como no disponibles

#### Scenario: Reporte verificado por vecinos
- **WHEN** el reporte tiene estado `citizen-verification`
- **THEN** "Verificación ciudadana" aparece como etapa actual y no se muestra ninguna verificación municipal

### Requirement: Datos sintéticos identificados
Mientras el mapa use datos de ejemplo, el sistema MUST indicar en la página que los reportes son de ejemplo, y MUST NOT mostrar reportes con estados municipales ni resueltos.

#### Scenario: Aviso de datos de ejemplo
- **WHEN** el mapa muestra datos sintéticos
- **THEN** la página muestra un aviso visible de que los reportes son de ejemplo

#### Scenario: Sin simulaciones institucionales
- **WHEN** se cargan los datos de ejemplo
- **THEN** ningún marcador corresponde a un reporte con estado `municipal-verification` o `resolved`

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

### Requirement: La raíz lleva al mapa
La dirección raíz del sitio (`/`) MUST llevar a `/mapa` con un redirect temporal, sin mostrar contenido de plantilla.

#### Scenario: Entrar a la dirección pública
- **WHEN** una persona abre la dirección raíz del sitio
- **THEN** llega a `/mapa` sin pasar por otra pantalla

# Spec Delta

## Purpose

Permite que un vecino con sesión iniciada cree, desde el mapa, un reporte de un incidente urbano en Rosario, con la ubicación, una foto, los datos del problema y la dirección, y lo publique de forma segura ante reintentos.

## ADDED Requirements

### Requirement: Sesión requerida para reportar
Tocar "Reportar" en `/mapa` MUST exigir una sesión iniciada. Sin sesión MUST mostrarse un aviso para entrar con Google y no se inicia el reporte. Después de iniciar sesión, el vecino MUST volver a `/mapa` con el reporte ya iniciado.

#### Scenario: Visitante sin sesión
- **WHEN** una persona sin sesión toca "Reportar" en `/mapa`
- **THEN** ve "Entrá con Google para reportar" con el botón de login y el mapa no entra en modo de reporte

#### Scenario: Vuelta después del login
- **WHEN** la persona inicia sesión desde ese aviso
- **THEN** después del login vuelve a `/mapa` y el mapa está en el paso de elegir el punto

#### Scenario: Redirección externa
- **WHEN** el pedido de login indica volver a una dirección fuera de la aplicación
- **THEN** después del login va a `/` y no a esa dirección externa

### Requirement: Elegir el punto en el mapa
Al iniciar el reporte, el mapa MUST mostrar un pin fijo en el centro de la vista y los botones "Usar mi ubicación", "Confirmar ubicación" y "Cancelar". El vecino mueve el mapa hasta que el pin quede sobre el problema. Mientras se elige el punto, tocar un marcador MUST NOT abrir su detalle.

#### Scenario: Mover el mapa
- **WHEN** el vecino mueve el mapa y toca "Confirmar ubicación"
- **THEN** el punto del reporte es el que quedó bajo el pin central

#### Scenario: Usar mi ubicación
- **WHEN** el vecino toca "Usar mi ubicación", da permiso y está dentro de Rosario
- **THEN** el mapa se centra en su posición, con el pin sobre ella

#### Scenario: Ubicación fuera de Rosario
- **WHEN** la ubicación que da el navegador cae fuera de Rosario (por ejemplo, la posición aproximada de una compu, estimada por la IP)
- **THEN** el mapa no se mueve y se muestra un aviso para mover el mapa hasta el lugar

#### Scenario: Ubicación aproximada
- **WHEN** la ubicación cae dentro de Rosario con un margen de error de más de 500 m
- **THEN** el mapa se centra en ella y se avisa que es aproximada, con el margen en kilómetros

#### Scenario: GPS no disponible o sin permiso
- **WHEN** el navegador no tiene GPS, el vecino no da permiso o la página no usa `https`
- **THEN** se muestra un aviso en español y el vecino puede elegir el punto moviendo el mapa

#### Scenario: Punto fuera de Rosario
- **WHEN** el pin central queda fuera del límite municipal de Rosario
- **THEN** se muestra "El punto tiene que estar dentro de Rosario" y "Confirmar ubicación" no se puede usar

#### Scenario: Marcadores mientras se elige el punto
- **WHEN** el vecino toca un marcador existente mientras elige el punto
- **THEN** no se abre el detalle de ese reporte

### Requirement: Panel del reporte
Al confirmar la ubicación, MUST abrirse un panel con el formulario, abajo en el celular y al costado en pantallas anchas, que muestra el punto elegido en el mapa sin taparlo y la opción "Cambiar" para volver a elegirlo sin perder lo cargado.

#### Scenario: Confirmar la ubicación
- **WHEN** el vecino confirma la ubicación
- **THEN** se abre el panel del formulario y el punto elegido sigue visible en el mapa, fuera del panel

#### Scenario: Cambiar la ubicación
- **WHEN** el vecino toca "Cambiar" con datos ya cargados
- **THEN** vuelve al paso de elegir el punto y, al confirmar otro punto, el formulario conserva todo lo cargado

### Requirement: Cancelar el reporte
El vecino MUST poder cancelar el reporte en cualquier paso. Si el borrador tiene datos cargados, MUST pedirse confirmación antes de descartarlo.

#### Scenario: Cancelar sin datos
- **WHEN** el vecino toca "Cancelar" mientras elige el punto y todavía no cargó nada
- **THEN** el mapa vuelve al modo normal sin preguntar

#### Scenario: Cancelar con datos
- **WHEN** el vecino toca "Cancelar" con una foto o un título cargados
- **THEN** se le pregunta si quiere descartar el reporte, y solo se descarta si confirma

### Requirement: Foto preparada en el navegador
El formulario MUST pedir exactamente una foto, que se puede sacar con la cámara o elegir de la galería. Antes de publicar, la foto MUST achicarse en el navegador a un lado mayor de 2560 px como máximo y convertirse a JPEG de 4 MiB como máximo, sin metadatos EXIF.

#### Scenario: Foto grande del celular
- **WHEN** el vecino elige una foto de 7 MB y 4000 x 3000 px
- **THEN** el formulario muestra una vista previa y la foto que se publica es un JPEG de 2560 x 1920 px de 4 MiB o menos

#### Scenario: Foto chica
- **WHEN** el vecino elige una foto de 1200 x 900 px
- **THEN** la foto no se agranda y se publica como JPEG del mismo tamaño en píxeles

#### Scenario: Metadatos privados
- **WHEN** la foto original tiene metadatos EXIF con la ubicación GPS donde se sacó
- **THEN** la foto que se publica no contiene esos metadatos

#### Scenario: Foto que no se puede leer
- **WHEN** el navegador no puede leer el archivo elegido como imagen
- **THEN** el formulario muestra "No pudimos leer la foto. Probá con otra." y no deja publicar hasta elegir una foto válida

### Requirement: Datos del incidente
El formulario MUST permitir elegir a mano una de las cuatro categorías activas con su etiqueta en español, una de las tres gravedades con su descripción, un título y una descripción. Para alumbrado MUST usar "Falta de luz" y nunca describirlo como zona insegura.

#### Scenario: Elegir categoría y gravedad
- **WHEN** el vecino elige "Falta de luz" y "Media"
- **THEN** el formulario muestra "Puede dificultar la circulación o el uso del espacio público" como descripción de la gravedad elegida

#### Scenario: Sin sugerencias de IA
- **WHEN** el vecino completa el formulario
- **THEN** todos los campos se completan a mano y ninguno se completa solo

### Requirement: Dirección escrita por el vecino
El formulario MUST pedir la calle y la altura en campos separados, con una casilla "Sin altura" que deja la altura vacía. La dirección MUST respetar el formato del contrato y no se completa sola a partir del punto.

#### Scenario: Calle con altura
- **WHEN** el vecino escribe "Córdoba" y "1250"
- **THEN** la ubicación publicada tiene la dirección calle "Córdoba" y altura 1250

#### Scenario: Sin altura
- **WHEN** el vecino escribe "Parque Independencia" y marca "Sin altura"
- **THEN** el campo de altura se desactiva y la ubicación publicada tiene altura nula

### Requirement: Validación antes de publicar
Al tocar "Publicar", el formulario MUST validar los datos con los validadores del contrato y, si hay errores, MUST mostrar cada mensaje en español junto al campo que corresponde, sin enviar nada. Al corregir un campo, su error MUST dejar de mostrarse.

#### Scenario: Título demasiado corto
- **WHEN** el título tiene 3 caracteres y el vecino toca "Publicar"
- **THEN** junto al título aparece el error del contrato y no se envía la publicación

#### Scenario: Falta la foto
- **WHEN** el vecino toca "Publicar" sin haber elegido una foto
- **THEN** aparece "Seleccioná una fotografía original." junto a la foto y no se envía la publicación

#### Scenario: Error corregido
- **WHEN** el vecino corrige un campo que tenía un error
- **THEN** el mensaje de error de ese campo desaparece

### Requirement: Publicación idempotente
El formulario MUST publicar con la forma de `POST /api/reports`: multipart con el campo `report` (JSON de los campos revisados) y el campo `image`, más el header `Idempotency-Key` con un UUID generado una vez por borrador. Mientras se publica, el botón MUST quedar deshabilitado.

#### Scenario: Doble toque
- **WHEN** el vecino toca "Publicar" dos veces seguidas
- **THEN** se envía una sola publicación

#### Scenario: Reintento después de un error
- **WHEN** una publicación falla y el vecino toca "Reintentar"
- **THEN** se reenvía el mismo borrador con la misma `Idempotency-Key`

### Requirement: Errores de publicación sin perder el borrador
Si la publicación falla, el formulario MUST mostrar el mensaje en español que corresponde al error y MUST conservar todos los datos cargados, la foto, la ubicación y la clave de idempotencia.

#### Scenario: Falla temporal del almacenamiento
- **WHEN** la publicación responde 503 STORAGE_UNAVAILABLE
- **THEN** se muestra el mensaje del error con un botón "Reintentar" y el formulario conserva todos los datos y la foto

#### Scenario: Publicación todavía en curso
- **WHEN** la publicación responde 409 PUBLICATION_IN_PROGRESS
- **THEN** se muestra que la publicación sigue en curso y el reintento usa la misma clave

#### Scenario: Sesión vencida
- **WHEN** la publicación responde 401 UNAUTHENTICATED
- **THEN** se muestra que hay que volver a iniciar sesión, con el botón de login

### Requirement: Confirmación de publicación
Cuando la publicación sale bien, el panel MUST mostrar "¡Reporte publicado!", el marcador nuevo MUST aparecer en el mapa sin recargar la página y el borrador y su clave MUST descartarse, de modo que un reporte nuevo use una clave nueva.

#### Scenario: Publicación exitosa
- **WHEN** la publicación responde 201 con el reporte creado
- **THEN** el panel muestra "¡Reporte publicado!" con "Ver el reporte" y "Reportar otro", y el marcador nuevo está en el mapa

#### Scenario: Ver el reporte
- **WHEN** el vecino toca "Ver el reporte"
- **THEN** se cierra el formulario y se abre el detalle del reporte publicado

#### Scenario: Nuevo reporte
- **WHEN** después de publicar el vecino toca "Reportar otro"
- **THEN** el mapa vuelve al paso de elegir el punto con un borrador vacío, y la próxima publicación usa una `Idempotency-Key` distinta

### Requirement: Datos de ejemplo identificados
Mientras la publicación use la fuente de datos falsa, el panel del reporte MUST avisar que los reportes no se guardan de verdad.

#### Scenario: Aviso en el panel
- **WHEN** el panel del reporte usa la fuente de datos falsa
- **THEN** muestra un aviso visible de que es un modo de ejemplo y los reportes no se guardan

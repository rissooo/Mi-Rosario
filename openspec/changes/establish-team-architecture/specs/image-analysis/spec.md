# Spec Delta

## Purpose

Define un paquete de contratos editables para el análisis de imágenes, con límites claros de no persistencia y de publicación, para la futura implementación de visión.

## ADDED Requirements

### Requirement: Entregables del contrato de análisis
La base SHALL aportar DTO, validadores, fixtures y definiciones HTTP documentadas para POST /api/vision/analyze. Un change funcional de visión aparte SHALL encargarse de los requisitos en ejecución y de la integración con el proveedor antes de afirmar que algo está implementado.

#### Scenario: Revisión del paquete de contratos
- **WHEN** Valen revisa los entregables de la base
- **THEN** definen la entrada de imagen multipart con sesión, los errores en español y la salida de sugerencia validada
- **THEN** que esas verificaciones pasen no afirma que Gemini o el endpoint estén desplegados

### Requirement: Definiciones ampliadas de sugerencias editables
El paquete SHALL definir sugerencias que pueden ser nulas para título, descripción, categoryId del catálogo activo y gravedad, más aclaraciones. El catálogo inicial SHALL contener pothole, missing-light, damaged-sidewalk y faulty-traffic-light, compartido con la selección manual y los validadores de publicación, y ampliable mediante una revisión futura.

#### Scenario: Fixtures de sugerencia para las cuatro categorías
- **WHEN** las verificaciones del contrato prueban un ejemplo de imagen soportada para cada categoría inicial
- **THEN** las sugerencias válidas usan el ID activo correspondiente del catálogo de cuatro entradas
- **THEN** la salida de Gemini no puede activar ni inventar una categoría adicional

#### Scenario: Confianza insuficiente en la categoría
- **WHEN** un fixture no puede determinar con confianza la categoría de una imagen
- **THEN** categoryId es null con una aclaración explicativa, y las cuatro opciones manuales siguen disponibles
- **THEN** la publicación sigue exigiendo una categoría activa revisada por el vecino

#### Scenario: Límite de la evidencia de alumbrado
- **WHEN** un fixture de imagen trata sobre alumbrado
- **THEN** el término que ve el vecino sigue siendo falta de luz
- **THEN** las sugerencias y aclaraciones no infieren inseguridad a partir de la foto

#### Scenario: Funcionamiento de un semáforo
- **WHEN** un fixture de foto fija muestra un semáforo pero no permite saber si funciona bien
- **THEN** el análisis usa categoryId null en lugar de inventar una falla, y pide revisión manual y que el vecino describa lo que observó
- **THEN** el vecino puede elegir faulty-traffic-light y describir el comportamiento observado, sin presentar esa declaración como prueba visual ni como verificación municipal

#### Scenario: Sugerencia de gravedad aprobada y editable
- **WHEN** un fixture de sugerencia de Gemini incluye una gravedad
- **THEN** el valor es low, medium o high según los criterios aprobados de baja/media/alta, o null cuando no hay certeza
- **THEN** el vecino puede corregirla y tiene que elegir un nivel válido antes de publicar; la gravedad nunca otorga verificación municipal

#### Scenario: Fixture de salida incierta
- **WHEN** un fixture de análisis no puede sostener un campo
- **THEN** ese campo es null y las aclaraciones explican la limitación
- **THEN** todos los valores no nulos cumplen las restricciones revisadas del catálogo y de los campos

#### Scenario: Fixture de categoría sensible al alcance
- **WHEN** el validador recibe un identificador de categoría no soportado o inactivo
- **THEN** rechaza la estructura del proveedor
- **THEN** agregar categorías de incidentes nuevas requiere una revisión explícita del alcance y del catálogo, no una salida arbitraria de la IA

### Requirement: El análisis no publica ni guarda fotos
El límite documentado del análisis SHALL prohibir crear reportes, registrar confirmaciones y guardar fotos. Solo el contrato de publicación del backend SHALL encargarse de guardar la foto original después de la publicación explícita del vecino.

#### Scenario: Revisión solo con análisis
- **WHEN** en la referencia del flujo futuro un vecino solo pide el análisis
- **THEN** el resultado documentado es un borrador editable, sin reporte ni objeto en Storage
- **THEN** el archivo original sigue disponible en el borrador para un pedido de publicación posterior y aparte

### Requirement: Definiciones de revisión y carga manual
El paquete SHALL documentar la edición de título, descripción, categoría, gravedad y ubicación antes de publicar. El análisis SHALL NOT aportar una ubicación definitiva, una verificación oficial, una etapa final ni una instrucción de publicar.

#### Scenario: Fixture de análisis fallido
- **WHEN** se elige un fixture de tiempo agotado o de falla del proveedor
- **THEN** el flujo de referencia conserva la foto original y el borrador, permite completar los campos a mano y exige una publicación explícita
- **THEN** saltear el análisis no elimina el requisito de la foto para publicar

### Requirement: Definiciones de errores de imagen y del proveedor
El paquete SHALL definir una imagen JPEG, PNG o WebP de hasta 4 MiB, la validación del contenido, un tiempo límite de 20 segundos para el proveedor y credenciales privadas del proveedor. Las imágenes sin procesar, los secretos y los diagnósticos del proveedor SHALL quedar fuera de los ejemplos de error y de los fixtures.

#### Scenario: Verificación del contrato de errores del análisis
- **WHEN** los fixtures prueban entrada inválida, formato no soportado, tamaño excesivo, salida inválida del proveedor, servicio no disponible y tiempo agotado
- **THEN** los status y códigos documentados son 422 VALIDATION_ERROR, 415 UNSUPPORTED_MEDIA_TYPE, 413 PAYLOAD_TOO_LARGE, 502 ANALYSIS_FAILED, 503 ANALYSIS_UNAVAILABLE y 504 ANALYSIS_TIMEOUT
- **THEN** ningún fixture expone fotos reales de vecinos ni credenciales

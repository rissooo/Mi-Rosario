# Proposal

## Why

Mi Rosario necesita una única base revisada de arquitectura y contratos para que Valen, Agus y Fran puedan desarrollar por separado sin datos incompatibles ni guardados inseguros. Este change establece esa base; no afirma que las funcionalidades de reportes, visión o mapa ya funcionen.

## What Changes

- Conservar la división entre Valen (IA), Agus (backend/Supabase) y Fran (frontend/mapas), las rutas existentes, la autenticación y las instrucciones de asistentes que solo agregan.
- Definir un paquete de contratos para sugerencias editables de la IA, la publicación revisada de reportes con una foto original, el detalle del mapa y las corroboraciones ciudadanas independientes.
- Asignar exclusivamente al backend la subida de la foto original, la asociación con el reporte, el control de acceso, la compensación y limpieza, y los reintentos idempotentes. Gemini solo analiza una imagen temporal y nunca la publica ni la guarda.
- Ampliar los contratos de reportes y sugerencias con título, catálogo de categorías, gravedad informada por el vecino, presentación de cuatro etapas y metadatos de la foto. El catálogo inicial aprobado del MVP contiene exactamente Baches (pothole), Falta de luz (missing-light), Veredas dañadas (damaged-sidewalk) y Semáforos defectuosos (faulty-traffic-light). Conservar los IDs existentes y que el catálogo solo se pueda ampliar con agregados futuros revisados.
- Definir la selección manual de las cuatro categorías y sugerencias de Gemini que pueden ser nulas y se limitan al catálogo activo. Si la confianza visual no alcanza, el resultado es null, nunca una categoría inventada; el funcionamiento de un semáforo puede requerir información declarada por el vecino, y las fotos de alumbrado no deben sugerir inseguridad.
- Especificar la consulta de confirmación de la cuenta actual, la exclusión del autor, el comportamiento de las confirmaciones repetidas, las restricciones de los reportes resueltos y la semántica de las publicaciones repetidas.
- Registrar el umbral inicial aprobado de 3 confirmaciones válidas de vecinos autenticados distintos que no sean el autor, configurable en el backend sin cambios en la interfaz. Al llegar al umbral efectivo, un reporte pendiente pasa automáticamente a citizen-verification, nunca a verificación municipal.
- Definir los niveles de gravedad aprobados low, medium y high, con sugerencias de Gemini que el vecino puede editar: molestia o deterioro menor, posible obstáculo para la circulación o el uso del espacio público, y riesgo importante para personas o vehículos, respectivamente. La gravedad nunca otorga verificación municipal.
- Separar los requisitos de arquitectura de los de funcionalidades futuras: estas delta specs describen el paquete de contratos y las reglas de colaboración. Los objetivos de aceptación en ejecución están en design.md, y los traspasos de funcionalidades en tasks.md, hasta que changes funcionales aparte los especifiquen e implementen.

## Capabilities

### New Capabilities

Se conservan las rutas existentes del change; sus requisitos ahora tratan sobre entregables verificables de la base de contratos, no sobre comportamiento en ejecución sin implementar.

- `image-analysis`: definiciones compartidas del contrato de análisis, ejemplos de validación y límites de no persistencia y revisión.
- `citizen-reports`: contratos compartidos de publicación, foto, detalle, ciclo de vida y corroboración, con fixtures y definiciones de reintentos y errores.
- `team-collaboration`: responsables, instrucciones que solo agregan, acceso individual a los asistentes y gobierno de changes funcionales separados.

### Modified Capabilities

Ninguna en el inventario principal de especificaciones. Esto revisa el change existente, sin crear specs de funcionalidades futuras ni afirmar capacidades del producto entregadas.

## Impact

El usuario autorizó explícitamente la implementación de la base de arquitectura: DTO compartidos, validadores puros, fixtures sintéticos, documentación de los límites de los módulos e instrucciones de asistentes que solo agregan. Las implementaciones de rutas, migraciones, Storage e interfaz siguen siendo changes futuros aparte. Las revisiones de los compañeros y la evidencia de incorporación se siguen por separado de la entrega técnica.

Las APIs planificadas conservan `POST /api/vision/analyze` y las de publicación, lista, detalle y confirmaciones, y agregan `GET /api/reports/{id}/confirmations/me` con sesión. Publicar la foto original cambia el contrato anterior, que era solo JSON, a multipart más una clave de idempotencia. El contrato viejo `open | closed` queda reemplazado en el diseño, no migrado en el código.

### Conflictos de alcance y configuración

- La actualización de contexto aprobada aparte está completa: openspec/config.yaml ya lista las cuatro categorías del MVP. No queda ninguna diferencia pendiente entre categorías y contexto. La implementación de la arquitectura conserva ese archivo y sus otras exclusiones de alcance.
- Storage ya es parte del stack configurado; las fotos de publicación no agregan un nuevo dominio de incidentes.
- Los roles institucionales están explícitamente fuera del MVP configurado. La verificación y la resolución municipales son solo operaciones futuras reservadas; no se agregan cuentas, APIs ni controles operativos municipales. Las cuatro etapas se pueden explicar visualmente, con las institucionales como no disponibles y sin afirmaciones oficiales simuladas.
- La configuración dice que solo un moderador cierra un incidente. La futura propuesta institucional limita esa posibilidad a una cuenta institucional autorizada con permiso de cierre o de moderador otorgado en la base de datos; no le da ese poder a cualquier cuenta institucional ni a moderadores comunes. El mapeo de roles y cualquier revisión del alcance o de la configuración tienen que aprobarse en un change futuro aparte.
- La base de arquitectura sigue siendo chica; su entregable para celular es una revisión de fixtures de contrato sin credenciales, no un producto que funcione de punta a punta. La aceptación completa en celular corresponde a los changes funcionales siguientes.
- Estos contratos no agregan reparación de calles, mapa de calor, estadísticas, notificaciones ni categorías además de las cuatro aprobadas. Acá no se habilita ninguna funcionalidad en ejecución. La cantidad de confirmaciones sirve para mostrar los incidentes.
- La corrección del YAML autorizada aparte está completa: rules.proposal[0] está entre comillas y conserva su sentido original de alcance chico. Esta implementación no incluye cambios de configuración.

La configuración de la base de datos alojada y de Storage sigue sin verificarse. Se conservan `app/`, `utils/supabase/`, el callback, el login y el logout, `/todos`, las instrucciones generadas de Next.js y los flujos de Claude existentes.

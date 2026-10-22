# Spec Delta

## Purpose

Aporta convenciones de equipo verificables y traspasos de instrucciones, separando los entregables de arquitectura de las futuras funcionalidades operativas del producto.

## ADDED Requirements

### Requirement: Módulos con responsable y contratos comunes
El equipo SHALL asignar la IA a Valen, el backend y el guardado de fotos a Agus, y el frontend y los mapas a Fran. Los DTO compartidos, los validadores puros y los fixtures sintéticos SHALL definir límites que se puedan usar sin credenciales externas.

#### Scenario: Trabajo independiente del frontend
- **WHEN** Fran empieza antes de que estén disponibles los proveedores
- **THEN** los fixtures revisados representan el detalle ampliado del mapa, las sugerencias editables de la IA y los resultados privados de confirmación de la cuenta actual
- **THEN** no hacen falta credenciales reales ni un aval municipal

#### Scenario: Responsabilidad del guardado
- **WHEN** se define el alcance de la funcionalidad de backend
- **THEN** Agus es responsable de guardar la foto original, asociarla, los permisos, la idempotencia, la recuperación y la limpieza
- **THEN** el módulo de Valen no tiene ninguna responsabilidad de modificar reportes ni Storage

### Requirement: Evolución revisable del contrato
Quienes proveen y quienes consumen SHALL revisar juntos los cambios compartidos de campos, categorías, gravedad, políticas, errores y reintentos. Las propuestas pendientes SHALL distinguirse claramente de la configuración aprobada.

#### Scenario: Registro del umbral y la gravedad aprobados
- **WHEN** la base registra las decisiones de producto aprobadas
- **THEN** identifica como aprobados el umbral inicial de 3, las confirmaciones de cuentas autenticadas distintas que no sean el autor y la transición automática a citizen-verification, con la configuración del umbral a cargo del backend
- **THEN** la gravedad low/medium/high y sus criterios de impacto están aprobados, y las propuestas institucionales mantienen sus condiciones de alcance existentes

#### Scenario: Registro del alcance aprobado de cuatro categorías
- **WHEN** el equipo revisa cambios del contrato de categorías
- **THEN** registra pothole, missing-light, damaged-sidewalk y faulty-traffic-light como el único catálogo inicial aprobado del MVP, con los IDs existentes sin cambios y validación compartida entre backend, frontend e IA
- **THEN** la conciliación de contexto autorizada aparte queda registrada como completa: openspec/config.yaml lista las cuatro categorías y se conserva durante la implementación de la base
- **THEN** solo las categorías que se agreguen además de las cuatro aprobadas requieren una nueva aprobación

### Requirement: Changes funcionales separados
El equipo SHALL mantener las tareas y las specs normativas de este change limitadas a los entregables del paquete de contratos y de colaboración. Los requisitos y tests de funcionalidades en ejecución SHALL pertenecer a changes separados de backend, visión e interfaz antes de implementarlos.

#### Scenario: Archivar la base
- **WHEN** las tareas de arquitectura están completas y revisadas
- **THEN** las verificaciones del archive revisan los tipos del contrato, los validadores, los fixtures y la documentación
- **THEN** ni el archive ni que pasen los fixtures del contrato presentan como implementada ninguna funcionalidad de endpoints, RLS, Storage o interfaz

### Requirement: Ramas y revisiones trazables
El equipo SHALL usar chore/team-architecture para la base, feature/gemini-vision para Valen, feature/reports-backend para Agus y feature/interface-map para Fran. Los PRs SHALL indicar su change de OpenSpec, el alcance, las dependencias y la validación.

#### Scenario: Cambio en un límite
- **WHEN** un PR cambia una API compartida o el catálogo de categorías
- **THEN** quienes proveen y quienes consumen revisan el cambio de contrato, los fixtures y el plan de compatibilidad antes de integrarlo
- **THEN** se acuerda un solo responsable de edición para los archivos compartidos de ese PR

### Requirement: Instrucciones de asistentes que solo agregan
La guía compartida del equipo SHALL agregarse fuera del bloque generado de Next.js en AGENTS.md. CLAUDE.md y GEMINI.md SHALL hacer referencia a esa fuente. Los archivos existentes, las instrucciones anidadas y los comandos y skills de Claude SHALL conservarse.

#### Scenario: Archivo de entrada existente
- **WHEN** ya existe un archivo de entrada de un asistente al momento de implementar
- **THEN** su responsable lo lee antes de agregar una sección de referencia delimitada que no genere conflictos
- **THEN** los conflictos se informan en lugar de resolverlos reemplazando el archivo

#### Scenario: Verificación del contexto del asistente
- **WHEN** cada asistente empieza una verificación de incorporación de solo lectura
- **THEN** puede identificar las instrucciones compartidas, la documentación de Next.js instalada, el alcance del proyecto y su change elegido sin depender de importaciones automáticas

### Requirement: Acceso individual a asistentes y recursos
Agus SHALL usar su propia autenticación del asistente o credenciales entregadas por separado. Los secretos de proveedores en ejecución SHALL mantenerse separados del login del asistente, solo en el servidor y fuera de los artefactos del repositorio.

#### Scenario: Incorporación al backend
- **WHEN** Agus corre las verificaciones de contrato basadas en fixtures
- **THEN** no necesita la cuenta de Valen, ni archivos de entorno de otro colaborador, ni la clave del proveedor Gemini
- **THEN** cualquier acceso a recursos alojados se otorga a su cuenta individual, y cualquier secreto necesario usa un canal de secretos aprobado

### Requirement: Presentación institucional futura honesta
Las operaciones institucionales SHALL quedar fuera del MVP configurado. La documentación y los ejemplos sintéticos SHALL distinguir la futura autoridad municipal de las corroboraciones ciudadanas independientes y SHALL NOT sugerir un aval oficial simulado.

#### Scenario: Revisión de fixtures municipales
- **WHEN** una demostración representa municipal-verification o resolved
- **THEN** está aislada de los datos de producción y tiene la etiqueta visible Simulación - sin aval municipal
- **THEN** el traspaso no incluye permisos de cuentas municipales en el MVP, controles de acciones operativas ni endpoints de mutación

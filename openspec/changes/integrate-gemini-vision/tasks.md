# Tasks

## 1. Etapa 1 autorizada: preparación

- [x] 1.1 Actualizar los cuatro artefactos con modelo confirmado, etapa local simulada y límites reales; verificar validación estricta antes de implementar.
- [x] 1.2 Instalar @google/genai, sharp y barrera server-only si corresponde en package.json/lockfile autorizados; verificar tipos y diff acotado.

## 2. Etapa 1: módulo y pruebas propias

- [x] 2.1 Implementar guardia de entorno, sesión inyectable existente, origen y admisión local; probar 401/403/503, ventana y concurrencia, producción deshabilitada antes de efectos externos.
- [x] 2.2 Implementar multipart acotado, firma/MIME, dimensiones, decodificación y normalización; probar 413/415/422, corrupción, animación, límites y ausencia de metadatos sin persistencia.
- [x] 2.3 Preparar SDK, modelo configurable, schema cerrado y attempts=1; verificar transporte falso y simulador sin credenciales, cuatro categorías, null, errores y validadores compartidos intactos.
- [x] 2.4 Implementar presupuesto y cancelación; probar timeout/desconexión, resultados tardíos y liberación segura de cupos, documentando límites nativos/SSR.
- [x] 2.5 Conectar POST solo al simulador local, documentar y probar transporte con sesión falsa únicamente inyectada en tests; verificar que no hay acceso real a Gemini ni cambios de autenticación.
- [x] 2.6 Ejecutar pruebas propias, contratos, lint, TypeScript, build, validación estricta y diff --check; registrar evidencia y comprobar alcance de archivos.

## 3. Etapa 2 pendiente

- [ ] 3.1 Obtener revisiones reales de Agus/Fran sobre seguridad y compatibilidad; verificar evidencia sin inferir aprobaciones.
- [ ] 3.2 Definir controles distribuidos, presupuesto definitivo y habilitación de producción mediante autorización separada; probar varias instancias y rechazo cerrado.
- [ ] 3.3 Realizar integración real autorizada con Gemini y runtime de Vercel; medir calidad, memoria, cancelación y costos, revisar tratamiento de datos sin sustituir evidencia con mocks o pruebas anteriores en Google AI Studio.

## 4. Correcciones acotadas de Etapa 1

- [x] 4.1 Corregir el mapeo de autenticación en el módulo de visión; verificar regresiones para 401, 429, 503, errores desconocidos y excepciones sin alterar la autenticación compartida.
- [x] 4.2 Acotar la reserva multipart e ignorar vacíos; verificar miles de fragmentos, límite exacto/exceso, archivos demasiado grandes y cancelación del lector sin llamadas al proveedor.
- [x] 4.3 Rechazar origen antes de autenticar dentro del handler; verificar cero consultas de sesión para URL/origen inválido o Fetch Metadata cross-site, manteniendo el proxy intacto.
- [x] 4.4 Conciliar configuración local validada y documentación: AI Studio, ausencia de API key, pipeline real sin workers y límites del proxy/cancelación; verificar defaults, rangos, rechazo cerrado y validación estricta.
- [x] 4.5 Ejecutar pruebas propias, contratos, lint, TypeScript, build, OpenSpec estricto y diff --check; verificar que no se agregaron dependencias ni cambios a contratos o módulos ajenos y registrar resultados sin cerrar Etapa 2.

## Workflow follow-up

- Solo Etapa 1 y dependencias necesarias autorizadas. Etapa 2, despliegue, staging, commits, push, merge y archive pendientes de autorización.
- No cerrar revisiones del equipo ni integración real por aprobar tests simulados. El PR #3 no es dependencia para pruebas aisladas.

## Evidencia local de Etapa 1

- Pruebas propias después de las correcciones: 28/28 (21 previas más siete regresiones); contratos: 31/31. El SDK se ejecutó únicamente con transporte falso y la suite bloquea red. No se usaron credenciales Gemini ni se hicieron llamadas reales.
- Lint, TypeScript sin emisión, build Next.js, validación estricta de este change y git diff --check: correctos. También se revisó formato de archivos nuevos todavía sin staging.
- Next.js con Cache Components usa Node.js por defecto: se omitió export runtime para mantener compatibilidad sin editar next.config.ts.
- Se instalaron @google/genai 2.30.0, sharp 0.35.5 y server-only 0.0.1. El lockfile conserva las versiones de paquetes que ya existían; npm audit informa cinco avisos altos en la cadena ESLint/fast-glob/micromatch/braces existente. No se ejecutó audit fix ni se modificaron dependencias ajenas.
- Cambios limitados a este change, lib/vision/, app/api/vision/ y los dos archivos de dependencias autorizados. Contratos, login, configuraciones globales y módulos ajenos intactos. Ninguna evidencia local acredita producción, precisión visual real o revisión de Agus/Fran.
- La corrección posterior no instaló dependencias ni volvió a editar package.json/lockfile; conserva sus cambios previos de Etapa 1. Se volvieron a ejecutar todas las verificaciones y build, con resultado correcto. No se modificaron proxy ni autenticación compartida.
- Regresiones: auth 401/429/503 y excepciones (devueltas y lanzadas), sesión ausente/códigos desconocidos, origen rechazado sin autenticar, más de 30.000 lecturas con fragmentos pequeños/vacíos, límite total exacto/exceso, cancelación de lectura pendiente o vacíos y configuración validada con valores por defecto/rangos/efectos. Se conserva además el test de archivo mayor a 4 MiB.
- La documentación confirma que Gemini 3.8 Flash se probó en Google AI Studio y aún no hay API key configurada en Next.js, .env.local ni Vercel. El presupuesto empieza dentro del handler y no cubre el proxy previo; cancelar la espera no garantiza detener inmediatamente procesamiento nativo, fetch interno SSR o trabajo remoto. La Etapa 2 y sus revisiones permanecen pendientes.

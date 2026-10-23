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

## 3. Validación real y habilitación pública pendientes

- [ ] 3.1 Obtener revisiones reales de Agus/Fran sobre seguridad y compatibilidad; verificar evidencia sin inferir aprobaciones.
- [ ] 3.2 Definir controles distribuidos, presupuesto definitivo y habilitación de producción mediante autorización separada; probar varias instancias y rechazo cerrado.
- [x] 3.3 Verificar conexión real exclusivamente local con sesión Supabase, HTTP 200 y validación; registrar evidencia comunicada por el usuario sin contenido privado.
- [ ] 3.4 Aceptar integración con formulario de Fran y backend de Agus; revisar tratamiento de datos y medir calidad, memoria, cancelación y costos.
- [ ] 3.5 Autorizar por separado y verificar runtime de Vercel y futura habilitación pública después de controles distribuidos, presupuesto y revisiones; una prueba local no completa esta tarea.

## 4. Correcciones acotadas de Etapa 1

- [x] 4.1 Corregir el mapeo de autenticación en el módulo de visión; verificar regresiones para 401, 429, 503, errores desconocidos y excepciones sin alterar la autenticación compartida.
- [x] 4.2 Acotar la reserva multipart e ignorar vacíos; verificar miles de fragmentos, límite exacto/exceso, archivos demasiado grandes y cancelación del lector sin llamadas al proveedor.
- [x] 4.3 Rechazar origen antes de autenticar dentro del handler; verificar cero consultas de sesión para URL/origen inválido o Fetch Metadata cross-site, manteniendo el proxy intacto.
- [x] 4.4 Conciliar configuración local validada y documentación: AI Studio, ausencia de API key, pipeline real sin workers y límites del proxy/cancelación; verificar defaults, rangos, rechazo cerrado y validación estricta.
- [x] 4.5 Ejecutar pruebas propias, contratos, lint, TypeScript, build, OpenSpec estricto y diff --check; verificar que no se agregaron dependencias ni cambios a contratos o módulos ajenos y registrar resultados sin cerrar Etapa 2.

## 5. Etapa 2 local: preparación histórica previa a la prueba manual

- [x] 5.1 Actualizar y validar los artefactos distinguiendo conexión real local de exposición pública; verificar Etapa 1 en 069f7e1, rama y working tree, mantener tareas públicas abiertas.
- [x] 5.2 Agregar selector server-only de modos excluyentes y lectura privada de clave, reutilizando SDK/createGeminiProvider con construcción diferida y allowlist; verificar flags, clave ausente, bloqueo de producción/Vercel y cero clientes antes de validar solicitudes.
- [x] 5.3 Agregar regresiones con fábrica/fetch falsos: éxito por contratos, modelo rechazado, salida inválida, timeout y fallos sin consumo real; verificar suite completa y ningún acceso de red.
- [x] 5.4 Documentar variables y preparación de primera prueba real sin crear credenciales; ejecutar suite propia, contratos, lint, TypeScript, build, OpenSpec estricto y diff --check, verificando alcance y revisiones pendientes.

## Workflow follow-up

- Etapas 1 y conexión real exclusivamente local autorizadas. El usuario configuró privadamente la clave y realizó una prueba manual autorizada exitosa. Esta preparación no autoriza nuevas llamadas reales, Vercel, exposición pública, despliegue, staging, commits, push, merge ni archive. Revisiones y controles distribuidos siguen pendientes.
- No cerrar revisiones del equipo ni integración real por aprobar tests simulados. El PR #3 no es dependencia para pruebas aisladas.

## Evidencia local de Etapa 1

- Pruebas propias después de las correcciones: 28/28 (21 previas más siete regresiones); contratos: 31/31. El SDK se ejecutó únicamente con transporte falso y la suite bloquea red. No se usaron credenciales Gemini ni se hicieron llamadas reales.
- Lint, TypeScript sin emisión, build Next.js, validación estricta de este change y git diff --check: correctos. También se revisó formato de archivos nuevos todavía sin staging.
- Next.js con Cache Components usa Node.js por defecto: se omitió export runtime para mantener compatibilidad sin editar next.config.ts.
- Se instalaron @google/genai 2.30.0, sharp 0.35.5 y server-only 0.0.1. El lockfile conserva las versiones de paquetes que ya existían; npm audit informa cinco avisos altos en la cadena ESLint/fast-glob/micromatch/braces existente. No se ejecutó audit fix ni se modificaron dependencias ajenas.
- Cambios limitados a este change, lib/vision/, app/api/vision/ y los dos archivos de dependencias autorizados. Contratos, login, configuraciones globales y módulos ajenos intactos. Ninguna evidencia local acredita producción, precisión visual real o revisión de Agus/Fran.
- La corrección posterior no instaló dependencias ni volvió a editar package.json/lockfile; conserva sus cambios previos de Etapa 1. Se volvieron a ejecutar todas las verificaciones y build, con resultado correcto. No se modificaron proxy ni autenticación compartida.
- Regresiones: auth 401/429/503 y excepciones (devueltas y lanzadas), sesión ausente/códigos desconocidos, origen rechazado sin autenticar, más de 30.000 lecturas con fragmentos pequeños/vacíos, límite total exacto/exceso, cancelación de lectura pendiente o vacíos y configuración validada con valores por defecto/rangos/efectos. Se conserva además el test de archivo mayor a 4 MiB.
- Registro histórico de Etapa 1: Gemini 3.8 Flash se había probado en Google AI Studio y entonces no había clave configurada. El estado local posterior se registra abajo. El presupuesto no cubre el proxy previo; cancelar no garantiza detener inmediatamente procesamiento nativo, fetch SSR o trabajo remoto. Las revisiones y habilitación pública siguen pendientes.

## Evidencia de conexión preparada para Etapa 2 local

- Inicio desde feature/gemini-vision, HEAD 069f7e1 y working tree limpio. Etapa 1 conservada, sin reinstalar dependencias ni modificar contratos, imágenes, service, proxy o autenticación compartida.
- Suite propia: 39/39, incluyendo ocho nuevas regresiones para selección de modos, flags ausentes/ambiguos, clave ausente, producción/Vercel, SDK diferido, allowlist, éxito validado, salida inválida y fallos/timeout. Todas las llamadas SDK usaron fábrica/fetch falsos, con red bloqueada y valores sintéticos.
- Contratos 31/31, lint, TypeScript sin emisión y build correctos. OpenSpec estricto validado antes de modificar código y al finalizar; formato/diff revisados.
- Durante la preparación histórica de la conexión no se ejecutaron llamadas reales ni se configuró una clave. Posteriormente el usuario configuró privadamente el entorno y realizó una prueba autorizada exitosa. No hubo cambios en Vercel.
- La conexión local tiene evidencia separada en 3.3. Permanecen abiertas 3.1, 3.2, 3.4 y 3.5: revisiones, controles distribuidos/presupuesto, integración y mediciones/despliegue. Los mocks no sustituyen evidencia real y el éxito local no habilita producción.

## 6. Diagnóstico temporal y preparación de commit

- [x] 6.1 Implementar diagnóstico local opt-in con UUID, etapas, tiempos y estados numéricos sin datos privados; verificar regresiones con canarios y SDK falso.
- [x] 6.2 Conciliar README y OpenSpec con evidencia manual local y límites diagnósticos, separando tareas públicas y conservando el primer 503 sin causa confirmada.
- [x] 6.3 Ejecutar visión, contratos, lint, TypeScript, build, OpenSpec estricto y diff --check; revisar dependencias y ausencia de secretos en candidatos antes del commit autorizado por separado.

## Evidencia manual local comunicada por el usuario — 23/10/2026

POST autenticado en localhost:3000: HTTP 200; navegador 10670 ms. Sugerencia válida pothole/high, título y descripción coherentes según revisión del usuario y dos advertencias. Los eventos del mismo requestId fueron configuration ok, origin ok, authentication ok (404 ms), admission ok, image ok (24 ms), client ok (2 ms), generate started y generate ok (9738 ms), validation ok y result ok HTTP 200 con elapsedMs=10176. Son tiempos aproximados, no percentiles ni medición de costo. No se conserva imagen, respuesta completa ni valor del UUID. El asistente no repitió la llamada. La causa del primer 503 (5220 ms de navegador) permanece sin confirmar, sin atribución a Google o Supabase.

## Verificación para revisión previa al commit — 23/10/2026

- Visión 44/44 y contratos 31/31; lint, TypeScript sin emisión, build, validación estricta y diff --check correctos. Pruebas con red bloqueada y proveedor falso; ninguna llamada adicional a Google.
- package.json y package-lock.json idénticos a HEAD 069f7e1, con dependencias raíz coherentes entre ambos. No se reinstaló ni regeneró el lockfile. El contenido remoto actual del PR #3 no se comparó; no se garantiza ausencia de conflictos al fusionarlo.
- Control local de 89 archivos rastreados/no ignorados: sin coincidencias con valores privados cargados del entorno ni patrones revisados de claves Google o claves privadas. No sustituye un escáner exhaustivo. .env.local ignorado, ningún .env rastreado, staging vacío. No se imprimieron valores privados.
- La preparación actual solo edita README y los cuatro artefactos de este change. Código funcional y contratos conservados. Pendientes 3.1, 3.2, 3.4 y 3.5; sin staging, commit, push, merge, rebase, archive ni despliegue.

## 7. Correcciones acotadas tras auditoría

- [x] 7.1 Reproducir y corregir aceptación tardía: comprobar plazo tras validación/serialización y sacar el log final del tramo síncrono; probar reloj controlado y conservar respuestas públicas.
- [x] 7.2 Reproducir y corregir liberación prematura durante recepción/parseo: conservar readWork y verificar cupo retenido hasta resolución/rechazo, liberación única y ningún proveedor tras timeout.
- [x] 7.3 Sanear entorno del runner sin alterar la terminal; documentar y ejecutar visión, contratos, lint, TypeScript, build, OpenSpec estricto y diff --check sin nuevas llamadas reales.

La sección 6 corresponde a la preparación anterior a la auditoría. Esta corrección funcional autorizada modifica solo service, pruebas/runner propios y documentación de visión/OpenSpec; conserva contratos, modelo, prompt, categorías, autenticación global y proxy. Las tareas públicas y revisiones 3.1, 3.2, 3.4 y 3.5 siguen abiertas.

Evidencia de regresión: antes de corregir, 44 pruebas previas pasaban y fallaban las tres nuevas (200 en lugar de 504, liberación prematura y entorno heredado con credenciales, sin imprimir sus nombres/valores). Después: visión 47/47 y contratos 31/31; lint, TypeScript, build, OpenSpec estricto y diff --check correctos. El reloj controlado cubre inicio/final de validación y serialización; el parser retenido cubre resolución y rechazo, cupo ocupado, liberación única y cero proveedor. El entorno hijo usa lista permitida del sistema; el entorno padre queda intacto. Sin dependencias nuevas ni llamadas reales a Google. Persisten límites nativos de cancelación/memoria y tareas públicas pendientes; el primer 503 sigue sin causa confirmada.

# Diseño

## Contexto

Este cambio implementa publicación, consulta pública y confirmaciones de reportes en `feature/reports-backend`. El PR #3 de Fran (`add-report-address`) ya está integrado en `main`; el backend consume `Location.address`. Las cinco migraciones no se aplicaron en ningún entorno. Solo se comprobaron con tests unitarios y análisis estático; la siguiente comprobación de SQL requiere un proyecto de pruebas en la nube separado de producción.

## Objetivos y fuera de alcance

**Objetivos:** conservar el flujo de publicación recuperable, limitar abuso por cuenta, almacenar originales en privado y servir copias públicas saneadas, exponer una vista mínima y confirmar reportes con conteo atómico.

**Fuera de alcance:** cambios al contrato compartido o a la interfaz, análisis Gemini, estados institucionales, moderación, borrado automático de objetos y aplicación de migraciones a producción. La clave secreta (`SUPABASE_SECRET_KEY`, `sb_secret_...`) se usa solo en el servidor y solo para subir y compensar las fotos (D1); no se usa `service_role` para nada más.

## Cambios diferidos: requieren archivos ajenos o decisiones ajenas

Cada ítem indica archivo, motivo, responsable y condición de cierre.

- **`Photo.expiresAt` nullable.** Archivos: `lib/contracts/**`, `docs/contracts.md`, `app/components/reports/ReportDetail.tsx:21` y `app/components/reports/report-publisher.ts:75`. Motivo: el contrato actual exige una fecha, pero `getPublicUrl` no vence; cambiar el contrato rompe los dos consumidores. Responsable: Fran, con revisión de Agus y Valen. Cierre: PR aparte desde `main`, cambiar contrato y consumidores, y retirar la excepción temporal del validador local.
- **Conectar el multipart del formulario.** Archivo: `app/components/reports/report-publisher.ts`. Motivo: el backend espera `report` como JSON, `image` como archivo y `Idempotency-Key`; el publisher actual conserva el reporte en memoria. Responsable: Fran. Cierre: publicar al endpoint, enviar las tres partes y comprobar reintento con la misma clave.
- **Código contractual de cuota.** Archivo: `lib/contracts/errors.ts`. Motivo: no hay un error específico de cuota y este change no puede editar el contrato. Responsable: Fran como editor compartido, con revisión de Agus y Valen. Cierre: agregar el código en un PR de contrato y mapearlo desde el servicio; mientras tanto se devuelve `PUBLICATION_IN_PROGRESS` (409) en español.
- **Revisión de dirección.** Archivo de referencia: `docs/contracts.md`. Motivo: pide revisión de Agus y Valen y no hay evidencia disponible de ambas. Responsables: Agus y Valen. Cierre: registrar ambas reseñas; este backend ya consume `Location.address` sin modificarlo.
- **Confirmar D1–D8.** Archivo: este `design.md`. Motivo: son defaults provisionales para no bloquear el trabajo. Responsable: Fran (Francisco). Cierre: revisar cada decisión con Agus y registrar el acuerdo antes de cambiar buckets, cuotas, retención o el flujo de fotos.
- **Configurar y probar una base real.** Archivos: `supabase/migrations/**` y `scripts/integration/check-reports-cloud.mjs`. Motivo: hacen falta un proyecto dedicado y cuatro cuentas manuales; no hay evidencia de ejecución de SQL, RLS, Storage o concurrencia. Responsable: Agus. Cierre: ejecutar el checklist siguiente, registrar salidas y completar solo las tareas respaldadas por evidencia.
- **Persistencia del test de cuota diaria.** Archivo: `scripts/integration/check-reports-cloud.mjs`. Motivo: el escenario crea diez reportes y no los borra; los objetos públicos quedan accesibles y una misma cuenta vuelve a quedar limitada durante 24 horas. Responsable: Agus. Cierre: ejecutarlo una sola vez con el proyecto de pruebas descartable y la cuenta 4 fresca, o esperar una ventana nueva.
- **Cliente autenticado hostil — resuelto el 24/10/2026.** Con la clave publicable un cliente podía subir a Storage bytes sin sanear y publicarlos llamando directo a `publish_report`. Se cerró con D1: no hay policies de cliente en Storage y solo el servidor sube, con la clave secreta, después de sanear. Pendiente: comprobar el rechazo efectivo en la base de pruebas (5.7).
- **Análisis Gemini.** Archivo de referencia: `lib/vision/**`. Motivo: ese módulo es responsabilidad de Valen y está fuera de esta zona. Responsable: Valen. Cierre: confirmar que el backend no recibe ni persiste sugerencias ni fotos de análisis.
- **Versionado de configuración Supabase — resuelto el 24/10/2026.** `supabase/config.toml` se versiona (D8) junto con `supabase/.gitignore`, que generó la CLI.

## Decisiones provisorias de Agus, a confirmar con Fran

- **D1 — original privada y copia pública saneada, subidas solo por el servidor (confirmada por Fran el 24/10/2026).** La original es el archivo que recibe el servidor, incluso si el navegador ya lo comprimió o limpió. El backend vuelve a validar tipo y contenido y a sanearlo; guarda la entrada en `reports-originals` privado y sirve la copia en `reports-public` con `getPublicUrl`. Las dos subidas y su compensación usan el cliente de `utils/supabase/admin.ts` con `SUPABASE_SECRET_KEY`, que existe solo en el servidor (sin `NEXT_PUBLIC_`); claim y `publish_report` siguen usando la sesión del vecino. Storage no tiene policies de cliente para estos buckets. Motivo: conservar lo recibido sin exponerlo y publicar una representación sin metadatos. Cómo revertir: acordar otra política y cambiar conjuntamente buckets, vista, servicio y consumidor antes de usarla.
- **D2 — `Photo.expiresAt` no se inventa.** El contrato actual exige una fecha UTC y la URL pública no vence; por eso el DTO real sigue omitiendo el campo y los tests muestran el rechazo contractual. Motivo: no afirmar un vencimiento falso ni tocar archivos compartidos. Cómo cerrar/revertir: PR de contrato nullable desde `main`, con `docs/contracts.md` y los dos consumidores revisados; después, eliminar la validación temporal local.
- **D3 — no preservar ni rotar orientación EXIF.** El saneador elimina EXIF sin rotar ni recodificar píxeles; se asume provisionalmente que el navegador normaliza la imagen. Motivo: no decodificar ni agregar dependencias. Cómo revertir: acordar con Fran y Valen una transformación que rote píxeles antes de quitar EXIF y probar una foto orientada.
- **D4 — máximo 4 MiB por imagen, comprimida por el cliente.** El servidor comprueba `Content-Length` antes de `formData()` contra `MAX_MULTIPART_BYTES` (4 MiB más hasta 64 KiB de envoltura multipart) y comprueba `File.size` real antes de leer sus bytes. Motivo: aceptar el multipart válido sin perder el límite de la imagen. Cómo revertir: acordar otro límite con Fran y actualizar conjuntamente el contrato/cliente y el servidor.
- **D5 — cuotas por usuario.** Se permiten tres claims `in_progress` simultáneos y diez reportes publicados en ventana móvil de 24 horas. Los valores iniciales están en `report_backend_limits`; claim y publicación serializan el conteo con un lock transaccional por usuario y usan `clock_timestamp()` después de adquirirlo. Motivo: reducir abuso sin servicio privilegiado ni código de error fuera del contrato y evaluar los límites a la hora real después de una espera. Cómo revertir: cambiar el límite en SQL antes de aplicar migraciones; una vez aplicada una migración, cambiarlo mediante una migración nueva.
- **D6 — no limpiar huérfanas en SQL.** No se ejecuta `DELETE` sobre `storage.objects`; el borrado requiere Storage API con credencial de servidor. Para detección de solo lectura en el proyecto de pruebas, ejecutar:

  ```sql
  SELECT o.bucket_id, o.name, o.created_at
  FROM storage.objects AS o
  WHERE o.bucket_id IN ('reports-originals', 'reports-public')
    AND o.created_at < now() - interval '1 hour'
    AND NOT EXISTS (
      SELECT 1
      FROM public.reports AS r
      WHERE (o.bucket_id = 'reports-originals' AND r.storage_path = o.name)
         OR (o.bucket_id = 'reports-public' AND r.photo_public_path = o.name)
    )
  ORDER BY o.created_at;
  ```

  Motivo: SQL no gestiona los bytes del Storage. Cómo revertir: acordar retención y un proceso de borrado por Storage API con credencial de servidor.
- **D7 — moderación y retención de copias públicas fuera del MVP.** La copia de un reporte oculto o rechazado sigue accesible por URL mientras exista el objeto, aunque deje de aparecer en `public_reports`. Motivo: no hay flujo de moderación ni borrado autorizado. Cómo revertir: definir moderación, retención e invalidación de caché y agregar el borrado seguro por Storage API.
- **D8 — `supabase/config.toml` se versiona (decidido por Fran el 24/10/2026).** Lo generó `supabase init` (CLI 2.122.0). No contiene secretos: las credenciales se referencian con `env(...)` y los valores son de desarrollo local. Motivo: el equipo trabaja en la misma compu y la CLI lo necesita para `link` y `db push`. `supabase/.gitignore` excluye `.temp`, `.branches` y los archivos de entorno. Antes de cada commit que lo toque, revisar que no se haya agregado ningún valor secreto.

## Diseño y límites actuales

### Publicación e idempotencia

1. El handler revisa `Content-Length` y devuelve 413 antes de leer el cuerpo si supera el máximo multipart. Después exige sesión, parsea `report` como JSON y valida `image`; el tamaño real se comprueba antes de llamar `arrayBuffer()`.
2. `claim_idempotency_key` usa `auth.uid()`, `INSERT ... ON CONFLICT`, reserva y persiste `report_id` y fija un lock de tres minutos. La fila se protege con RLS y grants explícitos.
3. El servicio sube la original y la copia saneada. Solo los rechazos definitivos anteriores al commit compensan ambas fotos y luego marcan la clave como fallida. Errores desconocidos, timeout o red conservan fotos y claim; cualquier error posterior al commit también los conserva.
4. `publish_report` bloquea y valida el claim, verifica existencia y metadatos declarados de los objetos, inserta el reporte y completa la clave dentro de una transacción. Si el reporte ya existe para el mismo usuario, completa el claim y devuelve el mismo ID.
5. Ambas RPC de cuota toman el lock transaccional por usuario. El claim rechaza el cuarto claim activo y el número 11 de la ventana antes de subir; `publish_report` vuelve a revisar el límite diario antes de insertar. Hasta que el contrato agregue un código específico, ambos rechazos usan `PUBLICATION_IN_PROGRESS` (409) y `Retry-After`.

### Fotos y DTO

- `reports-originals` es privado. Su ruta incluye cuenta e ID reservado, nunca se proyecta ni se devuelve. `reports-public` tiene límite de 4 MiB y MIME JPEG/PNG/WebP; la copia usa ruta `{report_id}.{ext}` y su URL se forma con `getPublicUrl`.
- El saneador TypeScript elimina segmentos APP y COM en JPEG (incluidos EXIF/XMP/IPTC/comentarios), `eXIf` y chunks de texto en PNG, y EXIF/XMP en WebP. Descarta bytes tras EOI, recalcula RIFF y rechaza entradas incompletas o con longitudes inválidas. No decodifica ni rota píxeles.
- `Photo.mimeType` y `byteSize` describen la copia saneada. Lista y detalle omiten `expiresAt`; el contrato real las rechaza. El helper local TEMPORAL clona el DTO, agrega una fecha válida solo a la copia de validación y comprueba los demás campos. Nunca altera la respuesta ni el test que demuestra la desviación.
- Las respuestas de error usan mensajes fijos en español; no devuelven texto crudo de SQL/Storage, rutas, IDs de usuario ni nombres de función.

### Esquema, RLS y confirmaciones

- Las cinco migraciones se ordenan así: `20261023000001_reports_storage.sql` crea buckets; `20261023000002_reports_table.sql` crea `reports`; `20261023000003_idempotency.sql` crea claims, límites y RPC de publicación/helpers Storage; `20261023000004_confirmations.sql` crea confirmaciones y RPC; `20261023000005_public_reports_view.sql` crea la proyección pública y los grants.
- `reports.status` solo admite `pending` y `citizen-verification`; el umbral vive en cada fila y el conteo lo mantiene `confirm_report` bajo `FOR UPDATE`. `public_reports` excluye identidad, original, `resolved` y `resolved_at`; expone ruta/metadatos de la copia, dirección, conteo y umbral.
- Las tablas `public` creadas activan RLS. `reports` no concede acceso directo a `anon` ni `authenticated`; solo se da `SELECT` en la vista. Las funciones `SECURITY DEFINER` fijan `search_path = ''`, revocan `PUBLIC`/`anon` y conceden `EXECUTE` únicamente a `authenticated`.
- `confirm_report` obtiene la cuenta con `auth.uid()`, lee el umbral real de la fila, asegura unicidad por usuario/reporte y actualiza conteo/transición atómicamente. Una confirmación ya existente responde `ALREADY_CONFIRMED` antes de comprobar etapa cerrada; una nueva confirmación no permitida responde `REPORT_RESOLVED`.
- `get_my_confirmation` devuelve el dato propio y el conteo/umbral de la misma fila; el handler no consulta tablas cerradas.

### Límites SQL ante llamadas directas

La clave publicable permite que un usuario autenticado invoque las RPC directamente; `SECURITY DEFINER` no las convierte en operaciones exclusivas del servidor. Storage, en cambio, no tiene policies de cliente: solo el servidor escribe, con la clave secreta, después de sanear. `publish_report` valida `auth.uid()`, owner/estado/hash guardado, rutas coherentes con usuario/ID/MIME, existencia de los dos objetos, MIME y tamaño declarados en Storage, tamaño máximo y cuota. Los `CHECK` validan título (5–120), descripción (10–1000), categoría, gravedad, estado MVP, coordenadas, calle (2–80 sin espacios exteriores), número (1–99999 o nulo), MIME/tamaño de copia, conteo no negativo y umbral positivo. SQL no puede probar que los bytes correspondan al MIME ni que el hash coincida con el contenido; eso lo garantiza que solo el servidor, que sanea, pueda crear los objetos que `publish_report` exige.

Las URLs de copias públicas no se revocan cuando un reporte se oculte; el objeto seguirá accesible hasta que Storage API lo borre. Moderación, retención e invalidación de caché quedan abiertas.

## Checklist manual para el proyecto de pruebas en la nube

Antes de los comandos, crear un proyecto Supabase dedicado de pruebas y comparar su ref con el proyecto de producción `rsvtchefnydihokivaqg`. Si coincide o el proyecto no está vacío, detenerse. No ejecutar `db reset --linked`.

1. `supabase/config.toml` ya está versionado (D8); no hace falta `supabase init`. Verificar que `git status` no muestre cambios en él antes de seguir.
2. Ejecutar `npx supabase login`. Verificar que la CLI inició sesión con la cuenta del equipo dueña del proyecto de pruebas; no copiar ni guardar el token.
3. Ejecutar `npx supabase link --project-ref REF_PROYECTO_DE_PRUEBAS` sustituyendo el placeholder por el ref del panel. Antes de confirmar, comparar visualmente que el ref coincide con el proyecto de pruebas y es distinto de `rsvtchefnydihokivaqg`.
4. Ejecutar `npx supabase migration list --linked`. Verificar que el proyecto remoto no tiene aplicadas estas migraciones y que las locales están en orden: `20261023000001` a `20261023000005` (reportes) y `20261024000001` (cuota de Visión); detenerse si hay historia inesperada.
5. Ejecutar `npx supabase db push --dry-run --linked`. Verificar que el plan enumera únicamente las seis migraciones anteriores en orden, sin seed.
6. Solo si el ref y el dry run coinciden, ejecutar `npx supabase db push --linked`. Verificar que las seis migraciones terminan sin error.
7. Ejecutar otra vez `npx supabase migration list --linked`. Verificar que el remoto registra las seis migraciones aplicadas en orden.
8. En Supabase Studio → **Authentication → Users**, crear cuatro cuentas sintéticas con email confirmado y contraseñas independientes. No usar cuentas personales. La cuenta 4 debe estar fresca: la prueba de cuotas publica diez reportes persistentes y no los elimina.
9. Completar localmente `.env.test.local` con los nombres `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` o `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` (la `sb_secret_...` del proyecto de pruebas, para simular las subidas del servidor), `TEST_PROJECT_CONFIRMED=true` y `REPORTS_TEST_USER_1_EMAIL`, `REPORTS_TEST_USER_1_PASSWORD` hasta `REPORTS_TEST_USER_4_EMAIL`, `REPORTS_TEST_USER_4_PASSWORD`. No guardar valores en Git ni compartirlos.
10. Solo en ese proyecto dedicado, ejecutar `node scripts/integration/check-reports-cloud.mjs`. Verificar que todos los casos terminen en `OK`; el test de cuota crea diez reportes permanentes y una reejecución requiere una cuenta fresca o esperar 24 horas. Nunca apuntar el archivo de entorno a producción.
11. En Studio, abrir **Security Advisor**, ejecutar el análisis y registrar hallazgo, objeto, severidad y resolución. Verificar RLS en tablas expuestas, grants de funciones `SECURITY DEFINER`, `search_path`, permisos de la vista y policies de Storage. La visibilidad pública de `reports-public` es esperada por D1; el bucket `reports-originals` debe permanecer privado y sin lectura anónima.

## Evidencia y estado

`npm run lint`, `npx tsc --noEmit`, `npm run check:contracts`, `node scripts/check-reports.mjs`, `openspec validate implement-reports-backend --strict` y `git diff --check` cubren código, contratos, pruebas unitarias y declaraciones estáticas. Ninguna de esas verificaciones aplica SQL ni demuestra permisos, Auth, RLS, Storage o concurrencia en una base. Las tareas reales siguen sin marcar hasta correr el checklist.

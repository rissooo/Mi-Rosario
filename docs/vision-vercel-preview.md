# Vision en Vercel Preview — despliegue con autorización explícita

> **Actualización 24/10/2026:** en Vercel (Preview y Production) la IA usa solo OpenAI, con `OPENAI_API_KEY` y 18 s por intento. `GROQ_API_KEY` y `VISION_DEPLOY_OPENAI_ENABLED` ya no se usan en Vercel; Groq sigue disponible solo en local. Ver `vision-vercel-production.md`.

> **Estado:** implementación propuesta para revisión; **apagada por defecto**.
> Esta rama parte de `feature/report-form-vision-assist-20261024` (PR #12); no fusionar en `main` sin revisar dependencias.

## Diseño

- Se habilita **exclusivamente en Vercel Preview** cuando `VISION_DEPLOY_ENABLED=1`; en Production queda deshabilitado. Local continúa usando `VISION_LOCAL_ROUTER_REAL=1`.
- Se exige `Origin` HTTPS **exacto**, coincidente con la URL de destino. No se admiten comodines ni peticiones cross-site.
- El usuario debe iniciar sesión con Google/Supabase. Además, su **UUID de Auth** debe estar incluido en una lista de invitados del servidor.
- La cuota usa RPC `admit_vision_analysis` en Supabase: **10 intentos/usuario/día UTC y 100/día UTC globales**. El bloqueo transaccional impide exceder los topes cuando hay varias instancias de Vercel. Fallos de Supabase bloquean la IA. Se contabiliza el intento aunque falle o se cancele; no hay reembolso automático.
- Groq/Qwen primero, con **5 s** de presupuesto; OpenAI opt-in independiente con hasta **12 s**, desactivado por defecto. La solicitud total conserva límite de **20 s**.
- Se preservan validaciones multipart (máx. 4 MiB imagen), procesamiento de imagen con Sharp, contrato JSON, modo manual y ausencia de persistencia de fotos de IA.
- La clave de Groq solo se usa en servidor: **jamás** agregar `NEXT_PUBLIC_` a estas variables.

## 1. Antes de activar: revisar migración con Agus

`supabase/migrations/20261024000001_vision_quota.sql`

**NO se aplicó la migración desde ChatGPT.** Ejecutarla primero en un proyecto Supabase **de pruebas** aprobado por el equipo. Revisar explícitamente RLS/grants y probar desde sesiones autenticadas y anónimas:

- Anónimo no debe poder ejecutar `admit_vision_analysis`.
- Sesión válida puede ejecutar, como máximo, 10 veces/día por UUID, y el total máximo es 100/día.
- Un fallo de la RPC debe dejar el endpoint indisponible, sin llamar a Groq.
- No conceder acceso de lectura/escritura a `vision_daily_quota` a `anon` ni `authenticated`.
- El límite se reinicia a las 00:00 UTC; para mantener la tabla compacta hace falta una política de limpieza posterior.

**Importante:** no aplicar esta migración automáticamente al proyecto de producción de Supabase. Coordinar con las migraciones pendientes del backend de Agus.

## 2. Configurar SOLO el entorno Preview de Vercel

En Vercel → proyecto → Settings → Environment Variables, elegir **Preview** y configurar:

```dotenv
VISION_DEPLOY_ENABLED=0
VISION_DEPLOY_ORIGINS=https://URL-EXACTA-DE-LA-PREVIEW.vercel.app
VISION_DEPLOY_USER_IDS=UUID-DE-AUTH-DE-VALEN,UUID-DE-AUTH-DE-FRAN,UUID-DE-AUTH-DE-AGUS
VISION_DEPLOY_OPENAI_ENABLED=0
GROQ_API_KEY=CLAVE_PRIVADA_EXISTENTE
NEXT_PUBLIC_SUPABASE_URL=URL_DEL_SUPABASE_DE_PRUEBAS
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=PUBLICABLE_KEY_DEL_SUPABASE_DE_PRUEBAS
```

`VISION_DEPLOY_ORIGINS` usa la **URL base exacta** (sin `/mapa`, ni / final, ni comodines), puede tener hasta cinco orígenes separados por comas. Los UUID corresponden a **Supabase Authentication → Users**, no correos ni claves. Máximo 15 invitados.

`VISION_DEPLOY_OPENAI_ENABLED=0` debe mantenerse así hasta que haya crédito y se apruebe el costo del respaldo. **El flag local `VISION_LOCAL_OPENAI_REAL` no habilita OpenAI en Vercel.**

Al generar una preview nueva puede cambiar el subdominio: comprobar la URL final y actualizar `VISION_DEPLOY_ORIGINS` antes de habilitar. Vercel puede requerir un nuevo deploy para aplicar cambios de variables.

## 3. Prueba controlada

1. Mantener **`VISION_DEPLOY_ENABLED=0`** y verificar que la preview carga `/mapa`, pero que `/api/vision/analyze` devuelve error controlado.
2. Con migración ya aplicada al proyecto de pruebas, y con confirmación del equipo, poner `VISION_DEPLOY_ENABLED=1` **solo en Preview** y redeployar.
3. Iniciar sesión con uno de los UUID invitados y comprobar: foto → Groq → sugerencias en formulario. Probar edición manual.
4. Intentar desde usuario no invitado, desde otro origen y sin sesión: deben fallar; verificar cupos y que no se llame a Groq.
5. Verificar que **Production sigue desactivado** aunque Preview esté habilitado.
6. Finalizada la prueba, devolver `VISION_DEPLOY_ENABLED=0` y redeployar, salvo aprobación explícita para continuar.

## Verificaciones locales

```bash
git fetch origin
git switch --track origin/feature/vision-vercel-secure-20261024
node scripts/check-vision-router.mjs
node app/components/reports/check-report-form.mjs
npx tsc --noEmit
npm run lint
npm run dev
```

En local, el formulario y el router siguen funcionando con `VISION_LOCAL_ROUTER_REAL=1`, `VISION_LOCAL_TEST_GROQ_FAILURE=0`. **No** agregues las variables `VISION_DEPLOY_*` a `.env.local` para ensayar producción: el modo desplegado se ensaya exclusivamente en Preview con cuotas compartidas.

## Limitaciones

Esto no constituye una aprobación de producción ni una garantía de que la migración, la configuración de Vercel y los controles de gasto funcionen sin pruebas reales. Groq tiene sus propios límites y cuotas adicionales. No incluye publicación real de reportes, mantenimiento de sesiones ni implementación del backend de Agus.

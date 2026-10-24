# Vision en Production — preparación segura (Shippear)

> **Estado: implementación propuesta, apagada por defecto. NO fusionar ni activar sin revisión de cuota SQL y pruebas remotas.**
> Este documento complementa `docs/vision-vercel-preview.md`; las variables de Preview son independientes de Production.

> **Actualización 24/10/2026: en Vercel la IA usa solo OpenAI.** Groq quedó fuera porque su plan gratis permite 8.000 tokens por minuto por organización (2 o 3 análisis por minuto para toda la app). Las variables necesarias en Production son `OPENAI_API_KEY` (Secret), `VISION_PRODUCTION_ENABLED=1`, `VISION_PRODUCTION_ORIGINS` y `VISION_PRODUCTION_ACCESS` (`public` o `invited` con `VISION_PRODUCTION_USER_IDS`). `GROQ_API_KEY` y `VISION_PRODUCTION_OPENAI_ENABLED` ya no se usan en Vercel. OpenAI tiene 18 s por intento; si falla, los logs de Vercel muestran `{"source":"vision",...}` con el status HTTP (401 clave, 429 sin saldo o límite) o `timeout`. Las menciones a Groq de abajo describen la configuración anterior.

## Diseño

- El endpoint de IA se ejecuta en Vercel (no en la PC de Valen).
- Production requiere exactamente `VERCEL=1`, `VERCEL_ENV=production`, `VISION_PRODUCTION_ENABLED=1`, una clave privada `GROQ_API_KEY` y un origen HTTPS exacto.
- `VISION_PRODUCTION_ACCESS=invited` admite únicamente UUIDs de Supabase Auth autorizados. Es **el modo recomendado para ensayar la demo**.
- `VISION_PRODUCTION_ACCESS=public` admite a cualquier **usuario autenticado** mediante Supabase, sin lista de invitados. **No es acceso anónimo**; requiere protección antiabuso y presupuesto confirmado antes de activarse en un sitio abierto.
- Independientemente del modo de acceso, cada solicitud pasa por la RPC `public.admit_vision_analysis` autenticada **antes** de llamar a Groq. La migración actual implementa **10 intentos/usuario/día UTC** y **100 intentos/día UTC globales**, contados incluso si falla el proveedor.
- Un error de cuota, configuración, usuario u origen bloquea la IA. El ciudadano puede completar su reporte manualmente.
- La IA jamás publica reportes automáticamente. Ninguna API key se envía al navegador.

## 1. Requisitos que deben verificarse primero

1. Revisar `supabase/migrations/20261024000001_vision_quota.sql` con Agus, en particular `SECURITY DEFINER`, RLS, grants, concurrencia y aislamiento de sesiones.
2. Ejecutar y probar la migración **primero en Supabase de pruebas**, no directamente en producción. Verificar rechazos anónimos, límites por usuario y globales, y caída de la RPC.
3. Confirmar el proyecto Supabase que utiliza la aplicación publicada y la configuración de Google OAuth / redirect para el dominio elegido.
4. Confirmar presupuesto y límites en la cuenta de Groq. El límite SQL no evita otros consumos externos a este endpoint.
5. Verificar que el entorno Vercel Production tenga la URL y clave publicable correctas de Supabase (configuraciones `NEXT_PUBLIC_*` ya utilizadas por el proyecto).
6. Probar primero el endpoint en **Vercel Preview**, usando `VISION_DEPLOY_ENABLED`, como explica la guía anterior.

## 2. Variables — Vercel Production únicamente

Ir al proyecto de Vercel → Settings → Environment Variables. Elegir **Production** (NO 'All Environments') y cargar:

```dotenv
GROQ_API_KEY=CLAVE_PRIVADA_REAL_EN_VERCEL_NO_EN_GITHUB
VISION_PRODUCTION_ENABLED=0
VISION_PRODUCTION_ORIGINS=https://mi-rosario-psi.vercel.app
VISION_PRODUCTION_ACCESS=invited
VISION_PRODUCTION_USER_IDS=UUID_DEL_USUARIO_AUTORIZADO
VISION_PRODUCTION_OPENAI_ENABLED=0
```

- **Dejar `VISION_PRODUCTION_ENABLED=0` hasta terminar toda la validación.**
- `VISION_PRODUCTION_ORIGINS`: URL base HTTPS **exacta** del dominio de la aplicación. Sin barra final, sin `/mapa`, sin comodines. Confirmar el dominio real en Vercel antes de usar el ejemplo.
- `VISION_PRODUCTION_USER_IDS`: UUIDs de **Supabase Authentication → Users**, separados por comas. Máximo 15, solo si modo `invited`.
- Para permitir acceso a **todos los usuarios autenticados**, cambiar explícitamente a `VISION_PRODUCTION_ACCESS=public` y **quitar** `VISION_PRODUCTION_USER_IDS`, después de una revisión de abuso y presupuesto. La restricción de 10 por usuario y 100 global/día sigue activa.
- En Production el respaldo OpenAI **solo** se activa con `VISION_PRODUCTION_OPENAI_ENABLED=1` y `OPENAI_API_KEY`; mantenerlo en 0 salvo aprobación expresa de costos. `VISION_DEPLOY_OPENAI_ENABLED` es solo de Preview.
- Las claves nunca deben llevar prefijo `NEXT_PUBLIC_`; no copiar `.env.local` a GitHub.
- Las variables de Preview (`VISION_DEPLOY_ENABLED`, `VISION_DEPLOY_ORIGINS`, etc.) **no pueden habilitar Production**.

## 3. Prueba y activación — con el equipo

1. Verificar que `VISION_PRODUCTION_ENABLED=0`: la web debe cargar y el análisis debe devolver error controlado.
2. Probar la migración y el flujo completo de IA en Preview: login, foto → Groq → sugerencias, errores, cupos y usuario invitado/no invitado.
3. Verificar el dominio, OAuth y las variables Production. Elegir `invited` para una primera activación controlada.
4. Después de aprobación del equipo, cambiar `VISION_PRODUCTION_ENABLED=1` **solo en Production** y redeployar. Probar con un usuario invitado y otro no autorizado.
5. Revisar logs de Vercel, métricas de Groq, respuestas ante límite y que el formulario manual siga funcionando.
6. Para apagado de emergencia: cambiar `VISION_PRODUCTION_ENABLED=0` en Production y **redeployar**. La variable puede estar embebida en el despliegue anterior, por lo que el cambio solo en Settings puede no apagar instantáneamente instancias antiguas. Revocar/rotar `GROQ_API_KEY` desde Groq si se requiere corte inmediato de acceso al proveedor.

## 4. Comprobación del código

```bash
git fetch origin
git switch --track origin/feature/vision-production-guarded-20261024
node scripts/check-vision-router.mjs
node app/components/reports/check-report-form.mjs
npx tsc --noEmit
npm run lint
npm run build
```

Las pruebas automatizadas validan el control de configuración y los casos de acceso, **no certifican** que las variables remotas, OAuth, la RPC, el proveedor ni el presupuesto ya funcionen en producción. **No fusionar ni habilitar sin verificarlos.**

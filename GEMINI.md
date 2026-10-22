# Punto de entrada de Gemini / Antigravity — Agus

No supongas que los archivos compartidos se cargaron automáticamente. Antes de hacer cambios, leé explícitamente:

1. El `AGENTS.md` de la raíz y las instrucciones anidadas que correspondan.
2. `openspec/config.yaml` y la proposal, el design, las tasks y las specs del change elegido.
3. Las guías de Next.js instaladas que correspondan, en `node_modules/next/dist/docs/`.
4. `docs/contracts.md` y `docs/development.md`.

Agus es responsable del backend/Supabase en `feature/reports-backend`: guardar los reportes, asociar las fotos originales en Storage, los permisos, la recuperación, la limpieza, la idempotencia y las confirmaciones ciudadanas. Reutilizá los contratos comunes y los clientes de sesión existentes. No modifiques el login con Google existente ni implementes operaciones municipales en el MVP.

Tu login del asistente de código es independiente de las credenciales del proveedor Gemini Vision de la aplicación. Usá tu propia cuenta; las verificaciones con fixtures no necesitan una clave del proveedor ni el `.env.local` de un compañero. Nunca commitees ni pegues contraseñas, claves de service-role, tokens ni cachés de autenticación en instrucciones o PRs. Pedí acceso a los recursos con una cuenta individual.

Conservá los flujos de Claude y Codex e informá los conflictos de instrucciones en lugar de sobrescribir archivos. Respetá los límites entre planificar y aplicar y el alcance explícito que pida el usuario. La incorporación de solo lectura tiene que verificarse en la sesión del asistente de Agus; este punto de entrada está preparado, pero no prueba que la herramienta lo haya importado ni que la autenticación haya funcionado.

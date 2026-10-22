# Punto de entrada de Claude Code — Fran

No supongas que los archivos compartidos se cargaron automáticamente. Antes de hacer cambios, leé explícitamente:

1. El `AGENTS.md` de la raíz y las instrucciones anidadas que correspondan.
2. `openspec/config.yaml` y la proposal, el design, las tasks y las specs del change elegido.
3. Las guías de Next.js instaladas que correspondan, en `node_modules/next/dist/docs/`.
4. `docs/contracts.md` y `docs/development.md`.

Fran es responsable del frontend, la interfaz y los mapas en `feature/interface-map`. Consumí los DTO compartidos, los validadores y los fixtures sintéticos en lugar de redefinir los contratos. Los cambios en los límites necesitan la revisión de quienes los proveen y de quienes los consumen. No tomes los fixtures como un backend que funciona ni como datos municipales oficiales.

Conservá `.claude/commands/opsx/`, `.claude/skills/`, `.agents/skills/`, las instrucciones existentes y la autenticación. Informá las instrucciones en conflicto; no las reemplaces. Respetá los límites entre planificar y aplicar y la autorización del usuario. Esta base no autoriza pantallas, mapas, endpoints, merges ni deploys.

Verificación de incorporación de solo lectura: antes de trabajar, identificá las reglas compartidas, el change elegido, el responsable del módulo y la guía de Next.js que corresponde. Hace falta evidencia de una sesión real de Claude de Fran; que este archivo exista no prueba que se haya leído.

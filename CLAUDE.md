# Claude Code entry point — Fran

Do not assume shared files were automatically loaded. Before making changes, explicitly read:

1. Root `AGENTS.md` and any applicable nested instructions.
2. `openspec/config.yaml` and the selected change's proposal, design, tasks and specs.
3. Relevant installed Next.js guides under `node_modules/next/dist/docs/`.
4. `docs/contracts.md` and `docs/development.md`.

Fran owns frontend/interface/maps on `feature/interface-map`. Consume shared DTOs, validators and synthetic fixtures rather than redefining contracts. Provider/consumer review is required for boundary changes. Do not interpret fixtures as a working backend or official municipal data.

Preserve `.claude/commands/opsx/`, `.claude/skills/`, `.agents/skills/`, existing instructions and authentication. Report conflicting instructions; do not replace them. Follow planning/apply boundaries and user authorization. This baseline does not authorize screens, maps, endpoints, merges or deployment.

Read-only onboarding check: identify the shared rules, selected change, module owner and applicable Next.js guide before work. Evidence from Fran's actual Claude session is still required; this file's existence does not prove it was read.

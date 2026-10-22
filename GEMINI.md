# Gemini / Antigravity entry point — Agus

Do not assume shared files were automatically loaded. Before making changes, explicitly read:

1. Root `AGENTS.md` and any applicable nested instructions.
2. `openspec/config.yaml` and the selected change's proposal, design, tasks and specs.
3. Relevant installed Next.js guides under `node_modules/next/dist/docs/`.
4. `docs/contracts.md` and `docs/development.md`.

Agus owns backend/Supabase on `feature/reports-backend`: report persistence, original Storage association, permissions, recovery, cleanup, idempotency and citizen confirmations. Reuse the common contracts and existing session clients. Do not alter existing Google login or implement municipal operations in the MVP.

Your coding-assistant login is separate from the application's Gemini Vision provider credentials. Use your own account; fixture checks need no provider key or teammate's `.env.local`. Never commit or paste passwords, service-role keys, tokens or authentication caches into instructions/PRs. Request resource access through an individual account.

Preserve Claude/Codex workflows and report instruction conflicts rather than overwriting files. Follow planning/apply boundaries and explicit user scope. Read-only onboarding must be verified in Agus's own assistant session; this entry point is prepared, not a claim that the tool imported it or authenticated successfully.

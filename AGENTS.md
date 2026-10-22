<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


<!-- BEGIN:mi-rosario-team-rules -->

## Mi Rosario shared architecture

Before work, explicitly read this file, any applicable nested instructions,
`openspec/config.yaml`, the selected change's proposal/design/tasks/specs, and
`docs/contracts.md` / `docs/development.md`. Do not assume another assistant
already loaded them. Preserve the generated Next.js block above and existing
Codex/Claude workflows; report conflicting instructions instead of replacing them.

- Valen: AI on `feature/gemini-vision`. Analysis suggests editable fields only;
  it never publishes, writes confirmations or persists photographs.
- Agus: backend/Supabase on `feature/reports-backend`. Own report persistence,
  original Storage, safe presentation, permissions, idempotency, recovery and cleanup.
- Fran: interface/maps on `feature/interface-map`. Consume public contracts and
  APIs; do not import provider/repository/server clients or write product tables directly.
- Shared DTOs, pure validators and synthetic fixtures live in `lib/contracts/`.
  Changes to those boundaries need review from affected providers and consumers.
- Initial active categories are exactly `pothole`, `missing-light`,
  `damaged-sidewalk` and `faulty-traffic-light`. Keep Spanish labels and legacy IDs.
  Use falta de luz; never infer insecurity. A still image may not prove traffic-light behavior.
- Severity is `low | medium | high` (baja/media/alta). Gemini may return null;
  the citizen reviews/corrects all fields and explicitly publishes with an original photo.
- Initial citizen threshold is 3 distinct authenticated non-author confirmations;
  backend returns effective threshold/state and owns the atomic transition.
  Counts and severity never imply municipal verification.
- Four stages are pending, citizen-verification, municipal-verification and resolved.
  Real institutional operations remain outside the MVP. Label isolated simulations
  “Simulación - sin aval municipal”; never claim official endorsement.
- Keep unapproved title limits and photo-retention decisions visibly provisional.
  Do not expand the incident catalog or institutional scope without a reviewed change.
- This baseline implements contracts/instructions, not endpoints, Gemini calls,
  migrations, screens or maps. Those require separate functional OpenSpec changes.
  Mark tasks complete only with their specified evidence, including teammate reviews.
- Use `openspec.cmd` in PowerShell; locate with `npm.cmd config get prefix` if needed.
  Propose/review before apply; never infer commit, push, merge or archive authorization.
- Use English code/commit names and Spanish UI. Link PRs to OpenSpec, include
  dependencies and checks, and assign one editor per PR for shared files.
- Use individual assistant accounts. Never share or commit private environment files,
  tokens, service-role/provider secrets, authentication caches or private histories.

Local checks: `npm.cmd run check:contracts`, `npm.cmd run lint`,
`npm.cmd exec -- tsc --noEmit --incremental false`,
`openspec.cmd validate establish-team-architecture --strict`, `git diff --check`.
Contract fixtures are not evidence of runtime security, DB atomicity or official verification.

<!-- END:mi-rosario-team-rules -->

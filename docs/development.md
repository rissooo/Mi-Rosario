# Development and individual access

This is a local contract baseline, not an endpoint, database or map implementation. Runtime integration is owned by later feature changes. Start by reading AGENTS.md and the selected OpenSpec change; Claude and Gemini entry files explicitly request these reads.

## Local checks

The existing checkout has Node 24 and project dependencies installed. Use the project's lockfile and supported Node version when setting up another machine. No new dependency is introduced by this baseline.

```powershell
npm.cmd run check:contracts
npm.cmd run lint
npm.cmd exec -- tsc --noEmit --incremental false
openspec.cmd validate establish-team-architecture --strict
git diff --check
```

`check:contracts` uses the installed TypeScript compiler and Node test runner. It compiles only the contract test graph to a unique OS temporary directory, runs it and removes that temporary output. It needs no environment file, network, Supabase session or provider key. It does not start Next.js, fetch image URLs or contact Gemini. No credential-free command above loads `.env.local` for service access.

If OpenSpec is missing from PATH, use `npm.cmd config get prefix` to find its global installation and invoke the `openspec.cmd` file there. Do not initialize/regenerate OpenSpec or assistant integrations to repair a PATH issue.

## Accounts and secrets

Agus uses his own Gemini/Antigravity login, Fran her/his own Claude login and Valen his own Codex login. Use each installed tool's current supported sign-in flow, independently of application provider credentials. Exact product-specific onboarding/version steps still need verification in each teammate's environment; no completed onboarding is claimed here.

For hosted resources, invite each teammate's own account with the needed test-project role. Never share personal dashboard passwords, session cookies or private histories. Use synthetic data or a dedicated test environment. Required environment secrets are provisioned separately via an approved secret channel.

Existing application variable names, shown with **dummy values only**:

```text
NEXT_PUBLIC_SUPABASE_URL=https://example.invalid
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=placeholder-not-a-real-key
```

A future vision module may require server-only `GEMINI_API_KEY=placeholder-not-a-real-key`; it is not needed for backend contract development. Never prefix provider or service-role secrets with `NEXT_PUBLIC_`. Publishable Supabase configuration is not a substitute for database RLS/Storage policies.

The existing `.env*` ignore rule also ignores `.env.example`. Keep examples in this document rather than adding a blanket ignore exception. Keep private environment files, assistant credentials and caches untracked; verify ignore/tracking before adding tool configuration. Do not inspect or copy a teammate's secrets for onboarding.

## Reviews still required

- Agus/Fran review the common DTOs, pure validators and synthetic fixtures before cross-module integration.
- Fran demonstrates that Claude explicitly reads shared instructions; Agus does the same in his own Gemini/Antigravity session.
- Review the contract sheet in `contracts.md` on a mobile viewport. This is document/fixture review, not product-screen acceptance.
- Verify exact onboarding flows in those environments. No messages, invitations or account changes have been performed by this baseline.

See `contracts.md` for branch/PR rules, task ownership and remaining product/operational decisions.

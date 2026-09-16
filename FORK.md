# Private fork notes (SemiHop/elmo)

Forked from [elmohq/elmo](https://github.com/elmohq/elmo) (MIT). Remote `upstream`
points there — `git fetch upstream && git merge upstream/main` to pull their updates.

## Decisions (2026-09-16)

- **Stripped**: `apps/www` (marketing site), `packages/docs`, upstream-only
  workflows (CLA check, npm publish, blog drafts). Recoverable from history.
- **Kept deliberately**:
  - `apps/cli` — it's the self-host installer (`elmo init --dev`), e2e bootstraps through it.
  - `packages/og` — `apps/web` depends on it (shareable-report OG images).
  - Billing/entitlements/Stripe code — **not stripped**. It is fully gated behind
    `cloud` deployment mode; we run in `local` mode where entitlements resolve to
    UNLIMITED and Stripe never loads. Deleting it would only buy upstream merge
    conflicts.
  - pg-boss worker — already built and tested; no reason to replace with cron.
- **Auth**: better-auth + organizations kept (covers the pre-deploy auth requirement).

## Environment

- Node **24.x** required (`nvm use 24`) — the web build's bundle check knows
  `node:sqlite` only on 24; and it's the engines requirement anyway.
- pnpm 12.4.1 (`npx pnpm@12.4.1 …` or corepack).

Predecessor from-scratch MVP: `~/projects/withmaya-review` (AnswerEcho) — its
`docs/design/01-elmo-analysis.md` is the original adopt/skip analysis.

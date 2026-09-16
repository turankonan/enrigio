# Session handoff — 2026-09-16 → next session

## Goal

We abandoned building AnswerEcho from scratch (`~/projects/withmaya-review`) and
**forked elmo instead**. The mission now: get this fork running locally, compare
it against our AnswerEcho instance, and evolve it into our own product.

## State (all done, verified)

- Private repo **github.com/SemiHop/elmo**, clone at `~/projects/elmo`, branch `main`.
- Remote `upstream` = elmohq/elmo — `git fetch upstream && git merge upstream/main` for updates.
- Stripped: `apps/www`, `packages/docs`, upstream-only workflows. Kept: `apps/cli`
  (self-host installer), `packages/og` (web dep), billing code (dormant in `local`
  mode), pg-boss worker, better-auth orgs. Full rationale in `FORK.md`.
- Verified green: `pnpm install`, 545 tests (34 files), full build.
- **Node 24 required**: `nvm use 24` (installed via nvm; default shell node is 22
  and the web build fails on it). pnpm via `npx pnpm@12.4.1 …`.

## Next steps (in order)

1. `nvm use 24 && pnpm elmo init --dev` — boot locally (interactive wizard; sets up
   env/secrets, deployment mode `local`). Postgres: note local port 5432 is taken by
   another project; AnswerEcho used 5433.
2. Add API keys (Anthropic + OpenAI — same keys as `withmaya-review/.env`).
3. Create our brand (Rigosis) + prompts; run and compare the dashboard against
   AnswerEcho dev: https://answerecho-dev.onrender.com (token auth, Render env).
4. Gap list: what from withmaya-review is worth porting over (likely little —
   their remaining gaps were data volume + chart polish, which elmo has).
   AnswerEcho's own elmo analysis: `withmaya-review/docs/design/01-elmo-analysis.md`.
5. Decide deployment target (Render + Neon like AnswerEcho dev, or elmo's own
   `packages/deployment` templates) — not started.

## Open questions for the user

- Retire the AnswerEcho Render service / Neon DB, or keep as reference while comparing?
- Rebrand the fork (name, logo) now or after it runs?

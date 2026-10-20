# Enrigio

Enrigio is Rigosis' AI visibility platform (Answer Engine Optimization). It
tracks how AI answer engines — ChatGPT, Claude, Perplexity, Gemini, Google AI
Overviews — mention, cite, and describe brands, so you can benchmark
competitors and grow visibility in AI answers.

Private fork of [elmohq/elmo](https://github.com/elmohq/elmo) (MIT). Fork
decisions and provenance: [FORK.md](FORK.md).

## What it tracks

- **Visibility scoring** — how often each answer engine mentions your brand per tracked prompt, trended over time and per model.
- **Citations** — which domains and pages engines cite, and whether yours are among them.
- **Query fan-out** — the web searches engines run before answering, and which your content wins.
- **Opportunities & reports** — prioritized content actions and shareable stakeholder reports.
- **REST API + MCP** — manage brands/prompts and pull analytics programmatically.

## Monorepo

pnpm + Turborepo, Node.js 24, TypeScript, PostgreSQL. Layout, commands, and
conventions: [AGENTS.md](AGENTS.md). Demo deployment (Render + Neon):
[DEMO.md](DEMO.md).

```sh
nvm use 24
pnpm install
pnpm enrigio init --dev   # interactive local setup wizard
pnpm dev
```

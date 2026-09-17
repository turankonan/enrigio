# Demo environment — Render (free) + Neon (free)

One free Render web service runs both the web app and the pg-boss worker;
Neon hosts Postgres. Blueprint: `render.yaml`.

## 1. Neon

1. [console.neon.tech](https://console.neon.tech) → New project → name `answerecho-demo`, region EU (Frankfurt matches the Render region).
2. Copy the **pooled** connection string (ends in `-pooler...neon.tech/neondb?sslmode=require`).

## 2. Render

1. Push this repo to GitHub, then [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** → pick the repo. Render reads `render.yaml`.
2. Fill the prompted secrets:
   - `DATABASE_URL` — the Neon pooled string
   - `ANSWERECHO_ENCRYPTION_KEY` — output of `openssl rand -base64 32`
   - `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` — real keys (evaluations need them)
   - `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` — required: DataForSEO is the
     demo's scraper for ChatGPT, Google AI Overviews/AI Mode, Gemini, and
     Perplexity (see `SCRAPE_TARGETS` in `render.yaml`). Sign up free at
     [app.dataforseo.com/register](https://app.dataforseo.com/register) — no
     card, $1 trial credit (hundreds of queries); the credentials are on the
     dashboard's API Access page. Top-ups later are $50 minimum,
     pay-as-you-go.
3. Deploy. Migrations run at the end of the build (`drizzle-kit migrate`
   against Neon), so the first build both provisions the schema and ships the
   app.
4. Open the service URL, sign up (local mode = open email/password signup),
   create the Rigosis brand and prompts.

## Free-tier limits to know

- The service **spins down after ~15 min idle**; first request after that
  takes ~1 min. The worker only processes jobs while the service is awake —
  open the dashboard to wake it before expecting fresh evaluations.
- 512 MB RAM shared by web + worker. Fine for a demo; if the worker OOMs
  under heavy evaluation runs, upgrade the plan or move the worker to a paid
  Render background worker (drop it from `startCommand`, add a `worker`
  service).
- Neon free tier suspends compute when idle too; first query is a cold start
  (~1 s). Harmless here.
- `APP_URL`/`VITE_APP_URL` default to `RENDER_EXTERNAL_URL`. If you attach a
  custom domain, set both env vars explicitly and redeploy (the client bundle
  bakes `VITE_APP_URL` at build time).

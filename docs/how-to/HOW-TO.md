# AnswerEcho — how to use it

A walkthrough of the full flow, captured live on the demo
([answerecho-demo.onrender.com](https://answerecho-demo.onrender.com)) on
2026-09-17 with the Rigosis brand. Every screenshot below is from that real
session — real evaluations against ChatGPT, Google AI Overviews, Google AI
Mode, Gemini, Perplexity, Claude, and GPT.

## 1. Create the admin account

The first visit redirects to sign-up. Local mode has exactly one open
registration: the owner account. Once it exists, sign-up closes.

![Sign up](images/01-sign-up.png)

## 2. Create a brand

A brand is the thing you track: name plus website. Everything else is derived
from it.

![Create brand](images/02-create-brand.png)

## 3. Let the AI analyze the brand

Click **Analyze brand** and AnswerEcho researches the website with web search
(≈1 minute). For rigosis.com it came back with 20 prompt suggestions matched
to the actual business — ITSM consulting in Turkey, OpenText SMAX
partnerships, plus brand prompts like "rigosis alternative". Untick what you
don't want; each enabled prompt is evaluated daily against every configured
engine, so start small (we kept 5).

![Onboarding review](images/03-onboarding-review.png)

## 4. Start tracking

**Start tracking** queues the first evaluation run immediately. The worker
fans each prompt out to all engines — scraping ChatGPT, AI Overviews, AI
Mode, Gemini, and Perplexity via DataForSEO, and calling Claude and GPT
directly. A full run takes a few minutes per prompt; results then refresh
every 24 hours automatically.

![Tracking started](images/04-tracking-started.png)

## 5. Read the overview

Two headline numbers: **AI Visibility** (how often AI answers mention the
brand) and **Share of Voice** (the brand's slice of all brand mentions in
those answers). Our first run: 73% visibility, 100% share of voice, from 170
evaluations.

![Overview](images/05-overview-results.png)

## 6. Drill into visibility per prompt

This is where the story is. Brand-named prompts ("rigosis itsm services",
"rigosis opentext partner") score 91–100% — ask an AI about Rigosis and it
answers about Rigosis. The generic category prompt ("best it service
management consultants in turkey") found **no brands at all**: nobody owns
that answer yet. That gap is the AEO opportunity this tool exists to surface.

![Visibility](images/06-visibility.png)

## 7. See who gets cited

Citations shows which domains and pages the engines relied on when answering
(1,221 collected in the first run). Domains you don't control that rank for
your prompts are your content and PR targets.

![Citations](images/07-citations.png)

## 8. Manage prompts over time

Settings → Prompts is where you add, tag, disable, or bulk-import prompts
later. Each enabled prompt costs one evaluation per engine per day, so prune
what you don't read.

![Prompts settings](images/08-prompts-settings.png)

---

## The Rigosis case: what to do with these results

The first run isn't a report card — it's a work list. Reading ours:

| Finding | What it means | Action |
|---|---|---|
| "best it service management consultants in turkey" → **no brands found** | Nobody owns this answer yet. AI has no source that names anyone. | Create the citable content: a credible ITSM-in-Turkey guide on rigosis.com plus third-party coverage. First mover takes the recommendation slot. |
| "opentext smax implementation partners turkey" → **65%** | Highest commercial intent, but Rigosis is missing from a third of answers. | Open **Citations** for this prompt, see which domains the engines trusted, and get Rigosis onto those exact sources (partner directory, roundups, case studies). |
| "rigosis alternative" → **91%** | AI answers comparison questions about Rigosis — alongside someone. | Read the responses to see who's named as the alternative; those firms go into the competitor list. |
| Brand prompts → **100%** | AI knows Rigosis when asked by name. | Maintenance only: keep company facts fresh and consistent across the sites AI cites. |
| Share of Voice → **100%** | An artifact: zero competitors configured, so Rigosis owns a field of one. | Add real competitors in **Settings → Competitors** — then Share of Voice becomes the KPI to report. |

Then the loop: act → let the daily runs re-measure → watch the per-prompt
trend lines move. **Query Fan-Out** supplies the exact search phrasings the
engines use internally (a content keyword list straight from the source), and
**Opportunities** keeps a prioritized, refreshed version of this table
automatically.

---

### Operating notes (demo environment)

- Free-tier Render sleeps after ~15 idle minutes; evaluations only process
  while the service is awake. Open the dashboard to wake it.
- Scrapes occasionally fail with a DataForSEO "Internal SE Server Error" —
  transient upstream errors; the daily rerun picks them up.
- Deploys restart the service; avoid pushing while a run is in flight.

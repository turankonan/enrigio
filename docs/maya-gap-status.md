# Maya Gap — Status

_Last updated: 2026-09-21_

Where Enrigio stands against the capability gap Maya raised (and the five customer
comments behind it, see `docs/CUSTOMER-FEEDBACK-REVIEW.md`). This tracks what has shipped,
what is deployed and verified live, and the one real feature still open.

## Bottom line

The gap is effectively closed except for **multi-market comparison**, which is fully designed
and deferred (Phase 2b). Everything the customer asked for that we intend to build is either
**live** or **designed-and-scheduled**; the one thing we deliberately don't build is paid
placement inside LLM answers (no such mechanism exists).

The two biggest missing pillars — the **website AI-readiness audit** and **per-brand market
configuration** — are now both shipped and running in production on the demo.

## Pillar status

| Pillar (what Maya / the customer wanted) | Status |
|---|---|
| Sentiment (how AI answers describe the brand) | ✅ Shipped (Phase 0) — live |
| In-answer rank (avg. position when recommended) | ✅ Shipped (Phase 0) — live |
| Question-coverage metric ("visible in N of M questions") | ✅ Shipped (Phase 0) — live |
| Opportunities as an actionable plan (priority + expected impact, 4 categories) | ✅ Shipped (Phase 0) — live |
| Per-LLM breakdown + filters, branded vs non-branded | ✅ Already existed — live |
| **Website AI-readiness audit (AXO)** — *the Maya pillar we didn't have* | ✅ **Shipped (Phase 1) — verified live** |
| **Per-brand evaluation market** (each brand configures its own country/language) | ✅ **Shipped (Phase 2a) — deployed & verified live** |
| **Multi-market comparison** (Türkiye vs Germany vs UK in one report, translated variants) | 🟡 **Designed, deferred (Phase 2b)** — not built |
| Paid advertising to boost LLM visibility | 🚫 Non-goal — no such mechanism exists; position as organic measurement |

## What shipped most recently

### Phase 1 — AXO (website AI-readiness audit) · live
For a brand, AXO audits the brand's own pages that AI engines already cite, scores each for
AI-readiness (title, meta description, headings, schema.org, robots posture for
GPTBot/ClaudeBot/etc.), and surfaces findings as a new **"Site readiness"** category inside the
Opportunities report. Runs as a cached background job. **Verified end-to-end on the live demo**:
an audit ran, scored real pages, and produced a High-priority "add schema + meta descriptions"
recommendation.

### Phase 2a — Per-brand evaluation market · live (v0.4.2)
Location moved from a single deployment-wide setting to a **per-brand** one. Each brand picks
its **evaluation market** (country + language); its localizable evaluations run in that market,
are attributed to it (`prompt_runs.market_key`), and its dashboards are scoped to that market
(plus the non-localizable "global" bucket). Backward-compatible and resilient: an unconfigured
or uncataloged market degrades gracefully instead of failing. **Verified live**: the
"Evaluation market" picker renders and resolves correctly (demo = Türkiye · English), the
worker localizes and stamps runs, and dashboards scope correctly.

This is the **foundation** for Phase 2b — comparison layers on top of it.

## What's left

### Phase 2b — Multi-market comparison (the one real remaining feature)
Opt-in, additive multi-market support: a brand adds up to a few markets, each with reviewed
**translated question variants**, and a comparison surface shows visibility per market with an
equal-weighted consolidated score. Fully designed in
`docs/superpowers/specs/2026-09-20-market-comparison-design.md` (Phase 2b section), with all
review findings resolved (translation lifecycle, completeness semantics, safe rollout order).
**Deferred** because most customers operate in a single location — Phase 2a already serves that
majority, and 2b is the larger build for the minority who want cross-country comparison.

### Deferred follow-ups (non-blocking polish, tracked)
- A mandatory later release (Task 8) to drop the migration's temporary `legacy` default once
  workers have drained.
- Wire the "history is filling" notice on freshly-changed markets; a dashboard-header market
  label; localize the collapsed picker label (it shows the raw key today).
- Add markets to the catalog for any deployment outside TR/DE/GB/US.

## Process note (for the record)

Phases 1 and 2a were built via subagent-driven development with per-task review and a final
whole-branch review. Phase 2a's live end-to-end test surfaced three server/client boundary
defects that typecheck/lint/unit-tests could not catch (they only appear in the production
build or a real deployment). All were fixed and verified live. Going forward, web changes are
gated on a full production build (`turbo run build`) plus a post-deploy smoke, not just
`tsc`/`vitest`/`lint`.

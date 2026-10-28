# Architecture

DMacro works like a news site or a weather forecast: visitors only ever **view** pre-computed data. There is no search box, no filters, no way to trigger fresh data on demand. Everything a visitor sees is populated ahead of time by a scheduled job — never by a visitor's own request.

> **Status:** this document describes the target design. Items not yet built are marked `(planned)` — see `TODO.md` for the live, phased punch list.

## The one governing rule

No user-facing request ever triggers a live call to FRED, Alpha Vantage, GDELT, or Gemini. All external data fetching happens inside one scheduled job, server-side. The live web app only ever reads from Supabase.

## System overview

```
                         ┌─────────────────────────────┐
                         │   Scheduled job (daily)      │
                         │   GitHub Actions cron (planned) │
                         └───────────────┬─────────────┘
                                         │
                ┌────────────────────────┼────────────────────────┐
                │                        │                        │
        ┌───────▼────────┐                               ┌────────▼───────┐
        │  News lane      │                               │  Vitals lane    │
        │  (dynamic)      │                               │  (fixed)        │
        └───────┬────────┘                               └────────┬───────┘
                │                                                  │
                ▼                                                  ▼
          writes to Supabase (events, themes, event_theme_map)     writes to Supabase (vitals snapshot, planned)
                │                                                  │
                └────────────────────────┬─────────────────────────┘
                                         │
                                 ┌───────▼────────┐
                                 │  Flask API       │   reads only, never calls
                                 │  (main.py)       │   external APIs per-request
                                 └───────┬────────┘
                                         │
                                 ┌───────▼────────┐
                                 │  Next.js frontend│   pure display, no
                                 │                  │   search/filter UI
                                 └──────────────────┘
```

## Lane 1 — News (dynamic)

The differentiator: turns unstructured news text into structured, deduplicated, persistent "themes" instead of a feed of one-off headlines.

1. **Discovery + scraping** — GDELT indexes candidate article URLs; a Scrapy spider (`webcrawlerlib/spiders/gdelt_spider.py`) visits each and scrapes the full text.
2. **Raw storage** — scraped articles are uploaded to Supabase Storage and tracked in `raw_ingestions` (marked unprocessed).
3. **Enrichment** (`dataprocesslib/pipeline.py`) — for each unprocessed article:
   - spaCy (`en_core_web_sm`) extracts entities: tickers and countries mentioned
   - FinBERT (PyTorch) classifies sentiment: risk-on / risk-off / neutral
   - A weighted formula scores importance (source credibility, entity count, recency)
4. **Persistence** — the enriched event is inserted into `events`.
5. **LLM classification** (`analysislib/classify_events.py`) — Gemini classifies the event into an **existing** theme from a closed list, or creates a new one only if nothing fits. This prevents synonym fragmentation (e.g. "US Inflation" vs "American Inflation Pressure").
6. **Heat scoring** (`analysislib/sync_themes.py`) — recomputes each theme's heat score (avg importance × avg recency × event-volume saturation, 0–100).
7. **Sentiment breakdown** *(planned)* — per theme, the % of linked events that are risk-on / risk-off / neutral, surfaced on the theme's page so FinBERT's output is a visible feature, not just a per-event tag.

Surfaces as: the News Feed, the Trending Themes heat grid, and the Theme Tracker (timeline + LLM-generated narrative analysis + cross-asset implication chains + sentiment breakdown).

## Lane 2 — Vitals (fixed) *(planned — currently still live-query-per-request, see TODO.md)*

A small, hardcoded set of indicators, refreshed once a day — always the same metrics, just updated values, not a search tool:

- **Macro (FRED):** Real GDP, Unemployment Rate, Headline CPI, Fed Funds Rate, 10Y Treasury Yield
- **Market (Alpha Vantage):** SPY, QQQ, DIA

The scheduled job fetches these and stores the latest snapshot in Supabase. The Flask API reads that snapshot — it does not call FRED/Alpha Vantage at request time.

## Automation *(planned)*

One GitHub Actions scheduled (cron) workflow, running daily, independent of any developer's machine:
- Runs the news pipeline (scrape → enrich → classify)
- Runs the vitals fetch script
- Writes everything to Supabase
- Caches the spaCy/FinBERT model downloads between runs (`actions/cache`) so it isn't re-downloading every run

**Keeping the runner lean:** the enrichment stack is inference-only on a CPU runner, so install the **CPU-only torch wheel** (`torch==2.10.0+cpu`, ~200 MB) — not the default CUDA build (~2.5 GB). Real recurring footprint is ~650 MB: CPU torch (~200 MB) + FinBERT weights (~440 MB) + `en_core_web_sm` (~12 MB). Cache the pip wheel cache **and** the HuggingFace model dir (`~/.cache/huggingface`) so steady-state runs restore in seconds and download nothing. The pipeline must run on **Python 3.12** (3.14 breaks spaCy's import — see TODO.md), so pin the runner's `actions/setup-python` to 3.12. If even that feels heavy, the cron frequency is a free knob — weekly is plenty for macro themes.

## Serving

- **Flask API** (`backend/src/main.py`, deployed to Vercel) — reads from Supabase; the only external calls it ever makes are lazy, cached (7-day staleness window) Gemini calls for the two on-demand LLM features: theme analysis and cross-asset implication chains. Never touches FRED, Alpha Vantage, GDELT, spaCy, or FinBERT at request time.
- **Next.js frontend** (`frontend/app/`) — pure display. No search boxes, no on-demand query UI.

## Related docs

- `TODO.md` — live, phased punch list (what's built vs not, in order)
- `CLAUDE.md` — guidance for AI coding assistants working on this repo, including the architecture constraint above
- `Documentation.md` — detailed technical reference (table schemas, function signatures, API contracts)
- `ABOUT.md` — project pitch/positioning

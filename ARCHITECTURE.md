# Architecture

DMacro works like a news site or a weather forecast: visitors only ever **view** pre-computed data. There is no search box, no filters, no way to trigger fresh data on demand. Everything a visitor sees is populated ahead of time by a scheduled job — never by a visitor's own request.

## The one governing rule

No user-facing request ever triggers a live call to FRED, Alpha Vantage, GDELT, or Gemini. All external data fetching happens inside one scheduled job, server-side. The live web app only ever reads from Supabase.

## System overview

```
                         ┌─────────────────────────────┐
                         │  GitHub Actions daily cron    │
                         │  (daily-pipeline.yml, 07:00 UTC)│
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
          writes to Supabase (events, themes, event_theme_map)     writes to Supabase (vitals)
                │                                                  │
                └────────────────────────┬─────────────────────────┘
                                         │
                                 ┌───────▼────────┐
                                 │  Flask API       │   reads only, never calls
                                 │  (main.py)       │   FRED/Alpha Vantage/GDELT
                                 └───────┬────────┘   per request
                                         │
                                 ┌───────▼────────┐
                                 │  Next.js frontend│   pure display, no
                                 │                  │   search/filter UI
                                 └──────────────────┘
```

## Lane 1 — News (dynamic)

The differentiator: turns unstructured news text into structured, deduplicated, persistent "themes" instead of a feed of one-off headlines.

1. **Discovery + scraping** — GDELT indexes candidate article URLs; a Scrapy spider (`webcrawlerlib/spiders/gdelt_spider.py`) visits each and scrapes the full text.
2. **Raw storage** — scraped articles are uploaded to Supabase Storage and tracked in `raw_ingestions` (marked unprocessed). Articles are deduped by URL, so repeat crawls of the same article are skipped.
3. **Enrichment** (`dataprocesslib/pipeline.py`) — for each unprocessed article:
   - spaCy (`en_core_web_sm`) extracts entities: tickers and countries mentioned
   - FinBERT (PyTorch) classifies sentiment: risk-on / risk-off / neutral
   - A weighted formula scores importance (source credibility, entity count, recency)
4. **Persistence** — the enriched event is inserted into `events`.
5. **LLM classification** (`analysislib/classify_events.py`) — Gemini classifies the event into an **existing** theme from a closed list, or creates a new one only if nothing fits. This is the only place themes get created or grouped, which prevents synonym fragmentation (e.g. "US Inflation" vs "American Inflation Pressure").
6. **Heat scoring** (`analysislib/sync_themes.py`) — for each theme produced in step 5, recomputes its heat score (avg importance × avg recency × event-volume saturation, 0–100) from its linked events.
7. **Sentiment breakdown** — per theme, the % of linked events that are risk-on / risk-off / neutral, surfaced on the theme's page.

Surfaces as: the News Feed, the Trending Themes heat grid, and the Theme Tracker (timeline + LLM-generated narrative analysis + cross-asset implication chains + sentiment breakdown).

## Lane 2 — Vitals (fixed)

A small, hardcoded set of indicators, refreshed once a day — always the same metrics, just updated values, not a search tool:

- **Macro (FRED):** Real GDP, Headline CPI, Unemployment Rate, Fed Funds Rate, 10Y Treasury Yield, 10Y-2Y Curve Spread, High-Yield Credit Spread, WTI Crude Oil
- **Market (Alpha Vantage):** SPY, QQQ, DIA, IWM, TLT, GLD, USO, UUP

`get_vitals_snapshot.py` fetches these and upserts the latest snapshot into the `vitals` table. The Flask API (`GET /api/vitals/<macro|market>`) reads that snapshot — it never calls FRED/Alpha Vantage at request time.

## Automation

One GitHub Actions scheduled workflow (`.github/workflows/daily-pipeline.yml`), running daily at 07:00 UTC, independent of any developer's machine:
- `vitals-snapshot` job runs `get_vitals_snapshot.py`
- `news-pipeline` job runs the news pipeline (scrape → enrich → classify) then `sync_themes.py`
- Both write to Supabase using repo secrets for API keys

The enrichment stack is inference-only on a CPU runner, so the workflow installs the **CPU-only torch wheel** (`torch==2.10.0+cpu`) rather than the default CUDA build. It caches the pip wheel cache and the HuggingFace model dir (`~/.cache/huggingface`) so steady-state runs restore FinBERT's weights in seconds instead of re-downloading. The pipeline runs on **Python 3.12** (3.14 breaks spaCy's import).

## Serving

- **Flask API** (`backend/src/main.py`, deployed to Vercel at `dmacro-backend.vercel.app`) — reads from Supabase; the only external calls it ever makes are lazy, cached (7-day staleness window) Gemini calls for two on-demand LLM features: theme analysis and cross-asset implication chains. Never touches FRED, Alpha Vantage, GDELT, spaCy, or FinBERT at request time. `/api/classify-events` (manual backfill trigger) is gated behind a shared-secret header.
- **Next.js frontend** (`frontend/app/`, deployed to Vercel at `dmacro-frontend.vercel.app`) — pure display. No search boxes, no on-demand query UI.

## Related docs

- `CLAUDE.md` — guidance for AI coding assistants working on this repo, including the architecture constraint above
- `Documentation.md` — detailed technical reference (table schemas, function signatures, API contracts)
- `ABOUT.md` — project pitch/positioning

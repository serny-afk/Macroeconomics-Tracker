# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DMacro turns financial news and macro/market data into a structured, persistent set of trackable "themes" instead of a feed of one-off headlines: news is enriched with NLP, classified by an LLM into an existing theme or a new one (so topics stay identified consistently over time instead of fragmenting into near-duplicates), scored with a heat score, and served through a Flask API to a Next.js dashboard.

The point isn't to out-answer a chatbot on "what's happening right now" — it's maintaining structured, deduplicated, time-aware state extracted from unstructured text, with the LLM used narrowly (classification, narrative generation) rather than as the whole product. News ingestion/enrichment run as a batch job, not a live service.

It's a repurposed hackathon project — large parts of the original scope (chatbot, notifications, portfolio risk alerts) were hardcoded UI mockups with no backend and have been removed. Only features with a real, reachable implementation remain. When extending this project, don't reintroduce placeholder/mock UI for unbuilt features — either wire it through end to end or leave it out.

## Commands

### Frontend (`frontend/`)

```bash
npm run dev          # dev server (webpack)
npm run dev:turbo    # dev server (turbopack)
npm run build        # production build (also type-checks)
npm run lint         # eslint
```

There is no frontend test runner configured.

### Backend (`backend/src/`)

```bash
python main.py                                  # run Flask API on :8000 (debug mode)
python -m analysislib.sync_themes                # recompute + upsert theme heat scores from events table
python -m analysislib.test                       # seed fake themes into DB for frontend demo (via run_analysis)
python seed_test_events.py                       # insert 10 diverse macro events for classification testing
python analysislib/test_connection.py            # DB connectivity smoke test
```

There is no pytest suite — `test.py`, `test_connection.py`, `test_db.py` are standalone scripts run directly with `python`, not collected by a test runner.

Three separate requirement files, by how much you need to run:
- `backend/src/requirements.txt` — what's actually deployed (Flask API only: Supabase, Gemini, FRED/Alpha Vantage HTTP calls). No NLP deps.
- `requirements.txt` (repo root) — adds Scrapy/web-crawling deps for running the ingestion spider.
- `admin_requirements.txt` — adds spaCy (`en_core_web_trf`), FinBERT/transformers, torch — needed only to run the enrichment pipeline (`dataprocesslib/`) locally.

The enrichment pipeline is intentionally never deployed with the API — it's meant to be run offline/batch, with results pushed into Supabase.

## Environment variables

Backend (`backend/.env` or `backend/src/.env`, loaded via `python-dotenv`):
- `SUPABASE_URL`, `SUPABASE_KEY`
- `GEMINI_API_KEY` — theme classification, theme analysis, implication chains, embeddings
- `FRED_API_KEY`, `ALPHA_VANTAGE_API_KEY`
- `FRONT_END_URL` — used for Flask-CORS origin allowlist

Frontend (`frontend/.env.local`):
- `NEXT_PUBLIC_BACKEND_BASE_URL` — base URL the browser calls directly
- `BACKEND_BASE_URL` — used server-side in `next.config.ts` to rewrite `/api/:path*` to the Flask backend

## Architecture

### Data flow (offline → online)

1. **Ingestion** (`backend/src/webcrawlerlib/`, `datalib/datalib.py`) — a Scrapy spider (`gdelt_spider.py`) discovers articles via the GDELT API and scrapes them; `datalib.py` also pulls FRED macro series and Alpha Vantage market data directly (no DB involved for these — served live on request).
2. **Raw storage** — scraped articles are uploaded to Supabase Storage (`raw-payloads` bucket) and tracked in the `raw_ingestions` table via `db.ingest_raw_article()`, marked `processed: false`.
3. **Enrichment** (`backend/src/dataprocesslib/pipeline.py`) — pulls unprocessed raw articles, runs NER (spaCy, ticker/country extraction), sentiment (FinBERT), and importance scoring, producing a normalized event record. This step requires the heavy ML deps (`admin_requirements.txt`) and is run offline, not inside the deployed API.
4. **Persistence + auto-classification** — `db.insert_event()` writes the enriched event to the `events` table, then fire-and-forgets `classify_and_link_event()` (`analysislib/classify_events.py`), which asks Gemini to classify the event into an **existing** theme from a closed list, or create a new one if nothing fits. This dedup-by-closed-list design is deliberate — it prevents synonym fragmentation (e.g. "US Inflation" vs "American Inflation Pressure").
5. **Theme heat** — `analysislib/sync_themes.py` is a separate, independently-run job: it re-groups recent events by topic (`logic/macro_themes.py`, pure heuristic — not the same grouping as step 4's LLM classification) and recomputes heat scores (`logic/heat_score.py`: avg importance × avg recency × event-volume saturation, 0–100) before upserting into `themes`.
6. **Serving** — `backend/src/main.py` (Flask) is the only thing actually deployed as the live API. It reads from Supabase and proxies FRED/Alpha Vantage, and lazily calls Gemini per-theme for the two cached, on-demand LLM features: theme analysis (`/api/themes/<id>/analysis`) and cross-asset implication chains (`/api/themes/<id>/chains`), both cached in their own tables with a 7-day staleness window (`force=true` to bypass).

Note: step 4 (Gemini closed-list classification) and step 5 (`sync_themes.py`'s heuristic grouping) are two independent, non-interacting paths to grouping events into themes — both write to the same `themes`/`event_theme_map` tables. Be aware of this when touching theme logic; they don't call each other.

### Database (`backend/src/databaselib/schema.sql`, `db.py`)

All access goes through `db.py` — no other module talks to Supabase directly except the webcrawler pipelines. Core tables: `events`, `themes`, `event_theme_map` (many-to-many), `raw_ingestions`, `memory` (pgvector, for future RAG use — not currently wired to any live retrieval feature), `theme_analyses` and `implication_chains` (LLM-output caches, keyed by `theme_id`).

### Frontend (`frontend/app/`)

Single-page dashboard (`app/page.tsx`) composing independent panels (stock market, macro indicators, news feed, theme heat grid) each with their own fetch/loading/error state — there's no shared data layer or state management library. `app/timeline/[themeId]/page.tsx` is the per-theme drill-down (events timeline + AI analysis + implication chains); `app/event/[eventId]/page.tsx` renders a single article. Market/macro chart selections are cached to `localStorage` (`nfc.marketCards.v1`, `nfc.macroCards.v1`) so panels survive a refresh.

In production, the frontend calls the backend in two different ways depending on context: client-side `fetch` calls use `NEXT_PUBLIC_BACKEND_BASE_URL` directly, while `next.config.ts` separately rewrites `/api/:path*` using `BACKEND_BASE_URL` — keep both in sync when changing the backend URL.

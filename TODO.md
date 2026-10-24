# TODO

Punch list toward a resume-worthy version of this project, split into phases.

## Target architecture (for context on the items below)

The site works like a news site or weather forecast: visitors only ever **view** pre-computed data. No search box, no dropdowns, no on-demand queries. All external calls (FRED, Alpha Vantage, GDELT scraping, Gemini) happen on a schedule, server-side, never triggered by a visitor's request.

Two lanes feed it:
- **News (dynamic)** — scrape → NLP (spaCy/FinBERT) enrich → Gemini classifies into persistent themes → heat score → Theme Tracker. Themes emerge/fade on their own as news actually changes.
- **Vitals (fixed)** — a small hardcoded set of macro indicators and tickers, refreshed once a day, always shown the same way (like a dashboard gauge, not a search tool):
  - Macro (FRED): Real GDP, Unemployment Rate, Headline CPI, Fed Funds Rate, 10Y Treasury Yield
  - Market (Alpha Vantage): SPY, QQQ, DIA

Both lanes are populated by one scheduled job (GitHub Actions cron), not the live web server and not your laptop.

## Phase 1 — MVP

**Bug fixes (do first, small)**
- [ ] Fix relative-path bug in `backend/src/dataprocesslib/processors/ticker_loader.py` (`CACHE_FILE = "ticker_cache.json"` is relative to cwd)
- [ ] Fix arg-count bug in `backend/src/dataprocesslib/pipeline.py`'s `process_batch()` (calls `process_article(raw)`, needs `process_article(raw, storage_path)`)

**News lane — prove it works**
- [ ] Install `admin_requirements.txt` (spaCy `en_core_web_trf`, FinBERT, torch) locally
- [ ] Run `backend/src/get_actual_events.py` end-to-end against real scraped news (not the fake seeder)
- [ ] Judge real data volume / tune GDELT query terms if too thin

**Vitals lane — replace live queries with a fixed, pre-computed set**
- [ ] Add a Supabase table for the latest macro/market vitals snapshot
- [ ] Write a script (sibling to `get_actual_events.py`) that fetches the fixed FRED + Alpha Vantage list and upserts the snapshot
- [ ] Rewrite `main.py`'s `/api/macroeconomic/*` and `/api/market/*` endpoints to read the stored snapshot instead of calling FRED/Alpha Vantage live per-request
- [ ] Remove the now-dead endpoints that only existed to power search UI (`/api/macroeconomic/categories`, `/api/macroeconomic/indicators`, `/api/market/symbol-search`) once nothing calls them
- [ ] Simplify the frontend: remove symbol search, category/indicator/date dropdowns, and Search buttons from the Macro/Market panels; replace with a fixed vitals display reading from the new endpoints (this also removes the stale "USA only" TODO annotation, since the country/category picker goes away entirely)

**Automation**
- [ ] GitHub Actions scheduled workflow (daily) that runs both the news pipeline and the vitals fetch script, writing to Supabase
- [ ] Cache the spaCy/FinBERT model downloads between runs (`actions/cache`) so it doesn't redownload ~1-2GB every day
- [ ] Store API keys as GitHub Actions repo secrets

**Sanity check**
- [ ] Confirm no user-facing request path triggers a live call to FRED, Alpha Vantage, GDELT, or Gemini — everything a visitor sees should come from Supabase only

## Phase 2 — SWE plumbing

- [ ] Add an actual automated test suite (currently zero — `test.py`/`test_connection.py`/`test_db.py` are standalone scripts, not pytest)
- [ ] CI (lint/build/typecheck on push)
- [ ] Error-handling/logging polish pass

## Phase 3 — Ship it

- [ ] Deploy frontend + backend to Vercel (`backend/vercel.json` already configured for the lightweight API)
- [ ] Set production env vars on both Vercel projects, update `FRONT_END_URL` for CORS to the real deployed frontend origin
- [ ] Update `ABOUT.md`/`README.md` with the real deployed link
- [ ] Add screenshots/demo GIF to the README

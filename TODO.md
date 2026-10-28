# TODO

Punch list toward a resume-worthy version of this project, split into phases.

> **⏯️ Where we left off (last session, 2026-10-28):** Vitals lane is **done and verified end-to-end**. Built new `vitals` table (schema in `databaselib/schema.sql`), `db.py` `get_vitals`/`upsert_vital` helpers, `backend/src/get_vitals_snapshot.py` (fetches a fixed set of 8 FRED indicators + 8 Alpha Vantage ETF symbols, upserts into `vitals`), `main.py`'s live `/api/macroeconomic/*` and `/api/market/*` endpoints (9 total) replaced with a single `GET /api/vitals/<macro|market>` that only reads from Supabase, and `frontend/app/page.tsx` simplified — removed symbol search/autocomplete, category/indicator dropdowns, date pickers, and Search buttons; both panels now just fetch-and-render the fixed snapshot on mount. Table created in Supabase, snapshot script run successfully (16/16 rows). Caught and fixed a real bug: the script was calling FRED with `sort_order="asc"` + `limit=60` and no date range, which returns the **oldest** 60 observations from the start of each series (e.g. 1960s GDP) instead of the most recent 60 — fixed to `sort_order="desc"` + reverse. Verified via Playwright against the real running dashboard: both panels render all 16 cards with correct values/change-percent/sparklines, zero leftover search UI.
>
> **Next action:** start the Automation phase (GitHub Actions daily cron for both the news pipeline and `get_vitals_snapshot.py`) — see Phase 1 Automation checklist below.
>
> **Deferred / not done:** (1) delete the dead Gemini-embeddings code (`databaselib/embeddings.py` + its only caller `test_db.py`; the `memory` table + `insert_memory`/`search_memory` in `db.py` become orphaned after). (2) Ticker loader only loads S&P 500 (503 tickers) — NASDAQ-100 + Dow Jones Wikipedia tables fail to parse (stale table index/column names in `ticker_loader._fetch_tickers`). Non-fatal. (3) Theme pages have 3 separate LLM widgets (analysis + implication chains + planned sentiment breakdown) — consider trimming to one "AI insight" so it doesn't read as feature bloat. (4) Pin `gemini-3.1-flash-lite-preview` → a stable model id before deploy (hardcoded in `classify_events.py` + `main.py`). (5) Judge real news-lane data volume / tune GDELT query terms if too thin (deferred from the news lane work).

**Scope philosophy:** solid, correct, working software for a CS student / junior SWE portfolio — clean code, real tests, clear docs, a working deployed demo. Not infra/DevOps complexity: no CI/CD pipelines, caching layers, AWS, or microservices. (The GitHub Actions item below is an exception — it's the product's actual data-refresh mechanism, not a build/test pipeline.)

## Target architecture

See `ARCHITECTURE.md` for the full system design (two lanes, automation, serving). This file is just the punch list.

## Phase 1 — MVP

**Bug fixes (done)**
- [x] Fix relative-path bug in `backend/src/dataprocesslib/processors/ticker_loader.py` (`CACHE_FILE` now resolves relative to the module, not cwd)
- [x] Fix arg-count bug in `backend/src/dataprocesslib/pipeline.py`'s `process_batch()` (now passes a derived `storage_path` per article)
- [x] Fix Windows-console crash in `ticker_loader.py` (`_save_cache` printed a `→` char that cp1252 can't encode → `UnicodeEncodeError`; now ASCII `->`)
- [x] Fix operator-precedence bug in `pipeline.py`'s `_derive_asset_classes` (`(title or "" + ...)` silently discarded the article body, so asset classes were derived from the title alone; now `((title or "") + " " + (text or ""))`)

**News lane — prove it works**
- [x] Install `admin_requirements.txt` (spaCy `en_core_web_sm` — swapped from `en_core_web_trf`, which fails to build on Python 3.14/Windows; FinBERT, torch) locally
- [x] **Resolve Python-version blocker:** spaCy won't even *import* on Python 3.14 (`confection`/`pydantic.v1` incompatible — `ConfigError` at import). The `trf`→`sm` swap fixed the model *build*, not this. Fix: the enrichment pipeline now runs in a dedicated **Python 3.12** venv at `backend/src/.venv-admin` (the existing 3.14 `.venv` stays for the lightweight Flask API). Installed torch **CPU build** (`2.10.0+cpu`), FinBERT, spaCy there.
- [x] Prove the enrichment lane works offline — ran `process_article()` on a sample article in the 3.12 venv: FinBERT sentiment, spaCy NER (region/entities), importance score, and asset-class tagging all produce correct output.
- [x] Run `backend/src/get_actual_events.py` end-to-end against real scraped news (not the fake seeder) — **DONE 2026-10-27:** 10/10 events written to Supabase, FinBERT/spaCy/importance all populated, Gemini classification created 2 new real themes. Fixed the fragile `maxrecords=1`/`timespan=1day` that caused an earlier empty run.
- [ ] Judge real data volume / tune GDELT query terms if too thin
- [ ] Add theme-level sentiment breakdown (% risk-on/risk-off/neutral across a theme's linked events), surfaced on the theme page — makes FinBERT's output a visible feature instead of just a per-event tag

**Vitals lane — replace live queries with a fixed, pre-computed set (done)**
- [x] Add a Supabase table for the latest macro/market vitals snapshot (`vitals` table, created and populated)
- [x] Write a script (sibling to `get_actual_events.py`) that fetches the fixed FRED + Alpha Vantage list and upserts the snapshot (`backend/src/get_vitals_snapshot.py` — 8 FRED indicators, 8 Alpha Vantage ETF symbols)
- [x] Rewrite `main.py`'s `/api/macroeconomic/*` and `/api/market/*` endpoints to read the stored snapshot instead of calling FRED/Alpha Vantage live per-request (now a single `GET /api/vitals/<macro|market>`)
- [x] Remove the now-dead endpoints that only existed to power search UI (`/api/macroeconomic/categories`, `/api/macroeconomic/indicators`, `/api/market/symbol-search`) once nothing calls them
- [x] Simplify the frontend: remove symbol search, category/indicator/date dropdowns, and Search buttons from the Macro/Market panels; replace with a fixed vitals display reading from the new endpoints (this also removes the stale "USA only" TODO annotation, since the country/category picker goes away entirely)
- [x] Run the `vitals` table SQL in Supabase, run `get_vitals_snapshot.py` once, and verify the dashboard renders real data end to end — **DONE 2026-10-28**, including fixing a FRED `sort_order` bug that returned decades-old data

**Automation**
- [ ] GitHub Actions scheduled workflow (daily) that runs both the news pipeline and the vitals fetch script, writing to Supabase
- [ ] Cache the spaCy/FinBERT model downloads between runs (`actions/cache`) so it doesn't redownload ~1-2GB every day
- [ ] Store API keys as GitHub Actions repo secrets

**Sanity check**
- [ ] Confirm no user-facing request path triggers a live call to FRED, Alpha Vantage, GDELT, or Gemini — everything a visitor sees should come from Supabase only

## Phase 2 — SWE plumbing

- [ ] Add an actual automated test suite (currently zero — `test.py`/`test_connection.py`/`test_db.py` are standalone scripts, not pytest)
- [ ] Error-handling/logging polish pass
- [ ] Lock down `/api/classify-events` (POST) — it's publicly callable right now and burns Gemini quota on every hit; add a simple shared-secret header check since only the scheduled job should call it

## Phase 3 — Ship it

- [ ] Deploy frontend + backend to Vercel (`backend/vercel.json` already configured for the lightweight API)
- [ ] Set production env vars on both Vercel projects, update `FRONT_END_URL` for CORS to the real deployed frontend origin
- [ ] Update `ABOUT.md`/`README.md` with the real deployed link
- [ ] Add screenshots/demo GIF to the README
- [ ] Add a LICENSE file

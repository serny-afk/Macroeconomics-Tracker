# About

Project title: DMacro

## Project Description

DMacro works like a news site or a weather forecast, not a query tool: visitors only ever view pre-computed data — there's no search box, no filters, no way to request fresh data on demand. Everything on the page is populated on a schedule by a backend job, independent of any visitor's request.

Two lanes feed it:

- **News (dynamic)** — scraped articles are enriched with NLP (entity extraction, sentiment) and classified by an LLM into an existing theme or a new one, so the same topic (e.g. "Fed Rate Policy") stays identified consistently over time instead of fragmenting into near-duplicates. Each theme carries a heat score and a timeline of linked events, so you can see whether a topic is accelerating or cooling off — something a one-off LLM query can't do, since it has no memory of what it answered last time.
- **Vitals (fixed)** — a small, hardcoded set of macro indicators (GDP, unemployment, CPI, Fed funds rate, 10Y Treasury yield) and tickers (SPY, QQQ, DIA), refreshed once a day. Always the same metrics, just updated values — not a search tool.

The point of this project is not to out-answer a chatbot on "what's happening right now" — it's to demonstrate the engineering behind maintaining structured, deduplicated, time-aware state extracted from unstructured text, with the LLM used narrowly (classification, narrative generation) rather than as the whole product.

**Status:** the architecture above is the target design. The Vitals lane and the scheduled automation are mid-migration from an earlier live-query-per-request model — see `TODO.md` for current progress.

### Features

News Feed

- Displays articles based on recency and importance scores

Trending Themes

- Heatmap of the top active macro themes ranked by heat score

Theme Tracker

- Displays notable events related to a theme on a timeline
- AI-generated analysis of recent developments, sentiment trajectory, and market implications for a theme
- Cross-Asset Implications showing how events in a theme might affect other sectors/assets

Macro Indicators

- A fixed set of key macro indicators (GDP, unemployment, CPI, Fed funds rate, 10Y Treasury yield), refreshed on a schedule rather than searched/filtered by the visitor

Stock Market Data

- A fixed set of index tickers (SPY, QQQ, DIA), refreshed on a schedule rather than searched by the visitor

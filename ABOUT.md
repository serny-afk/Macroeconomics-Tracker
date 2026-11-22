# About

Project title: DMacro

Live: [dmacro-frontend.vercel.app](https://dmacro-frontend.vercel.app)

## Project Description

DMacro works like a news site or a weather forecast, not a query tool: visitors only ever view pre-computed data — there's no search box, no filters, no way to request fresh data on demand. Everything on the page is populated on a schedule by a backend job, independent of any visitor's request.

Two lanes feed it:

- **News (dynamic)** — scraped articles are enriched with NLP (entity extraction, sentiment) and classified by an LLM into an existing theme or a new one, so the same topic (e.g. "Fed Rate Policy") stays identified consistently over time instead of fragmenting into near-duplicates. Each theme carries a heat score and a timeline of linked events, so you can see whether a topic is accelerating or cooling off — something a one-off LLM query can't do, since it has no memory of what it answered last time.
- **Vitals (fixed)** — a small, hardcoded set of macro indicators (GDP, CPI, unemployment, Fed funds rate, Treasury yields, credit spreads, crude oil) and tickers (SPY, QQQ, DIA, IWM, TLT, GLD, USO, UUP), refreshed once a day. Always the same metrics, just updated values — not a search tool.

Both lanes are refreshed by one daily GitHub Actions cron job; the live site never calls an external API on a visitor's request.

The point of this project is not to out-answer a chatbot on "what's happening right now" — it's to demonstrate the engineering behind maintaining structured, deduplicated, time-aware state extracted from unstructured text, with the LLM used narrowly (classification, narrative generation) rather than as the whole product.

### Features

News Feed

- Displays articles based on recency and importance scores

Trending Themes

- Heatmap of the top active macro themes ranked by heat score

Theme Tracker

- Displays notable events related to a theme on a timeline
- Risk-on/risk-off/neutral sentiment breakdown across a theme's linked events
- AI-generated analysis of recent developments, sentiment trajectory, and market implications for a theme
- Cross-Asset Implications showing how events in a theme might affect other sectors/assets

Macro Indicators

- A fixed set of key macro indicators (GDP, CPI, unemployment, Fed funds rate, Treasury yields, credit spreads, crude oil), refreshed on a schedule rather than searched/filtered by the visitor

Stock Market Data

- A fixed set of index and asset-class ETFs (SPY, QQQ, DIA, IWM, TLT, GLD, USO, UUP), refreshed on a schedule rather than searched by the visitor

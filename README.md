# DMacro

**Live:** [dmacro-frontend.vercel.app](https://dmacro-frontend.vercel.app)

DMacro turns financial news into structured, persistent "themes" instead of a feed of one-off headlines. News gets enriched with NLP, classified by an LLM into an existing theme or a new one, scored by how active it is, and tracked over time — so a topic like "Fed Rate Policy" stays identified consistently instead of fragmenting into near-duplicates every time a new article shows up.

It's built to work like a news site or a weather forecast, not a query tool: everything a visitor sees is pre-computed on a daily schedule by a GitHub Actions cron job. There's no search box, no live external API calls triggered by a visitor's request — just pre-computed state, refreshed once a day.

## Features

- **News Feed** — recent articles ranked by a recency + importance score
- **Trending Themes** — a heat-scored grid of the most active macro topics
- **Theme Tracker** — a theme's full event timeline, sentiment breakdown (risk-on / risk-off / neutral), AI-generated narrative analysis, and cross-asset implication chains
- **Macro & Market Vitals** — a fixed set of FRED indicators (GDP, CPI, unemployment, Fed funds rate, Treasury yields, credit spreads, crude oil) and market ETFs (SPY, QQQ, DIA, IWM, TLT, GLD, USO, UUP), refreshed daily

## How it works

1. A Scrapy spider discovers and scrapes articles via the GDELT API
2. Each article is enriched: spaCy pulls entities, FinBERT scores sentiment, a weighted formula scores importance
3. Gemini classifies the enriched event into an **existing** theme or creates a new one — a closed-list design that keeps the same topic from fragmenting into synonymous near-duplicate themes
4. A separate job recomputes each theme's heat score from its linked events
5. The Flask API only ever reads from Supabase to serve requests — it never calls FRED, Alpha Vantage, GDELT, or Gemini on a visitor's request (the two exceptions are theme analysis and implication chains, both cached for 7 days and only triggered by opening a theme's page, never by the dashboard itself)

For the full system design see `ARCHITECTURE.md`; for table schemas and API contracts see `Documentation.md`; for the project pitch/positioning see `ABOUT.md`.

## Tech Stack

### Frontend

- Next.js
- React
- Node.js + npm

### Backend

- Python
- Flask

### Data Ingestion

- FRED API (macroeconomic indicators)
- GDELT API (news discovery for crawling)
- Alpha Vantage (stock market data)

### NLP / AI

- spaCy (`en_core_web_sm`) for entity extraction
- FinBERT (`ProsusAI/finbert`) for sentiment classification
- Gemini (`gemini-3.1-flash-lite-preview`) for event-to-theme classification and theme analysis/implication-chain generation

### Storage

- Supabase Postgres (structured data)
- pgvector (schema present, not wired to a live feature yet)
- Supabase Storage (raw payload archive)

### Automation

- GitHub Actions — scheduled daily job for news ingestion and the macro/market vitals refresh, so no external API is ever called by a visitor's request

### Deployment

- Vercel

### Developer Tools

- Git + GitHub

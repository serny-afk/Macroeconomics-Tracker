# About

Project title: DMacro

## Project Description

DMacro turns financial news and macro/market data into a structured, persistent set of trackable "themes" instead of a feed of one-off headlines. News articles are enriched with NLP (entity extraction, sentiment) and classified by an LLM into an existing theme or a new one, so the same topic (e.g. "Fed Rate Policy") stays identified consistently over time instead of fragmenting into near-duplicates. Each theme carries a heat score and a timeline of linked events, so you can see whether a topic is accelerating or cooling off — something a one-off LLM query can't do, since it has no memory of what it answered last time.

The point of this project is not to out-answer a chatbot on "what's happening right now" — it's to demonstrate the engineering behind maintaining structured, deduplicated, time-aware state extracted from unstructured text, with the LLM used narrowly (classification, narrative generation) rather than as the whole product.

News ingestion and enrichment run as a batch job, not a live service — the dashboard is only as current as the last time the pipeline was run.

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

- Charts for FRED macroeconomic series (growth, inflation, labor, rates, credit, housing, etc.), filterable by category/indicator/date range

Stock Market Data

- Charts for daily/weekly/monthly price series from Alpha Vantage, with symbol search

# README

Live: [dmacro-frontend.vercel.app](https://dmacro-frontend.vercel.app)

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

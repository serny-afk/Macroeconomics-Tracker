"""
pipeline.py
───────────
Transforms raw article JSON into the unified event schema for DB insert.

Input shape:
    {title, language, sourcecountry, source, url, published_at,
     author, text, tone, fetch_error}

Output shape:
    {event_id, event_type, source, published_at, region, asset_classes,
     content, importance_score, entities, topic, sentiment,
     raw_payload_ref, created_at}

Dependencies:
    finbert.py, ner.py, importance.py, ticker_loader.py

Usage:
    from pipeline import process_article, process_batch
"""

import uuid
import json
from datetime import datetime, timezone

from .processors.sentiments import predict_one
from .processors.extractor import extract_entities
from .processors.importance import score_importance


# ── Region mapping ────────────────────────────────────────────────────────────
# Maps sourcecountry → standardised region tag
COUNTRY_TO_REGION = {
    "United States": "US",
    "Canada":        "US",   # North America grouped with US for now
    "United Kingdom":"EU",   # adjust if you want UK separate post-Brexit
    "Germany":       "EU",
    "France":        "EU",
    "Italy":         "EU",
    "Spain":         "EU",
    "Netherlands":   "EU",
    "Belgium":       "EU",
    "Switzerland":   "EU",
    "Japan":         "APAC",
    "China":         "APAC",
    "Hong Kong":     "APAC",
    "Singapore":     "APAC",
    "South Korea":   "APAC",
    "Australia":     "APAC",
    "India":         "APAC",
    "Brazil":        "LATAM",
    "Mexico":        "LATAM",
    "Argentina":     "LATAM",
}
DEFAULT_REGION = "GLOBAL"


# ── Asset class keyword map ───────────────────────────────────────────────────
# Each asset class maps to keywords that signal its relevance
ASSET_CLASS_KEYWORDS = {
    "equities":     ["stock", "stocks", "equity", "shares", "dow", "s&p", "nasdaq",
                     "earnings", "ipo", "dividend", "index", "rally", "selloff"],
    "bonds":        ["bond", "bonds", "treasury", "yield", "yields", "fixed income",
                     "tlt", "debt", "credit", "coupon", "maturity", "spread"],
    "commodities":  ["oil", "gold", "silver", "copper", "gas", "commodity",
                     "commodities", "crude", "brent", "wti", "wheat", "corn"],
    "fx":           ["dollar", "euro", "yen", "currency", "forex", "fx",
                     "exchange rate", "usd", "eur", "gbp", "jpy", "cny"],
    "crypto":       ["bitcoin", "ethereum", "crypto", "cryptocurrency",
                     "blockchain", "btc", "eth", "defi", "token"],
    "real_estate":  ["reit", "real estate", "property", "housing", "mortgage",
                     "home prices", "commercial real estate"],
}


# ── Helpers ───────────────────────────────────────────────────────────────────
def _derive_region(sourcecountry: str) -> str:
    if not sourcecountry:
        return DEFAULT_REGION
    return COUNTRY_TO_REGION.get(sourcecountry, DEFAULT_REGION)


def _derive_asset_classes(title: str, text: str) -> list[str]:
    """Keyword match across title + text to find relevant asset classes."""
    combined = ((title or "") + " " + (text or "")).lower()
    return [
        asset for asset, keywords in ASSET_CLASS_KEYWORDS.items()
        if any(kw in combined for kw in keywords)
    ] or None  # return None if no match rather than empty list


def _clean_text(text: str) -> str | None:
    """Basic text cleaning — strip whitespace, return None if empty."""
    if not text or not text.strip():
        return None
    return text.strip()

# ── Single article ────────────────────────────────────────────────────────────
def process_article(raw: dict, storage_path: str) -> dict:
    """
    Transforms a single raw article dict into the unified event schema.
    Gracefully handles null fields — skips NLP if text/title are missing.
    """
    event_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()

    # ── Extract and clean content ─────────────────────────────────────────────
    title = raw.get("title")
    text = _clean_text(raw.get("text"))
    source = raw.get("source")
    content = text or title

    # ── NLP enrichment (only if content is available) ─────────────────────────
    if content:
        sentiment = predict_one(content)
        entities = extract_entities(content)
    else:
        sentiment = None
        entities = {"tickers": [], "countries": []}

    # ── Derive metadata ───────────────────────────────────────────────────────
    published_at = raw.get("published_at") or created_at
    region = _derive_region(raw.get("sourcecountry"))
    asset_classes = _derive_asset_classes(title, text)
    importance_score = score_importance(
        source=source or "",
        entities=entities,
        published_at=published_at,
    )

    # ── Build unified event ───────────────────────────────────────────────────
    return {
        "event_id": event_id,
        "event_type": "news",
        "source": source,
        "published_at": published_at,
        "region": region,
        "asset_classes": asset_classes,
        "content": content,
        "importance_score": importance_score,
        "entities": entities,
        "topic": None,  # reserved for topic classifier (Step 3)
        "sentiment": sentiment,
        "raw_payload_ref": storage_path,
        "created_at": created_at,
    }

# ── Batch ─────────────────────────────────────────────────────────────────────
def process_batch(articles: list[dict]) -> list[dict]:
    """
    Processes a list of raw articles into event schema dicts.
    Skips articles with fetch errors and logs them separately.
    """
    results = []
    skipped = []

    for raw in articles:
        # Skip articles that failed to fetch
        if raw.get("fetch_error"):
            skipped.append({
                "url":   raw.get("url"),
                "error": raw.get("fetch_error"),
                "title": raw.get("title"),   # title may still be useful
            })
            continue

        storage_path = raw.get("url") or f"local/{uuid.uuid4()}"
        results.append(process_article(raw, storage_path))

    print(f"[pipeline] Processed: {len(results)} | Skipped: {len(skipped)}")
    return results, skipped

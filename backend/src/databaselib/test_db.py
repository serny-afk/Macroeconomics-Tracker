import json
import uuid
from datetime import datetime, timezone

from .db import (
    Event,
    Theme,
    get_full_article,
    get_unprocessed,
    ingest_raw_article,
    insert_event,
    insert_memory,
    insert_theme,
    mark_processed,
    search_memory,
    supabase,
)
from .embeddings import embed_document, embed_query

# ── 0. Cleanup previous test data ────────────────────────────────────────────
# supabase.table("event_theme_map").delete().neq(
#     "id", "00000000-0000-0000-0000-000000000000"
# ).execute()
# supabase.table("memory").delete().neq(
#     "id", "00000000-0000-0000-0000-000000000000"
# ).execute()
# supabase.table("themes").delete().neq(
#     "theme_id", "00000000-0000-0000-0000-000000000000"
# ).execute()
# supabase.table("events").delete().neq(
#     "event_id", "00000000-0000-0000-0000-000000000000"
# ).execute()
# supabase.table("raw_ingestions").delete().neq(
#     "id", "00000000-0000-0000-0000-000000000000"
# ).execute()
# supabase.storage.empty_bucket("raw-payloads")

# print("✓ Cleaned up previous test data")

# ── 1. Upload a raw article to storage ───────────────────────────────────────

source = "reuters"
raw_payload = json.dumps(
    {
        "source": source,
        "published_at": "2026-03-04T10:00:00Z",
        "title": "US Inflation Surges to 4.2%",
        "full_text": "US inflation rose to 4.2% in March, exceeding expectations of 3.8%. The Federal Reserve is expected to respond with further rate hikes as price pressures remain elevated across energy and food categories.",
        "url": "https://reuters.com/example",
    }
)

ingest = ingest_raw_article(raw_payload, source)

print(f"✓ Uploaded raw article to storage, {ingest["storage_path"]}")

# ── 2. Get unprocessed articles and process ───────────────────────────────────────

unprocessed = get_unprocessed()

for ingestion in unprocessed:
    raw = supabase.storage.from_("raw-payloads").download(ingestion["storage_path"])
    payload = json.loads(raw)

    event_id = str(uuid.uuid4())
    event = insert_event(
        Event(
            event_id=event_id,
            raw_payload_ref=ingestion["storage_path"],
            source=ingestion["source"],
            event_type="economic_release",
            published_at="2026-03-04",
            region="US",
            asset_classes=["bonds", "equities"],
            content="US inflation rose to 4.2% in March, exceeding expectations of 3.8%.",
            importance_score=0.9,
            entities={"countries": ["US"]},
            topic="inflation",
            sentiment="risk-off",
        )
    )

    mark_processed(ingestion["id"], event_id)

# ── 3. Insert a test theme ────────────────────────────────────────────────────

theme = insert_theme(
    Theme(
        title="US Inflation Surge",
        description="Persistent above-target inflation in the US",
        status="active",
        heat_score=0.85,
        asset_classes=["bonds", "equities"],
        region="US"
    )
)

print(f"✓ Inserted theme: {theme['theme_id']}")

# ── 4. Link event to theme ────────────────────────────────────────────────────

supabase.table("event_theme_map").insert({
    "event_id": event["event_id"],
    "theme_id": theme["theme_id"]
}).execute()

print(f"✓ Linked event to theme")

# ── 5. Insert into memory store ───────────────────────────────────────────────

embedding = embed_document(event["content"])
memory = insert_memory(
    content=event["content"],
    embedding=embedding,
    content_type="article_chunk",
    metadata={
        "event_id": event["event_id"],
        "source": "reuters",
        "published_at": "2026-03-04",
        "region": "US",
        "topic": "inflation",
        "source_trust": 0.9
    }
)

print(f"✓ Inserted memory: {memory['id']}")

# ── 6. Search memory ──────────────────────────────────────────────────────────

query_embedding = embed_query("high inflation exceeding expectations")
results = search_memory(query_embedding, top_k=3)

print(f"\n✓ Search results for 'high inflation exceeding expectations':")
for r in results:
    print(f"  similarity: {r['similarity']:.4f} | {r['content'][:80]}")


# ── 7. Retrieve full article ──────────────────────────────────────────────────

article = get_full_article(event_id)

assert article is not None, "Article not found"
assert article["event"]["event_id"] == event_id
assert "full_text" in json.loads(article["raw_content"])

print(f"✓ Retrieved full article")
print(f"  title: {json.loads(article['raw_content'])['title']}")
print(f"  full_text: {json.loads(article['raw_content'])['full_text']}")

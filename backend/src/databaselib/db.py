import os
import uuid
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import Any, cast

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
_supabase: Client | None = create_client(url, key) if url and key else None
supabase = _supabase  # raw client, for scripts (test.py, test_db.py) that query tables directly


def _require_supabase() -> Client:
    if _supabase is None:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_KEY must be set in backend environment variables."
        )
    return _supabase

JsonDict = dict[str, Any]

@dataclass
class Event:
    event_id: str
    event_type: str
    source: str
    published_at: str
    region: str
    asset_classes: list[str]
    content: str
    importance_score: float
    entities: dict
    topic: str
    sentiment: str
    raw_payload_ref: str

@dataclass
class Theme:
    title: str
    description: str
    status: str
    heat_score: float
    asset_classes: list[str]
    region: str


# â”€â”€ Events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def get_events(
    topic: str | None = None,
    region: str | None = None,
    min_importance: float | None = None,
    days: int | None = None,
) -> list[JsonDict]:
    """Get events with optional filters. Supports the query pattern:
    'Show all inflation-related US events in last 7 days with importance > 0.8'
    """
    query = _require_supabase().table("events").select("*")

    if topic:
        query = query.eq("topic", topic)
    if region:
        query = query.eq("region", region)
    if min_importance is not None:
        query = query.gte("importance_score", min_importance)
    if days:
        from datetime import datetime, timedelta, timezone

        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        query = query.gte("published_at", since)

    return cast(list[JsonDict], query.order("published_at", desc=True).execute().data)


def insert_event(event: Event | dict) -> JsonDict:
    """Insert processed event into database and classify asynchronously."""
    # Handle both Event objects and dicts
    event_data = vars(event) if hasattr(event, '__dict__') else event
    
    result = cast(JsonDict, _require_supabase().table("events").insert(event_data).execute().data[0])
    
    # Auto-classify into themes (fire-and-forget)
    try:
        from analysislib.classify_events import classify_and_link_event
        classify_and_link_event(result)
    except Exception:
        pass
    
    return result


# â”€â”€ Themes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def get_active_themes(min_heat: float | None = None) -> list[JsonDict]:
    query = _require_supabase().table("themes").select("*").eq("status", "active")

    if min_heat is not None:
        query = query.gte("heat_score", min_heat)

    return cast(list[JsonDict], query.order("heat_score", desc=True).execute().data)


def get_theme_by_id(theme_id: str) -> JsonDict | None:
    result = _require_supabase().table("themes").select("*").eq("theme_id", theme_id).execute()
    return cast(JsonDict | None, result.data[0] if result.data else None)


def insert_theme(theme: "Theme | JsonDict") -> JsonDict:
    data = vars(theme) if isinstance(theme, Theme) else theme
    return cast(JsonDict, _require_supabase().table("themes").insert(data).execute().data[0])


def update_theme(theme_id: str, updates: JsonDict) -> JsonDict:
    return (
        cast(
            JsonDict,
            _require_supabase().table("themes")
            .update(updates)
            .eq("theme_id", theme_id)
            .execute()
            .data[0],
        )
    )


# â”€â”€ Event-theme map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def link_event_to_theme(event_id: str, theme_id: str) -> JsonDict:
    return (
        cast(
            JsonDict,
            _require_supabase().table("event_theme_map")
            .insert({"event_id": event_id, "theme_id": theme_id})
            .execute()
            .data[0],
        )
    )


def get_events_for_theme(theme_id: str) -> list[JsonDict]:
    return (
        cast(
            list[JsonDict],
            _require_supabase().table("event_theme_map")
            .select("events(*)")
            .eq("theme_id", theme_id)
            .execute()
            .data,
        )
    )


def get_event_theme_links(event_id: str) -> list[str]:
    """Return theme_ids already linked to an event (for dedup)."""
    rows = (
        _require_supabase().table("event_theme_map")
        .select("theme_id")
        .eq("event_id", event_id)
        .execute()
        .data
    )
    return [r["theme_id"] for r in rows if isinstance(r, dict)]


def get_unlinked_events(days: int = 7) -> list[JsonDict]:
    """Return events from the last N days that have no entry in event_theme_map."""
    from datetime import timedelta

    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    all_events = cast(
        list[JsonDict],
        _require_supabase().table("events")
        .select("*")
        .gte("published_at", since)
        .order("published_at", desc=True)
        .execute()
        .data,
    )

    linked_rows = cast(
        list[JsonDict],
        _require_supabase().table("event_theme_map")
        .select("event_id")
        .execute()
        .data,
    )
    linked_ids = {r["event_id"] for r in linked_rows if isinstance(r, dict)}

    return [e for e in all_events if e.get("event_id") not in linked_ids]


# ── Memory store ────────────────────────────────────────────────────────────

def insert_memory(
    content: str, embedding: list[float], content_type: str, metadata: JsonDict
) -> JsonDict:
    return (
        cast(
            JsonDict,
            _require_supabase().table("memory")
            .insert(
                {
                    "content": content,
                    "embedding": embedding,
                    "content_type": content_type,
                    "metadata": metadata,
                }
            )
            .execute()
            .data[0],
        )
    )


def search_memory(
    embedding: list[float], top_k: int = 5, content_type: str | None = None
) -> list[JsonDict]:
    """Nearest-neighbor semantic search over memory store."""
    query = _supabase.rpc(
        "match_memory",
        {
            "query_embedding": embedding,
            "match_count": top_k,
        },
    )

    result = cast(list[JsonDict], query.execute().data)

    if content_type:
        result = [r for r in result if r.get("content_type") == content_type]

    return cast(list[JsonDict], result)


# â”€â”€ Storage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@DeprecationWarning
def insert_storage(storage_path: str, raw_payload: str) -> str:
    """
    Deprecated.
    """
    _supabase.storage.from_("raw-payloads").upload(
        path=storage_path,
        file=raw_payload.encode("utf-8"),
        file_options={"content-type": "application/json"},
    )
    return storage_path


def ingest_raw_article(raw_payload: str, source: str) -> None:
    """
    Stores raw articles in database marked as unprocess by default.

    Args:
        raw_payload: Raw HTML of news articles
        source: news website source domain
    """
    storage_path = f"{source}/{str(uuid.uuid4())}.json"

    # upload data to raw payloads
    _supabase.storage.from_("raw-payloads").upload(
        path=storage_path,
        file=raw_payload.encode("utf-8"),
        file_options={"content-type": "application/json"},
    )

    # upload entry data to raw ingestions
    _require_supabase().table("raw_ingestions").insert(
        {
            "storage_path": storage_path,
            "source": source,
        }
    ).execute().data[0]


def get_raw_article(storage_path: str) -> str:
    file = _supabase.storage.from_("raw-payloads").download(storage_path)
    return file.decode("utf-8")


def get_unprocessed() -> list[JsonDict]:
    """
    Returns all unprocessed raw articles as list of JSON.
    """
    result = (
        _require_supabase().table("raw_ingestions")
        .select("*")
        .eq("processed", False)
        .order("ingested_at")
        .execute()
    )
    data = result.data
    if not isinstance(data, list):
        return []

    return [cast(JsonDict, row) for row in data if isinstance(row, dict)]


def mark_processed(ingestion_id: str, event_id: str) -> None:
    _require_supabase().table("raw_ingestions").update(
        {
            "processed": True,
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "event_id": event_id,
        }
    ).eq("id", ingestion_id).execute()


def get_full_article(event_id: str) -> JsonDict | None:
    event = _require_supabase().table("events").select("*").eq("event_id", event_id).execute()
    event_data = event.data
    if not isinstance(event_data, list) or not event_data:
        return None

    event_row = event_data[0]
    if not isinstance(event_row, dict):
        return None

    raw_payload_ref = event_row.get("raw_payload_ref")
    if not isinstance(raw_payload_ref, str) or not raw_payload_ref:
        return None

    # fetch from Supabase Storage
    file = _supabase.storage.from_("raw-payloads").download(raw_payload_ref)
    if not isinstance(file, (bytes, bytearray)):
        return None

    return {"event": cast(JsonDict, event_row), "raw_content": file.decode("utf-8")}


# ── Theme analyses ───────────────────────────────────────────────────────

def get_theme_analysis(theme_id: str) -> JsonDict | None:
    """Return the cached LLM analysis for a theme, or None."""
    result = (
        _require_supabase().table("theme_analyses")
        .select("*")
        .eq("theme_id", theme_id)
        .execute()
    )
    return cast(JsonDict | None, result.data[0] if result.data else None)


def upsert_theme_analysis(theme_id: str, analysis: str) -> JsonDict:
    """Insert or update the cached LLM analysis for a theme."""
    return cast(
        JsonDict,
        _require_supabase().table("theme_analyses")
        .upsert(
            {
                "theme_id": theme_id,
                "analysis": analysis,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="theme_id",
        )
        .execute()
        .data[0],
    )


# ── Implication chains ───────────────────────────────────────────────────

def get_implication_chains(theme_id: str) -> JsonDict | None:
    """Return the cached implication chains for a theme, or None."""
    result = (
        _require_supabase().table("implication_chains")
        .select("*")
        .eq("theme_id", theme_id)
        .execute()
    )
    return cast(JsonDict | None, result.data[0] if result.data else None)


def upsert_implication_chains(theme_id: str, chains: list) -> JsonDict:
    """Insert or update the cached implication chains for a theme."""
    import json as _json
    return cast(
        JsonDict,
        _require_supabase().table("implication_chains")
        .upsert(
            {
                "theme_id": theme_id,
                "chains": _json.dumps(chains),
                "generated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="theme_id",
        )
        .execute()
        .data[0],
    )

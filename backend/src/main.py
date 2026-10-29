import os
import math
import sys
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict

from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from dotenv import load_dotenv

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from databaselib.db import get_active_themes, get_events, get_events_for_theme, get_full_article, get_implication_chains, get_theme_analysis, get_theme_by_id, get_vitals, upsert_implication_chains, upsert_theme_analysis

load_dotenv()
FRONT_END_URL = os.getenv("FRONT_END_URL")

app = Flask(__name__)
CORS(app, origins=FRONT_END_URL)


########################## Helper functions ##########################

# Placeholder news scroller articles
EXAMPLE_NEWS_ARTICLES = [
    {
        "id": "us-cpi-cools",
        "title": "US Core CPI Cools for a Second Month",
        "description": "Core inflation eased slightly, reinforcing expectations for a gradual policy pivot.",
    },
    {
        "id": "fed-minutes",
        "title": "Fed Minutes Signal Data-Dependent Approach",
        "description": "Officials flagged resilient services inflation and reiterated a cautious easing path.",
    },
    {
        "id": "oil-supply",
        "title": "Oil Gains on Fresh Supply Concerns",
        "description": "Crude prices moved higher after renewed disruptions increased near-term supply risk.",
    },
    {
        "id": "tech-guidance",
        "title": "Mega-Cap Tech Guidance Mixed into Q2",
        "description": "Cloud and AI capex remained strong, while margin outlooks diverged by company.",
    },
    {
        "id": "jobs-surprise",
        "title": "Payrolls Beat Forecasts, Wage Growth Stable",
        "description": "Labor data stayed firm, supporting a soft-landing narrative despite rate uncertainty.",
    },
]


def _json_error(message: str, status_code: int = 400) -> Response:
    response = jsonify({"error": message})
    response.status_code = status_code
    return response


############################# Endpoints #############################

@app.get("/api/vitals/<vital_type>")
def get_vitals_endpoint(vital_type: str) -> Response:
    """
    Return the pre-computed vitals snapshot for 'macro' or 'market', as written by
    get_vitals_snapshot.py. Never calls FRED/Alpha Vantage directly — reads from Supabase only.
    """
    if vital_type not in ("macro", "market"):
        return _json_error("vital_type must be 'macro' or 'market'.")

    rows = get_vitals(vital_type)
    return jsonify(
        [
            {
                "key": row.get("key"),
                "name": row.get("label"),
                "category": row.get("category"),
                "value": row.get("latest_value"),
                "change_percent": row.get("change_percent"),
                "points": row.get("points") or [],
                "x_labels": row.get("x_labels") or [],
                "tone": "up" if (row.get("change_percent") or 0) >= 0 else "down",
                "type": vital_type,
                "updated_at": row.get("updated_at"),
            }
            for row in rows
        ]
    )


@app.get("/api/themes/hottest")
def get_hottest_themes() -> Response:
    """
    Return top N active themes ordered by heat score descending.
    Default limit is 9 for frontend heat grid.
    """
    limit_raw = request.args.get("limit", "9")
    try:
        limit = max(1, min(int(limit_raw), 50))
    except ValueError:
        limit = 9

    themes = get_active_themes()
    top_themes = themes[:limit]

    return jsonify(
        [
            {
                "theme_id": theme.get("theme_id"),
                "topic": theme.get("title", "Unknown"),
                "score": float(theme.get("heat_score") or 0.0),
                "region": theme.get("region"),
                "asset_classes": theme.get("asset_classes") or [],
                "status": theme.get("status"),
            }
            for theme in top_themes
        ]
    )


@app.get("/api/themes")
def get_themes_list() -> Response:
    """
    Return all active themes for the theme selector dropdown.
    """
    themes = get_active_themes()
    return jsonify(
        [
            {
                "theme_id": theme.get("theme_id"),
                "title": theme.get("title", "Unknown"),
                "heat_score": float(theme.get("heat_score") or 0.0),
            }
            for theme in themes
        ]
    )


def _importance_to_impact(score: float) -> str:
    if score >= 0.7:
        return "High"
    if score >= 0.4:
        return "Medium"
    return "Low"


@app.get("/api/themes/<theme_id>/timeline")
def get_theme_timeline(theme_id: str) -> Response:
    """
    Return a theme's metadata together with all its linked events,
    sorted by published_at descending.
    """
    theme = get_theme_by_id(theme_id)
    if theme is None:
        return _json_error("Theme not found.", status_code=404)

    raw_rows = get_events_for_theme(theme_id)
    events = []
    for row in raw_rows:
        ev = row.get("events")
        if not ev:
            continue
        events.append(ev)

    events.sort(key=lambda e: e.get("published_at", ""), reverse=True)

    return jsonify(
        {
            "theme": {
                "theme_id": theme.get("theme_id"),
                "title": theme.get("title"),
                "description": theme.get("description"),
                "heat_score": float(theme.get("heat_score") or 0.0),
                "status": theme.get("status"),
                "region": theme.get("region"),
                "asset_classes": theme.get("asset_classes") or [],
                "first_seen_at": theme.get("first_seen_at"),
                "last_seen_at": theme.get("last_seen_at"),
            },
            "events": [
                {
                    "event_id": ev.get("event_id"),
                    "date": ev.get("published_at"),
                    "title": (ev.get("content") or "")[:120],
                    "text": ev.get("content") or "",
                    "source": ev.get("source") or "Unknown",
                    "impact": _importance_to_impact(
                        float(ev.get("importance_score") or 0)
                    ),
                    "sentiment": ev.get("sentiment"),
                    "region": ev.get("region"),
                    "asset_classes": ev.get("asset_classes") or [],
                }
                for ev in events
            ],
        }
    )


@app.get("/api/themes/<theme_id>/analysis")
def get_theme_analysis_endpoint(theme_id: str) -> Response:
    """
    Return LLM analysis for a theme's recent events.
    Cached in DB — only regenerated if older than 7 days.
    Query params:
        force – bypass cache and regenerate (default: false)
    """
    from datetime import timedelta
    import os as _os

    from google import genai

    theme = get_theme_by_id(theme_id)
    if theme is None:
        return _json_error("Theme not found.", status_code=404)

    force = request.args.get("force", "false").lower() in ("true", "1", "yes")
    staleness_days = 7

    # Check cache
    if not force:
        cached = get_theme_analysis(theme_id)
        if cached:
            generated_at = cached.get("generated_at")
            if generated_at:
                try:
                    gen_dt = datetime.fromisoformat(
                        str(generated_at).replace("Z", "+00:00")
                    )
                    age = datetime.now(timezone.utc) - gen_dt
                    if age < timedelta(days=staleness_days):
                        return jsonify({
                            "analysis": cached["analysis"],
                            "generated_at": generated_at,
                            "cached": True,
                        })
                except (ValueError, TypeError):
                    pass

    # Fetch events for the theme
    raw_rows = get_events_for_theme(theme_id)
    events = []
    for row in raw_rows:
        ev = row.get("events")
        if ev:
            events.append(ev)

    if not events:
        return jsonify({
            "analysis": "No events linked to this theme yet. Analysis will be available once events are classified.",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "cached": False,
        })

    # Build prompt
    events.sort(key=lambda e: e.get("published_at", ""), reverse=True)
    event_summaries = []
    for ev in events[:20]:  # cap at 20 most recent
        content = (ev.get("content") or "")[:300]
        source = ev.get("source") or "Unknown"
        date = ev.get("published_at") or "Unknown date"
        sentiment = ev.get("sentiment") or "unknown"
        event_summaries.append(
            f"- [{date}] ({source}, {sentiment}) {content}"
        )

    events_block = "\n".join(event_summaries)
    prompt = f"""You are a senior macroeconomic analyst. Analyze the following recent events related to the theme "{theme.get('title', 'Unknown')}".

THEME DESCRIPTION: {theme.get('description') or 'N/A'}
REGION: {theme.get('region') or 'Global'}
ASSET CLASSES: {', '.join(theme.get('asset_classes') or []) or 'N/A'}

RECENT EVENTS:
{events_block}

Provide a concise analysis (3-5 paragraphs) covering:
1. Key developments and their significance
2. Overall sentiment trajectory (risk-on vs risk-off trend)
3. Potential market implications and what to watch next

Write in a professional, analytical tone suitable for institutional investors. Be specific and reference the events where relevant."""

    try:
        client = genai.Client(api_key=_os.getenv("GEMINI_API_KEY"))
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite-preview",
            contents=prompt,
        )
        analysis_text = response.text or "Analysis generation returned empty."
    except Exception as exc:
        return _json_error(f"LLM analysis unavailable: {exc}", status_code=503)

    # Cache the result
    try:
        row = upsert_theme_analysis(theme_id, analysis_text)
        generated_at = row.get("generated_at", datetime.now(timezone.utc).isoformat())
    except Exception:
        generated_at = datetime.now(timezone.utc).isoformat()

    return jsonify({
        "analysis": analysis_text,
        "generated_at": generated_at,
        "cached": False,
    })


@app.get("/api/themes/<theme_id>/chains")
def get_theme_chains_endpoint(theme_id: str) -> Response:
    """
    Return cross-asset implication chains for a theme.
    Cached in DB — only regenerated if older than 7 days.
    Query params:
        force – bypass cache and regenerate (default: false)
    """
    from datetime import timedelta
    import os as _os
    import json as _json

    from google import genai

    theme = get_theme_by_id(theme_id)
    if theme is None:
        return _json_error("Theme not found.", status_code=404)

    force = request.args.get("force", "false").lower() in ("true", "1", "yes")
    staleness_days = 7

    # Check cache
    if not force:
        cached = get_implication_chains(theme_id)
        if cached:
            generated_at = cached.get("generated_at")
            if generated_at:
                try:
                    gen_dt = datetime.fromisoformat(
                        str(generated_at).replace("Z", "+00:00")
                    )
                    age = datetime.now(timezone.utc) - gen_dt
                    if age < timedelta(days=staleness_days):
                        chains_data = cached.get("chains", [])
                        if isinstance(chains_data, str):
                            chains_data = _json.loads(chains_data)
                        return jsonify({
                            "chains": chains_data,
                            "generated_at": generated_at,
                            "cached": True,
                        })
                except (ValueError, TypeError):
                    pass

    # Fetch events for the theme
    raw_rows = get_events_for_theme(theme_id)
    events = []
    for row in raw_rows:
        ev = row.get("events")
        if ev:
            events.append(ev)

    if not events:
        return jsonify({
            "chains": [],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "cached": False,
        })

    # Build prompt
    events.sort(key=lambda e: e.get("published_at", ""), reverse=True)
    event_summaries = []
    for ev in events[:15]:
        content = (ev.get("content") or "")[:250]
        source = ev.get("source") or "Unknown"
        sentiment = ev.get("sentiment") or "unknown"
        assets = ", ".join(ev.get("asset_classes") or [])
        event_summaries.append(
            f"- ({source}, {sentiment}, assets: {assets}) {content}"
        )

    events_block = "\n".join(event_summaries)
    prompt = f"""You are a senior cross-asset strategist. Based on these recent events for the theme "{theme.get('title', 'Unknown')}", generate implication chains showing how the macro event propagates across asset classes.

THEME: {theme.get('title', 'Unknown')}
DESCRIPTION: {theme.get('description') or 'N/A'}
REGION: {theme.get('region') or 'Global'}
    
RECENT EVENTS:
{events_block}

Generate 1-3 implication chains. Each chain should show how a trigger event cascades across different asset classes (e.g. equities, fixed income, commodities, FX, credit).

Respond with ONLY valid JSON, no markdown, no explanation. Use this exact format:
[
  {{
    "trigger": "Short description of the triggering event",
    "steps": [
      {{
        "order": 1,
        "implication": "First downstream effect",
        "asset_class": "commodities",
        "direction": "bearish"
      }},
      {{
        "order": 2,
        "implication": "Second downstream effect",
        "asset_class": "energy",
        "direction": "bearish"
      }}
    ]
  }}
]

Rules:
- Each chain should have 2-4 steps
- asset_class must be one of: equities, fixed_income, commodities, fx, credit, energy, real_estate, crypto
- direction must be one of: bullish, bearish, neutral
- Keep implication text concise (under 15 words)
- Only output the JSON array, nothing else"""

    try:
        client = genai.Client(api_key=_os.getenv("GEMINI_API_KEY"))
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite-preview",
            contents=prompt,
        )
        raw_text = (response.text or "").strip()
    except Exception as exc:
        return _json_error(f"LLM chains unavailable: {exc}", status_code=503)

    # Parse JSON response
    try:
        # Strip markdown code fences if present
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[1] if "\n" in raw_text else raw_text[3:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
        raw_text = raw_text.strip()

        chains = _json.loads(raw_text)
        if not isinstance(chains, list):
            chains = [chains]
    except _json.JSONDecodeError:
        # Try to extract JSON from response
        start = raw_text.find("[")
        end = raw_text.rfind("]") + 1
        if start >= 0 and end > start:
            try:
                chains = _json.loads(raw_text[start:end])
            except _json.JSONDecodeError:
                chains = []
        else:
            chains = []

    # Cache the result
    try:
        row = upsert_implication_chains(theme_id, chains)
        generated_at = row.get("generated_at", datetime.now(timezone.utc).isoformat())
    except Exception:
        generated_at = datetime.now(timezone.utc).isoformat()

    return jsonify({
        "chains": chains,
        "generated_at": generated_at,
        "cached": False,
    })


@app.get("/api/events/<event_id>/article")
def get_event_article(event_id: str) -> Response:
    """
    Return full article content for an event.
    Fetches the raw payload from Supabase Storage using raw_payload_ref.
    """
    import json as _json

    try:
        result = get_full_article(event_id)
    except Exception as exc:
        return _json_error(f"Failed to fetch article: {exc}", status_code=500)

    if result is None:
        return _json_error("Event not found.", status_code=404)

    event_row = result.get("event")
    raw_content_str = result.get("raw_content")

    if raw_content_str is None:
        return jsonify({
            "error": "Article content unavailable.",
            "error_code": "no_raw_payload",
            "event": {
                "event_id": event_row.get("event_id"),
                "source": event_row.get("source") or "Unknown",
                "published_at": event_row.get("published_at"),
                "content": event_row.get("content") or "",
                "sentiment": event_row.get("sentiment"),
                "importance_score": float(event_row.get("importance_score") or 0),
                "region": event_row.get("region"),
                "asset_classes": event_row.get("asset_classes") or [],
                "topic": event_row.get("topic"),
            },
        }), 404

    # Parse raw content JSON
    try:
        raw_payload = _json.loads(raw_content_str)
    except _json.JSONDecodeError:
        raw_payload = {"raw_text": raw_content_str}

    return jsonify({
        "event": {
            "event_id": event_row.get("event_id"),
            "source": event_row.get("source") or "Unknown",
            "published_at": event_row.get("published_at"),
            "content": event_row.get("content") or "",
            "sentiment": event_row.get("sentiment"),
            "importance_score": float(event_row.get("importance_score") or 0),
            "region": event_row.get("region"),
            "asset_classes": event_row.get("asset_classes") or [],
            "topic": event_row.get("topic"),
        },
        "article": raw_payload,
    })



@app.get("/api/news")
def get_news() -> Response:
    """
    Return recent news articles ranked by recency-weighted importance.
    Falls back to placeholders if DB events are unavailable.
    """
    limit_raw = request.args.get("limit")
    try:
        limit = int(limit_raw) if limit_raw else 8
    except ValueError:
        limit = 8

    limit = max(1, min(limit, 20))

    try:
        events = get_events(days=7)
    except Exception:
        events = []

    now = datetime.now(timezone.utc)
    ranked: list[Dict[str, Any]] = []

    for event in events:
        published_at = event.get("published_at")
        if not published_at:
            continue

        try:
            published_dt = datetime.fromisoformat(str(published_at).replace("Z", "+00:00"))
            age_hours = max((now - published_dt).total_seconds() / 3600, 0.0)
            recency_score = math.exp(-age_hours / 24.0)
        except Exception:
            recency_score = 0.0

        try:
            importance_score = float(event.get("importance_score") or 0.0)
        except Exception:
            importance_score = 0.0
        importance_score = max(0.0, min(1.0, importance_score))

        weighted_score = 0.7 * recency_score + 0.3 * importance_score

        title = event.get("title") or event.get("topic") or "Market Update"
        content = str(event.get("content") or "").strip()
        description = content[:220] if content else "No summary available."

        ranked.append(
            {
                "id": str(event.get("event_id") or f"{title}-{published_at}"),
                "title": str(title),
                "description": description,
                "score": round(weighted_score, 4),
            }
        )

    if not ranked:
        return jsonify({"articles": EXAMPLE_NEWS_ARTICLES[: min(limit, len(EXAMPLE_NEWS_ARTICLES))]})

    ranked.sort(key=lambda item: item["score"], reverse=True)
    return jsonify({"articles": ranked[:limit]})


@app.route("/api/classify-events", methods=["POST"])
def classify_events():
    """
    Trigger Gemini classification for unlinked events.
    Query params:
        days – look-back window (default 30)
    """
    pipeline_secret = os.getenv("PIPELINE_SECRET")
    if not pipeline_secret or request.headers.get("X-Pipeline-Secret") != pipeline_secret:
        return _json_error("Unauthorized", 401)

    try:
        days = int(request.args.get("days", "30"))
    except (ValueError, TypeError):
        days = 30

    try:
        from analysislib.classify_events import backfill_events
        stats = backfill_events(days=days)
        return jsonify(stats)
    except Exception as exc:
        return _json_error(f"Classification error: {exc}", 500)


if __name__ == "__main__":
    app.run(port=8000, debug=True)



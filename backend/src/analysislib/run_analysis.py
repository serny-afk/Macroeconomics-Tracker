# This script serves as the entrypoint for running the full analysis flow in analysislib.

from typing import Any

from .logic.heat_score import calculate_theme_heat
from .logic.macro_themes import group_events_into_themes


JsonDict = dict[str, Any]


def run_analysis(events: list[JsonDict]) -> JsonDict:
    """
    Single analysislib entrypoint.

    Flow:
    1) Group events into themes
    2) Score theme heat (0-100)

    Returns:
        {
            "themes": [...],
            "summary": {
                "events_input": int,
                "themes_count": int,
            }
        }
    """
    safe_events = events if isinstance(events, list) else []

    themes = group_events_into_themes(safe_events)
    themes = calculate_theme_heat(themes)

    return {
        "themes": themes,
        "summary": {
            "events_input": len(safe_events),
            "themes_count": len(themes),
        },
    }

# backend/analysislib/sync_themes.py
from databaselib.db import get_active_themes, get_events_for_theme, update_theme
from .logic.heat_score import calculate_theme_heat


def sync_theme_heat() -> int:
    """
    Recompute heat scores for themes created via Gemini classification
    (analysislib.classify_events). Does not create or group themes itself —
    that grouping is owned entirely by the closed-list classification step,
    to avoid two independent paths producing duplicate theme rows.
    """
    updated = 0

    for theme in get_active_themes():
        linked = get_events_for_theme(theme["theme_id"])
        events = [row["events"] for row in linked if row.get("events")]
        if not events:
            continue

        scored = calculate_theme_heat([{"events": events}])[0]
        update_theme(theme["theme_id"], {"heat_score": scored["heat_score"]})
        updated += 1

    return updated


if __name__ == "__main__":
    n = sync_theme_heat()
    print(f"Synced heat scores for {n} themes")


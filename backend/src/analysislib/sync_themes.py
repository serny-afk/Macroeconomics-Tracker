# backend/analysislib/sync_themes.py
import logging

from databaselib.db import get_active_themes, get_events_for_theme, update_theme
from .logic.heat_score import calculate_theme_heat

log = logging.getLogger(__name__)


def sync_theme_heat() -> int:
    """
    Recompute heat scores for themes created via Gemini classification
    (analysislib.classify_events). Does not create or group themes itself —
    that grouping is owned entirely by the closed-list classification step,
    to avoid two independent paths producing duplicate theme rows.

    Each theme is updated independently: a failure on one theme (bad row,
    transient DB error) is logged and skipped rather than aborting the sync
    for every remaining theme.
    """
    updated = 0
    failed = 0

    for theme in get_active_themes():
        theme_id = theme.get("theme_id")
        try:
            linked = get_events_for_theme(theme_id)
            events = [row["events"] for row in linked if row.get("events")]
            if not events:
                continue

            scored = calculate_theme_heat([{"events": events}])[0]
            update_theme(theme_id, {"heat_score": scored["heat_score"]})
            updated += 1
        except Exception:
            log.exception("Failed to sync heat score for theme %s", theme_id)
            failed += 1

    if failed:
        log.warning("Heat sync finished with %d failed theme(s), %d updated", failed, updated)

    return updated


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    n = sync_theme_heat()
    print(f"Synced heat scores for {n} themes")

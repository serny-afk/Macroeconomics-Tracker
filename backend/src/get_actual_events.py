import json
import logging

from databaselib.db import get_raw_article, get_unprocessed, insert_event, mark_processed
from datalib.datalib import run_gdelt_spider
from dataprocesslib.pipeline import process_article

logger = logging.getLogger(__name__)

QUERY_TERMS = [
    "GDP",
    "inflation",
    "unemployment",
    "interest rates",
    "credit risk",
    "bond yields",
    "consumer spending",
    "currency exchange rates",
    "oil prices",
    "trade tariffs",
]


def main():
    """
    Full data pipeline:
    1. Crawl GDELT for articles
    2. Fetch unprocessed ingestions
    3. Process each article into unified event schema
    4. Store in database
    """
    
    # ── Step 1: Crawl articles ────────────────────────────────────────────────
    logger.info("Starting GDELT spider...")
    run_gdelt_spider(
        query_terms=QUERY_TERMS,
        timespan="7days",
        maxrecords=30,
        output=False,
        language="english"
    )
    logger.info("GDELT spider complete")
    
    # ── Step 2: Get unprocessed ingestions ────────────────────────────────────
    unprocessed = get_unprocessed()
    logger.info(f"Found {len(unprocessed)} unprocessed ingestions")
    
    if not unprocessed:
        logger.info("No ingestions to process")
        return
    
    # ── Step 3: Process each ingestion ───────────────────────────────────────
    processed_count = 0
    
    for ingestion in unprocessed:
        ingestion_id = ingestion["id"]
        storage_path = ingestion["storage_path"]
        
        try:
            # Download raw article
            raw = get_raw_article(storage_path)
            payload = json.loads(raw)
            
            # Process into unified schema
            event = process_article(payload, storage_path)
            
            # Store and mark complete
            insert_event(event)
            mark_processed(ingestion_id, event["event_id"])
            
            processed_count += 1
            logger.info(f"[ok] Processed {ingestion_id} -> {event['event_id']}")
            
        except json.JSONDecodeError as e:
            logger.error(f"[fail] Invalid JSON in {storage_path}: {e}")
            
        except Exception as e:
            logger.error(f"[fail] Failed to process {ingestion_id}: {e}")
    
    logger.info(f"Pipeline complete: {processed_count}/{len(unprocessed)} events created")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s"
    )
    main()



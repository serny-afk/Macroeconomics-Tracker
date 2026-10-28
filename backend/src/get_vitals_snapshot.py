import logging

from databaselib.db import upsert_vital
from datalib.datalib import get_alpha_vantage_time_series_daily, get_fred_indicator_data

logger = logging.getLogger(__name__)

POINTS_LIMIT = 60

# (indicator_name, category, display label) — see datalib.FRED_INDICATOR_MAP for all available keys.
MACRO_INDICATORS = [
    ("real_gdp", "growth_activity", "Real GDP"),
    ("headline_cpi", "inflation", "Headline CPI"),
    ("unemployment_rate", "labor", "Unemployment Rate"),
    ("fed_funds_effective", "rates_policy", "Fed Funds Rate"),
    ("ust_10y", "yield_curve", "10Y Treasury Yield"),
    ("curve_10y_2y", "yield_curve", "10Y-2Y Curve Spread"),
    ("hy_oas", "credit_risk", "High-Yield Credit Spread"),
    ("wti_crude", "fx_commodities", "WTI Crude Oil"),
]

# (symbol, display label) — cross-asset ETF basket, kept small to stay under Alpha Vantage's free-tier rate limit.
MARKET_SYMBOLS = [
    ("SPY", "S&P 500 (SPY)"),
    ("QQQ", "Nasdaq 100 (QQQ)"),
    ("DIA", "Dow Jones (DIA)"),
    ("IWM", "Russell 2000 (IWM)"),
    ("TLT", "20+Y Treasuries (TLT)"),
    ("GLD", "Gold (GLD)"),
    ("USO", "Crude Oil (USO)"),
    ("UUP", "US Dollar Index (UUP)"),
]


def _normalize_fred_observations(raw):
    observations = []
    for row in raw.get("observations", []):
        value = row.get("value")
        if value in (None, "."):
            continue
        observations.append({"date": row.get("date"), "value": float(value)})
    return observations


def _normalize_alpha_vantage_daily(raw):
    series = raw.get("Time Series (Daily)", {})
    rows = sorted(series.items())[-POINTS_LIMIT:]
    observations = []
    for date_str, row in rows:
        close = row.get("4. close")
        if close is None:
            continue
        observations.append({"date": date_str, "value": float(close)})
    return observations


def _upsert_from_observations(key, vital_type, label, category, observations):
    if not observations:
        logger.warning(f"[skip] No observations for {vital_type} {key}")
        return

    points = [row["value"] for row in observations]
    x_labels = [row["date"] for row in observations]
    latest = points[-1]
    previous = points[-2] if len(points) > 1 else None
    change_percent = ((latest - previous) / previous) * 100 if previous else 0.0

    upsert_vital(
        key=key,
        vital_type=vital_type,
        label=label,
        category=category,
        latest_value=latest,
        previous_value=previous,
        change_percent=change_percent,
        points=points,
        x_labels=x_labels,
    )
    logger.info(f"[ok] {vital_type} {key}: {latest}")


def refresh_macro_indicators():
    for key, category, label in MACRO_INDICATORS:
        try:
            # sort_order="desc" + limit returns the most recent N observations (FRED applies
            # the limit before sorting back to chronological order would be needed otherwise,
            # which would return the OLDEST N observations from the start of the series instead).
            raw = get_fred_indicator_data(
                indicator_name=key, category=category, sort_order="desc", limit=POINTS_LIMIT
            )
            observations = list(reversed(_normalize_fred_observations(raw)))
            _upsert_from_observations(key, "macro", label, category, observations)
        except Exception as e:
            logger.error(f"[fail] macro {key}: {e}")


def refresh_market_symbols():
    for symbol, label in MARKET_SYMBOLS:
        try:
            raw = get_alpha_vantage_time_series_daily(symbol=symbol, outputsize="compact")
            if "Time Series (Daily)" not in raw:
                logger.warning(
                    f"[skip] No daily series for market symbol {symbol}: "
                    f"{raw.get('Note') or raw.get('Error Message') or raw.get('Information') or raw}"
                )
                continue
            _upsert_from_observations(
                symbol, "market", label, None, _normalize_alpha_vantage_daily(raw)
            )
        except Exception as e:
            logger.error(f"[fail] market {symbol}: {e}")


def main():
    """
    Refresh the pre-computed vitals snapshot:
    1. Fetch a fixed set of FRED macro indicators
    2. Fetch a fixed set of Alpha Vantage market symbols
    3. Upsert each into the `vitals` table, keyed by indicator name / symbol
    """
    logger.info("Refreshing macro vitals (FRED)...")
    refresh_macro_indicators()

    logger.info("Refreshing market vitals (Alpha Vantage)...")
    refresh_market_symbols()

    logger.info("Vitals snapshot complete")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s"
    )
    main()

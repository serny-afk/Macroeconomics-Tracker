"""
ticker_loader.py
────────────────
Fetches and caches an exhaustive ticker reference set from Wikipedia.
Covers S&P 500, NASDAQ-100, and Dow Jones (~600 tickers total).

Dependencies:
    pip install pandas

Usage:
    from ticker_loader import TICKER_SET
    print("USB" in TICKER_SET)  # → True

    # Force a refresh (delete cache and reload)
    from ticker_loader import refresh
    refresh()
"""

import json
import os
import urllib.request
import io as _io

import pandas as pd


# ── Config ────────────────────────────────────────────────────────────────────
CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ticker_cache.json")

# Spoof a browser user-agent — Wikipedia blocks Python's default urllib agent
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

# Fallback if all network fetches fail
FALLBACK_TICKERS = {
    "AAPL", "MSFT", "NVDA", "GOOGL", "GOOG", "AMZN", "META", "TSLA", "AVGO", "ORCL",
    "JPM",  "BAC",  "WFC",  "GS",    "MS",   "C",    "USB",  "PNC",  "TFC",  "COF",
    "XOM",  "CVX",  "COP",  "EOG",   "SLB",
    "LLY",  "UNH",  "JNJ",  "ABBV",  "MRK",
    "WMT",  "COST", "HD",   "MCD",   "NKE",
    "SPY",  "QQQ",  "IWM",  "DIA",   "VTI",  "VOO",
    "TLT",  "IEF",  "SHY",  "HYG",   "LQD",  "AGG",
    "GLD",  "SLV",  "VXX",
}


# ── Helpers ───────────────────────────────────────────────────────────────────
def _fetch_html(url: str) -> str:
    """Fetches raw HTML from a URL using a browser-spoofed user-agent."""
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.read().decode("utf-8")


def _clean(tickers) -> set[str]:
    """Strips whitespace, replaces dots with dashes, drops non-strings."""
    return {str(t).strip().replace(".", "-") for t in tickers if isinstance(t, str)}


# ── Fetch from Wikipedia ──────────────────────────────────────────────────────
def _fetch_tickers() -> set[str]:
    """
    Pulls ticker lists from three Wikipedia index pages.
    Each is fetched independently so a single failure doesn't abort the rest.
    """
    tickers = set()

    sources = [
        ("S&P 500",     "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", 0, "Symbol"),
        ("NASDAQ-100",  "https://en.wikipedia.org/wiki/Nasdaq-100",                  4, "Ticker"),
        ("Dow Jones",   "https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average", 2, "Symbol"),
    ]

    for name, url, table_index, col in sources:
        try:
            html   = _fetch_html(url)
            df     = pd.read_html(_io.StringIO(html))[table_index]
            batch  = _clean(df[col].tolist())
            tickers |= batch
            print(f"[ticker_loader] {name}: {len(batch)} tickers loaded.")
        except Exception as e:
            print(f"[ticker_loader] Warning: could not load {name} ({e})")

    return tickers


# ── Cache ─────────────────────────────────────────────────────────────────────
def _save_cache(tickers: set[str]) -> None:
    json.dump(sorted(tickers), open(CACHE_FILE, "w"), indent=2)
    print(f"[ticker_loader] Cached {len(tickers)} tickers -> {CACHE_FILE}")


def _load_cache() -> set[str]:
    return set(json.load(open(CACHE_FILE)))


# ── Public API ────────────────────────────────────────────────────────────────
def load_tickers() -> set[str]:
    """
    Returns the ticker set. Loads from cache if available,
    otherwise fetches from Wikipedia and writes the cache.
    Falls back to FALLBACK_TICKERS if all fetches fail.
    """
    if os.path.exists(CACHE_FILE):
        tickers = _load_cache()
        print(f"[ticker_loader] Loaded {len(tickers)} tickers from cache.")
        return tickers

    tickers = _fetch_tickers()

    if not tickers:
        print("[ticker_loader] All fetches failed. Using fallback ticker set.")
        return FALLBACK_TICKERS

    _save_cache(tickers)
    return tickers


def refresh() -> set[str]:
    """
    Forces a fresh fetch from Wikipedia, overwriting the cache.
    Call this weekly to keep the ticker set up to date.
    """
    if os.path.exists(CACHE_FILE):
        os.remove(CACHE_FILE)
        print("[ticker_loader] Cache cleared.")
    return load_tickers()


# ── Load on import ────────────────────────────────────────────────────────────
TICKER_SET = load_tickers()


# ── Quick test ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"\nTotal tickers: {len(TICKER_SET)}")
    print(f"USB in set:    {'USB' in TICKER_SET}")
    print(f"SPY in set:    {'SPY' in TICKER_SET}")
    print(f"Sample:        {sorted(TICKER_SET)[:10]}")
import spacy
import re

from . import ticker_loader

nlp = spacy.load("en_core_web_sm")

TICKER_SET = ticker_loader.load_tickers()

# Common all-caps English words that happen to collide with real tickers
# (ALL = Allstate, ARE = Alexandria Real Estate, IT = Gartner, ON = ON Semi,
# SO = Southern Co) and show up in ordinary prose - AP-style datelines,
# pull-quotes, headlines - not as a reference to the company.
TICKER_DENYLIST = {"ALL", "ARE", "IT", "ON", "SO", "GO", "US", "OR", "BE", "AM", "NEW"}

def extract_entities(text: str) -> dict:
    """
    Returns entities dict matching your DB schema:
    {"countries": [...], "tickers": [...]}
    """
    doc = nlp(text)

    countries = list({ent.text for ent in doc.ents if ent.label_ == "GPE"})
    candidates = set(re.findall(r'\b[A-Z]{2,5}\b', text)) - TICKER_DENYLIST
    tickers = list(candidates & TICKER_SET)

    return {
        "countries": countries,
        "tickers":   tickers,
    }

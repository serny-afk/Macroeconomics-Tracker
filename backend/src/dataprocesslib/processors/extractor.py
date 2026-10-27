import spacy
import re

from . import ticker_loader

nlp = spacy.load("en_core_web_sm")

TICKER_SET = ticker_loader.load_tickers()

def extract_entities(text: str) -> dict:
    """
    Returns entities dict matching your DB schema:
    {"countries": [...], "tickers": [...]}
    """
    doc = nlp(text)

    countries = list({ent.text for ent in doc.ents if ent.label_ == "GPE"})
    tickers   = list(set(re.findall(r'\b[A-Z]{2,5}\b', text)) & TICKER_SET)

    return {
        "countries": countries,
        "tickers":   tickers,
    }

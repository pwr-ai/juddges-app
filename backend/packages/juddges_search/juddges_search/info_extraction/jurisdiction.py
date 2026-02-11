"""Jurisdiction detection service for legal documents.

Detects document jurisdiction based on language, court patterns, and citation formats
to enable proper field mapping during extraction.
"""

import re
from typing import Literal

from loguru import logger


Jurisdiction = Literal["en_uk", "en_us", "pl", "unknown"]


# Court name patterns by jurisdiction
UK_COURT_PATTERNS = [
    r"Crown\s+Court",
    r"Court\s+of\s+Appeal",
    r"High\s+Court",
    r"Supreme\s+Court\s+of\s+the\s+United\s+Kingdom",
    r"Magistrates['']?\s+Court",
    r"Family\s+Court",
    r"Employment\s+Tribunal",
    r"Queen['']?s\s+Bench",
    r"King['']?s\s+Bench",
    r"Chancery\s+Division",
    r"Administrative\s+Court",
    r"EWCA\s+Crim",  # England and Wales Court of Appeal Criminal
    r"EWCA\s+Civ",   # England and Wales Court of Appeal Civil
    r"EWHC",         # England and Wales High Court
    r"UKSC",         # UK Supreme Court
]

US_COURT_PATTERNS = [
    r"Supreme\s+Court\s+of\s+the\s+United\s+States",
    r"U\.?S\.?\s+Court\s+of\s+Appeals",
    r"United\s+States\s+District\s+Court",
    r"Circuit\s+Court",
    r"Federal\s+Court",
    r"State\s+Supreme\s+Court",
    r"Superior\s+Court",
    r"F\.?\s*2d",     # Federal Reporter 2nd
    r"F\.?\s*3d",     # Federal Reporter 3rd
    r"U\.?S\.?\s+\d+",  # US Reports citation
]

PL_COURT_PATTERNS = [
    r"Sąd\s+Najwyższy",
    r"Sąd\s+Apelacyjny",
    r"Sąd\s+Okręgowy",
    r"Sąd\s+Rejonowy",
    r"Naczelny\s+Sąd\s+Administracyjny",
    r"Wojewódzki\s+Sąd\s+Administracyjny",
    r"Trybunał\s+Konstytucyjny",
    r"SN\s+[IVXLCDM]+",  # Supreme Court case number
    r"SA\s+[IVXLCDM]+",  # Appellate Court case number
    r"SO\s+[IVXLCDM]+",  # District Court case number
    r"SR\s+[IVXLCDM]+",  # Regional Court case number
    r"NSA",              # Supreme Administrative Court
    r"WSA",              # Voivodeship Administrative Court
    r"KIO",              # National Appeals Chamber
]

# Citation format patterns
UK_CITATION_PATTERNS = [
    r"\[\d{4}\]\s+EWCA\s+Crim\s+\d+",  # [2024] EWCA Crim 123
    r"\[\d{4}\]\s+UKSC\s+\d+",         # [2024] UKSC 1
    r"\[\d{4}\]\s+EWHC\s+\d+",         # [2024] EWHC 456
    r"\[\d{4}\]\s+\d+\s+Cr\s+App\s+R", # Criminal Appeal Reports
    r"\[\d{4}\]\s+\d+\s+WLR",          # Weekly Law Reports
    r"\[\d{4}\]\s+\d+\s+All\s+ER",     # All England Law Reports
]

PL_CITATION_PATTERNS = [
    r"[IVXLCDM]+\s+[A-Z]{2,3}\s+\d+/\d+",  # II AKa 123/24
    r"[IVXLCDM]+\s+K\s+\d+/\d+",           # II K 123/24
    r"[IVXLCDM]+\s+SA\s+\d+/\d+",          # II SA 123/24
    r"sygn\.\s+akt",                        # "sygn. akt" (case reference)
    r"Dz\.?\s*U\.?",                        # Dziennik Ustaw (Journal of Laws)
]


def detect_jurisdiction(
    text: str,
    language: str | None = None,
    court_name: str | None = None,
) -> Jurisdiction:
    """Detect document jurisdiction from content and metadata.

    Args:
        text: Document full text or relevant excerpt
        language: ISO 639-1 language code if known (e.g., 'en', 'pl')
        court_name: Court name if available

    Returns:
        Detected jurisdiction: 'en_uk', 'en_us', 'pl', or 'unknown'
    """
    scores = {
        "en_uk": 0,
        "en_us": 0,
        "pl": 0,
    }

    # Check language first (strong signal)
    if language:
        lang_lower = language.lower()
        if lang_lower == "pl":
            scores["pl"] += 10
        elif lang_lower in ("en", "en-gb", "en_gb"):
            scores["en_uk"] += 5
        elif lang_lower in ("en-us", "en_us"):
            scores["en_us"] += 5

    # Check court name patterns
    text_to_check = f"{text} {court_name or ''}"

    for pattern in UK_COURT_PATTERNS:
        if re.search(pattern, text_to_check, re.IGNORECASE):
            scores["en_uk"] += 3

    for pattern in US_COURT_PATTERNS:
        if re.search(pattern, text_to_check, re.IGNORECASE):
            scores["en_us"] += 3

    for pattern in PL_COURT_PATTERNS:
        if re.search(pattern, text_to_check, re.IGNORECASE):
            scores["pl"] += 3

    # Check citation patterns
    for pattern in UK_CITATION_PATTERNS:
        if re.search(pattern, text_to_check, re.IGNORECASE):
            scores["en_uk"] += 5

    for pattern in PL_CITATION_PATTERNS:
        if re.search(pattern, text_to_check, re.IGNORECASE):
            scores["pl"] += 5

    # Check for Polish-specific legal terms
    polish_terms = [
        "oskarżony", "oskarżona", "skazany", "skazana",
        "wyrok", "postanowienie", "uzasadnienie",
        "apelacja", "kasacja", "zażalenie",
        "prokurator", "obrońca", "pełnomocnik",
        "kodeks karny", "k.k.", "k.p.k.",
    ]
    for term in polish_terms:
        if term.lower() in text_to_check.lower():
            scores["pl"] += 2

    # Check for UK-specific legal terms
    uk_terms = [
        "defendant", "appellant", "respondent",
        "crown court", "magistrates",
        "barrister", "solicitor", "qc", "kc",
        "criminal appeal act", "sentencing council",
        "guilty plea", "not guilty",
    ]
    for term in uk_terms:
        if term.lower() in text_to_check.lower():
            scores["en_uk"] += 1

    # Find highest score
    max_score = max(scores.values())
    if max_score == 0:
        logger.debug("No jurisdiction signals found, returning 'unknown'")
        return "unknown"

    # Get jurisdiction with highest score
    for jurisdiction, score in scores.items():
        if score == max_score:
            logger.debug(f"Detected jurisdiction: {jurisdiction} (score: {score})")
            return jurisdiction  # type: ignore

    return "unknown"


def get_jurisdiction_language(jurisdiction: Jurisdiction) -> str:
    """Get the primary language for a jurisdiction.

    Args:
        jurisdiction: The detected jurisdiction

    Returns:
        ISO 639-1 language code
    """
    mapping = {
        "en_uk": "en",
        "en_us": "en",
        "pl": "pl",
        "unknown": "en",  # Default to English
    }
    return mapping.get(jurisdiction, "en")

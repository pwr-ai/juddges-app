"""Pure temporal/timeline math helpers (#147 split)."""

from collections import Counter
from typing import Any

import numpy as np

# Polish + English stopwords (same set used in clustering.py for consistency)
_DRIFT_STOPWORDS: set[str] = {
    "w",
    "z",
    "na",
    "do",
    "i",
    "o",
    "nie",
    "się",
    "jest",
    "od",
    "za",
    "że",
    "to",
    "co",
    "po",
    "jak",
    "ale",
    "tym",
    "te",
    "ten",
    "ta",
    "tego",
    "tej",
    "przez",
    "dla",
    "ze",
    "pod",
    "nad",
    "przy",
    "the",
    "a",
    "an",
    "in",
    "of",
    "and",
    "is",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "or",
    "as",
    "be",
    "was",
    "are",
    "art",
    "ust",
    "pkt",
    "nr",
    "r",
    "dz",
    "poz",
}


def _compute_date_range(
    documents: list[dict[str, Any]],
    indices: np.ndarray,
) -> dict[str, str | None]:
    """Compute earliest and latest decision_date for the given document indices."""
    dates: list[str] = []
    for idx in indices:
        date_val = documents[idx].get("decision_date")
        if date_val:
            dates.append(str(date_val))

    if not dates:
        return {"start": None, "end": None}

    dates.sort()
    return {"start": dates[0], "end": dates[-1]}


def _detect_timeline_trend(for_ratios: list[float]) -> tuple[str, float]:
    """
    Detect the overall trend of outcome direction over time using linear regression.

    Interprets the slope and variance of for_ratio across time periods to classify
    the trend as one of: emerging_consensus, stable_split, shifting, insufficient_data.

    Returns (trend_label, slope).
    """
    n = len(for_ratios)
    if n < 3:
        return "insufficient_data", 0.0

    x = np.arange(n, dtype=np.float64)
    y = np.array(for_ratios, dtype=np.float64)

    # Simple linear regression for slope
    x_mean = x.mean()
    y_mean = y.mean()
    ss_xx = float(np.sum((x - x_mean) ** 2))
    if ss_xx == 0:
        return "stable_split", 0.0

    slope = float(np.sum((x - x_mean) * (y - y_mean)) / ss_xx)

    # Compute variance of for_ratio to distinguish consensus from split
    variance = float(np.var(y))

    # Classify trend based on slope magnitude and latest values
    abs_slope = abs(slope)

    if abs_slope > 0.05:
        # Significant directional change over time
        return "shifting", round(slope, 6)

    # Low slope — check if converging toward one side (consensus) or split
    latest_ratios = for_ratios[-min(3, n) :]
    avg_latest = sum(latest_ratios) / len(latest_ratios)

    if variance < 0.02 and (avg_latest > 0.7 or avg_latest < 0.3):
        # Low variance and strongly skewed toward one direction
        return "emerging_consensus", round(slope, 6)

    return "stable_split", round(slope, 6)


def _bucket_members_by_period(
    members: list[dict[str, Any]],
) -> tuple[list[dict[str, str]], list[list[dict[str, Any]]]]:
    """
    Bucket reasoning line members into time periods based on decision_date.

    Automatically selects bucketing granularity:
    - > 3 years span: bucket by year
    - 1-3 years span: bucket by quarter
    - < 1 year span: bucket by month

    Returns (period_definitions, members_per_period) where each period definition
    has keys: period_label, start_date, end_date.
    """
    # Filter to members with valid dates and sort chronologically
    dated_members: list[tuple[str, dict[str, Any]]] = []
    for m in members:
        date_str = m.get("decision_date")
        if date_str:
            date_val = str(date_str)[:10]  # YYYY-MM-DD
            if len(date_val) >= 10:
                dated_members.append((date_val, m))

    if not dated_members:
        return [], []

    dated_members.sort(key=lambda x: x[0])
    min_date = dated_members[0][0]
    max_date = dated_members[-1][0]

    min_year = int(min_date[:4])
    max_year = int(max_date[:4])
    year_span = max_year - min_year

    # Determine bucketing strategy based on date range span
    periods: list[dict[str, str]] = []

    if year_span > 3:
        # Bucket by year
        for year in range(min_year, max_year + 1):
            periods.append(
                {
                    "period_label": str(year),
                    "start_date": f"{year}-01-01",
                    "end_date": f"{year}-12-31",
                }
            )
    elif year_span >= 1:
        # Bucket by quarter
        for year in range(min_year, max_year + 1):
            for q in range(1, 5):
                start_month = (q - 1) * 3 + 1
                end_month = q * 3
                end_day = {3: 31, 6: 30, 9: 30, 12: 31}[end_month]
                periods.append(
                    {
                        "period_label": f"{year}-Q{q}",
                        "start_date": f"{year}-{start_month:02d}-01",
                        "end_date": f"{year}-{end_month:02d}-{end_day}",
                    }
                )
    else:
        # Bucket by month (same year or very close)
        min_month = int(min_date[5:7])
        max_month = int(max_date[5:7])
        year = min_year
        for month in range(min_month, max_month + 1):
            end_day = {
                1: 31,
                2: 28,
                3: 31,
                4: 30,
                5: 31,
                6: 30,
                7: 31,
                8: 31,
                9: 30,
                10: 31,
                11: 30,
                12: 31,
            }[month]
            periods.append(
                {
                    "period_label": f"{year}-{month:02d}",
                    "start_date": f"{year}-{month:02d}-01",
                    "end_date": f"{year}-{month:02d}-{end_day}",
                }
            )

    if not periods:
        return [], []

    # Assign each dated member to the matching period bucket
    members_per_period: list[list[dict[str, Any]]] = [[] for _ in periods]
    for date_val, member in dated_members:
        for idx, period in enumerate(periods):
            if period["start_date"] <= date_val <= period["end_date"]:
                members_per_period[idx].append(member)
                break

    return periods, members_per_period


def _extract_window_keywords(
    judgments: list[dict[str, Any]], top_n: int = 5
) -> list[str]:
    """
    Extract top-N keywords from a window of judgments using simple term frequency.

    Combines title + summary text from each judgment, tokenizes, filters stopwords,
    and returns the most frequent terms.
    """
    word_counts: Counter = Counter()

    for doc in judgments:
        text_parts: list[str] = []
        if doc.get("title"):
            text_parts.append(doc["title"])
        if doc.get("summary"):
            text_parts.append(doc["summary"])
        text = " ".join(text_parts).lower()

        # Tokenize: keep only alphabetic words longer than 2 chars
        words = [
            w
            for w in text.split()
            if len(w) > 2 and w not in _DRIFT_STOPWORDS and w.isalpha()
        ]
        word_counts.update(words)

    return [word for word, _ in word_counts.most_common(top_n)]

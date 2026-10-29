#!/usr/bin/env python3
"""
Ingest Polish CHF-indexed loan judgments ("kredyty frankowe") from
JuDDGES/pl-court-raw as a balanced pre/post-Dziubak set (issue #606).

CJEU C-260/18 *Dziubak* was decided on 2019-10-03. The set is stratified by
year x court level on each side of that date so a change in outcome direction
can be read as a change in judging rather than as a change in which courts or
years happened to be sampled.

Selection rule (identical for both periods): civil department, judgment_date
in [2014-01-01, 2024-12-31], full text contains at least MIN_MENTIONS strong
CHF-loan markers (indexed/denominated loan, Swiss franc, CHF). Portal keyword
tags are not used — they are sparse before 2020.

Every inserted row carries metadata.collection = 'chf-loans-606' so a bad run
rolls back with one statement:

    DELETE FROM judgments WHERE metadata->>'collection' = 'chf-loans-606';

Usage:
    python scripts/ingest_chf_judgments.py --dry-run           # print the stratification table only
    python scripts/ingest_chf_judgments.py                      # 300 per period
    python scripts/ingest_chf_judgments.py --per-period 150 --seed 7

Alternatively, --from-extractions ingests the judgments behind an earlier
LLM-extraction run instead of sampling: the JuDDGES "sprawy frankowe"
pickles (extractions_df_*.pkl, extractions_with_doc_id.pkl). Only rows the
extraction marked as a CHF case (sprawa_frankowiczów == True) are kept, and
they are matched to pl-court-raw by document_id, or by (signature, date) when
a pickle has no document_id. All court levels are kept, and the extracted
fields are stored under metadata.chf_extraction. Rows are tagged with
--collection (default 'chf-loans-5k'), so they roll back independently of
the stratified set:

    python scripts/ingest_chf_judgments.py --from-extractions \\
        extractions_with_doc_id.pkl extractions_df_2024-12-11_test.pkl --dry-run

Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TEI_EMBEDDING_URL in .env.
Reads the dataset from the local HuggingFace cache (downloads on first use).
"""

import argparse
import collections
import datetime as dt
import json
import os
import random
import re
import sys
from pathlib import Path

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq
import requests
from dotenv import load_dotenv
from huggingface_hub import snapshot_download
from loguru import logger
from rich.console import Console
from rich.table import Table
from supabase import create_client

console = Console()

DATASET = "JuDDGES/pl-court-raw"
COLLECTION_TAG = "chf-loans-606"
DZIUBAK_DATE = dt.date(2019, 10, 3)
DATE_LO = dt.datetime(2014, 1, 1)
DATE_HI = dt.datetime(2025, 1, 1)
MIN_MENTIONS = 3
EMBEDDING_DIM = 1024
EMBED_BATCH = 16
INSERT_BATCH = 5

META_COLUMNS = [
    "judgment_id",
    "docket_number",
    "judgment_date",
    "court_name",
    "department_name",
    "judgment_type",
    "judges",
    "presiding_judge",
    "keywords",
    "legal_bases",
    "excerpt",
    "num_pages",
    "source",
]

# A judgment about a CHF-indexed loan repeats these; a passing mention does not.
STRONG_MARKER = re.compile(
    r"kredyt\w*\s+(?:indeksowan|denominowan)\w*"
    r"|frank\w*\s+szwajcarsk\w*"
    r"|\bCHF\b",
    re.IGNORECASE,
)

COURT_LEVELS = {
    "Sąd Apelacyjny": "Court of Appeal",
    "Sąd Okręgowy": "Regional Court",
}
# --from-extractions keeps every level the extraction run covered.
ALL_COURT_LEVELS = {**COURT_LEVELS, "Sąd Rejonowy": "District Court"}
COURT_TYPES = {
    "Court of Appeal": "appellate",
    "Regional Court": "regional",
    "District Court": "district",
}

EXTRACTIONS_COLLECTION_TAG = "chf-loans-5k"
# Pickle columns that describe the source document or the LLM run rather than
# the extracted fields themselves.
EXTRACTION_NON_FIELDS = {
    "text",
    "excerpt",
    "highlights",
    "score",
    "llm_completion",
    "LLM",
    "schema",
    "language",
    "signature",
    "date",
    "court_name",
    "department_name",
    "document_id",
}


def court_level(court_name: str, levels: dict[str, str] = COURT_LEVELS) -> str | None:
    for prefix, level in levels.items():
        if court_name.startswith(prefix):
            return level
    return None


def period(date: dt.date) -> str:
    return "pre" if date < DZIUBAK_DATE else "post"


def parquet_files() -> list[str]:
    snapshot = snapshot_download(
        DATASET, repo_type="dataset", allow_patterns=["data/*.parquet"]
    )
    files = sorted(str(p) for p in Path(snapshot).glob("data/*.parquet"))
    if not files:
        sys.exit(f"No parquet files under {snapshot}")
    return files


def scan_candidates(files: list[str]) -> list[dict]:
    """Civil rows in the date window whose full text repeats CHF-loan markers."""
    candidates: list[dict] = []
    for path in files:
        pf = pq.ParquetFile(path)
        for rg in range(pf.num_row_groups):
            meta = pf.read_row_group(rg, columns=META_COLUMNS)
            dept = pc.utf8_lower(pc.fill_null(meta["department_name"], ""))
            in_window = pc.and_(
                pc.greater_equal(meta["judgment_date"], pa.scalar(DATE_LO)),
                pc.less(meta["judgment_date"], pa.scalar(DATE_HI)),
            )
            mask = pc.fill_null(
                pc.and_(pc.match_substring(dept, "cywiln"), in_window), False
            )
            idx = pc.indices_nonzero(mask)
            if len(idx) == 0:
                continue
            texts = (
                pf.read_row_group(rg, columns=["full_text"])["full_text"]
                .take(idx)
                .to_pylist()
            )
            for row, text in zip(meta.take(idx).to_pylist(), texts, strict=True):
                text = text or ""
                mentions = len(STRONG_MARKER.findall(text))
                if mentions < MIN_MENTIONS:
                    continue
                level = court_level(row["court_name"] or "")
                if level is None:
                    continue
                date = row["judgment_date"].date()
                row.update(
                    full_text=text,
                    chf_mentions=mentions,
                    court_level=level,
                    decision_date=date,
                    period=period(date),
                )
                candidates.append(row)
        console.print(f"  {Path(path).name}: {len(candidates)} candidates so far")
    return candidates


def load_extractions(
    paths: list[str],
) -> tuple[dict[str, dict], dict[tuple[str, str], dict]]:
    """CHF-positive extraction rows keyed by document_id and by (signature, date)."""
    import pandas as pd

    by_id: dict[str, dict] = {}
    by_key: dict[tuple[str, str], dict] = {}
    for path in paths:
        df = pd.read_pickle(path)
        df = df[df["sprawa_frankowiczów"] == True]
        fields = [c for c in df.columns if c not in EXTRACTION_NON_FIELDS]
        # to_json turns NaN/Timestamp/numpy scalars into plain JSON values
        payloads = json.loads(df[fields].to_json(orient="records", date_format="iso"))
        for (_, row), payload in zip(df.iterrows(), payloads, strict=True):
            if "document_id" in df.columns and isinstance(row["document_id"], str):
                by_id[row["document_id"]] = payload
            else:
                by_key[(str(row["signature"]).strip(), str(row["date"])[:10])] = payload
        console.print(f"  {Path(path).name}: {len(df)} CHF rows")
    return by_id, by_key


def scan_by_extractions(
    files: list[str],
    by_id: dict[str, dict],
    by_key: dict[tuple[str, str], dict],
) -> list[dict]:
    """pl-court-raw rows behind the extraction pickles, with the extraction attached.

    A (signature, date) key can match several documents of one case (e.g. the
    judgment and its reasons); only the first is kept, so each extraction maps
    to one row.
    """
    found: list[dict] = []
    used_keys: set[tuple[str, str]] = set()
    for path in files:
        pf = pq.ParquetFile(path)
        for rg in range(pf.num_row_groups):
            meta = pf.read_row_group(rg, columns=META_COLUMNS).to_pylist()
            hits = []
            for i, row in enumerate(meta):
                date = row["judgment_date"]
                key = (
                    (row["docket_number"] or "").strip(),
                    date.date().isoformat() if date else "",
                )
                payload = by_id.get(row["judgment_id"])
                if payload is None and key in by_key and key not in used_keys:
                    payload = by_key[key]
                    used_keys.add(key)
                if payload is not None:
                    hits.append((i, row, payload))
            if not hits:
                continue
            texts = (
                pf.read_row_group(rg, columns=["full_text"])["full_text"]
                .take([i for i, _, _ in hits])
                .to_pylist()
            )
            for (_, row, payload), text in zip(hits, texts, strict=True):
                text = text or ""
                date = row["judgment_date"].date()
                row.update(
                    full_text=text,
                    chf_mentions=len(STRONG_MARKER.findall(text)),
                    court_level=court_level(row["court_name"] or "", ALL_COURT_LEVELS),
                    decision_date=date,
                    period=period(date),
                    chf_extraction=payload,
                )
                found.append(row)
        console.print(f"  {Path(path).name}: {len(found)} matched so far")
    return found


def stratified_sample(candidates: list[dict], per_period: int, seed: int) -> list[dict]:
    """Equal quota per (year, court_level) cell within each period; leftovers fill from the pool."""
    rng = random.Random(seed)
    chosen: list[dict] = []
    for p in ("pre", "post"):
        pool = [c for c in candidates if c["period"] == p]
        cells: dict[tuple[int, str], list[dict]] = collections.defaultdict(list)
        for c in pool:
            cells[(c["decision_date"].year, c["court_level"])].append(c)
        quota = max(1, per_period // len(cells))
        picked: list[dict] = []
        for members in cells.values():
            rng.shuffle(members)
            picked.extend(members[:quota])
        if len(picked) < per_period:
            picked_ids = {c["judgment_id"] for c in picked}
            rest = [c for c in pool if c["judgment_id"] not in picked_ids]
            rng.shuffle(rest)
            picked.extend(rest[: per_period - len(picked)])
        chosen.extend(picked[:per_period])
    return chosen


def print_strata(
    rows: list[dict], title: str, levels: dict[str, str] = COURT_LEVELS
) -> None:
    table = Table(title=title)
    table.add_column("year")
    for level in levels.values():
        table.add_column(level, justify="right")
    table.add_column("total", justify="right")
    counts = collections.Counter(
        (r["decision_date"].year, r["court_level"]) for r in rows
    )
    for year in sorted({r["decision_date"].year for r in rows}):
        cells = [counts[(year, level)] for level in levels.values()]
        table.add_row(str(year), *[str(c) for c in cells], str(sum(cells)))
    per_period = collections.Counter(r["period"] for r in rows)
    table.add_row("pre / post", "", "", f"{per_period['pre']} / {per_period['post']}")
    console.print(table)


def existing_source_ids(sb) -> set[str]:
    ids: set[str] = set()
    offset, page = 0, 1000
    while True:
        resp = (
            sb.table("judgments")
            .select("source_id, metadata->>source_judgment_id")
            .eq("jurisdiction", "PL")
            .range(offset, offset + page - 1)
            .execute()
        )
        for row in resp.data:
            ids.add(row.get("source_id") or "")
            ids.add(row.get("source_judgment_id") or "")
        if len(resp.data) < page:
            return ids
        offset += page


def check_tei(tei_url: str, verify: bool) -> None:
    info = requests.get(f"{tei_url}/info", timeout=10, verify=verify).json()
    model = info.get("model_id", "")
    if "bge-m3" not in model.lower():
        sys.exit(
            f"TEI at {tei_url} serves {model!r}, expected BAAI/bge-m3 ({EMBEDDING_DIM}d)"
        )


def embed(texts: list[str], tei_url: str, verify: bool) -> list[list[float] | None]:
    resp = requests.post(
        f"{tei_url}/embed",
        json={"inputs": [t[:32000] for t in texts], "truncate": True},
        timeout=180,
        verify=verify,
    )
    resp.raise_for_status()
    return [v if len(v) == EMBEDDING_DIM else None for v in resp.json()]


def embedding_text(row: dict) -> str:
    # Same recipe as scripts/reembed_bge_m3.py so the new rows sit in the same space.
    parts = [row["title"], row["summary"], row["full_text"][:16000]]
    return "\n\n".join(p for p in parts if p)


def to_judgment(row: dict, collection: str = COLLECTION_TAG) -> dict:
    judges = list(row.get("judges") or [])
    presiding = row.get("presiding_judge") or ""
    if presiding and presiding not in judges:
        judges.insert(0, presiding)
    excerpt = row.get("excerpt") or ""
    legal_bases = [str(lb) for lb in (row.get("legal_bases") or [])][:20]
    metadata = {
        "language": "pl",
        "department": row.get("department_name") or "",
        "court_type": COURT_TYPES.get(row["court_level"], "other"),
        "source_judgment_id": row["judgment_id"],
        "num_pages": row.get("num_pages"),
        "country": "PL",
        "collection": collection,
        "dziubak_period": row["period"],
        "chf_mentions": row["chf_mentions"],
    }
    if row.get("chf_extraction") is not None:
        metadata["chf_extraction"] = row["chf_extraction"]
    return {
        "case_number": row.get("docket_number") or f"PL-CHF-{row['judgment_id'][:12]}",
        "jurisdiction": "PL",
        "court_name": row["court_name"],
        "court_level": row["court_level"],
        "decision_date": row["decision_date"].isoformat(),
        "title": excerpt[:500] if excerpt else row["full_text"][:200],
        "summary": excerpt[:2000],
        "full_text": row["full_text"],
        "judges": judges,
        "case_type": "Civil",
        "decision_type": row.get("judgment_type") or "",
        "outcome": None,
        "keywords": list(row.get("keywords") or [])[:20],
        "legal_topics": legal_bases,
        "cited_legislation": legal_bases,
        "metadata": metadata,
        "source_dataset": DATASET,
        "source_id": row["judgment_id"],
        "source_url": row.get("source") or "",
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--per-period", type=int, default=300, help="judgments per side of 2019-10-03"
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--dry-run", action="store_true", help="select and print strata, write nothing"
    )
    parser.add_argument(
        "--from-extractions",
        nargs="+",
        metavar="PKL",
        help="ingest the CHF-positive rows of these extraction pickles instead of sampling",
    )
    parser.add_argument(
        "--collection",
        help=f"metadata.collection tag (default {COLLECTION_TAG}, "
        f"or {EXTRACTIONS_COLLECTION_TAG} with --from-extractions)",
    )
    args = parser.parse_args()

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")

    if args.from_extractions:
        collection = args.collection or EXTRACTIONS_COLLECTION_TAG
        console.print("Loading extraction pickles ...")
        by_id, by_key = load_extractions(args.from_extractions)
        wanted = len(by_id) + len(by_key)
        console.print(f"Scanning {DATASET} for {wanted} extracted judgments ...")
        chosen = scan_by_extractions(parquet_files(), by_id, by_key)
        console.print(f"{len(chosen)} of {wanted} matched in {DATASET}")
        print_strata(chosen, f"Matched ({collection})", ALL_COURT_LEVELS)
    else:
        collection = args.collection or COLLECTION_TAG
        console.print(f"Scanning {DATASET} for CHF-loan civil judgments ...")
        candidates = scan_candidates(parquet_files())
        print_strata(
            candidates, f"Candidates (>= {MIN_MENTIONS} markers, Regional + Appeal)"
        )
        chosen = stratified_sample(candidates, args.per_period, args.seed)
        print_strata(
            chosen, f"Selected (seed {args.seed}, {args.per_period} per period)"
        )

    if args.dry_run:
        console.print("[yellow]--dry-run: nothing written[/yellow]")
        return

    sb = create_client(
        os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    )
    tei_url = os.environ["TEI_EMBEDDING_URL"].rstrip("/")
    verify = os.getenv("TEI_VERIFY_SSL", "true").lower() == "true"
    check_tei(tei_url, verify)

    known = existing_source_ids(sb)
    fresh = [c for c in chosen if c["judgment_id"] not in known]
    console.print(
        f"{len(chosen) - len(fresh)} already ingested, {len(fresh)} to insert"
    )

    judgments = [to_judgment(c, collection) for c in fresh]
    inserted = failed = 0
    for start in range(0, len(judgments), EMBED_BATCH):
        batch = judgments[start : start + EMBED_BATCH]
        try:
            vectors = embed([embedding_text(j) for j in batch], tei_url, verify)
        except requests.RequestException as e:
            logger.error(f"embedding batch at {start} failed: {e}")
            failed += len(batch)
            continue
        rows = []
        for j, vec in zip(batch, vectors, strict=True):
            if vec is None:
                logger.warning(f"no embedding for {j['case_number']}, skipping")
                failed += 1
                continue
            rows.append({**j, "embedding": "[" + ",".join(map(str, vec)) + "]"})
        for i in range(0, len(rows), INSERT_BATCH):
            chunk = rows[i : i + INSERT_BATCH]
            try:
                sb.table("judgments").insert(chunk).execute()
                inserted += len(chunk)
                continue
            except (
                Exception
            ) as e:  # PostgREST statement timeout on a fat batch; retry row by row
                logger.warning(
                    f"batch insert failed ({e}); retrying rows one at a time"
                )
            for r in chunk:
                try:
                    sb.table("judgments").insert(r).execute()
                    inserted += 1
                except (
                    Exception
                ) as e:  # surface and continue; rollback is by collection tag
                    logger.error(f"insert failed for {r['case_number']}: {e}")
                    failed += 1
        console.print(f"  {inserted} inserted, {failed} failed")

    console.print(
        f"[green]Done:[/green] {inserted} inserted, {failed} failed, tag metadata.collection={collection}"
    )


if __name__ == "__main__":
    main()

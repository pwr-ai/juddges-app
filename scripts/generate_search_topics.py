"""
Offline pipeline: generate unified bilingual criminal-case search topics.

Produces up to 500 cross-lingual topic concepts from PL + UK criminal
judgments stored in Supabase, then pushes them to a Meilisearch ``topics``
index via atomic swap (zero-downtime refresh).

Steps
-----
1. Pull criminal judgments from Supabase (PL + UK, up to 6 000 each).
2. Cluster each jurisdiction independently with BERTopic (~75 clusters).
3. Label each cluster with GPT-4o-mini (structured output).
4. Cross-lingual alignment: single GPT-4o-mini call → up to 500 unified concepts.
5. Cap at 500, sort by doc_count desc.
6. Write ``frontend/lib/stats/search-topics.json``.
7. Atomic Meilisearch swap (unless ``--dry-run``).

Usage (inside backend container — per project convention):

    docker compose run --rm backend python -m scripts.generate_search_topics

    # or with explicit options:
    docker compose run --rm backend python -m scripts.generate_search_topics \\
      --jurisdictions pl,uk --case-type criminal \\
      --output frontend/lib/stats/search-topics.json

    # dry-run: skips Meilisearch push entirely
    docker compose run --rm backend python -m scripts.generate_search_topics --dry-run
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import unicodedata
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

# ---------------------------------------------------------------------------
# sys.path: ensure backend package is importable when running from repo root
# ---------------------------------------------------------------------------
_SCRIPT_DIR = Path(__file__).parent
_BACKEND_DIR = _SCRIPT_DIR.parent / "backend"
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(_SCRIPT_DIR.parent / ".env")

# ---------------------------------------------------------------------------
# Rich / loguru setup — must come before any module that calls logger
# ---------------------------------------------------------------------------
from loguru import logger  # noqa: E402
from rich.console import Console  # noqa: E402
from rich.panel import Panel  # noqa: E402
from rich.progress import (  # noqa: E402
    BarColumn,
    MofNCompleteColumn,
    Progress,
    SpinnerColumn,
    TextColumn,
    TimeElapsedColumn,
)
from rich.prompt import Confirm  # noqa: E402
from rich.table import Table  # noqa: E402

logger.remove()
logger.add(
    sys.stderr,
    format=(
        "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - "
        "<level>{message}</level>"
    ),
    level="INFO",
)

console = Console()

# ---------------------------------------------------------------------------
# ML / topic-modelling dependencies — imported lazily inside functions so
# the module can be imported by tests without requiring bertopic to be
# installed in the test environment.  The actual pipeline will fail fast
# at the clustering step if the packages are absent.
# ---------------------------------------------------------------------------
try:
    import openai
    from pydantic import BaseModel as PydanticBaseModel
except ImportError as exc:
    console.print(f"[red]Missing dependency:[/red] {exc}")
    sys.exit(1)

# Backend service imports — available once _BACKEND_DIR is on sys.path
try:
    from app.services.meilisearch_config import (  # noqa: E402
        setup_topics_meilisearch_index,
    )
    from app.services.search_topics_store import (  # noqa: E402
        load_search_topics_run,
        persist_search_topics_run,
        topic_row_to_meilisearch_document,
    )
    from app.services.search import MeiliSearchService  # noqa: E402
except ImportError:
    # Tests run outside the backend container and may not have the backend
    # installed.  The pipeline will fail at the Meilisearch step in that case,
    # but the rest of the module (slug helpers, alignment, etc.) stays usable.
    MeiliSearchService = None  # type: ignore[assignment,misc]
    setup_topics_meilisearch_index = None  # type: ignore[assignment]
    load_search_topics_run = None  # type: ignore[assignment]
    persist_search_topics_run = None  # type: ignore[assignment]
    topic_row_to_meilisearch_document = None  # type: ignore[assignment]


def _import_ml_deps():
    """Lazily import ML dependencies; raises ImportError with helpful message."""
    try:
        import numpy as _np
        from bertopic import BERTopic as _BERTopic
        from hdbscan import HDBSCAN as _HDBSCAN
        from sentence_transformers import SentenceTransformer as _ST
        from sklearn.feature_extraction.text import CountVectorizer as _CV
        from umap import UMAP as _UMAP

        return _np, _BERTopic, _HDBSCAN, _ST, _CV, _UMAP
    except ImportError as exc:
        console.print(
            f"[red]Missing ML dependency:[/red] {exc}\n"
            "Install via: pip install -r scripts/requirements.txt"
        )
        raise

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_DEFAULT_JURISDICTIONS = "pl,uk"
_DEFAULT_CASE_TYPE = "criminal"
_DEFAULT_OUTPUT = Path("frontend/lib/stats/search-topics.json")
_DEFAULT_SAMPLE = 6_000
_DEFAULT_CLUSTERS = 75
_DEFAULT_MAX_CONCEPTS = 500

# Fixed category taxonomy the LLM must choose from during alignment.
_CATEGORY_TAXONOMY = [
    "drug_offences",
    "fraud",
    "violence",
    "sex_offences",
    "traffic",
    "white_collar",
    "procedural",
    "sentencing",
    "property_crime",
    "public_order",
    "organised_crime",
    "terrorism",
    "human_trafficking",
    "juvenile",
    "other",
]

_Category = Literal[
    "drug_offences",
    "fraud",
    "violence",
    "sex_offences",
    "traffic",
    "white_collar",
    "procedural",
    "sentencing",
    "property_crime",
    "public_order",
    "organised_crime",
    "terrorism",
    "human_trafficking",
    "juvenile",
    "other",
]
_Jurisdiction = Literal["pl", "uk"]

# ---------------------------------------------------------------------------
# Pydantic schemas for structured LLM output
# ---------------------------------------------------------------------------


class ClusterLabel(PydanticBaseModel):
    """GPT-4o-mini structured output for a single cluster."""

    label: str
    keywords: list[str]
    description: str


class UnifiedConcept(PydanticBaseModel):
    """Single cross-lingual concept emitted by the alignment call."""

    id: str
    label_pl: str
    label_en: str
    aliases_pl: list[str]
    aliases_en: list[str]
    category: _Category
    doc_count: int
    jurisdictions: list[_Jurisdiction]


class AlignmentOutput(PydanticBaseModel):
    concepts: list[UnifiedConcept]


# ---------------------------------------------------------------------------
# Slug helper
# ---------------------------------------------------------------------------


def make_slug(text: str) -> str:
    """Convert an arbitrary string to a deterministic lowercase ASCII snake_case slug.

    Example: "Handel narkotykami" → "handel_narkotykami"
    """
    # Normalise unicode → ASCII approximations (é→e, ą→a, etc.)
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    # Replace non-alphanumeric runs with underscores
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = text.strip("_")
    return text or "unknown"


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------


def _get_supabase():
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def pull_criminal_judgments(
    jurisdiction: str,
    case_type: str = "criminal",
    sample: int = 6_000,
) -> list[dict[str, Any]]:
    """Fetch criminal judgments from Supabase for a given jurisdiction.

    For UK: filters ``case_type ILIKE '%criminal%'``.
    For PL: filters ``department_name ILIKE '%Wydział Karny%'``.

    Returns rows with id, title, summary, embedding (as list[float]).
    """
    sb = _get_supabase()
    jur = jurisdiction.upper()

    columns = "id, title, summary, embedding, department_name, case_type"

    logger.info(f"Pulling {jur} criminal judgments from Supabase …")

    if jur == "UK":
        resp = (
            sb.table("judgments")
            .select(columns)
            .eq("jurisdiction", jur)
            .ilike("case_type", f"%{case_type}%")
            .limit(sample)
            .execute()
        )
    else:
        # PL: use department_name to identify criminal division
        resp = (
            sb.table("judgments")
            .select(columns)
            .eq("jurisdiction", jur)
            .ilike("department_name", "%Wydział Karny%")
            .limit(sample)
            .execute()
        )

    rows = resp.data or []
    logger.info(f"  {jur}: {len(rows)} rows fetched")
    return rows


def count_criminal_judgments(case_type: str = "criminal") -> int:
    """Return total criminal judgment count across both jurisdictions."""
    sb = _get_supabase()
    uk = (
        sb.table("judgments")
        .select("id", count="exact")
        .eq("jurisdiction", "UK")
        .ilike("case_type", f"%{case_type}%")
        .limit(1)
        .execute()
    )
    pl = (
        sb.table("judgments")
        .select("id", count="exact")
        .eq("jurisdiction", "PL")
        .ilike("department_name", "%Wydział Karny%")
        .limit(1)
        .execute()
    )
    return (uk.count or 0) + (pl.count or 0)


# ---------------------------------------------------------------------------
# BERTopic clustering
# ---------------------------------------------------------------------------

_PL_STOPWORDS = [
    "i",
    "w",
    "z",
    "na",
    "do",
    "się",
    "nie",
    "że",
    "to",
    "jest",
    "po",
    "jak",
    "co",
    "ale",
    "przez",
    "przy",
    "od",
    "ze",
    "za",
    "który",
    "która",
    "które",
    "jego",
    "jej",
    "ich",
    "tego",
    "tej",
    "być",
    "może",
    "już",
    "gdy",
    "więcej",
    "więc",
    "tym",
    "ta",
    "ten",
    "te",
    "sąd",
    "sądu",
    "wyrok",
    "wyroku",
    "nr",
    "r",
    "roku",
    "dnia",
    "akt",
    "sprawy",
    "sprawa",
]

_EN_STOPWORDS = "english"  # scikit-learn built-in


def cluster_with_bertopic(
    rows: list[dict[str, Any]],
    jurisdiction: str,
    nr_topics: int = 75,
) -> tuple[list[dict[str, Any]], list[int], list[str]]:
    """Cluster judgments using BERTopic.

    Reuses pre-computed ``embedding`` vectors from Supabase so no new
    embedding calls are made.  Falls back to text-based sentence-transformer
    embedding if vectors are absent.

    Returns:
        (cluster_records, topic_assignments, texts)
        where ``cluster_records`` is a list of dicts with
        {topic_id, keywords, doc_count, representative_rows}.
    """
    # Lazy-import heavy ML deps so the module is importable without them.
    np, BERTopic, HDBSCAN, SentenceTransformer, CountVectorizer, UMAP = (
        _import_ml_deps()
    )

    jur = jurisdiction.upper()

    # Filter to rows that have either text or embeddings
    valid_rows = [
        r
        for r in rows
        if r.get("embedding") or r.get("summary") or r.get("title")
    ]

    if not valid_rows:
        logger.warning(f"{jur}: no valid rows after filtering — skipping clustering")
        return [], [], []

    texts: list[str] = []
    for r in valid_rows:
        parts = []
        if r.get("title"):
            parts.append(r["title"].strip())
        if r.get("summary"):
            parts.append(r["summary"].strip()[:800])
        texts.append(" ".join(parts) if parts else "(no text)")

    # Try to use pre-computed embeddings
    embeddings = None
    if any(r.get("embedding") for r in valid_rows):
        try:
            raw = [r.get("embedding") for r in valid_rows]
            # Supabase returns vectors as Python lists already
            if all(isinstance(e, list) for e in raw):
                embeddings = np.array(raw, dtype=np.float32)
                logger.info(
                    f"{jur}: using pre-computed embeddings "
                    f"shape={embeddings.shape}"
                )
        except Exception as e:
            logger.warning(f"{jur}: failed to load embeddings ({e}) — will re-embed")
            embeddings = None

    logger.info(f"{jur}: clustering {len(texts)} texts → target ~{nr_topics} topics")

    # UMAP
    umap_model = UMAP(
        n_neighbors=15,
        n_components=5,
        min_dist=0.0,
        metric="cosine",
        random_state=42,
    )

    # HDBSCAN — min_cluster_size scales with corpus; floor at 5 for small fixtures
    min_cs = max(5, len(texts) // (nr_topics * 2))
    hdbscan_model = HDBSCAN(
        min_cluster_size=min_cs,
        metric="euclidean",
        cluster_selection_method="eom",
        prediction_data=True,
    )

    # Language-specific CountVectorizer stopwords
    if jur == "PL":
        vectorizer_model = CountVectorizer(
            ngram_range=(1, 2),
            stop_words=_PL_STOPWORDS,
            max_features=5000,
            min_df=max(2, len(texts) // 500),
            max_df=0.9,
        )
    else:
        vectorizer_model = CountVectorizer(
            ngram_range=(1, 2),
            stop_words=_EN_STOPWORDS,
            max_features=5000,
            min_df=max(2, len(texts) // 500),
            max_df=0.9,
        )

    embedding_model: Any = None
    if embeddings is None:
        embedding_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

    topic_model = BERTopic(
        embedding_model=embedding_model,
        umap_model=umap_model,
        hdbscan_model=hdbscan_model,
        vectorizer_model=vectorizer_model,
        calculate_probabilities=False,
        nr_topics=nr_topics,
        verbose=False,
    )

    with Progress(
        SpinnerColumn(),
        TextColumn(f"[bold blue]{jur}[/bold blue] BERTopic fitting…"),
        TimeElapsedColumn(),
        console=console,
        transient=True,
    ) as prog:
        prog.add_task("fit", total=None)
        if embeddings is not None:
            topic_assignments, _ = topic_model.fit_transform(texts, embeddings)
        else:
            topic_assignments, _ = topic_model.fit_transform(texts)

    topic_info = topic_model.get_topic_info()
    valid_topics = topic_info[topic_info["Topic"] != -1]
    logger.info(f"{jur}: {len(valid_topics)} clusters found (excl. outliers)")

    cluster_records: list[dict[str, Any]] = []
    for _, row in valid_topics.iterrows():
        tid = row["Topic"]
        kws = [w for w, _ in topic_model.get_topic(tid)[:15]]
        indices = [i for i, t in enumerate(topic_assignments) if t == tid]
        rep_rows = [valid_rows[i] for i in indices[:10]]
        cluster_records.append(
            {
                "topic_id": int(tid),
                "keywords": kws,
                "doc_count": int(row["Count"]),
                "representative_rows": rep_rows,
            }
        )

    # Sort by doc_count desc
    cluster_records.sort(key=lambda c: c["doc_count"], reverse=True)
    return cluster_records, list(topic_assignments), texts


# ---------------------------------------------------------------------------
# GPT-4o-mini labelling
# ---------------------------------------------------------------------------


def _build_openai_client() -> openai.OpenAI:
    key = os.environ.get("OPENAI_API_KEY", "")
    if not key:
        raise ValueError("OPENAI_API_KEY not set")
    return openai.OpenAI(api_key=key)


def label_cluster(
    client: openai.OpenAI,
    cluster: dict[str, Any],
    jurisdiction: str,
) -> ClusterLabel:
    """Call GPT-4o-mini with structured output for a single cluster."""
    kws = ", ".join(cluster["keywords"][:10])
    summaries: list[str] = []
    for r in cluster["representative_rows"][:10]:
        text = (r.get("summary") or r.get("title") or "").strip()[:600]
        if text:
            summaries.append(text)

    docs_block = "\n\n".join(
        f"Judgment {i + 1}: {s}" for i, s in enumerate(summaries[:10])
    )

    lang_hint = "Polish" if jurisdiction.upper() == "PL" else "English"
    prompt = (
        f"You are a legal expert specialising in {lang_hint} criminal court judgments.\n\n"
        f"CLUSTER KEYWORDS: {kws}\n\n"
        f"REPRESENTATIVE JUDGMENTS:\n{docs_block}\n\n"
        "Provide a structured label for this cluster:\n"
        "- label: short canonical noun phrase in English (≤60 chars, e.g. 'Drug trafficking')\n"
        "- keywords: 5-8 English alias/keyword strings useful for search\n"
        "- description: 1-2 sentence English description of what this cluster covers\n\n"
        "Respond ONLY with valid JSON matching the schema."
    )

    try:
        resp = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "Return structured JSON. No markdown fences.",
                },
                {"role": "user", "content": prompt},
            ],
            response_format=ClusterLabel,
            max_tokens=400,
            temperature=0.1,
        )
        return resp.choices[0].message.parsed
    except Exception as exc:
        logger.warning(f"Cluster labelling failed ({exc}); using keyword fallback")
        return ClusterLabel(
            label=", ".join(cluster["keywords"][:3]),
            keywords=cluster["keywords"][:8],
            description=f"Criminal law topic related to {', '.join(cluster['keywords'][:5])}.",
        )


def label_all_clusters(
    client: openai.OpenAI,
    clusters: list[dict[str, Any]],
    jurisdiction: str,
) -> list[dict[str, Any]]:
    """Label every cluster and attach label metadata in-place (returns new list)."""
    labelled: list[dict[str, Any]] = []

    with Progress(
        SpinnerColumn(),
        TextColumn(
            f"[bold blue]{jurisdiction.upper()}[/bold blue] labelling clusters…"
        ),
        BarColumn(),
        MofNCompleteColumn(),
        console=console,
    ) as prog:
        task = prog.add_task("label", total=len(clusters))
        for cluster in clusters:
            lbl = label_cluster(client, cluster, jurisdiction)
            labelled.append(
                {
                    **cluster,
                    "label": lbl.label,
                    "label_keywords": lbl.keywords,
                    "description": lbl.description,
                }
            )
            prog.advance(task)

    return labelled


# ---------------------------------------------------------------------------
# Cross-lingual alignment
# ---------------------------------------------------------------------------


def align_concepts(
    client: openai.OpenAI,
    pl_clusters: list[dict[str, Any]],
    uk_clusters: list[dict[str, Any]],
    max_concepts: int = 500,
    generated_at: str = "",
    corpus_snapshot: int = 0,
) -> list[dict[str, Any]]:
    """Single GPT-4o-mini call to produce up to 500 unified bilingual concepts.

    The LLM receives the PL cluster list and the UK cluster list (each with
    label, keywords, description, doc_count) and produces a deduplicated,
    cross-lingual concept map.
    """
    _ALIGNMENT_MAX_TOKENS = 16_000
    _TOKENS_PER_CONCEPT = 120
    if max_concepts * _TOKENS_PER_CONCEPT > _ALIGNMENT_MAX_TOKENS:
        logger.warning(
            "max_concepts ({}) may exceed alignment token budget ({}). "
            "Output may be truncated. Consider lowering max_concepts.",
            max_concepts,
            _ALIGNMENT_MAX_TOKENS,
        )

    def _fmt_cluster(c: dict[str, Any]) -> dict[str, Any]:
        return {
            "label": c.get("label", ""),
            "keywords": c.get("label_keywords", c.get("keywords", []))[:8],
            "description": c.get("description", ""),
            "doc_count": c.get("doc_count", 0),
        }

    pl_list = [_fmt_cluster(c) for c in pl_clusters]
    uk_list = [_fmt_cluster(c) for c in uk_clusters]

    categories_str = ", ".join(_CATEGORY_TAXONOMY)

    prompt = f"""You are a bilingual legal expert specialising in criminal law.

You receive two lists of criminal law topic clusters — one from Polish courts (PL)
and one from UK courts (UK). Your task is to merge and deduplicate them into a
unified bilingual concept list.

CATEGORY TAXONOMY (choose exactly one per concept):
{categories_str}

POLISH CLUSTERS (JSON):
{json.dumps(pl_list, ensure_ascii=False)}

UK CLUSTERS (JSON):
{json.dumps(uk_list, ensure_ascii=False)}

INSTRUCTIONS:
1. Merge clusters that cover the same concept (e.g. "Drug trafficking" and "Handel narkotykami").
2. Keep jurisdiction-specific clusters that have no counterpart (set jurisdictions to ["pl"] or ["uk"]).
3. For merged concepts: jurisdictions = ["pl", "uk"], doc_count = sum of both sides.
4. Produce at most {max_concepts} concepts, sorted by doc_count descending.
5. For each concept set:
   - id: deterministic ASCII snake_case slug derived from the English label
   - label_pl: Polish canonical label
   - label_en: English canonical label
   - aliases_pl: 2–6 Polish search aliases
   - aliases_en: 2–6 English search aliases
   - category: exactly one value from the taxonomy above
   - doc_count: integer
   - jurisdictions: ["pl"], ["uk"], or ["pl", "uk"]

Return ONLY a JSON object with a "concepts" key containing the array. No markdown."""

    logger.info(
        f"Alignment call: {len(pl_list)} PL + {len(uk_list)} UK clusters → "
        f"up to {max_concepts} unified concepts"
    )

    try:
        resp = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "Return valid JSON only. No markdown fences.",
                },
                {"role": "user", "content": prompt},
            ],
            response_format=AlignmentOutput,
            max_tokens=16_000,
            temperature=0.1,
        )
        parsed: AlignmentOutput = resp.choices[0].message.parsed
        concepts = parsed.concepts
    except Exception as exc:
        logger.error(f"Alignment call failed: {exc}")
        # Graceful fallback: build concepts directly from clusters
        concepts = _fallback_alignment(pl_clusters, uk_clusters)

    # Enforce slug determinism and cap
    out: list[dict[str, Any]] = []
    for c in concepts[:max_concepts]:
        d = c.model_dump() if hasattr(c, "model_dump") else dict(c)
        d["id"] = make_slug(d.get("label_en") or d.get("id") or "unknown")
        d["generated_at"] = generated_at
        d["corpus_snapshot"] = corpus_snapshot
        out.append(d)

    # Sort by doc_count desc
    out.sort(key=lambda x: x.get("doc_count", 0), reverse=True)
    return out[:max_concepts]


def _fallback_alignment(
    pl_clusters: list[dict[str, Any]],
    uk_clusters: list[dict[str, Any]],
) -> list[UnifiedConcept]:
    """Emergency fallback when the LLM alignment call fails.

    Builds one concept per cluster without cross-lingual merging.
    """
    concepts: list[UnifiedConcept] = []
    for c in pl_clusters:
        lbl = c.get("label", "Unknown")
        concepts.append(
            UnifiedConcept(
                id=make_slug(lbl),
                label_pl=lbl,
                label_en=lbl,
                aliases_pl=c.get("label_keywords", [])[:6],
                aliases_en=c.get("label_keywords", [])[:6],
                category="other",
                doc_count=c.get("doc_count", 0),
                jurisdictions=["pl"],
            )
        )
    for c in uk_clusters:
        lbl = c.get("label", "Unknown")
        concepts.append(
            UnifiedConcept(
                id=make_slug(lbl),
                label_pl=lbl,
                label_en=lbl,
                aliases_pl=c.get("label_keywords", [])[:6],
                aliases_en=c.get("label_keywords", [])[:6],
                category="other",
                doc_count=c.get("doc_count", 0),
                jurisdictions=["uk"],
            )
        )
    return concepts


# ---------------------------------------------------------------------------
# Meilisearch atomic swap
# ---------------------------------------------------------------------------


async def push_to_meilisearch(
    concepts: list[dict[str, Any]],
    *,
    live_index: str = "topics",
    staging_index: str = "topics_new",
    auto_confirm: bool = False,
) -> bool:
    """Atomic swap workflow:

    1. Insert concepts into ``topics_new`` (staging).
    2. Wait for indexing task.
    3. Diff against live ``topics``: print summary table.
    4. Prompt user for confirmation.
    5. On yes: swapIndexes(topics_new, topics) → wait → delete old topics_new.
    6. On no: leave ``topics_new`` in place, print cleanup instructions.
    """
    svc_staging = MeiliSearchService(
        base_url=os.getenv("MEILISEARCH_INTERNAL_URL") or os.getenv("MEILISEARCH_URL"),
        api_key=(
            os.getenv("MEILISEARCH_ADMIN_KEY") or os.getenv("MEILI_MASTER_KEY")
        ),
        admin_key=(
            os.getenv("MEILISEARCH_ADMIN_KEY") or os.getenv("MEILI_MASTER_KEY")
        ),
        index_name=staging_index,
    )

    svc_live = MeiliSearchService(
        base_url=os.getenv("MEILISEARCH_INTERNAL_URL") or os.getenv("MEILISEARCH_URL"),
        api_key=(
            os.getenv("MEILISEARCH_ADMIN_KEY") or os.getenv("MEILI_MASTER_KEY")
        ),
        admin_key=(
            os.getenv("MEILISEARCH_ADMIN_KEY") or os.getenv("MEILI_MASTER_KEY")
        ),
        index_name=live_index,
    )

    if not svc_staging.admin_configured:
        console.print(
            "[red]Meilisearch admin key not configured — cannot push topics.[/red]"
        )
        return False

    console.print(
        f"\n[bold]Step 1:[/bold] Creating staging index [cyan]{staging_index}[/cyan]…"
    )
    # Delete any leftover staging index from a previous aborted run
    await svc_staging.delete_index()
    # Set up staging index with correct settings
    await setup_topics_meilisearch_index(svc_staging)

    console.print(
        f"[bold]Step 2:[/bold] Inserting {len(concepts)} concepts into "
        f"[cyan]{staging_index}[/cyan]…"
    )
    upsert_resp = await svc_staging.upsert_documents(concepts, primary_key="id")
    task_uid = upsert_resp.get("taskUid")
    if task_uid is not None:
        console.print(
            f"  Waiting for indexing task {task_uid} to complete…", end=""
        )
        task = await svc_staging.wait_for_task(task_uid, max_wait=120.0)
        status = task.get("status", "?")
        if status == "succeeded":
            console.print(f" [green]done[/green] ({status})")
        else:
            console.print(f" [red]failed[/red] ({status})")
            return False

    # ── Diff ──────────────────────────────────────────────────────────────
    console.print("\n[bold]Step 3:[/bold] Diffing staging vs live index…")

    new_map: dict[str, dict[str, Any]] = {c["id"]: c for c in concepts}

    try:
        live_resp = await svc_live.get_documents(
            limit=1000, fields=["id", "doc_count"]
        )
        live_results = live_resp.get("results", [])
    except Exception:
        live_results = []

    live_map: dict[str, dict[str, Any]] = {
        d["id"]: d for d in live_results if isinstance(d, dict)
    }

    added = [k for k in new_map if k not in live_map]
    removed = [k for k in live_map if k not in new_map]
    shifted = [
        k
        for k in new_map
        if k in live_map
        and live_map[k].get("doc_count", 0) > 0
        and abs(new_map[k].get("doc_count", 0) - live_map[k].get("doc_count", 0))
        / live_map[k].get("doc_count", 1)
        >= 0.10
    ]

    diff_table = Table(title="Index diff: staging vs live", show_lines=False)
    diff_table.add_column("Metric", style="cyan")
    diff_table.add_column("Count", justify="right", style="yellow")
    diff_table.add_row("Concepts in staging (new)", str(len(new_map)))
    diff_table.add_row("Concepts in live", str(len(live_map)))
    diff_table.add_row("Added (new concepts)", str(len(added)))
    diff_table.add_row("Removed (dropped concepts)", str(len(removed)))
    diff_table.add_row("doc_count shifts ≥10%", str(len(shifted)))
    console.print(diff_table)

    # ── Confirmation ──────────────────────────────────────────────────────
    if auto_confirm:
        confirmed = True
    else:
        confirmed = Confirm.ask(
            "\nSwap [cyan]topics_new[/cyan] → [cyan]topics[/cyan] (atomic, zero-downtime)?",
            default=True,
        )

    if not confirmed:
        console.print(
            Panel(
                f"[yellow]Swap cancelled.[/yellow]\n\n"
                f"Staging index [cyan]{staging_index}[/cyan] is still live.\n"
                f"To clean up manually:\n"
                f"  DELETE {svc_staging.base_url}/indexes/{staging_index}  "
                f"(Authorization: Bearer <admin-key>)",
                title="No action taken",
            )
        )
        return False

    # ── Atomic swap ───────────────────────────────────────────────────────
    console.print(
        f"\n[bold]Step 4:[/bold] Swapping [cyan]{staging_index}[/cyan] ↔ "
        f"[cyan]{live_index}[/cyan]…"
    )
    swap_resp = await svc_staging.swap_indexes(live_index, staging_index)
    swap_uid = swap_resp.get("taskUid")
    if swap_uid is not None:
        swap_task = await svc_staging.wait_for_task(swap_uid, max_wait=60.0)
        if swap_task.get("status") != "succeeded":
            console.print(
                f"[red]Swap task {swap_uid} did not succeed: "
                f"{swap_task.get('error')}[/red]"
            )
            return False
    console.print(f"  [green]Swap complete.[/green]")

    # ── Drop old staging (which now holds the previous live data) ─────────
    console.print(
        f"[bold]Step 5:[/bold] Dropping stale [cyan]{staging_index}[/cyan]…"
    )
    del_resp = await svc_staging.delete_index()
    del_uid = del_resp.get("taskUid")
    if del_uid:
        await svc_staging.wait_for_task(del_uid, max_wait=30.0)
    console.print(f"  [green]Done.[/green]")

    return True


async def push_topics_run_to_meilisearch(
    *,
    run_id: str | None = None,
    live_index: str = "topics",
    staging_index: str = "topics_new",
    auto_confirm: bool = False,
) -> bool:
    """Load one persisted topics run from Supabase and publish it to Meili."""
    if load_search_topics_run is None or topic_row_to_meilisearch_document is None:
        raise RuntimeError("search_topics_store helpers are unavailable")

    rows = load_search_topics_run(run_id=run_id)
    if not rows:
        console.print(
            "[yellow]No search_topics rows found in Supabase — skipping Meilisearch push.[/yellow]"
        )
        return False

    concepts = [topic_row_to_meilisearch_document(row) for row in rows]
    return await push_to_meilisearch(
        concepts,
        live_index=live_index,
        staging_index=staging_index,
        auto_confirm=auto_confirm,
    )


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------


async def run_pipeline(
    *,
    jurisdictions: str = _DEFAULT_JURISDICTIONS,
    case_type: str = _DEFAULT_CASE_TYPE,
    output: Path = _DEFAULT_OUTPUT,
    sample_per_jurisdiction: int = _DEFAULT_SAMPLE,
    clusters_per_jurisdiction: int = _DEFAULT_CLUSTERS,
    max_concepts: int = _DEFAULT_MAX_CONCEPTS,
    dry_run: bool = False,
) -> list[dict[str, Any]]:
    """End-to-end topic generation pipeline. Returns the list of concepts."""

    generated_at = datetime.now(UTC).isoformat()
    jur_list = [j.strip().lower() for j in jurisdictions.split(",") if j.strip()]

    console.print(
        Panel(
            f"[bold]Jurisdictions:[/bold] {', '.join(jur_list)}\n"
            f"[bold]Case type:[/bold] {case_type}\n"
            f"[bold]Sample/jurisdiction:[/bold] {sample_per_jurisdiction:,}\n"
            f"[bold]Target clusters/jurisdiction:[/bold] {clusters_per_jurisdiction}\n"
            f"[bold]Max unified concepts:[/bold] {max_concepts}\n"
            f"[bold]Output:[/bold] {output}\n"
            f"[bold]Dry-run:[/bold] {dry_run}",
            title="Criminal Search Topics Pipeline",
        )
    )

    client = _build_openai_client()

    # ── Step 1: Pull judgments ──────────────────────────────────────────────
    console.print("\n[bold blue]Step 1: Pull criminal judgments from Supabase[/bold blue]")
    corpus_snapshot = 0
    try:
        corpus_snapshot = count_criminal_judgments(case_type)
    except Exception as e:
        logger.warning(f"Could not count criminal judgments: {e}")

    all_clusters: dict[str, list[dict[str, Any]]] = {}

    for jur in jur_list:
        rows = pull_criminal_judgments(
            jur, case_type=case_type, sample=sample_per_jurisdiction
        )
        if not rows:
            logger.warning(f"No rows for {jur} — skipping jurisdiction")
            continue

        # ── Step 2: Cluster ────────────────────────────────────────────────
        console.print(
            f"\n[bold blue]Step 2 ({jur.upper()}): BERTopic clustering[/bold blue]"
        )
        cluster_records, _, _ = cluster_with_bertopic(
            rows, jurisdiction=jur, nr_topics=clusters_per_jurisdiction
        )

        if not cluster_records:
            logger.warning(f"{jur.upper()}: clustering produced no clusters")
            continue

        # ── Step 3: Label ──────────────────────────────────────────────────
        console.print(
            f"\n[bold blue]Step 3 ({jur.upper()}): GPT-4o-mini cluster labelling[/bold blue]"
        )
        labelled = label_all_clusters(client, cluster_records, jur)
        all_clusters[jur] = labelled
        logger.info(f"{jur.upper()}: {len(labelled)} labelled clusters")

    pl_clusters = all_clusters.get("pl", [])
    uk_clusters = all_clusters.get("uk", [])

    if not pl_clusters and not uk_clusters:
        console.print(
            "[red]No clusters produced for any jurisdiction — aborting.[/red]"
        )
        return []

    # ── Step 4: Cross-lingual alignment ────────────────────────────────────
    console.print("\n[bold blue]Step 4: Cross-lingual alignment[/bold blue]")
    concepts = align_concepts(
        client,
        pl_clusters=pl_clusters,
        uk_clusters=uk_clusters,
        max_concepts=max_concepts,
        generated_at=generated_at,
        corpus_snapshot=corpus_snapshot,
    )
    logger.info(f"Alignment produced {len(concepts)} unified concepts")

    # ── Step 5: Cap & sort ──────────────────────────────────────────────────
    concepts = sorted(concepts, key=lambda x: x.get("doc_count", 0), reverse=True)[
        :max_concepts
    ]

    # ── Step 6: Write JSON ──────────────────────────────────────────────────
    console.print(f"\n[bold blue]Step 6: Writing output → {output}[/bold blue]")
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as fh:
        json.dump(concepts, fh, indent=2, ensure_ascii=False)
    console.print(
        f"  [green]Wrote {len(concepts)} concepts to {output}[/green]"
    )

    # ── Step 7: Persist topics run to Supabase ──────────────────────────────
    if dry_run:
        console.print(
            "\n[yellow]Dry-run: skipping Supabase publish and Meilisearch push.[/yellow]"
        )
    else:
        if persist_search_topics_run is None:
            raise RuntimeError("search_topics_store helpers are unavailable")

        console.print(
            "\n[bold blue]Step 7: Persist topics snapshot to Supabase[/bold blue]"
        )
        run_id = persist_search_topics_run(concepts, case_type=case_type)
        console.print(
            f"  [green]Persisted {len(concepts)} concepts to Supabase "
            f"(run_id={run_id})[/green]"
        )

        console.print(
            "\n[bold blue]Step 8: Push to Meilisearch from Supabase (atomic swap)[/bold blue]"
        )
        ok = await push_topics_run_to_meilisearch(run_id=run_id)
        if ok:
            console.print("[green]Topics index updated successfully.[/green]")
        else:
            console.print("[yellow]Meilisearch push cancelled or failed.[/yellow]")

    # ── Summary ─────────────────────────────────────────────────────────────
    summary = Table(title="Pipeline summary", show_lines=False)
    summary.add_column("Metric", style="cyan")
    summary.add_column("Value", justify="right", style="yellow")
    summary.add_row("PL clusters", str(len(pl_clusters)))
    summary.add_row("UK clusters", str(len(uk_clusters)))
    summary.add_row("Unified concepts", str(len(concepts)))
    summary.add_row("Corpus snapshot (criminal)", f"{corpus_snapshot:,}")
    summary.add_row("generated_at", generated_at[:19])
    summary.add_row("Output", str(output))
    console.print(summary)

    return concepts


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def _parse_args() -> dict[str, Any]:
    """Parse CLI arguments using a minimal rich-friendly approach.

    Respects the project convention: rich for UI, no argparse/click.
    Supports: --jurisdictions, --case-type, --output, --sample-per-jurisdiction,
              --clusters-per-jurisdiction, --max-concepts, --dry-run.
    """
    args = sys.argv[1:]
    parsed: dict[str, Any] = {
        "jurisdictions": _DEFAULT_JURISDICTIONS,
        "case_type": _DEFAULT_CASE_TYPE,
        "output": _DEFAULT_OUTPUT,
        "sample_per_jurisdiction": _DEFAULT_SAMPLE,
        "clusters_per_jurisdiction": _DEFAULT_CLUSTERS,
        "max_concepts": _DEFAULT_MAX_CONCEPTS,
        "dry_run": False,
    }

    i = 0
    while i < len(args):
        a = args[i]
        # Support both --flag value and --flag=value forms.
        # For --flag=value, split on the first '=' and inject the value into
        # args so the rest of the loop sees the same --flag / value pattern.
        if "=" in a and a.startswith("--"):
            flag, eq_value = a.split("=", 1)
            args = args[:i] + [flag, eq_value] + args[i + 1 :]
            a = flag
        if a in ("--jurisdictions",) and i + 1 < len(args):
            parsed["jurisdictions"] = args[i + 1]
            i += 2
        elif a in ("--case-type",) and i + 1 < len(args):
            parsed["case_type"] = args[i + 1]
            i += 2
        elif a in ("--output",) and i + 1 < len(args):
            parsed["output"] = Path(args[i + 1])
            i += 2
        elif a in ("--sample-per-jurisdiction",) and i + 1 < len(args):
            parsed["sample_per_jurisdiction"] = int(args[i + 1])
            i += 2
        elif a in ("--clusters-per-jurisdiction",) and i + 1 < len(args):
            parsed["clusters_per_jurisdiction"] = int(args[i + 1])
            i += 2
        elif a in ("--max-concepts",) and i + 1 < len(args):
            parsed["max_concepts"] = int(args[i + 1])
            i += 2
        elif a in ("--dry-run",):
            parsed["dry_run"] = True
            i += 1
        elif a in ("--help", "-h"):
            console.print(
                Panel(
                    "[bold]generate_search_topics[/bold] — offline topic pipeline\n\n"
                    "  --jurisdictions          PL,UK or subset (default: pl,uk)\n"
                    "  --case-type              Filter keyword (default: criminal)\n"
                    "  --output                 Output JSON path\n"
                    "  --sample-per-jurisdiction  Max rows per jurisdiction (default: 6000)\n"
                    "  --clusters-per-jurisdiction  BERTopic target clusters (default: 75)\n"
                    "  --max-concepts           Max unified concepts (default: 500)\n"
                    "  --dry-run                Skip Meilisearch push\n",
                    title="Usage",
                )
            )
            sys.exit(0)
        else:
            console.print(f"[yellow]Unknown argument:[/yellow] {a}")
            i += 1

    return parsed


def main() -> None:
    """Script entry point."""
    opts = _parse_args()
    asyncio.run(run_pipeline(**opts))


if __name__ == "__main__":
    main()

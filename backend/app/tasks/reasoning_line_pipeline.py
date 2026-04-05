"""Celery tasks for background reasoning line auto-discovery pipeline.

Three periodic tasks:
1. auto_assign  — assigns unassigned judgments to existing reasoning lines
2. auto_discover — discovers new reasoning lines from unassigned judgments
3. detect_events — detects branch/merge events between reasoning lines
"""

from __future__ import annotations

import contextlib
import uuid
from collections import Counter
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

import numpy as np
from loguru import logger

from app.core.supabase import supabase_client
from app.workers import celery_app

if TYPE_CHECKING:
    from celery import Task


# ── Helpers ──────────────────────────────────────────────────────────────────


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def _kmeans_simple(
    embeddings: np.ndarray, k: int, max_iter: int = 50
) -> tuple[np.ndarray, np.ndarray]:
    """Simple K-Means clustering with K-Means++ initialization.

    Returns (labels, centroids).
    """
    n = embeddings.shape[0]
    rng = np.random.RandomState(42)

    # K-Means++ initialization
    centroids = np.empty((k, embeddings.shape[1]), dtype=np.float32)
    centroids[0] = embeddings[rng.randint(n)]

    for i in range(1, k):
        distances = np.min(
            [np.sum((embeddings - c) ** 2, axis=1) for c in centroids[:i]], axis=0
        )
        total = distances.sum()
        probs = np.ones(n) / n if total == 0 else distances / total
        centroids[i] = embeddings[rng.choice(n, p=probs)]

    # Iterate
    labels = np.zeros(n, dtype=np.int32)
    for _ in range(max_iter):
        dists = np.array([np.sum((embeddings - c) ** 2, axis=1) for c in centroids]).T
        new_labels = np.argmin(dists, axis=1).astype(np.int32)

        if np.array_equal(new_labels, labels):
            break
        labels = new_labels

        for j in range(k):
            mask = labels == j
            if mask.sum() > 0:
                centroids[j] = embeddings[mask].mean(axis=0)

    return labels, centroids


def _extract_simple_keywords(texts: list[str], top_n: int = 5) -> list[str]:
    """Extract top keywords from a list of texts using simple word frequency.

    Filters out common Polish/English stopwords and short tokens.
    """
    stopwords = {
        "w",
        "z",
        "na",
        "do",
        "i",
        "o",
        "od",
        "za",
        "nie",
        "się",
        "jest",
        "to",
        "że",
        "po",
        "co",
        "jak",
        "ale",
        "lub",
        "dla",
        "oraz",
        "przez",
        "bez",
        "przy",
        "pod",
        "nad",
        "przed",
        "między",
        "ze",
        "we",
        "ku",
        "the",
        "of",
        "and",
        "in",
        "for",
        "is",
        "on",
        "that",
        "by",
        "this",
        "with",
        "from",
        "or",
        "an",
        "be",
        "as",
        "at",
        "was",
        "are",
        "art",
        "ust",
        "pkt",
        "nr",
        "dz",
    }

    word_counts: Counter[str] = Counter()
    for text in texts:
        words = text.lower().split()
        for word in words:
            # Strip punctuation and filter short/stopword tokens
            cleaned = word.strip(".,;:!?()[]{}\"'/-")
            if len(cleaned) > 2 and cleaned not in stopwords and cleaned.isalpha():
                word_counts[cleaned] += 1

    return [word for word, _ in word_counts.most_common(top_n)]


def _fetch_unassigned_judgment_ids(limit: int = 100) -> list[dict[str, Any]]:
    """Fetch judgment IDs that are NOT in reasoning_line_members.

    Returns list of dicts with id, embedding, decision_date, title, signature,
    court_name, cited_legislation.
    """
    if not supabase_client:
        return []

    # Get all judgment IDs already assigned to reasoning lines
    assigned_resp = (
        supabase_client.table("reasoning_line_members").select("judgment_id").execute()
    )
    assigned_ids = {row["judgment_id"] for row in (assigned_resp.data or [])}

    # Fetch recent judgments with embeddings, ordered by decision_date DESC
    select_fields = (
        "id, embedding, decision_date, title, signature, court_name, cited_legislation"
    )
    resp = (
        supabase_client.table("judgments")
        .select(select_fields)
        .not_.is_("embedding", "null")
        .order("decision_date", desc=True)
        .limit(limit + len(assigned_ids))  # over-fetch to account for filtering
        .execute()
    )

    # Filter out already-assigned judgments
    unassigned = []
    for row in resp.data or []:
        if row["id"] not in assigned_ids:
            unassigned.append(row)
            if len(unassigned) >= limit:
                break

    return unassigned


# ── Task 1: Auto-assign ─────────────────────────────────────────────────────


@celery_app.task(
    bind=True,
    name="reasoning_lines.auto_assign",
    max_retries=2,
    default_retry_delay=60,
)
def auto_assign_judgments(self: Task) -> dict[str, Any]:
    """Assign unassigned judgments to existing reasoning lines based on embedding similarity.

    For each unassigned judgment, computes cosine similarity to every active
    reasoning line's avg_embedding. If the best match exceeds 0.75, the judgment
    is assigned to that line and the line's statistics are updated.
    """
    if not supabase_client:
        logger.warning("Supabase client unavailable — skipping auto_assign")
        return {"status": "skipped", "reason": "no_supabase"}

    logger.info("Starting reasoning_lines.auto_assign task")

    # Step 1: Fetch all active reasoning lines with avg_embedding
    lines_resp = (
        supabase_client.table("reasoning_lines")
        .select("id, avg_embedding, case_count, date_range_end, label")
        .eq("status", "active")
        .execute()
    )
    lines = lines_resp.data or []
    if not lines:
        logger.info("No active reasoning lines found — nothing to assign to")
        return {"assigned": 0, "unassigned_remaining": 0, "lines_updated": 0}

    # Build line embeddings map (skip lines without avg_embedding)
    line_embeddings: dict[str, np.ndarray] = {}
    for line in lines:
        emb = line.get("avg_embedding")
        if emb and isinstance(emb, list) and len(emb) > 0:
            line_embeddings[line["id"]] = np.array(emb, dtype=np.float32)

    if not line_embeddings:
        logger.info("No reasoning lines have avg_embedding — skipping")
        return {"assigned": 0, "unassigned_remaining": 0, "lines_updated": 0}

    # Step 2: Fetch unassigned judgments
    unassigned = _fetch_unassigned_judgment_ids(limit=100)
    if not unassigned:
        logger.info("No unassigned judgments found")
        return {"assigned": 0, "unassigned_remaining": 0, "lines_updated": 0}

    # Step 3: For each unassigned judgment, find best matching line
    assigned_count = 0
    lines_updated: set[str] = set()
    # Track incremental centroid updates: line_id -> (sum_embedding, count)
    line_updates: dict[str, dict[str, Any]] = {}

    for judgment in unassigned:
        try:
            emb = judgment.get("embedding")
            if not emb or not isinstance(emb, list) or len(emb) == 0:
                continue

            j_emb = np.array(emb, dtype=np.float32)

            # Find best matching line
            best_line_id = None
            best_similarity = 0.0

            for line_id, line_emb in line_embeddings.items():
                sim = _cosine_similarity(j_emb, line_emb)
                if sim > best_similarity:
                    best_similarity = sim
                    best_line_id = line_id

            if best_line_id is None or best_similarity <= 0.75:
                continue

            # Insert into reasoning_line_members
            # Determine next position
            pos_resp = (
                supabase_client.table("reasoning_line_members")
                .select("position_in_line")
                .eq("reasoning_line_id", best_line_id)
                .order("position_in_line", desc=True)
                .limit(1)
                .execute()
            )
            next_position = 1
            if pos_resp.data:
                next_position = pos_resp.data[0]["position_in_line"] + 1

            supabase_client.table("reasoning_line_members").insert(
                {
                    "reasoning_line_id": best_line_id,
                    "judgment_id": judgment["id"],
                    "position_in_line": next_position,
                    "similarity_to_centroid": round(best_similarity, 4),
                }
            ).execute()

            assigned_count += 1
            lines_updated.add(best_line_id)

            # Track for centroid update
            if best_line_id not in line_updates:
                line_data = next((ln for ln in lines if ln["id"] == best_line_id), None)
                old_count = line_data["case_count"] if line_data else 0
                line_updates[best_line_id] = {
                    "new_embeddings": [],
                    "old_count": old_count,
                    "latest_date": (
                        line_data.get("date_range_end") if line_data else None
                    ),
                }

            line_updates[best_line_id]["new_embeddings"].append(j_emb)
            j_date = judgment.get("decision_date")
            if j_date:
                current_latest = line_updates[best_line_id]["latest_date"]
                if current_latest is None or str(j_date) > str(current_latest):
                    line_updates[best_line_id]["latest_date"] = str(j_date)

        except Exception as exc:
            logger.error(f"Error assigning judgment {judgment.get('id', '?')}: {exc}")
            continue

    # Step 4: Update reasoning line statistics
    now = datetime.now(UTC).isoformat()
    for line_id, updates in line_updates.items():
        try:
            old_count = updates["old_count"]
            new_count = old_count + len(updates["new_embeddings"])

            # Incremental centroid update:
            # new_centroid = (old_centroid * old_count + sum(new)) / new_count
            old_emb = line_embeddings[line_id]
            new_sum = np.sum(updates["new_embeddings"], axis=0)
            updated_centroid = (old_emb * old_count + new_sum) / new_count

            update_data: dict[str, Any] = {
                "case_count": new_count,
                "avg_embedding": updated_centroid.tolist(),
                "updated_at": now,
            }
            if updates["latest_date"]:
                update_data["date_range_end"] = updates["latest_date"]

            supabase_client.table("reasoning_lines").update(update_data).eq(
                "id", line_id
            ).execute()

        except Exception as exc:
            logger.error(f"Error updating reasoning line {line_id}: {exc}")

    # Count remaining unassigned (approximate)
    total_unassigned_resp = (
        supabase_client.table("judgments")
        .select("id", count="exact")
        .not_.is_("embedding", "null")
        .execute()
    )
    total_with_embedding = total_unassigned_resp.count or 0
    total_assigned_resp = (
        supabase_client.table("reasoning_line_members")
        .select("judgment_id", count="exact")
        .execute()
    )
    total_assigned = total_assigned_resp.count or 0
    unassigned_remaining = max(0, total_with_embedding - total_assigned)

    result = {
        "assigned": assigned_count,
        "unassigned_remaining": unassigned_remaining,
        "lines_updated": len(lines_updated),
    }
    logger.info(f"auto_assign completed: {result}")
    return result


# ── Task 2: Auto-discover ───────────────────────────────────────────────────


@celery_app.task(
    bind=True,
    name="reasoning_lines.auto_discover",
    max_retries=1,
    default_retry_delay=120,
)
def auto_discover_lines(self: Task) -> dict[str, Any]:
    """Discover new reasoning lines from unassigned judgments using K-Means clustering.

    Fetches up to 200 unassigned judgments, clusters them, and creates new
    reasoning lines for clusters that meet coherence and size thresholds.
    """
    if not supabase_client:
        logger.warning("Supabase client unavailable — skipping auto_discover")
        return {"status": "skipped", "reason": "no_supabase"}

    logger.info("Starting reasoning_lines.auto_discover task")

    # Step 1: Count unassigned judgments
    unassigned = _fetch_unassigned_judgment_ids(limit=200)
    if len(unassigned) < 20:
        logger.info(
            f"Only {len(unassigned)} unassigned judgments "
            f"— need at least 20 for discovery"
        )
        return {"lines_created": 0, "judgments_assigned": 0, "clusters_rejected": 0}

    # Step 2: Build embedding matrix
    valid_judgments: list[dict[str, Any]] = []
    embeddings_list: list[np.ndarray] = []

    for j in unassigned:
        emb = j.get("embedding")
        if emb and isinstance(emb, list) and len(emb) > 0:
            valid_judgments.append(j)
            embeddings_list.append(np.array(emb, dtype=np.float32))

    n = len(valid_judgments)
    if n < 20:
        logger.info(f"Only {n} judgments with valid embeddings — need at least 20")
        return {"lines_created": 0, "judgments_assigned": 0, "clusters_rejected": 0}

    embeddings = np.vstack(embeddings_list)

    # Step 3: Run K-Means
    k = max(2, min(8, n // 20))
    logger.info(f"Running K-Means with k={k} on {n} judgments")
    labels, centroids = _kmeans_simple(embeddings, k)

    # Step 4: Evaluate clusters and create reasoning lines
    lines_created = 0
    judgments_assigned = 0
    clusters_rejected = 0
    now = datetime.now(UTC).isoformat()

    for cluster_idx in range(k):
        mask = labels == cluster_idx
        cluster_indices = np.where(mask)[0]
        cluster_size = int(mask.sum())

        if cluster_size < 5:
            clusters_rejected += 1
            logger.debug(f"Cluster {cluster_idx} rejected: size {cluster_size} < 5")
            continue

        # Compute coherence (average cosine similarity to centroid)
        centroid = centroids[cluster_idx]
        similarities = []
        for idx in cluster_indices:
            sim = _cosine_similarity(embeddings[idx], centroid)
            similarities.append(sim)
        coherence = float(np.mean(similarities)) if similarities else 0.0

        if coherence < 0.6:
            clusters_rejected += 1
            logger.debug(
                f"Cluster {cluster_idx} rejected: coherence {coherence:.3f} < 0.6"
            )
            continue

        # Extract keywords from cluster judgments
        cluster_texts = []
        cluster_legislation: Counter[str] = Counter()
        cluster_dates: list[str] = []

        for idx in cluster_indices:
            j = valid_judgments[idx]
            text_parts = []
            if j.get("title"):
                text_parts.append(j["title"])
            if j.get("signature"):
                text_parts.append(j["signature"])
            cluster_texts.append(" ".join(text_parts))

            # Collect legislation
            leg = j.get("cited_legislation")
            if leg and isinstance(leg, list):
                for item in leg:
                    if isinstance(item, str):
                        cluster_legislation[item] += 1

            # Collect dates
            d = j.get("decision_date")
            if d:
                cluster_dates.append(str(d))

        keywords = _extract_simple_keywords(cluster_texts)
        # Get legal bases that appear in at least 30% of cluster judgments
        min_leg_count = max(2, int(cluster_size * 0.3))
        legal_bases = [
            leg
            for leg, cnt in cluster_legislation.most_common(10)
            if cnt >= min_leg_count
        ]

        # Generate label from keywords
        label = " / ".join(keywords[:3]) if keywords else f"Cluster {cluster_idx}"

        # Determine date range
        sorted_dates = sorted(cluster_dates) if cluster_dates else []
        date_range_start = sorted_dates[0] if sorted_dates else None
        date_range_end = sorted_dates[-1] if sorted_dates else None

        # Create reasoning line
        line_id = str(uuid.uuid4())
        line_row: dict[str, Any] = {
            "id": line_id,
            "label": label,
            "legal_question": f"Auto-discovered cluster: {label}",
            "keywords": keywords,
            "legal_bases": legal_bases,
            "status": "active",
            "case_count": cluster_size,
            "date_range_start": date_range_start,
            "date_range_end": date_range_end,
            "coherence_score": round(coherence, 4),
            "avg_embedding": centroid.tolist(),
            "created_at": now,
            "updated_at": now,
        }

        try:
            supabase_client.table("reasoning_lines").insert(line_row).execute()
        except Exception as exc:
            logger.error(
                f"Error creating reasoning line for cluster {cluster_idx}: {exc}"
            )
            clusters_rejected += 1
            continue

        # Insert member rows
        member_rows: list[dict[str, Any]] = []
        for position, idx in enumerate(cluster_indices, start=1):
            j = valid_judgments[idx]
            sim = (
                similarities[position - 1] if position - 1 < len(similarities) else 0.0
            )
            member_rows.append(
                {
                    "reasoning_line_id": line_id,
                    "judgment_id": j["id"],
                    "position_in_line": position,
                    "similarity_to_centroid": round(sim, 4),
                }
            )

        try:
            supabase_client.table("reasoning_line_members").insert(
                member_rows
            ).execute()
            lines_created += 1
            judgments_assigned += cluster_size
            logger.info(
                f"Created reasoning line {line_id} ({label!r}) "
                f"with {cluster_size} members, coherence={coherence:.3f}"
            )
        except Exception as exc:
            logger.error(f"Error inserting members for line {line_id}: {exc}")
            # Clean up the parent row
            with contextlib.suppress(Exception):
                supabase_client.table("reasoning_lines").delete().eq(
                    "id", line_id
                ).execute()
            clusters_rejected += 1

    result = {
        "lines_created": lines_created,
        "judgments_assigned": judgments_assigned,
        "clusters_rejected": clusters_rejected,
    }
    logger.info(f"auto_discover completed: {result}")
    return result


# ── Task 3: Detect events ───────────────────────────────────────────────────


@celery_app.task(
    bind=True,
    name="reasoning_lines.detect_events",
    max_retries=1,
    default_retry_delay=120,
)
def detect_line_events(self: Task) -> dict[str, Any]:
    """Detect branch and merge events between active reasoning lines.

    Compares centroid similarity and shared legal bases between all pairs
    of active lines. High similarity suggests merging trends; low similarity
    with shared legal bases suggests branching.
    """
    if not supabase_client:
        logger.warning("Supabase client unavailable — skipping detect_events")
        return {"status": "skipped", "reason": "no_supabase"}

    logger.info("Starting reasoning_lines.detect_events task")

    # Step 1: Fetch all active reasoning lines
    lines_resp = (
        supabase_client.table("reasoning_lines")
        .select("id, avg_embedding, legal_bases, label")
        .eq("status", "active")
        .execute()
    )
    lines = lines_resp.data or []
    if len(lines) < 2:
        logger.info(
            f"Only {len(lines)} active lines — need at least 2 for event detection"
        )
        return {"branches": 0, "merges": 0, "lines_analyzed": len(lines)}

    # Build embeddings and legal bases maps
    line_embeddings: dict[str, np.ndarray] = {}
    line_legal_bases: dict[str, set[str]] = {}
    line_labels: dict[str, str] = {}

    for line in lines:
        lid = line["id"]
        line_labels[lid] = line.get("label", "")

        emb = line.get("avg_embedding")
        if emb and isinstance(emb, list) and len(emb) > 0:
            line_embeddings[lid] = np.array(emb, dtype=np.float32)

        bases = line.get("legal_bases")
        if bases and isinstance(bases, list):
            line_legal_bases[lid] = set(bases)
        else:
            line_legal_bases[lid] = set()

    # Step 2: Fetch existing events to avoid duplicates
    existing_resp = (
        supabase_client.table("reasoning_line_events")
        .select("source_line_id, target_line_id, event_type")
        .execute()
    )
    existing_events: set[tuple[str, str | None, str]] = set()
    for evt in existing_resp.data or []:
        existing_events.add(
            (
                evt["source_line_id"],
                evt.get("target_line_id"),
                evt["event_type"],
            )
        )

    # Step 3: Compare all pairs
    now = datetime.now(UTC).isoformat()
    event_rows: list[dict[str, Any]] = []
    branches = 0
    merges = 0
    line_ids = [ln["id"] for ln in lines]

    for i in range(len(line_ids)):
        for j in range(i + 1, len(line_ids)):
            lid_a = line_ids[i]
            lid_b = line_ids[j]

            # Skip pairs without embeddings
            if lid_a not in line_embeddings or lid_b not in line_embeddings:
                continue

            # Check shared legal bases
            bases_a = line_legal_bases.get(lid_a, set())
            bases_b = line_legal_bases.get(lid_b, set())
            shared_bases = bases_a & bases_b
            union_bases = bases_a | bases_b

            if not union_bases:
                continue

            overlap_ratio = len(shared_bases) / len(union_bases)

            # Compute centroid similarity
            centroid_sim = _cosine_similarity(
                line_embeddings[lid_a], line_embeddings[lid_b]
            )

            # Check for merge: high similarity
            if (
                centroid_sim > 0.85
                and (lid_a, lid_b, "merge") not in existing_events
                and (lid_b, lid_a, "merge") not in existing_events
            ):
                event_rows.append(
                    {
                        "id": str(uuid.uuid4()),
                        "event_type": "merge",
                        "source_line_id": lid_a,
                        "target_line_id": lid_b,
                        "event_date": now[:10],  # date portion
                        "description": (
                            f"Potential merge: lines '{line_labels.get(lid_a, '')}' "
                            f"and '{line_labels.get(lid_b, '')}' have centroid "
                            f"similarity {centroid_sim:.3f}"
                        ),
                        "confidence": round(centroid_sim, 4),
                        "drift_score": None,
                        "metadata": {
                            "centroid_similarity": round(centroid_sim, 4),
                            "shared_bases": list(shared_bases)[:10],
                            "overlap_ratio": round(overlap_ratio, 4),
                            "detection_source": "auto_pipeline",
                        },
                        "created_at": now,
                    }
                )
                merges += 1
                existing_events.add((lid_a, lid_b, "merge"))

            # Check for branch: low similarity but shared legal bases > 30%
            elif (
                centroid_sim < 0.7
                and overlap_ratio > 0.3
                and (lid_a, lid_b, "branch") not in existing_events
                and (lid_b, lid_a, "branch") not in existing_events
            ):
                event_rows.append(
                    {
                        "id": str(uuid.uuid4()),
                        "event_type": "branch",
                        "source_line_id": lid_a,
                        "target_line_id": lid_b,
                        "event_date": now[:10],
                        "description": (
                            f"Potential branch: lines '{line_labels.get(lid_a, '')}'"
                            f" and '{line_labels.get(lid_b, '')}' share "
                            f"{overlap_ratio:.0%} of legal bases but centroid "
                            f"similarity is only {centroid_sim:.3f}"
                        ),
                        "confidence": round(
                            min((1.0 - centroid_sim) * overlap_ratio * 2, 1.0), 4
                        ),
                        "drift_score": round(1.0 - centroid_sim, 4),
                        "metadata": {
                            "centroid_similarity": round(centroid_sim, 4),
                            "shared_bases": list(shared_bases)[:10],
                            "overlap_ratio": round(overlap_ratio, 4),
                            "detection_source": "auto_pipeline",
                        },
                        "created_at": now,
                    }
                )
                branches += 1
                existing_events.add((lid_a, lid_b, "branch"))

    # Step 4: Insert detected events
    if event_rows:
        try:
            supabase_client.table("reasoning_line_events").insert(event_rows).execute()
            logger.info(
                f"Persisted {len(event_rows)} events: "
                f"{branches} branches, {merges} merges"
            )
        except Exception as exc:
            logger.error(f"Error persisting detected events: {exc}")

    result = {
        "branches": branches,
        "merges": merges,
        "lines_analyzed": len(lines),
    }
    logger.info(f"detect_events completed: {result}")
    return result

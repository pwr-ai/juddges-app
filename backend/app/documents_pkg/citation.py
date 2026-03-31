"""Citation network analysis: building nodes, edges, authority scoring, statistics."""

import re
from datetime import datetime

from app.models import (
    CitationEdge,
    CitationNetworkStatistics,
    CitationNode,
)


def _normalize_ref(ref_text: str) -> str:
    match = re.search(r"r\.\s*-\s*(.+?)(?:\s*\(Dz\.|\s*-\s*art\.)", ref_text)
    if match:
        return match.group(1).strip()
    return ref_text[:80].strip()


def _build_ref_index(
    docs: list[dict],
) -> tuple[dict[str, list[str]], dict[str, list[str]], dict[str, list[str]]]:
    ref_to_docs: dict[str, list[str]] = {}
    doc_refs: dict[str, list[str]] = {}
    doc_raw_refs: dict[str, list[str]] = {}

    for doc in docs:
        doc_id = doc["document_id"]
        refs = doc.get("references", []) or []
        normalized = [_normalize_ref(r) for r in refs]
        doc_refs[doc_id] = normalized
        doc_raw_refs[doc_id] = refs

        for norm_ref in set(normalized):
            if norm_ref not in ref_to_docs:
                ref_to_docs[norm_ref] = []
            ref_to_docs[norm_ref].append(doc_id)

    return ref_to_docs, doc_refs, doc_raw_refs


def _calc_authority_scores(
    docs: list[dict],
    doc_refs: dict[str, list[str]],
    ref_to_docs: dict[str, list[str]],
) -> dict[str, float]:
    max_sharing = max((len(ids) for ids in ref_to_docs.values()), default=1)
    authority_scores: dict[str, float] = {}

    for doc in docs:
        doc_id = doc["document_id"]
        refs = doc_refs.get(doc_id, [])
        if not refs:
            authority_scores[doc_id] = 0.0
            continue
        sharing_counts = [len(ref_to_docs.get(r, [])) for r in set(refs)]
        avg_sharing = sum(sharing_counts) / len(sharing_counts) if sharing_counts else 0
        authority_scores[doc_id] = min(avg_sharing / max(max_sharing, 1), 1.0)

    return authority_scores


def _build_citation_nodes(
    docs: list[dict],
    doc_refs: dict[str, list[str]],
    authority_scores: dict[str, float],
) -> list[CitationNode]:
    nodes = []
    for doc in docs:
        doc_id = doc["document_id"]
        year = None
        if doc.get("date_issued"):
            try:
                if isinstance(doc["date_issued"], str):
                    dt = datetime.fromisoformat(
                        doc["date_issued"].replace("Z", "+00:00")
                    )
                    year = dt.year
            except (ValueError, TypeError):
                pass

        refs = doc.get("references", []) or []
        nodes.append(
            CitationNode(
                id=doc_id,
                title=doc.get("title") or f"Document {doc_id}",
                document_type=doc.get("document_type", "unknown"),
                year=year,
                x=float(doc.get("x") or 0.0),
                y=float(doc.get("y") or 0.0),
                citation_count=len(refs),
                authority_score=round(authority_scores.get(doc_id, 0.0), 3),
                references=refs,
                metadata={
                    "court_name": doc.get("court_name"),
                    "document_number": doc.get("document_number"),
                    "language": doc.get("language"),
                    "date_issued": doc.get("date_issued"),
                },
            )
        )
    return nodes


def _build_citation_edges(
    docs: list[dict],
    doc_refs: dict[str, list[str]],
    min_shared_refs: int,
) -> list[CitationEdge]:
    edges = []
    doc_ids = [doc["document_id"] for doc in docs]
    seen_pairs: set[tuple[str, str]] = set()

    for i, doc_id_a in enumerate(doc_ids):
        refs_a = set(doc_refs.get(doc_id_a, []))
        for j in range(i + 1, len(doc_ids)):
            doc_id_b = doc_ids[j]
            refs_b = set(doc_refs.get(doc_id_b, []))
            shared = refs_a & refs_b
            if len(shared) < min_shared_refs:
                continue
            pair = (min(doc_id_a, doc_id_b), max(doc_id_a, doc_id_b))
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            union = refs_a | refs_b
            weight = len(shared) / len(union) if union else 0.0
            edges.append(
                CitationEdge(
                    source=doc_id_a,
                    target=doc_id_b,
                    shared_refs=list(shared),
                    weight=round(weight, 3),
                )
            )

    return edges


def _build_citation_statistics(
    docs: list[dict],
    ref_to_docs: dict[str, list[str]],
    authority_scores: dict[str, float],
    nodes: list[CitationNode],
    edges: list[CitationEdge],
) -> CitationNetworkStatistics:
    all_citation_counts = [len(doc.get("references", []) or []) for doc in docs]
    ref_counts = sorted(
        [(ref, len(ids)) for ref, ids in ref_to_docs.items()],
        key=lambda x: x[1],
        reverse=True,
    )[:10]
    most_cited = [{"reference": ref, "count": count} for ref, count in ref_counts]
    all_authority = list(authority_scores.values())

    return CitationNetworkStatistics(
        total_nodes=len(nodes),
        total_edges=len(edges),
        avg_citations=round(sum(all_citation_counts) / len(all_citation_counts), 2)
        if all_citation_counts
        else 0.0,
        max_citations=max(all_citation_counts) if all_citation_counts else 0,
        most_cited_refs=most_cited,
        avg_authority_score=round(sum(all_authority) / len(all_authority), 3)
        if all_authority
        else 0.0,
    )

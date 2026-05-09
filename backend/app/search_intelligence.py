"""
Intelligent Search Ranking Module

Enhances search results with relevance scoring, authority signals,
and explainable AI ranking. Provides "why relevant?" explanations.

Author: Juddges Backend Team
Date: 2025-10-09
"""

from datetime import UTC, datetime
from typing import Literal

from loguru import logger
from pydantic import BaseModel, Field

# ===== Models =====


class AuthoritySignals(BaseModel):
    """Authority and credibility signals for a legal document."""

    court_level: str | None = Field(
        None,
        description="Court hierarchy level (Supreme, Regional, Local)",
        examples=["Supreme Court"],
    )
    court_level_score: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Normalized court level score (Supreme=1.0, Regional=0.6, Local=0.3)",
    )
    citation_count: int | None = Field(
        None, description="Number of times this document has been cited", examples=[23]
    )
    citation_score: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Normalized citation score (based on percentile)",
    )
    recency_score: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Recency score (recent documents score higher)",
    )
    document_year: int | None = Field(
        None, description="Year the document was issued", examples=[2024]
    )
    precedent_strength: str | None = Field(
        None,
        description="Legal precedent strength classification",
        examples=["Binding", "Persuasive", "Informative"],
    )


class RelevanceReason(BaseModel):
    """Individual factor explaining why a document is relevant."""

    factor: str = Field(
        description="Type of relevance factor",
        examples=[
            "semantic_match",
            "authority",
            "recency",
            "document_type",
            "keyword_match",
        ],
    )
    weight: float = Field(
        ge=0.0, le=1.0, description="Weight of this factor in final score (0.0 to 1.0)"
    )
    score: float = Field(
        ge=0.0, le=1.0, description="Score for this specific factor (0.0 to 1.0)"
    )
    explanation: str = Field(
        description="Human-readable explanation of this factor",
        examples=["Strong semantic similarity to search query"],
    )
    matched_content: list[str] | None = Field(
        None,
        description="Specific content that matched (keywords, phrases, concepts)",
        examples=[["podatek VAT", "usługi cyfrowe"]],
    )


class DocumentPreview(BaseModel):
    """Quick preview information for a document (for hover tooltip)."""

    summary: str = Field(
        description="Brief 2-3 sentence summary of document", max_length=500
    )
    key_facts: list[str] | None = Field(
        None, description="Key facts extracted from document", max_length=3
    )
    holding: str | None = Field(
        None,
        description="Main holding or decision (for court judgments)",
        max_length=300,
    )


class SearchResultEnhanced(BaseModel):
    """Enhanced search result with ranking explanations."""

    document_id: str = Field(description="Document identifier")
    relevance_score: float = Field(
        ge=0.0, le=100.0, description="Overall relevance score (0-100)"
    )
    confidence: Literal["high", "medium", "low"] = Field(
        description="Confidence level in the ranking"
    )
    rank_position: int = Field(ge=1, description="Position in search results (1-based)")
    explanations: list[RelevanceReason] = Field(
        description="Detailed explanations of why this result is relevant"
    )
    authority_signals: AuthoritySignals = Field(
        description="Authority and credibility indicators"
    )
    preview: DocumentPreview | None = Field(
        None, description="Quick preview for hover tooltip"
    )
    highlighted_excerpts: list[str] | None = Field(
        None,
        description="Relevant text excerpts with query terms highlighted",
        max_length=3,
    )


# ===== Ranking Algorithm =====


class IntelligentRanker:
    """
    Intelligent document ranking engine.

    Combines multiple signals to produce explainable rankings:
    - Semantic similarity (vector search)
    - Keyword matching (BM25)
    - Authority signals (court level, citations)
    - Recency factor (newer is better)
    - Document type relevance
    """

    # Ranking weights (must sum to 1.0)
    WEIGHT_SEMANTIC = 0.40  # Vector similarity
    WEIGHT_KEYWORD = 0.20  # Keyword matching
    WEIGHT_AUTHORITY = 0.20  # Court level + citations
    WEIGHT_RECENCY = 0.10  # Document age
    WEIGHT_TYPE = 0.10  # Document type relevance

    # Court level scores
    COURT_SCORES = {
        "supreme": 1.0,
        "supreme court": 1.0,
        "constitutional": 1.0,
        "appellate": 0.8,
        "regional": 0.6,
        "district": 0.4,
        "local": 0.3,
        "administrative": 0.7,
    }

    # Document type scores (based on query context)
    TYPE_SCORES = {
        "judgment": 0.9,
        "legislation": 0.7,
        "regulation": 0.6,
        "article": 0.5,
    }

    @staticmethod
    def calculate_court_level_score(court: str | None) -> float:
        """
        Calculate normalized court level score.

        Args:
            court: Court name (e.g., "Supreme Court")

        Returns:
            Score from 0.0 to 1.0
        """
        if not court:
            return 0.5  # Default for unknown

        court_lower = court.lower()
        for key, score in IntelligentRanker.COURT_SCORES.items():
            if key in court_lower:
                return score

        return 0.5  # Default for unrecognized courts

    @staticmethod
    def calculate_recency_score(
        year: int | None, current_year: int | None = None
    ) -> float:
        """
        Calculate recency score with exponential decay.

        Recent documents score higher (2024 = 1.0, older = lower).

        Args:
            year: Document year
            current_year: Current year (defaults to now)

        Returns:
            Score from 0.0 to 1.0
        """
        if not year:
            return 0.3  # Low score for unknown year

        if current_year is None:
            current_year = datetime.now(UTC).year

        age = current_year - year

        # Exponential decay: documents older than 10 years score near 0
        # Recent documents (0-2 years) score 0.9-1.0
        if age <= 0:
            return 1.0
        if age <= 2:
            return 0.9
        if age <= 5:
            return 0.7
        if age <= 10:
            return 0.4
        return max(0.1, 0.4 * (0.8 ** (age - 10)))

    @staticmethod
    def calculate_citation_score(
        citation_count: int | None, max_citations: int = 100
    ) -> float:
        """
        Calculate citation score (normalized).

        Uses logarithmic scale to prevent highly-cited docs from dominating.

        Args:
            citation_count: Number of citations
            max_citations: Maximum citations for normalization

        Returns:
            Score from 0.0 to 1.0
        """
        if not citation_count or citation_count <= 0:
            return 0.0

        # Logarithmic scale
        import math

        normalized = math.log(citation_count + 1) / math.log(max_citations + 1)
        return min(1.0, normalized)

    @staticmethod
    def calculate_combined_score(
        semantic_similarity: float,
        keyword_match: float,
        court: str | None,
        year: int | None,
        citation_count: int | None,
        document_type: str | None,
    ) -> tuple[float, list[RelevanceReason]]:
        """
        Calculate combined relevance score with explanations.

        Args:
            semantic_similarity: Vector similarity score (0-1)
            keyword_match: Keyword matching score (0-1)
            court: Court name
            year: Document year
            citation_count: Number of citations
            document_type: Type of document

        Returns:
            tuple: (final_score, list_of_reasons)
        """
        # Calculate individual factor scores
        court_score = IntelligentRanker.calculate_court_level_score(court)
        recency_score = IntelligentRanker.calculate_recency_score(year)
        citation_score = IntelligentRanker.calculate_citation_score(citation_count)
        type_score = IntelligentRanker.TYPE_SCORES.get(document_type or "", 0.5)

        # Weighted average
        final_score = (
            IntelligentRanker.WEIGHT_SEMANTIC * semantic_similarity
            + IntelligentRanker.WEIGHT_KEYWORD * keyword_match
            + IntelligentRanker.WEIGHT_AUTHORITY * (court_score + citation_score) / 2
            + IntelligentRanker.WEIGHT_RECENCY * recency_score
            + IntelligentRanker.WEIGHT_TYPE * type_score
        )

        # Scale to 0-100
        final_score_scaled = final_score * 100

        # Generate explanations
        reasons = [
            RelevanceReason(
                factor="semantic_match",
                weight=IntelligentRanker.WEIGHT_SEMANTIC,
                score=semantic_similarity,
                explanation=IntelligentRanker._explain_semantic(semantic_similarity),
                matched_content=None,
            ),
            RelevanceReason(
                factor="keyword_match",
                weight=IntelligentRanker.WEIGHT_KEYWORD,
                score=keyword_match,
                explanation=IntelligentRanker._explain_keywords(keyword_match),
                matched_content=None,
            ),
            RelevanceReason(
                factor="authority",
                weight=IntelligentRanker.WEIGHT_AUTHORITY,
                score=(court_score + citation_score) / 2,
                explanation=IntelligentRanker._explain_authority(court, citation_count),
                matched_content=None,
            ),
            RelevanceReason(
                factor="recency",
                weight=IntelligentRanker.WEIGHT_RECENCY,
                score=recency_score,
                explanation=IntelligentRanker._explain_recency(year),
                matched_content=None,
            ),
            RelevanceReason(
                factor="document_type",
                weight=IntelligentRanker.WEIGHT_TYPE,
                score=type_score,
                explanation=IntelligentRanker._explain_type(document_type),
                matched_content=None,
            ),
        ]

        return final_score_scaled, reasons

    @staticmethod
    def _explain_semantic(score: float) -> str:
        """Generate human-readable explanation for semantic similarity."""
        if score >= 0.8:
            return "Very strong semantic similarity to your search query"
        if score >= 0.6:
            return "Good semantic match - discusses similar legal concepts"
        if score >= 0.4:
            return "Moderate semantic similarity - related legal topics"
        return "Weak semantic match - tangentially related"

    @staticmethod
    def _explain_keywords(score: float) -> str:
        """Generate human-readable explanation for keyword matching."""
        if score >= 0.8:
            return "Contains many exact keyword matches from your query"
        if score >= 0.6:
            return "Good keyword coverage - several query terms found"
        if score >= 0.4:
            return "Some keyword matches present"
        return "Few direct keyword matches"

    @staticmethod
    def _explain_authority(court: str | None, citations: int | None) -> str:
        """Generate human-readable explanation for authority signals."""
        parts = []

        if court:
            court_lower = court.lower()
            if "supreme" in court_lower or "constitutional" in court_lower:
                parts.append("Binding precedent from highest court")
            elif "appellate" in court_lower or "regional" in court_lower:
                parts.append("Persuasive precedent from appellate court")
            else:
                parts.append("Lower court decision")

        if citations and citations > 0:
            if citations >= 20:
                parts.append(f"Highly influential - cited {citations} times")
            elif citations >= 5:
                parts.append(f"Moderately cited ({citations} citations)")
            else:
                parts.append(f"Cited {citations} time(s)")

        return " | ".join(parts) if parts else "Standard authority level"

    @staticmethod
    def _explain_recency(year: int | None) -> str:
        """Generate human-readable explanation for recency."""
        if not year:
            return "Date unknown"

        current_year = datetime.now(UTC).year
        age = current_year - year

        if age <= 0:
            return f"Very recent - from {year}"
        if age <= 2:
            return f"Recent - from {year}"
        if age <= 5:
            return f"Relatively recent - from {year}"
        if age <= 10:
            return f"Older precedent - from {year}"
        return f"Historical precedent - from {year}"

    @staticmethod
    def _explain_type(doc_type: str | None) -> str:
        """Generate human-readable explanation for document type."""
        if not doc_type:
            return "Document type unknown"

        type_explanations = {
            "judgment": "Court judgment - primary legal authority",
            "legislation": "Legislative text - statutory law",
            "regulation": "Administrative regulation - binding rules",
            "article": "Academic article - scholarly analysis",
        }

        return type_explanations.get(doc_type, f"Document type: {doc_type}")

    @staticmethod
    def determine_confidence(score: float) -> Literal["high", "medium", "low"]:
        """
        Determine confidence level based on final score.

        Args:
            score: Final relevance score (0-100)

        Returns:
            Confidence level
        """
        if score >= 70:
            return "high"
        if score >= 40:
            return "medium"
        return "low"


# ===== Helper Functions =====


def extract_keywords_from_query(query: str) -> list[str]:
    """
    Extract important keywords from search query.

    Simple implementation - can be enhanced with NLP.

    Args:
        query: Search query text

    Returns:
        List of keywords
    """
    # Simple tokenization (can be improved with spaCy/NLTK)
    import re

    # Remove punctuation and lowercase
    cleaned = re.sub(r"[^\w\s]", " ", query.lower())

    # Split and filter short words
    words = [w for w in cleaned.split() if len(w) > 3]

    # Remove Polish stop words (basic list)
    stop_words = {
        "jest",
        "oraz",
        "albo",
        "które",
        "który",
        "która",
        "jakie",
        "jaki",
        "jaka",
        "czyli",
        "może",
        "mogą",
        "będzie",
        "było",
        "była",
        "byli",
        "były",
    }

    keywords = [w for w in words if w not in stop_words]

    return keywords[:10]  # Limit to top 10 keywords


def highlight_text_excerpt(
    text: str, keywords: list[str], max_length: int = 200
) -> str:
    """
    Extract and highlight relevant text excerpt containing keywords.

    Args:
        text: Full document text
        keywords: Keywords to highlight
        max_length: Maximum excerpt length

    Returns:
        Excerpt with keywords in context
    """
    # Find first keyword occurrence
    text_lower = text.lower()

    for keyword in keywords:
        pos = text_lower.find(keyword.lower())
        if pos != -1:
            # Extract context around keyword
            start = max(0, pos - 100)
            end = min(len(text), pos + max_length - 100)

            excerpt = text[start:end]

            # Clean up excerpt
            if start > 0:
                excerpt = "..." + excerpt
            if end < len(text):
                excerpt = excerpt + "..."

            return excerpt

    # No keywords found - return beginning
    return text[:max_length] + ("..." if len(text) > max_length else "")


logger.info("Search intelligence module initialized")

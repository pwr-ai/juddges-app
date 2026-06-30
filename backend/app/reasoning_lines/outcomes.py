"""LLM-based outcome classification endpoint (#147 split)."""

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from juddges_search.db.supabase_db import get_vector_db
from juddges_search.llms import get_default_llm
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate
from loguru import logger

from app.rate_limiter import limiter

from .constants import (
    REASONING_LINES_LLM_RATE_LIMIT,
)
from .schemas import (
    OutcomeClassificationResult,
)

router = APIRouter()

# Maximum characters of judgment text to send to the LLM for outcome classification
_OUTCOME_TEXT_MAX_CHARS = 8000

# Maximum members to classify in a single analyze-outcomes request
_OUTCOME_MAX_MEMBERS_PER_CALL = 50

OUTCOME_CLASSIFICATION_SYSTEM_PROMPT = (
    "You are a legal analyst specializing in court judgment outcome classification. "
    "You must respond with valid JSON matching the requested schema."
)

OUTCOME_CLASSIFICATION_USER_PROMPT = """You are a legal analyst. Given a legal question and a \
court judgment, classify the judgment's outcome.

Legal question: {legal_question}

Judgment text (excerpt): {text}

Classify the outcome as one of:
- "for": The court ruled in favor of the position implied by the legal question
- "against": The court ruled against the position
- "mixed": The court's ruling was partially favorable, partially unfavorable
- "procedural": The case was decided on procedural grounds without addressing the \
substantive question

Return JSON: {{"outcome_direction": "for|against|mixed|procedural", \
"reasoning": "brief explanation"}}"""


@router.post(
    "/{line_id}/analyze-outcomes",
    response_model=OutcomeClassificationResult,
    summary="Classify outcome direction for each member judgment using LLM",
)
@limiter.limit(REASONING_LINES_LLM_RATE_LIMIT)
async def analyze_outcomes(
    request: Request, line_id: str
) -> OutcomeClassificationResult:
    """
    Use LLM to classify each member judgment's outcome direction relative
    to the reasoning line's legal question.

    For each member that does not already have an outcome_direction set,
    the LLM classifies the judgment as 'for', 'against', 'mixed', or
    'procedural'. Results are persisted to the reasoning_line_members table.

    Processes at most 50 members per call to avoid timeout. Members that
    already have outcome_direction set are skipped.
    """
    db = get_vector_db()

    # Step 1: Fetch the reasoning line to get the legal question
    try:
        line_response = (
            db.client.table("reasoning_lines")
            .select("id, legal_question")
            .eq("id", line_id)
            .execute()
        )
    except Exception as e:
        logger.error(
            f"Error fetching reasoning line {line_id} for outcome analysis: {e}"
        )
        raise HTTPException(status_code=500, detail="Failed to fetch reasoning line")

    line_rows = line_response.data or []
    if not line_rows:
        raise HTTPException(
            status_code=404, detail=f"Reasoning line {line_id} not found"
        )

    legal_question = line_rows[0]["legal_question"]

    # Step 2: Fetch all members and identify those needing classification
    try:
        members_response = (
            db.client.table("reasoning_line_members")
            .select("judgment_id, outcome_direction")
            .eq("reasoning_line_id", line_id)
            .execute()
        )
    except Exception as e:
        logger.error(
            f"Error fetching members for outcome analysis on line {line_id}: {e}"
        )
        raise HTTPException(
            status_code=500, detail="Failed to fetch reasoning line members"
        )

    all_members = members_response.data or []

    # Separate already-classified from unclassified members
    unclassified_ids: list[str] = []
    skipped = 0
    for m in all_members:
        if m.get("outcome_direction"):
            skipped += 1
        else:
            unclassified_ids.append(str(m["judgment_id"]))

    # Cap at max members per call to avoid timeout
    unclassified_ids = unclassified_ids[:_OUTCOME_MAX_MEMBERS_PER_CALL]

    if not unclassified_ids:
        logger.info(f"All members of line {line_id} already classified, nothing to do")
        return OutcomeClassificationResult(classified=0, skipped=skipped, errors=0)

    # Step 3: Fetch judgment text (full_text preferred, fallback to summary)
    try:
        j_response = (
            db.client.table("judgments")
            .select("id, full_text, summary")
            .in_("id", unclassified_ids)
            .execute()
        )
    except Exception as e:
        logger.error(f"Error fetching judgment texts for outcome analysis: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch judgment texts")

    judgments_by_id: dict[str, dict[str, Any]] = {
        str(j["id"]): j for j in (j_response.data or [])
    }

    # Step 4: Build LLM chain (same pattern as argumentation.py)
    chat_prompt = ChatPromptTemplate.from_messages(
        [
            ("system", OUTCOME_CLASSIFICATION_SYSTEM_PROMPT),
            ("human", OUTCOME_CLASSIFICATION_USER_PROMPT),
        ]
    )
    llm = get_default_llm(use_mini_model=True)  # mini model for cost efficiency
    parser = JsonOutputParser()
    chain = chat_prompt | llm | parser

    valid_directions = {"for", "against", "mixed", "procedural"}

    # Step 5: Classify each unclassified member individually
    classified = 0
    errors = 0

    for jid in unclassified_ids:
        judgment = judgments_by_id.get(jid)
        if not judgment:
            logger.warning(
                f"Judgment {jid} not found in database, skipping classification"
            )
            errors += 1
            continue

        # Extract text, preferring full_text over summary, truncated to limit
        text = judgment.get("full_text") or judgment.get("summary") or ""
        if not text:
            logger.warning(
                f"Judgment {jid} has no text content, skipping classification"
            )
            errors += 1
            continue

        text = text[:_OUTCOME_TEXT_MAX_CHARS]

        try:
            result = await chain.ainvoke(
                {
                    "legal_question": legal_question,
                    "text": text,
                }
            )

            # Validate and extract outcome direction from LLM response
            direction = result.get("outcome_direction", "").lower().strip()
            if direction not in valid_directions:
                logger.warning(
                    f"LLM returned invalid outcome_direction '{direction}' "
                    f"for judgment {jid}, skipping"
                )
                errors += 1
                continue

            # Persist the classification to the database
            db.client.table("reasoning_line_members").update(
                {"outcome_direction": direction}
            ).eq("reasoning_line_id", line_id).eq("judgment_id", jid).execute()

            classified += 1
            logger.debug(
                f"Classified judgment {jid} as '{direction}' for line {line_id}"
            )

        except Exception as e:
            logger.error(f"LLM classification failed for judgment {jid}: {e}")
            errors += 1
            continue

    logger.info(
        f"Outcome analysis for line {line_id}: classified={classified}, "
        f"skipped={skipped}, errors={errors}"
    )

    return OutcomeClassificationResult(
        classified=classified,
        skipped=skipped,
        errors=errors,
    )

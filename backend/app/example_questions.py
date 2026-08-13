"""Router for serving example questions for chat interface."""

from fastapi import APIRouter, Request
from juddges_search.prompts.legal.examples import get_random_example_questions
from pydantic import BaseModel

from app.rate_limiter import limiter

router = APIRouter(prefix="/example_questions", tags=["example_questions"])

# Per-endpoint rate limit for example questions (lightweight endpoint)
EXAMPLE_QUESTIONS_RATE_LIMIT = "30/hour"


class ExampleQuestionsResponse(BaseModel):
    """Response model for example questions."""

    questions: list[str]


@router.get("", response_model=ExampleQuestionsResponse)
@limiter.limit(EXAMPLE_QUESTIONS_RATE_LIMIT)
async def get_example_questions(
    request: Request, num_polish: int = 2, num_english: int = 2
) -> ExampleQuestionsResponse:
    """
    Get randomly sampled example questions.

    Args:
        num_polish: Number of Polish questions to sample (default: 2)
        num_english: Number of English questions to sample (default: 2)

    Returns:
        ExampleQuestionsResponse containing list of randomly sampled questions
    """
    # Sourced from the curated list rather than the database. This used to call a
    # `get_random_example_questions` RPC and fall back to the curated list when
    # that failed — but the RPC has never existed in any migration or in the
    # database, and there is no example-questions table for it to read, so the
    # fallback was the only path that ever ran while every request paid for a
    # failed round trip and logged an error (#484).
    #
    # Kept out of the docstring deliberately: FastAPI publishes that verbatim as
    # the endpoint's OpenAPI description, and this is repo history, not something
    # an API consumer needs.
    questions = get_random_example_questions(num_polish, num_english)
    return ExampleQuestionsResponse(questions=questions)

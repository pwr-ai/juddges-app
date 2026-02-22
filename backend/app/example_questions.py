"""Router for serving example questions for chat interface."""

import asyncio
from fastapi import APIRouter
from pydantic import BaseModel
from loguru import logger

from app.core.supabase import get_supabase_client

router = APIRouter(prefix="/example_questions", tags=["example_questions"])


class ExampleQuestionsResponse(BaseModel):
    """Response model for example questions."""

    questions: list[str]


@router.get("", response_model=ExampleQuestionsResponse)
async def get_example_questions(
    num_polish: int = 2, num_english: int = 2
) -> ExampleQuestionsResponse:
    """
    Get randomly sampled example questions from database.

    Args:
        num_polish: Number of Polish questions to sample (default: 2)
        num_english: Number of English questions to sample (default: 2)

    Returns:
        ExampleQuestionsResponse containing list of randomly sampled questions
    """
    client = get_supabase_client()

    if client is None:
        logger.warning(
            "Supabase client not initialized - using fallback example questions"
        )
        # Fallback to hardcoded examples if database is not configured
        from juddges_search.prompts.legal.examples import get_random_example_questions

        questions = get_random_example_questions(num_polish, num_english)
        return ExampleQuestionsResponse(questions=questions)

    try:
        # Fetch random Polish and English questions in parallel for better performance
        # Wrap synchronous Supabase calls in asyncio.to_thread for parallel execution
        def fetch_polish():
            return client.rpc(
                "get_random_example_questions",
                {"p_language": "pl", "p_count": num_polish},
            ).execute()

        def fetch_english():
            return client.rpc(
                "get_random_example_questions",
                {"p_language": "en", "p_count": num_english},
            ).execute()

        # Execute both database calls in parallel
        polish_response, english_response = await asyncio.gather(
            asyncio.to_thread(fetch_polish), asyncio.to_thread(fetch_english)
        )

        # Extract questions from response
        polish_questions = [item["question"] for item in (polish_response.data or [])]
        english_questions = [item["question"] for item in (english_response.data or [])]

        # Combine Polish and English questions
        all_questions = polish_questions + english_questions

        logger.info(f"Retrieved {len(all_questions)} example questions from database")
        return ExampleQuestionsResponse(questions=all_questions)

    except Exception as e:
        logger.error(f"Error fetching example questions from database: {e}")
        # Fallback to hardcoded examples on error
        from juddges_search.prompts.legal.examples import get_random_example_questions

        questions = get_random_example_questions(num_polish, num_english)
        return ExampleQuestionsResponse(questions=questions)

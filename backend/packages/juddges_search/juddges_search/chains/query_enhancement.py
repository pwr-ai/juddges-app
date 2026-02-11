"""Query enhancement chain for 'thinking' mode search."""

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_openai import ChatOpenAI


# Query enhancement prompt
QUERY_ENHANCEMENT_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are an expert legal research assistant. Your task is to enhance user search queries to improve legal document retrieval.

Given a user's search query, rewrite it to:
1. Add relevant legal terminology and synonyms
2. Expand abbreviations and acronyms
3. Include related legal concepts
4. Maintain the original intent
5. Keep it concise (max 200 words)

Examples:
- Input: "contract disputes"
  Output: "contract disputes breach of contract contractual obligations breach of agreement contractual disputes agreement violations contract law"

- Input: "tax evasion cases"
  Output: "tax evasion tax fraud tax avoidance criminal tax violations tax law violations revenue evasion willful tax violations"

- Input: "employment discrimination"
  Output: "employment discrimination workplace discrimination discriminatory hiring practices discriminatory termination equal employment opportunity violations Title VII violations"

Return ONLY the enhanced query text, no explanation."""),
    ("human", "{query}")
])


def create_query_enhancement_chain(llm: ChatOpenAI | None = None):
    """Create the query enhancement chain.

    Args:
        llm: Optional LLM instance. If None, uses default gpt-4o-mini.

    Returns:
        Runnable chain that enhances queries.
    """
    if llm is None:
        llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0.3,  # Low temperature for consistency
            max_tokens=200
        )

    chain = QUERY_ENHANCEMENT_PROMPT | llm | StrOutputParser()
    return chain


async def enhance_query(query: str, llm: ChatOpenAI | None = None) -> str:
    """Enhance a search query for better legal document retrieval.

    Args:
        query: Original user query
        llm: Optional LLM instance

    Returns:
        Enhanced query string
    """
    chain = create_query_enhancement_chain(llm)
    enhanced = await chain.ainvoke({"query": query})
    return enhanced.strip()

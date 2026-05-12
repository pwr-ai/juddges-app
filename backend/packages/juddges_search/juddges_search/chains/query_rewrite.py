"""LLM chain that converts NL search queries into structured filters + a
cleaned query string for Meilisearch.

Outputs follow `QueryRewriteResult`. The chain expects three input keys:

    {"query": str, "today": str (YYYY-MM-DD), "languages_hint": list[str] | None}
"""

from __future__ import annotations

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable, RunnableLambda

from juddges_search.chains.callbacks import callbacks
from juddges_search.chains.query_rewrite_models import QueryRewriteResult
from juddges_search.llms import get_default_llm

# Few-shot examples kept short and outcome-focused. Each pair shows the
# *intent* of the rewrite: extract chip-worthy facts, leave the rest as
# rewritten_query.
SYSTEM_PROMPT = """You convert legal-research questions about Polish (PL) and UK court judgments into a Meilisearch query envelope.

Today's date: {today}
User's language hint (informational): {languages_hint}

Rules:
- Emit every field. Use null when the user did not state the value. Never guess.
- Keep Polish accents intact (ą, ć, ę, ł, ń, ó, ś, ź, ż). Do not transliterate.
- Use the rewritten_query for ranking signal: expand legal abbreviations (k.k. -> kodeks karny), drop the parts you turned into chips, keep useful synonyms.
- Numeric ranges (base_*): only when the user gives an explicit bound ("at least 3", "between 2018 and 2022").
- Arrays (keywords, legal_topics, cited_legislation): at most 6 candidates, no duplicates; the backend will canonicalise.
- decision_date: ISO 8601 dates (YYYY-MM-DD). Resolve relative phrases ("ostatnie 5 lat", "since 2020") against the date above.
- languages: only 'pl' or 'uk'. Lowercase. Include both when the user does not specify.

Categorical vocabulary (use exactly these values or null):
- jurisdiction: PL | UK
- court_level: supreme | constitutional | appellate | regional | district | local | administrative
- case_type: criminal | civil | administrative | commercial
- decision_type: judgment | order | resolution
- outcome: granted | dismissed | partial | remanded

Examples:

User: "wyroki sądu apelacyjnego z 2022 dotyczące VAT"
Output:
  rewritten_query: "VAT podatek od towarów i usług"
  jurisdiction: PL
  court_level: appellate
  decision_date: {{from: "2022-01-01", to: "2022-12-31"}}
  keywords: ["VAT", "podatek od towarów i usług"]

User: "criminal appeals with at least 3 victims since 2020"
Output:
  rewritten_query: "criminal appeal victims"
  case_type: criminal
  court_level: appellate
  decision_date: {{from: "2020-01-01"}}
  base_num_victims: {{min: 3}}

User: "kodeks karny art 286"
Output:
  rewritten_query: "kodeks karny artykuł 286 oszustwo"
  cited_legislation: ["kodeks karny art. 286"]

User: "umowy najmu mieszkania"
Output:
  rewritten_query: "umowa najmu mieszkania lokal mieszkalny dzierżawa"
  jurisdiction: PL
  case_type: civil
  keywords: ["najem", "umowa najmu", "mieszkanie"]
"""

USER_PROMPT = "{query}"

prompt = ChatPromptTemplate.from_messages(
    [
        ("system", SYSTEM_PROMPT),
        ("human", USER_PROMPT),
    ]
)


def build_query_rewrite_chain(
    structured_llm: Runnable | None = None,
) -> Runnable:
    """Build the chain. `structured_llm` is injectable for tests."""
    if structured_llm is None:
        structured_llm = get_default_llm(use_mini_model=True).with_structured_output(QueryRewriteResult)

    def _coerce_inputs(d: dict) -> dict:
        return {
            "query": d["query"],
            "today": d["today"],
            "languages_hint": d.get("languages_hint") or ["pl", "uk"],
        }

    return (RunnableLambda(_coerce_inputs) | prompt | structured_llm).with_config(
        run_name="juddges_query_rewrite_chain", callbacks=callbacks
    )


# Module-level handle for production wiring. Kept lazy because
# get_default_llm() instantiates ChatOpenAI, which requires OPENAI_API_KEY
# at construction time — importing this module during tests/CI must not
# fail. Callers should invoke `query_rewrite_chain()` to obtain a runnable;
# tests should call build_query_rewrite_chain(structured_llm=...) directly
# with a FakeLLM. Mirrors the pattern used by schema_generation_chain.
query_rewrite_chain = build_query_rewrite_chain

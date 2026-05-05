"""Natural-language → base-schema filter generator.

Converts a user's plain-English (or Polish) question into the JSON `p_filters`
shape accepted by the Postgres RPC `filter_documents_by_extracted_data` (defined
in supabase/migrations/20260226000001_create_judgment_base_extractions_table.sql
and extended by 20260505000001_extend_base_schema_filterable_searchable.sql).

The output is validated by Pydantic; every enum-constrained field uses
`Literal[...]` mirroring the CHECK constraints in the migration, so an LLM
that hallucinates an unknown value triggers a parse error and a retry rather
than poisoning the query.

Usage:

    from app.extraction_domain.nl_filter_generator import (
        generate_base_schema_filter,
    )

    result = await generate_base_schema_filter(
        "list cases with at least 2 co-defendants where the offender confessed"
    )
    payload = result.to_rpc_payload()
    # payload == {
    #     "filters": {"co_def_acc_num": {"min": 2}, "did_offender_confess": True},
    #     "text_query": None,
    # }
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal

from juddges_search.llms import get_default_llm
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from langchain_openai import ChatOpenAI

# ---------------------------------------------------------------------------
# Enum literals — must match CHECK constraints in
# supabase/migrations/20260226000001_create_judgment_base_extractions_table.sql
# ---------------------------------------------------------------------------

Appellant = Literal["offender", "attorney_general", "other"]
PleaPoint = Literal[
    "police_presence",
    "first_court_appearance",
    "before_trial",
    "first_day_of_trial",
    "after_first_day_of_trial",
    "dont_know",
]
RemandDecision = Literal[
    "unconditional_bail", "conditional_bail", "remanded_in_custody", "dont_know"
]
SentenceServe = Literal["serve_concurrent", "serve_consecutive", "serve_unknown"]
Gender = Literal["gender_male", "gender_female", "gender_unknown"]
Intoxication = Literal["intox_alcohol", "intox_drugs", "intox_unknown"]
VictimType = Literal["individual_person", "organisation"]
PreSentReport = Literal["low", "medium", "high", "dont_know"]
OffenderJob = Literal[
    "employed",
    "self_employed",
    "unemployed",
    "student",
    "retired",
    "other",
    "dont_know",
]
OffenderHome = Literal[
    "fixed_address", "homeless", "temporary_accommodation", "dont_know"
]
OffenderVictimRel = Literal["stranger", "relative", "acquaintance", "dont_know"]
AppealAgainst = Literal[
    "appeal_conviction_unsafe",
    "appeal_sentence_excessive",
    "appeal_sentence_lenient",
    "appeal_other",
    "appeal_unknown",
]
AppealOutcome = Literal[
    "outcome_dismissed_or_refused",
    "outcome_conviction_quashed",
    "outcome_sentence_more_severe",
    "outcome_sentence_more_lenient",
    "outcome_other",
    "outcome_unknown",
]


# ---------------------------------------------------------------------------
# Range helpers (mirror the {"min": ..., "max": ...} / {"from":, "to":} shapes
# already accepted by the RPC)
# ---------------------------------------------------------------------------


class NumericRange(BaseModel):
    """Inclusive numeric range. Either bound may be omitted."""

    model_config = ConfigDict(extra="forbid")
    min: float | None = Field(default=None, description="Inclusive lower bound.")
    max: float | None = Field(default=None, description="Inclusive upper bound.")


class DateRange(BaseModel):
    """Inclusive ISO-date range. Either bound may be omitted."""

    model_config = ConfigDict(extra="forbid")
    from_: str | None = Field(
        default=None,
        alias="from",
        description="Inclusive ISO date YYYY-MM-DD.",
    )
    to: str | None = Field(default=None, description="Inclusive ISO date YYYY-MM-DD.")


# ---------------------------------------------------------------------------
# Top-level filter model — mirrors filter_documents_by_extracted_data params
# ---------------------------------------------------------------------------


class BaseSchemaFilter(BaseModel):
    """Structured filter for the base-schema RPC.

    Every field is optional. Only set a field when the user's query *clearly*
    implies it. Never invent values for fields the user did not mention.
    """

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    # --- scalar enums (IN-list) ------------------------------------------------
    appellant: list[Appellant] | None = None
    plea_point: list[PleaPoint] | None = None
    remand_decision: list[RemandDecision] | None = None
    victim_type: list[VictimType] | None = None
    pre_sent_report: list[PreSentReport] | None = None
    offender_job_offence: list[OffenderJob] | None = None
    offender_home_offence: list[OffenderHome] | None = None
    offender_victim_relationship: list[OffenderVictimRel] | None = None

    # --- multi-value enums (array overlap) ------------------------------------
    appeal_against: list[AppealAgainst] | None = None
    appeal_outcome: list[AppealOutcome] | None = None
    sentence_serve: list[SentenceServe] | None = None
    offender_gender: list[Gender] | None = None
    offender_intox_offence: list[Intoxication] | None = None
    victim_gender: list[Gender] | None = None
    victim_intox_offence: list[Intoxication] | None = None

    # --- free-text array overlap ---------------------------------------------
    keywords: list[str] | None = None
    convict_offences: list[str] | None = None
    acquit_offences: list[str] | None = None
    appeal_ground: list[str] | None = None
    sentences_received: list[str] | None = None
    what_ancilliary_orders: list[str] | None = None
    pros_evid_type_trial: list[str] | None = None
    def_evid_type_trial: list[str] | None = None
    agg_fact_sent: list[str] | None = None
    mit_fact_sent: list[str] | None = None
    sent_guide_which: list[str] | None = None
    reason_quash_conv: list[str] | None = None
    reason_sent_excessive: list[str] | None = None
    reason_sent_lenient: list[str] | None = None
    reason_dismiss: list[str] | None = None
    convict_plea_dates: list[str] | None = None

    # --- booleans -------------------------------------------------------------
    did_offender_confess: bool | None = None
    vic_impact_statement: bool | None = None

    # --- numerics (eq or range) -----------------------------------------------
    num_victims: NumericRange | float | None = None
    case_number: NumericRange | float | None = None
    victim_age_offence: NumericRange | float | None = None
    co_def_acc_num: NumericRange | float | None = None

    # --- date -----------------------------------------------------------------
    date_of_appeal_court_judgment: DateRange | str | None = None

    # --- substring (ILIKE) ----------------------------------------------------
    case_name: str | None = None
    neutral_citation_number: str | None = None
    appeal_court_judges_names: str | None = None
    offender_representative_name: str | None = None

    # --- full-text query (separate parameter, not part of `p_filters`) -------
    text_query: str | None = Field(
        default=None,
        description=(
            "Plain text to match against base_search_tsv via websearch_to_tsquery. "
            "Use only when the user wants free-text search across case name, "
            "judges, charges, courts, etc."
        ),
    )

    def to_rpc_payload(self) -> dict[str, Any]:
        """Return the body shape expected by `POST /api/extractions/base-schema/filter`.

        Splits `text_query` from the JSONB `filters` blob, drops None values, and
        converts NumericRange / DateRange instances into plain dicts so the JSON
        round-trip matches what `filter_documents_by_extracted_data` expects.
        """
        dumped = self.model_dump(exclude_none=True, by_alias=True)
        text_query = dumped.pop("text_query", None)
        return {"filters": dumped, "text_query": text_query}


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You translate a user's natural-language question about UK
and Polish criminal-court judgments into a structured filter for the
`filter_documents_by_extracted_data` Postgres RPC.

You MUST follow these rules:

1. Only set a field when the user's query *clearly* implies it. If unsure,
   leave the field out (null). Never guess values.
2. Enum-constrained fields accept only the listed values — never invent
   new ones. Map common phrasing to the closest enum value.
3. For numeric fields, prefer ranges over equality. "at least N" → {"min": N};
   "no more than N" → {"max": N}; "between N and M" → {"min": N, "max": M};
   "exactly N" → equality (just a number).
4. For dates, use ISO format YYYY-MM-DD. "in 2024" → from 2024-01-01 to
   2024-12-31. "since 2023" → from 2023-01-01.
5. `text_query` is for free-text search across case name, judges, charges,
   courts, keywords. Use it only when the user is asking for content
   *mentioning* something. If the user is filtering by a structured field,
   use the structured filter and leave text_query null.
6. `case_name`, `neutral_citation_number`, `appeal_court_judges_names`,
   `offender_representative_name` are SUBSTRING matches (ILIKE). Strip
   honorifics ("Lord Justice", "Mrs Justice", "Sędzia") — keep the surname
   that's most distinctive.
7. Free-text array fields (`keywords`, `convict_offences`, `agg_fact_sent`,
   `mit_fact_sent`, …) are not enum-constrained; you may add reasonable
   short tokens but err toward leaving them null when the user hasn't been
   specific.

Enum reference (mirror these exactly):

- appellant: offender | attorney_general | other
- plea_point: police_presence | first_court_appearance | before_trial |
  first_day_of_trial | after_first_day_of_trial | dont_know
- remand_decision: unconditional_bail | conditional_bail |
  remanded_in_custody | dont_know
- sentence_serve: serve_concurrent | serve_consecutive | serve_unknown
- offender_gender / victim_gender: gender_male | gender_female | gender_unknown
- offender_intox_offence / victim_intox_offence: intox_alcohol | intox_drugs |
  intox_unknown
- victim_type: individual_person | organisation
- pre_sent_report: low | medium | high | dont_know
- offender_job_offence: employed | self_employed | unemployed | student |
  retired | other | dont_know
- offender_home_offence: fixed_address | homeless | temporary_accommodation |
  dont_know
- offender_victim_relationship: stranger | relative | acquaintance | dont_know
- appeal_against: appeal_conviction_unsafe | appeal_sentence_excessive |
  appeal_sentence_lenient | appeal_other | appeal_unknown
- appeal_outcome: outcome_dismissed_or_refused | outcome_conviction_quashed |
  outcome_sentence_more_severe | outcome_sentence_more_lenient |
  outcome_other | outcome_unknown

Examples:

user: "list cases with at least 2 co-defendants where the offender confessed"
→ co_def_acc_num: {"min": 2}, did_offender_confess: true

user: "successful appeals where the conviction was quashed in 2025"
→ appeal_outcome: ["outcome_conviction_quashed"],
  date_of_appeal_court_judgment: {"from": "2025-01-01", "to": "2025-12-31"}

user: "robbery cases involving a knife"
→ text_query: "robbery knife"

user: "female offenders under the influence of drugs, victim was a relative"
→ offender_gender: ["gender_female"],
  offender_intox_offence: ["intox_drugs"],
  offender_victim_relationship: ["relative"]

user: "judgments by Lord Justice Edis"
→ appeal_court_judges_names: "Edis"

user: "homeless offender, unemployed, with a guilty plea mitigating factor"
→ offender_home_offence: ["homeless"],
  offender_job_offence: ["unemployed"],
  mit_fact_sent: ["guilty_plea"]

Return JSON matching the schema exactly. Set unused fields to null.
"""

NL_FILTER_PROMPT = ChatPromptTemplate.from_messages(
    [("system", SYSTEM_PROMPT), ("human", "{query}")]
)


# ---------------------------------------------------------------------------
# Chain factory + entry point
# ---------------------------------------------------------------------------


def create_nl_filter_chain(llm: ChatOpenAI | None = None):
    """Build the LangChain pipeline that emits a validated BaseSchemaFilter."""
    if llm is None:
        llm = get_default_llm(use_mini_model=True)
    structured = llm.with_structured_output(BaseSchemaFilter)
    return NL_FILTER_PROMPT | structured


async def generate_base_schema_filter(
    query: str,
    llm: ChatOpenAI | None = None,
) -> BaseSchemaFilter:
    """Translate a natural-language question into a validated filter."""
    chain = create_nl_filter_chain(llm)
    return await chain.ainvoke({"query": query})

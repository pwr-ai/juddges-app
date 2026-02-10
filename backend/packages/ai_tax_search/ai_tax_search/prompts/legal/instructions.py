"""
Task-specific instructions for legal document analysis and response generation.
Supports both tax law and criminal law domains with cross-jurisdictional capabilities.
"""

LEGAL_INSTRUCTION_PROMPT = """<analysis_protocol>

PRIMARY DIRECTIVE:
- If <context> contains legal documents, base your response primarily on these documents
- If <context> is empty or contains only "Brak wcześniejszej rozmowy", this is a reformulation/format request or general question - use <chat_history> and your legal knowledge to respond
- For reformulation requests: Focus on rewording the previous response from <chat_history> without searching for new information
- For format changes: Adjust the presentation style (short/detailed) of information already discussed in <chat_history>
- For general legal questions without documents: Provide general legal knowledge while clearly stating it's not based on specific documents

<step_1_document_analysis>
Analyze provided documents to:

<domain_detection>
First, identify the legal domain from document context:
- Tax Law: Tax legislation, tax court judgments, tax interpretations, fiscal regulations
- Criminal Law: Criminal court judgments, sentencing decisions, procedural rulings, meta-annotated records
</domain_detection>

<universal_analysis>
1. Identify directly relevant legal sources (statutes, judgments, interpretations)
2. Extract specific citations with proper formatting:
   - Polish: "art. 12 ust. 1 ustawy o VAT" or "wyrok NSA z dnia..."
   - English: "Section 12(1) of Criminal Justice Act 2003" or "R v Smith [2023] EWCA Crim 123"
3. Note judicial reasoning and decision-making patterns
4. Understand practical implications and legal consequences
</universal_analysis>

<domain_specific_analysis>
For Tax Law documents:
- Identify tax provisions, rates, exemptions, procedures
- Extract administrative interpretations and their binding nature
- Note taxpayer obligations and compliance requirements

For Criminal Law documents:
- Identify judicial decision-making patterns and reasoning structures
- Extract sentencing factors, aggravating/mitigating circumstances
- Note procedural aspects and evidential standards
- Identify meta-annotation elements: case facts, legal reasoning, judicial outcomes
- Recognize cross-jurisdictional patterns (Poland vs England & Wales courts)
</domain_specific_analysis>
</step_1_document_analysis>

<step_2_conversational_context>
Review <chat_history> to:
1. Understand references to previously discussed cases, statutes, or legal provisions
2. Maintain context about specific situations discussed earlier:
   - Tax domain: Taxpayer circumstances, fiscal scenarios, compliance issues
   - Criminal domain: Case contexts, sentencing patterns, judicial reasoning threads
3. Build upon or clarify previous explanations with added depth
4. Avoid redundant repetition while maintaining conversational continuity
5. Track evolving analytical threads in empirical research or comparative analysis
</step_2_conversational_context>

<step_3_response_construction>
Construct your response following these rules:

LANGUAGE RULE: Always respond in the same language as the user's question. Match the user's language exactly (Polish or English). Maintain language consistency throughout the response including section headers and technical terminology.

CITATION RULE: Reference documents using [number] notation:
- [1], [2], [3] for each unique document cited
- Place citations at the end of sentences: "Supply of goods is subject to VAT [1]." / "Dostawa towarów podlega VAT [1]."
- Reuse citation numbers for the same document throughout response
- Citations refer to document numbers provided in <context>
- For cross-jurisdictional analysis, indicate jurisdiction: "Polish courts [1] and English courts [2] differ..."

LEGAL REASONING RULE: Structure analysis to show logical progression:
1. Applicable legal provisions (statutes/regulations) →
2. Judicial/administrative interpretation →
3. Practical application and consequences

For criminal law: Add judicial decision-making analysis:
1. Case facts and procedural context →
2. Legal reasoning and precedent application →
3. Sentencing rationale or procedural outcome →
4. Meta-analytical insights (patterns, policies, cross-jurisdictional comparisons)

NO_DOCUMENT_MATCH_RULE:
1. If <context> is empty (reformulation/format change/general question):
   - For reformulation: Rewrite previous response from <chat_history> in different words
   - For format change: Adjust presentation (short ↔ detailed) of <chat_history> content
   - For general questions: Provide general legal knowledge with disclaimer

2. If <context> has documents but none are relevant, explicitly state (language-matched):
   - Polish: "W dostarczonych dokumentach nie znaleziono informacji bezpośrednio odnoszących się do tego zagadnienia."
   - English: "No information directly relevant to this issue was found in the provided documents."

Then provide general legal context clearly marked as not from provided documents.
</step_3_response_construction>

<step_4_self_verification>
Before finalizing, verify:
1. All [number] citations reference actual documents in <context>
2. Legal reasoning is logically coherent and domain-appropriate
3. Response matches requested format (short vs. detailed)
4. Language consistency: All terminology, headers, and text match user's question language
5. Domain-specific terminology is accurate:
   - Tax law: Polish fiscal terminology or English tax terms
   - Criminal law: Appropriate court names, procedural terms, sentencing concepts
6. Cross-jurisdictional references are clearly distinguished when applicable
7. JSON structure is valid and complete
</step_4_self_verification>

</analysis_protocol>

<input_variables>
<chat_history>
{chat_history}
</chat_history>

<user_question>
{question}
</user_question>

<context>
{context}
</context>
</input_variables>"""

# Adaptive format instructions - LLM decides based on query complexity
ADAPTIVE_FORMAT_INSTRUCTIONS = """<response_format_selection>

ANALYZE the user's question and SELECT the appropriate response format:

USE SHORT FORMAT when:
- User asks a simple, specific question with a clear yes/no or brief answer
- Question requests quick clarification or confirmation
- User explicitly requests a brief/short/concise response
- Query is about a single, straightforward legal provision or rule
- Question format suggests brevity (e.g., "Czy...", "Is...", "What is...")

USE DETAILED FORMAT when:
- Question involves complex legal analysis or multiple legal provisions
- User asks about reasoning, rationale, or comprehensive understanding
- Query requires analysis of case law and statutory provisions together
- Question involves comparative analysis or cross-jurisdictional issues
- User explicitly requests detailed/comprehensive/in-depth response
- Query suggests need for practical guidance or step-by-step explanation
- Default to this when uncertainty exists

</response_format_selection>

<output_formats>

REQUIRED JSON SCHEMA (same for both formats):
{{
    "text": "string (markdown formatted)",
    "document_ids": ["string array of document IDs cited"],
    "format_used": "short" or "detailed"
}}

---

FORMAT OPTION 1: SHORT (150-300 words, max 3 citations)

REQUIRED MARKDOWN STRUCTURE in "text" field (adapt headers to user's language):

## [Response Header]
Polish: "Odpowiedź" | English: "Response"

[Direct answer to the question in 2-3 sentences]

### [Legal Basis Header]
Polish: "Podstawa prawna" | English: "Legal Basis"
For criminal law in English, consider: "Relevant Law" or "Applicable Provisions"

[Key legal provisions and citations [1], [2]]

### [Summary Header]
Polish: "Podsumowanie" | English: "Summary"

- **[Key point 1]**
- **[Key point 2]**
- **[Key point 3]**

DOMAIN-SPECIFIC ADAPTATIONS:
- Tax Law: Focus on fiscal provisions, tax rates, compliance obligations
- Criminal Law: Highlight sentencing factors, judicial reasoning, procedural aspects

CONSTRAINTS:
- Total length: 150-300 words
- Maximum 3 citations
- Focus on actionable conclusions
- Match user's question language exactly (Polish or English)

---

FORMAT OPTION 2: DETAILED (400-800 words, all relevant citations)

REQUIRED MARKDOWN STRUCTURE in "text" field (adapt headers to user's language and domain):

# [Legal Analysis Header]
Polish: "Analiza prawna" | English: "Legal Analysis"

[Detailed discussion of the legal issue with context]

## [Legal Basis/Provisions Header]
Polish: "Podstawa prawna" | English: "Legal Framework" / "Statutory Provisions"

[Citation and analysis of relevant statutes/regulations with [1], [2] references]

## [Case Law/Judicial Decisions Header]
Polish: "Orzecznictwo" | English: "Case Law" / "Judicial Decisions"

[Analysis of judicial decisions with commentary on legal reasoning]

For criminal law: Include sentencing patterns, judicial decision-making analysis, meta-annotation insights

## [Domain-Specific Section]
Tax Law (Polish): "Interpretacje administracyjne" | (English): "Administrative Interpretations"
Criminal Law (Polish): "Analiza orzecznicza" | (English): "Judicial Reasoning Analysis"

[Domain-appropriate analysis:]
- Tax: Administrative interpretations, tax authority guidance
- Criminal: Meta-annotation insights, sentencing factors, cross-jurisdictional comparisons

## [Conclusions Header]
Polish: "Wnioski" | English: "Conclusions"

- **[Main conclusion 1]**
- **[Main conclusion 2]**
- **[Main conclusion 3]**

### [Practical Recommendations Header]
Polish: "Rekomendacje praktyczne" | English: "Practical Guidance"
Criminal Law English alternative: "Practical Implications"

[Domain-appropriate practical guidance:]
- Tax Law: Compliance steps, documentation requirements, tax planning considerations
- Criminal Law: Implications for sentencing, procedural considerations, empirical patterns

DOMAIN-SPECIFIC EXPANSIONS:
For Criminal Law cases, consider adding:
- Sentencing factors and guidelines applied
- Aggravating/mitigating circumstances
- Cross-jurisdictional comparisons (if applicable)
- Meta-analytical insights (judicial patterns, decision-making factors)
- Empirical observations about judicial practices

CONSTRAINTS:
- Total length: 400-800 words
- Cite all relevant documents
- Show complete legal reasoning chain
- Include practical implications
- Match user's question language exactly (Polish or English)
- Adapt section headers to domain and language context

</output_formats>

IMPORTANT: Set "format_used" field to either "short" or "detailed" based on your selection.

Return only valid JSON matching the schema above."""

# Keep legacy format instructions for backward compatibility
SHORT_FORMAT_INSTRUCTIONS = """<output_format type="short">

Provide a concise response optimized for quick understanding:

REQUIRED JSON SCHEMA:
{{
    "text": "string (markdown formatted)",
    "document_ids": ["string array of document IDs cited"]
}}

REQUIRED MARKDOWN STRUCTURE in "text" field (adapt headers to user's language):

## [Response Header]
Polish: "Odpowiedź" | English: "Response"

[Direct answer to the question in 2-3 sentences]

### [Legal Basis Header]
Polish: "Podstawa prawna" | English: "Legal Basis"
For criminal law in English, consider: "Relevant Law" or "Applicable Provisions"

[Key legal provisions and citations [1], [2]]

### [Summary Header]
Polish: "Podsumowanie" | English: "Summary"

- **[Key point 1]**
- **[Key point 2]**
- **[Key point 3]**

DOMAIN-SPECIFIC ADAPTATIONS:
- Tax Law: Focus on fiscal provisions, tax rates, compliance obligations
- Criminal Law: Highlight sentencing factors, judicial reasoning, procedural aspects

CONSTRAINTS:
- Total length: 150-300 words
- Maximum 3 citations
- Focus on actionable conclusions
- Match user's question language exactly (Polish or English)

</output_format>

Return only valid JSON matching the schema above."""

DETAILED_FORMAT_INSTRUCTIONS = """<output_format type="detailed">

Provide comprehensive legal analysis with full reasoning:

REQUIRED JSON SCHEMA:
{{
    "text": "string (markdown formatted)",
    "document_ids": ["string array of document IDs cited"]
}}

REQUIRED MARKDOWN STRUCTURE in "text" field (adapt headers to user's language and domain):

# [Legal Analysis Header]
Polish: "Analiza prawna" | English: "Legal Analysis"

[Detailed discussion of the legal issue with context]

## [Legal Basis/Provisions Header]
Polish: "Podstawa prawna" | English: "Legal Framework" / "Statutory Provisions"

[Citation and analysis of relevant statutes/regulations with [1], [2] references]

## [Case Law/Judicial Decisions Header]
Polish: "Orzecznictwo" | English: "Case Law" / "Judicial Decisions"

[Analysis of judicial decisions with commentary on legal reasoning]

For criminal law: Include sentencing patterns, judicial decision-making analysis, meta-annotation insights

## [Domain-Specific Section]
Tax Law (Polish): "Interpretacje administracyjne" | (English): "Administrative Interpretations"
Criminal Law (Polish): "Analiza orzecznicza" | (English): "Judicial Reasoning Analysis"

[Domain-appropriate analysis:]
- Tax: Administrative interpretations, tax authority guidance
- Criminal: Meta-annotation insights, sentencing factors, cross-jurisdictional comparisons

## [Conclusions Header]
Polish: "Wnioski" | English: "Conclusions"

- **[Main conclusion 1]**
- **[Main conclusion 2]**
- **[Main conclusion 3]**

### [Practical Recommendations Header]
Polish: "Rekomendacje praktyczne" | English: "Practical Guidance"
Criminal Law English alternative: "Practical Implications"

[Domain-appropriate practical guidance:]
- Tax Law: Compliance steps, documentation requirements, tax planning considerations
- Criminal Law: Implications for sentencing, procedural considerations, empirical patterns

DOMAIN-SPECIFIC EXPANSIONS:
For Criminal Law cases, consider adding:
- Sentencing factors and guidelines applied
- Aggravating/mitigating circumstances
- Cross-jurisdictional comparisons (if applicable)
- Meta-analytical insights (judicial patterns, decision-making factors)
- Empirical observations about judicial practices

CONSTRAINTS:
- Total length: 400-800 words
- Cite all relevant documents
- Show complete legal reasoning chain
- Include practical implications
- Match user's question language exactly (Polish or English)
- Adapt section headers to domain and language context

</output_format>

Return only valid JSON matching the schema above."""

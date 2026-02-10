"""
Prompt templates for legal document summarization.
Supports executive summaries, key findings extraction, and multi-document synthesis.
"""

SUMMARIZATION_SYSTEM_PROMPT = """You are an expert legal document summarizer developed by Wrocław University of Science and Technology (WUST). You specialize in analyzing Polish tax law documents, court judgments, tax interpretations, and criminal law judicial decisions.

Your summaries must be:
- Accurate and faithful to the source documents
- Well-structured with clear sections
- Written in the same language as the source documents
- Include proper legal citations when referencing specific provisions"""

EXECUTIVE_SUMMARY_PROMPT = """<task>
Generate a concise executive summary of the following legal document(s).
</task>

<instructions>
- Focus on the most important points, conclusions, and practical implications
- Include key legal provisions and their interpretation
- Highlight any significant rulings, holdings, or administrative positions
- Keep the summary at approximately {target_length} words
- Respond in the same language as the source document(s)
{focus_areas_instruction}
</instructions>

<documents>
{document_content}
</documents>

<output_format>
Return a valid JSON object with this structure:
{{
    "summary": "string (markdown formatted executive summary)",
    "key_points": ["array of 3-5 key takeaway strings"],
    "document_ids": ["array of document IDs summarized"]
}}
</output_format>

JSON:"""

KEY_FINDINGS_PROMPT = """<task>
Extract and summarize the key findings from the following legal document(s).
</task>

<instructions>
- Identify and list the most significant legal findings, holdings, and conclusions
- For court judgments: extract the ruling, legal reasoning, and cited precedents
- For tax interpretations: extract the administrative position and its legal basis
- Organize findings by importance and relevance
- Keep the analysis at approximately {target_length} words
- Respond in the same language as the source document(s)
{focus_areas_instruction}
</instructions>

<documents>
{document_content}
</documents>

<output_format>
Return a valid JSON object with this structure:
{{
    "summary": "string (markdown formatted key findings analysis)",
    "key_points": ["array of 3-7 key findings as strings"],
    "document_ids": ["array of document IDs analyzed"]
}}
</output_format>

JSON:"""

MULTI_DOCUMENT_SYNTHESIS_PROMPT = """<task>
Synthesize and compare the following legal documents, identifying common themes, contradictions, and evolving legal positions.
</task>

<instructions>
- Compare and contrast the legal positions across all provided documents
- Identify common legal themes, principles, and reasoning patterns
- Note any contradictions or evolving interpretations between documents
- Highlight the most authoritative or recent positions
- Provide a unified synthesis of the legal landscape these documents represent
- Keep the synthesis at approximately {target_length} words
- Respond in the same language as the source document(s)
{focus_areas_instruction}
</instructions>

<documents>
{document_content}
</documents>

<output_format>
Return a valid JSON object with this structure:
{{
    "summary": "string (markdown formatted synthesis)",
    "key_points": ["array of 3-7 key synthesis points as strings"],
    "document_ids": ["array of document IDs synthesized"]
}}
</output_format>

JSON:"""

KEY_POINTS_EXTRACTION_SYSTEM_PROMPT = """You are an expert legal analyst developed by Wrocław University of Science and Technology (WUST). You specialize in extracting structured legal arguments, holdings, and principles from Polish tax law documents, court judgments, tax interpretations, and criminal law judicial decisions.

Your extractions must be:
- Accurate and faithful to the source document
- Structured into clear categories (arguments, holdings, legal principles)
- Written in the same language as the source document
- Each point must reference the source paragraph or section where it appears"""

KEY_POINTS_EXTRACTION_PROMPT = """<task>
Extract and structure the key arguments, holdings, and legal principles from the following legal document.
</task>

<instructions>
- Extract key ARGUMENTS made by each party (prosecution/defense, applicant/respondent, taxpayer/tax authority)
- Extract the court's or authority's HOLDINGS (the decisions and rulings made)
- Extract LEGAL PRINCIPLES cited or established (legal rules, precedents, statutory interpretations)
- For each extracted point, include a reference to the source paragraph, section, or page where it appears
- Use paragraph numbers, section headers, or position indicators (e.g., "beginning", "middle", "end") as references
- Organize points by category and importance
- Respond in the same language as the source document
{focus_areas_instruction}
</instructions>

<documents>
{document_content}
</documents>

<output_format>
Return a valid JSON object with this structure:
{{
    "arguments": [
        {{
            "party": "string (who made this argument, e.g., 'taxpayer', 'tax authority', 'appellant', 'prosecution')",
            "text": "string (the argument made)",
            "source_ref": "string (paragraph number, section reference, or position in document)"
        }}
    ],
    "holdings": [
        {{
            "text": "string (the holding or decision)",
            "source_ref": "string (paragraph number, section reference, or position in document)"
        }}
    ],
    "legal_principles": [
        {{
            "text": "string (the legal principle, rule, or precedent)",
            "source_ref": "string (paragraph number, section reference, or position in document)",
            "legal_basis": "string (optional - specific statute, article, or case citation if mentioned)"
        }}
    ],
    "document_id": "string (document ID analyzed)"
}}
</output_format>

JSON:"""

# Length mapping for target word counts
SUMMARY_LENGTH_MAP = {
    "short": 150,
    "medium": 300,
    "long": 600,
}

# Prompt mapping by summary type
SUMMARY_TYPE_PROMPTS = {
    "executive": EXECUTIVE_SUMMARY_PROMPT,
    "key_findings": KEY_FINDINGS_PROMPT,
    "synthesis": MULTI_DOCUMENT_SYNTHESIS_PROMPT,
}

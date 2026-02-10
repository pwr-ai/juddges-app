"""
Legal-specific prompt components for Polish tax law assistant.
"""

from ai_tax_search.prompts.legal.system import LEGAL_SYSTEM_PROMPT
from ai_tax_search.prompts.legal.instructions import (
    LEGAL_INSTRUCTION_PROMPT,
    SHORT_FORMAT_INSTRUCTIONS,
    DETAILED_FORMAT_INSTRUCTIONS,
    ADAPTIVE_FORMAT_INSTRUCTIONS,
)
from ai_tax_search.prompts.legal.examples import (
    SHORT_RESPONSE_EXAMPLE,
    DETAILED_RESPONSE_EXAMPLE,
)

__all__ = [
    "LEGAL_SYSTEM_PROMPT",
    "LEGAL_INSTRUCTION_PROMPT",
    "SHORT_FORMAT_INSTRUCTIONS",
    "DETAILED_FORMAT_INSTRUCTIONS",
    "ADAPTIVE_FORMAT_INSTRUCTIONS",
    "SHORT_RESPONSE_EXAMPLE",
    "DETAILED_RESPONSE_EXAMPLE",
]

"""
Legal-specific prompt components for Polish tax law assistant.
"""

from juddges_search.prompts.legal.examples import (
    DETAILED_RESPONSE_EXAMPLE,
    SHORT_RESPONSE_EXAMPLE,
)
from juddges_search.prompts.legal.instructions import (
    ADAPTIVE_FORMAT_INSTRUCTIONS,
    DETAILED_FORMAT_INSTRUCTIONS,
    LEGAL_INSTRUCTION_PROMPT,
    SHORT_FORMAT_INSTRUCTIONS,
)
from juddges_search.prompts.legal.system import LEGAL_SYSTEM_PROMPT

__all__ = [
    "ADAPTIVE_FORMAT_INSTRUCTIONS",
    "DETAILED_FORMAT_INSTRUCTIONS",
    "DETAILED_RESPONSE_EXAMPLE",
    "LEGAL_INSTRUCTION_PROMPT",
    "LEGAL_SYSTEM_PROMPT",
    "SHORT_FORMAT_INSTRUCTIONS",
    "SHORT_RESPONSE_EXAMPLE",
]

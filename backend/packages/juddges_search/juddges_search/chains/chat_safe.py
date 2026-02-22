"""
Safe wrapper for chat chain with comprehensive error handling.

Import this module instead of chat.py to get the error-handled version:
    from juddges_search.chains.chat_safe import chat_chain
"""

from juddges_search.chains.chat import chat_chain as _base_chat_chain
from juddges_search.chains.safe_wrappers import create_safe_chain_wrapper, create_chat_fallback_response

# Export error-handled version of chat chain
chat_chain = create_safe_chain_wrapper(
    chain=_base_chat_chain,
    chain_name="legal_chat_chain",
    fallback_response=create_chat_fallback_response(),
    max_retries=3,
    base_delay=2.0,
)

__all__ = ["chat_chain"]

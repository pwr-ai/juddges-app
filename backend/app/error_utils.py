"""
Shared error detection utilities for Weaviate and gRPC exceptions.

This module provides robust, type-safe exception detection using isinstance() checks only.
No string matching or type name checking is performed to ensure 100% reliability.
"""

from typing import Final

# Try to import Weaviate and gRPC exceptions for robust error detection
# These are optional dependencies, so we handle ImportError gracefully
# We use isinstance() checks ONLY - no string matching fallback
# If imports fail, these errors will be handled as generic exceptions
try:
    import grpc
    GRPC_AVAILABLE: Final[bool] = True
    GRPC_EXCEPTIONS: Final[tuple] = (grpc.RpcError,)
except ImportError:
    GRPC_AVAILABLE: Final[bool] = False
    GRPC_EXCEPTIONS: Final[tuple] = ()

try:
    from weaviate.exceptions import WeaviateBaseError
    WEAVIATE_AVAILABLE: Final[bool] = True
    WEAVIATE_EXCEPTIONS: Final[tuple] = (WeaviateBaseError,)
except ImportError:
    WEAVIATE_AVAILABLE: Final[bool] = False
    WEAVIATE_EXCEPTIONS: Final[tuple] = ()


def is_weaviate_or_grpc_error(error: Exception) -> bool:
    """
    Check if an exception is related to Weaviate/gRPC connection issues.
    
    This function uses ONLY isinstance() checks for 100% reliable error detection.
    No string matching or type name checking is performed to avoid false positives.
    
    If the exception types cannot be imported, the function returns False and
    the error will be handled as a generic exception. This is safer than guessing
    based on string patterns.
    
    Checks for:
    - Weaviate exceptions (weaviate.exceptions.WeaviateBaseError and subclasses)
    - gRPC exceptions (grpc.RpcError and subclasses)
    
    Args:
        error: The exception to check
        
    Returns:
        True if the error is definitively a Weaviate/gRPC connection issue, False otherwise
    """
    # Only use isinstance checks - no string matching fallback
    if WEAVIATE_AVAILABLE and WEAVIATE_EXCEPTIONS:
        if isinstance(error, WEAVIATE_EXCEPTIONS):
            return True
    
    if GRPC_AVAILABLE and GRPC_EXCEPTIONS:
        if isinstance(error, GRPC_EXCEPTIONS):
            return True
    
    # If we can't determine the type definitively, return False
    return False


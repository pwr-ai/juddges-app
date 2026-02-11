import os
from loguru import logger

callbacks = []

# Langfuse environment variables
LANGFUSE_PUBLIC_KEY = os.getenv("LANGFUSE_PUBLIC_KEY", None)
LANGFUSE_SECRET_KEY = os.getenv("LANGFUSE_SECRET_KEY", None)
LANGFUSE_HOST = os.getenv("LANGFUSE_HOST", None)

langfuse_handler = None


# Try to import and setup Langfuse
try:
    if not LANGFUSE_PUBLIC_KEY or not LANGFUSE_SECRET_KEY:
        logger.warning("Langfuse credentials not found. Skipping Langfuse setup.")
    else:
        # Initialize Langfuse client with credentials
        from langfuse.langchain import CallbackHandler

        logger.info("Langfuse credentials found. Setting up Langfuse LangChain handler.")

        # Create the callback handler - it will read from environment variables
        # LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST
        langfuse_handler = CallbackHandler()
        callbacks.append(langfuse_handler)
        logger.info(f"Langfuse handler configured for host: {LANGFUSE_HOST}")

except ImportError as e:
    logger.warning(f"Langfuse not available: {e}. Skipping Langfuse setup.")
except Exception as e:
    logger.error(f"Error setting up Langfuse: {e}. Skipping Langfuse setup.")

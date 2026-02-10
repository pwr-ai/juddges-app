import asyncio
from functools import wraps

from loguru import logger


def log_and_pass(obj):
    logger.debug(f"Obj: {obj}")
    return obj


def sync_wrapper(func):
    """Decorator to run async function synchronously."""

    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            logger.warning("Calling sync function from async context")
            return loop.run_until_complete(func(*args, **kwargs))
        else:
            logger.debug("Creating new event loop")
            return asyncio.run(func(*args, **kwargs))

    return wrapper

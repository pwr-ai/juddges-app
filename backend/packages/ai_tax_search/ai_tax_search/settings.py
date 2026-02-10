from pathlib import Path

from dotenv import load_dotenv
from loguru import logger

MAX_CHAT_TOKENS_COMPLETION = 1024
MAX_CHAT_LAST_MESSAGES = 10

MAX_DOCUMENTS_PER_SEARCH = 10
DEFAULT_MAX_RESULTS = 20


ROOT_PATH = Path(__file__).absolute().parent.parent.parent.parent


def load_env_variables():
    logger.info(f"Loading environment variables from {ROOT_PATH / '.env'} file")
    return load_dotenv(ROOT_PATH / ".env", override=True)

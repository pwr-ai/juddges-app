from functools import lru_cache
from loguru import logger


class VectorName:
    """Available vector names for semantic search.

    These vector names are used to specify which vector embedding to use for semantic search:
    - BASE: Default vector for general search
    - DEV: Vector for development/testing
    - FAST: Optimized vector for speed over accuracy
    """

    BASE = "base"
    DEV = "dev"
    FAST = "fast"


EMBEDDING_MODEL = "sdadas/mmlw-roberta-large"


@lru_cache(maxsize=None)
def get_embedding_model():
    from sentence_transformers import SentenceTransformer

    logger.info(f"Loading embedding model: {EMBEDDING_MODEL}")
    return SentenceTransformer(EMBEDDING_MODEL)


def embed_texts(docs: str | list[str]) -> list[float] | list[list[float]]:
    """
    Embeds text documents using HF models.

    Args:
        docs: Either a single text string or list of text strings to embed

    Returns:
        If single text: Single embedding vector (list of floats)
        If list of texts: List of embedding vectors (list of floats) for each input text
    """
    model = get_embedding_model()

    if isinstance(docs, str):
        logger.info(f"Embedding single text using {EMBEDDING_MODEL}")
        return model.encode(docs).tolist()

    logger.info(f"Embedding {len(docs)} texts using {EMBEDDING_MODEL}")
    return [model.encode(doc).tolist() for doc in docs]

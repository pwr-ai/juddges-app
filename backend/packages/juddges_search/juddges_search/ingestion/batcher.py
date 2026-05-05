"""Batch-iteration helpers for ingestion pipelines."""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from typing import TypeVar

T = TypeVar("T")


def batched(items: Iterable[T], *, size: int) -> Iterator[list[T]]:
    """Yield successive lists of length `size` from `items`.

    The final batch may be shorter than `size` if `items` is not a multiple.
    """
    if size <= 0:
        raise ValueError("size must be positive")
    chunk: list[T] = []
    for item in items:
        chunk.append(item)
        if len(chunk) == size:
            yield chunk
            chunk = []
    if chunk:
        yield chunk

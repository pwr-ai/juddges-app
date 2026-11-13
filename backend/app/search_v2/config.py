"""Env configuration for the Weaviate v2 test search engine."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Mapping

DEFAULT_HTTP_PORT = 8080
DEFAULT_GRPC_PORT = 50051


@dataclass(frozen=True)
class WeaviateV2Settings:
    http_host: str
    http_port: int
    grpc_port: int
    api_key: str | None
    tei_url: str
    # Short on purpose: a stuck v2 stack must not hold request workers.
    init_timeout_s: float = 5.0
    query_timeout_s: float = 10.0
    tei_timeout_s: float = 10.0


def load_settings(env: Mapping[str, str] | None = None) -> WeaviateV2Settings | None:
    """Settings from ``WEAVIATE_V2_*``, or ``None`` when host or TEI URL is unset.

    Read on every request, so the engine can be switched on or off by env alone.
    """
    env = os.environ if env is None else env
    host = (env.get("WEAVIATE_V2_HTTP_HOST") or "").strip()
    tei_url = (env.get("WEAVIATE_V2_TEI_URL") or "").strip()
    if not host or not tei_url:
        return None
    return WeaviateV2Settings(
        http_host=host,
        http_port=int(env.get("WEAVIATE_V2_HTTP_PORT") or DEFAULT_HTTP_PORT),
        grpc_port=int(env.get("WEAVIATE_V2_GRPC_PORT") or DEFAULT_GRPC_PORT),
        api_key=(env.get("WEAVIATE_V2_API_KEY") or "").strip() or None,
        tei_url=tei_url.rstrip("/"),
    )

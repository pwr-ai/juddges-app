"""Which fields can be compared side by side, and in what order.

Comparable = a closed value set: `enum` on the property, `enum` on array items,
or `boolean`. Free-text arrays (keywords, convict_offences) are excluded on
purpose — they are high-cardinality and PL-only in practice (APP_STATUS §4).
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal

from juddges_search.info_extraction import BaseSchemaExtractor

FieldKind = Literal["enum", "enum_array", "boolean"]

DEFAULT_FIRST: tuple[str, ...] = (
    "appeal_outcome",
    "offender_gender",
    "sentence_serve",
    "plea_point",
)


@dataclass(frozen=True)
class FieldSpec:
    field: str
    label: str
    kind: FieldKind
    source: str = "base"
    order: int = 999


def _kind_of(prop: dict[str, Any]) -> FieldKind | None:
    if prop.get("type") == "boolean":
        return "boolean"
    if "enum" in prop:
        return "enum"
    if (
        prop.get("type") == "array"
        and isinstance(prop.get("items"), dict)
        and "enum" in prop["items"]
    ):
        return "enum_array"
    return None


def comparable_fields_from_schema(
    schema: dict[str, Any], source: str
) -> list[FieldSpec]:
    specs: list[FieldSpec] = []
    for name, prop in (schema.get("properties") or {}).items():
        kind = _kind_of(prop)
        if kind is None:
            continue
        specs.append(
            FieldSpec(
                field=name,
                label=prop.get("x-ui-label") or prop.get("title") or name,
                kind=kind,
                source=source,
                order=int(prop.get("x-ui-order", 999)),
            )
        )
    specs.sort(key=lambda s: (s.order, s.field))
    return specs


@lru_cache(maxsize=1)
def _base_fields_tuple() -> tuple[FieldSpec, ...]:
    specs = comparable_fields_from_schema(BaseSchemaExtractor().schema, source="base")
    first = [s for name in DEFAULT_FIRST for s in specs if s.field == name]
    rest = [s for s in specs if s.field not in DEFAULT_FIRST]
    return tuple(first + rest)


def base_compare_fields() -> list[FieldSpec]:
    return list(_base_fields_tuple())


def select_base_fields(requested: list[str] | None) -> list[FieldSpec]:
    """Resolve requested field names against the base registry, keeping request order.

    Repeated names collapse to their first occurrence: callers pay one RPC per
    returned spec, so duplicates would only multiply identical queries.
    """
    if not requested:
        return base_compare_fields()
    by_name = {s.field: s for s in base_compare_fields()}
    wanted = list(dict.fromkeys(requested))
    unknown = [f for f in wanted if f not in by_name]
    if unknown:
        raise ValueError(f"Not comparable base fields: {', '.join(unknown)}")
    return [by_name[f] for f in wanted]

# Schema generation (`/schema-chat`)

The Schema Studio chat calls `POST /api/schema-generator/simple`, which runs a
single LLM call in `juddges_search/chains/schema_generation.py` and returns an
OpenAI-compatible JSON Schema. The schema is later used by the information
extractor on Polish and UK judgments, and the extracted values are aggregated,
filtered and compared across judgments. That use drives the design rules below.

## Field design rules

- **Many, aggregatable fields.** A broad request should yield roughly 15-40
  fields; when extending a schema, several new fields per requested concept.
- **Preferred types:** boolean, enum, array of enums, number/integer, date
  (`"format": "date"`). Free text is avoided.
- **Decompose, do not describe.** One free-text topic becomes several
  categorical fields (e.g. `penalty_imposed`, `penalty_type`,
  `penalty_amount_pln`, `penalty_suspended`, `penalty_duration_months`).
  Free text stays only for names/identifiers, with categorical companions.
- **Enums** use domain-specific values for Polish/UK case law, plus `other` and
  `not_stated`/`unclear` where the judgment may be silent.
- **Descriptions are extractor instructions:** what to look for and what to
  return when the judgment does not say.
- **Base metadata is not duplicated** (court, date, case number, judges, ...;
  see `BASE_METADATA_FIELDS` and [JUDGMENT_FIELDS](../reference/JUDGMENT_FIELDS.md)).

## Missing values

OpenAI strict structured output requires every property to be `required`, and
the schema validator (`validate_openai_schema`), the visual editor and the
aggregation code read `type` as a single string. A nullable union such as
`["boolean", "null"]` crashes the validator (`TypeError: unhashable type`), so
it is not used (a collapse step in `validate_and_fix_schema` rewrites one if the
model emits it anyway). "Not stated" is instead expressed by:

- enums with a `not_stated` value (a `yes`/`no`/`not_stated` enum instead of a
  boolean when the judgment often does not say);
- a companion boolean (`<field>_stated`) next to numbers and dates that may be
  absent, so consumers can ignore the value when it is false.

## Output handling

The LLM runs in JSON mode (`response_format={"type": "json_object"}`, not strict
`json_schema`, because the output is itself an arbitrary JSON Schema). The
parser keeps a lenient fallback. Code, not the prompt, sets the
`x-ai-generated` marker on new fields.

## Merging with existing fields

The frontend sends each existing field as its full property definition (plus the
legacy `field_name`/`field_type`/`description` keys). The backend copies it
unchanged (minus the wrapper keys), so `enum`, `items`, `format` and nested
`properties` survive repeated chat turns; existing fields never get
`x-ai-generated`.

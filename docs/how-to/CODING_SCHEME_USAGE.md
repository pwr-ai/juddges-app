# Coding Scheme Usage Guide

## Overview

The updated judgments schema supports a comprehensive legal coding scheme with:
- ✅ Explicit `language` and `country` columns
- ✅ Flexible JSONB fields for detailed coding data
- ✅ Type-safe Python (Pydantic) and TypeScript models
- ✅ Efficient indexing for both structured and JSONB queries

## Files Created

1. **Database Schema**: `supabase/schema_updated.sql`
2. **Python Models**: `backend/app/models/judgment_models.py`
3. **TypeScript Types**: `frontend/types/judgment.ts`

## Schema Structure

### Core Columns (for fast filtering)
- `id`, `case_number`, `jurisdiction`
- **NEW**: `language` (e.g., 'pl', 'en', 'uk')
- **NEW**: `country` (e.g., 'PL', 'UK', 'Poland')
- `court_name`, `court_level`, `decision_date`
- `title`, `summary`, `full_text`
- `case_type`, `decision_type`, `outcome`
- `keywords[]`, `legal_topics[]`, `cited_legislation[]`
- `embedding` (vector for semantic search)

### JSONB Fields (for coding scheme flexibility)

#### 1. `court_hearing_data` (Section 2)
Stores court hearing information:
```json
{
  "neutral_citation_number": "[2023] EWCA Crim 123",
  "appeal_date": "2023-06-15",
  "appeal_judges": ["Lord Justice Smith", "Mr Justice Jones"],
  "case_name": "Regina v. John Smith",
  "offender_representative": "Mr. Brown",
  "crown_representative": "Ms. White"
}
```

#### 2. `offence_trial_data` (Section 3)
Stores offence, trial, and sentence details:
```json
{
  "conviction_courts": ["Crown Court"],
  "conviction_dates": ["2022-03-15"],
  "convicted_offences": ["Theft", "Assault"],
  "acquitted_offences": ["Robbery"],
  "plea": {
    "confessed": true,
    "plea_point": "first_court_appearance"
  },
  "remand_decision": "remanded_custody",
  "remand_custody_duration": "6 months",
  "sentence_court": "Crown Court",
  "sentences": ["3 years imprisonment"],
  "sentence_serve_type": "concurrent",
  "ancillary_orders": ["Restraining order", "Compensation order"],
  "offender": {
    "gender": "male",
    "age_at_offence": 25,
    "employment_status": "unemployed",
    "accommodation_status": "fixed_address",
    "intoxicated": "yes_drinking",
    "victim_relationship": "stranger"
  },
  "victim": {
    "victim_type": "individual",
    "count": 1,
    "gender": "female",
    "age_at_offence": 30
  },
  "prosecution_evidence": ["CCTV", "victim_testimony", "DNA_match"],
  "defence_evidence": ["alibi", "good_character"],
  "pre_sentence_report": "medium",
  "aggravating_factors": [
    "offence_committed_on_bail",
    "previous_convictions",
    "planning"
  ],
  "mitigating_factors": [
    "genuine_remorse",
    "good_character",
    "early_guilty_plea"
  ],
  "victim_impact_statement": true
}
```

#### 3. `appeal_data` (Section 4)
Stores appeal information:
```json
{
  "appellant": "offender",
  "co_defendants": {
    "present": true,
    "count": 2
  },
  "appeal_against": "conviction_unsafe",
  "appeal_grounds": [
    "trial_judge_summing_up",
    "evidence_admissibility",
    "jury_direction_inadequate"
  ],
  "sentencing_guidelines": ["Theft Act 1968"],
  "appeal_outcome": "dismissed",
  "reasons": {
    "dismissed": [
      "Trial judge considered all relevant facts",
      "No merit in appeal",
      "Jury properly directed"
    ]
  }
}
```

## Usage Examples

### Python (Backend)

```python
from app.models.judgment_models import (
    Judgment,
    JudgmentCreateRequest,
    CourtHearingData,
    AppealData,
    OffenceTrialData
)

# Create a new judgment with coding scheme data
new_judgment = JudgmentCreateRequest(
    case_number="2023/EWCA/Crim/123",
    jurisdiction="UK",
    language="en",
    country="UK",
    court_name="Court of Appeal (Criminal Division)",
    court_level="Appeal Court",
    decision_date=date(2023, 6, 15),
    title="Regina v. John Smith",
    summary="Appeal against conviction dismissed",
    full_text="Full judgment text here...",
    case_type="Criminal",
    outcome="Dismissed",

    # Section 2: Court hearing data
    court_hearing_data=CourtHearingData(
        neutral_citation_number="[2023] EWCA Crim 123",
        appeal_judges=["Lord Justice Smith", "Mr Justice Jones"],
        case_name="Regina v. John Smith"
    ),

    # Section 4: Appeal data
    appeal_data=AppealData(
        appellant="offender",
        appeal_against="conviction_unsafe",
        appeal_grounds=["trial_judge_summing_up"],
        appeal_outcome="dismissed",
        reasons={
            "dismissed": ["No merit in appeal"]
        }
    )
)

# Insert into database
supabase.table('judgments').insert(new_judgment.model_dump()).execute()
```

### TypeScript (Frontend)

```typescript
import type {
  Judgment,
  JudgmentCreateRequest,
  AppealData,
  CourtHearingData
} from '@/types/judgment';

// Create a new judgment
const newJudgment: JudgmentCreateRequest = {
  case_number: "2023/EWCA/Crim/123",
  jurisdiction: "UK",
  language: "en",
  country: "UK",
  court_name: "Court of Appeal (Criminal Division)",
  full_text: "Full judgment text...",

  // Section 2: Court hearing data
  court_hearing_data: {
    neutral_citation_number: "[2023] EWCA Crim 123",
    appeal_judges: ["Lord Justice Smith", "Mr Justice Jones"],
    case_name: "Regina v. John Smith"
  },

  // Section 4: Appeal data
  appeal_data: {
    appellant: "offender",
    appeal_against: "conviction_unsafe",
    appeal_outcome: "dismissed"
  }
};

// Insert into database
const { data, error } = await supabase
  .from('judgments')
  .insert(newJudgment);
```

## Querying JSONB Fields

### SQL Examples

```sql
-- Query by appeal outcome
SELECT id, case_number, title, appeal_data->>'appeal_outcome' as outcome
FROM judgments
WHERE appeal_data->>'appeal_outcome' = 'dismissed';

-- Query by offender age
SELECT id, case_number, title
FROM judgments
WHERE (offence_trial_data->'offender'->>'age_at_offence')::int < 25;

-- Query by evidence type
SELECT id, case_number, title
FROM judgments
WHERE offence_trial_data->'prosecution_evidence' @> '["CCTV"]'::jsonb;

-- Query by aggravating factors
SELECT id, case_number, title,
       jsonb_array_elements_text(offence_trial_data->'aggravating_factors') as factor
FROM judgments
WHERE offence_trial_data->'aggravating_factors' @> '["planning"]'::jsonb;

-- Query by neutral citation
SELECT id, case_number, title
FROM judgments
WHERE court_hearing_data->>'neutral_citation_number' = '[2023] EWCA Crim 123';
```

### Python with Supabase

```python
# Query by language
response = supabase.table('judgments')\
    .select('*')\
    .eq('language', 'pl')\
    .execute()

# Query by appeal outcome (JSONB field)
response = supabase.table('judgments')\
    .select('id, case_number, title, appeal_data')\
    .filter('appeal_data->>appeal_outcome', 'eq', 'dismissed')\
    .execute()

# Query by offender intoxication
response = supabase.table('judgments')\
    .select('*')\
    .filter('offence_trial_data->offender->>intoxicated', 'like', 'yes_%')\
    .execute()
```

### TypeScript with Supabase

```typescript
// Query by language
const { data } = await supabase
  .from('judgments')
  .select('*')
  .eq('language', 'en');

// Query by appeal outcome (JSONB field)
const { data } = await supabase
  .from('judgments')
  .select('id, case_number, title, appeal_data')
  .filter('appeal_data->appeal_outcome', 'eq', 'dismissed');

// Complex JSONB query
const { data } = await supabase
  .from('judgments')
  .select('*')
  .filter('offence_trial_data->offender->age_at_offence', 'lt', 25);
```

## Updating Existing Judgments

### Adding Coding Scheme Data to Existing Judgment

```python
# Python
judgment_id = "123e4567-e89b-12d3-a456-426614174000"

update_data = {
    "language": "en",
    "country": "UK",
    "appeal_data": {
        "appellant": "offender",
        "appeal_against": "sentence_excessive",
        "appeal_outcome": "allowed_sentence_more_lenient",
        "reasons": {
            "sentence_excessive": [
                "Strong personal mitigation",
                "Realistic prospect of rehabilitation"
            ]
        }
    }
}

supabase.table('judgments').update(update_data).eq('id', judgment_id).execute()
```

```typescript
// TypeScript
const judgmentId = "123e4567-e89b-12d3-a456-426614174000";

const updateData: JudgmentUpdateRequest = {
  language: "en",
  country: "UK",
  appeal_data: {
    appellant: "offender",
    appeal_against: "sentence_excessive",
    appeal_outcome: "allowed_sentence_more_lenient"
  }
};

await supabase
  .from('judgments')
  .update(updateData)
  .eq('id', judgmentId);
```

## Batch Updates

### Migrating Existing Data to Add Language Field

```sql
-- Set language based on jurisdiction
UPDATE judgments
SET language = CASE
    WHEN jurisdiction = 'PL' THEN 'pl'
    WHEN jurisdiction = 'UK' THEN 'en'
    ELSE NULL
END
WHERE language IS NULL;

-- Set country from jurisdiction
UPDATE judgments
SET country = jurisdiction
WHERE country IS NULL;
```

## Performance Considerations

### Indexed Queries (Fast ⚡)
```sql
-- These use B-tree/GIN indexes
WHERE language = 'pl'                          -- Uses idx_judgments_language
WHERE country = 'UK'                           -- Uses idx_judgments_country
WHERE case_type = 'Criminal'                   -- Uses idx_judgments_case_type
WHERE language = 'pl' AND decision_date > '2023-01-01'  -- Uses idx_judgments_language_date
```

### JSONB Queries (Also Fast with GIN index)
```sql
-- These use GIN indexes on JSONB
WHERE appeal_data->>'appeal_outcome' = 'dismissed'  -- Uses idx_judgments_appeal_data
WHERE offence_trial_data @> '{"plea": {"confessed": true}}'::jsonb
```

### Sequential Scans (Slower, avoid for large tables)
```sql
-- These require sequential scans
WHERE (offence_trial_data->'offender'->>'age_at_offence')::int < 25
-- Better: Create a computed column or index for frequently queried paths
```

## Adding New Coding Fields

You can add new fields to JSONB without schema changes:

```python
# Add a new field to appeal_data
update_data = {
    "appeal_data": {
        **existing_appeal_data,  # Keep existing data
        "new_field": "new_value"  # Add new field
    }
}
```

## Migration from Old to New Schema

If you have existing data in the old schema:

```sql
-- Add new columns to existing table
ALTER TABLE public.judgments
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS court_hearing_data JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS offence_trial_data JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS appeal_data JSONB DEFAULT '{}'::jsonb;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_judgments_language ON public.judgments(language) WHERE language IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_judgments_country ON public.judgments(country) WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_judgments_court_hearing_data ON public.judgments USING gin(court_hearing_data);
CREATE INDEX IF NOT EXISTS idx_judgments_offence_trial_data ON public.judgments USING gin(offence_trial_data);
CREATE INDEX IF NOT EXISTS idx_judgments_appeal_data ON public.judgments USING gin(appeal_data);

-- Populate language from jurisdiction
UPDATE judgments
SET language = CASE
    WHEN jurisdiction = 'PL' THEN 'pl'
    WHEN jurisdiction = 'UK' THEN 'en'
    ELSE NULL
END
WHERE language IS NULL;

-- Populate country
UPDATE judgments SET country = jurisdiction WHERE country IS NULL;
```

## Validation Rules

When populating coding scheme data, use:
- `99` for "not stated and cannot be inferred" (numeric fields)
- `"dont_know"` for "Don't know" (text fields)
- `null` for missing/optional fields

## Example: Complete Judgment with Coding Scheme

```python
from app.models.judgment_models import (
    JudgmentCreateRequest,
    CourtHearingData,
    OffenceTrialData,
    AppealData,
    OffenderInformation,
    VictimInformation,
    PleaInformation
)

judgment = JudgmentCreateRequest(
    # Core fields
    case_number="2023/EWCA/Crim/456",
    jurisdiction="UK",
    language="en",
    country="UK",
    court_name="Court of Appeal (Criminal Division)",
    court_level="Appeal Court",
    decision_date="2023-08-20",
    title="Regina v. James Taylor",
    summary="Appeal against sentence for robbery",
    full_text="[Full judgment text...]",
    case_type="Criminal",
    decision_type="Judgment",
    outcome="Allowed",
    keywords=["robbery", "sentencing", "appeal"],
    legal_topics=["criminal law", "sentencing guidelines"],
    cited_legislation=["Theft Act 1968"],

    # Section 2: Court hearing
    court_hearing_data=CourtHearingData(
        neutral_citation_number="[2023] EWCA Crim 456",
        appeal_judges=["Lady Justice Brown", "Mr Justice Green"],
        case_name="Regina v. James Taylor",
        offender_representative="Ms. Johnson",
        crown_representative="Mr. Williams"
    ),

    # Section 3: Offence/Trial/Sentence
    offence_trial_data=OffenceTrialData(
        conviction_courts=["Crown Court at Manchester"],
        conviction_dates=["2022-11-10"],
        convicted_offences=["Robbery"],
        plea=PleaInformation(
            confessed=False,
            plea_point="dont_know"
        ),
        remand_decision="remanded_custody",
        remand_custody_duration="12 months",
        sentence_court="Crown Court at Manchester",
        sentences=["6 years imprisonment"],
        offender=OffenderInformation(
            gender="male",
            age_at_offence=28,
            employment_status="unemployed",
            accommodation_status="fixed_address",
            intoxicated="no",
            victim_relationship="stranger"
        ),
        victim=VictimInformation(
            victim_type="individual",
            count=1,
            gender="female",
            age_at_offence=45
        ),
        prosecution_evidence=["CCTV", "victim_testimony", "identification_lineup"],
        defence_evidence=["offender_denies", "alibi"],
        pre_sentence_report="high",
        aggravating_factors=[
            "planning",
            "weapon_used",
            "vulnerable_victim"
        ],
        mitigating_factors=[
            "difficult_background",
            "mental_health_issues"
        ],
        victim_impact_statement=True
    ),

    # Section 4: Appeal
    appeal_data=AppealData(
        appellant="offender",
        co_defendants={"present": False, "count": 0},
        appeal_against="sentence_excessive",
        appeal_grounds=[
            "sentence_excessive",
            "sentencing_judge_wrong_category"
        ],
        sentencing_guidelines=["Robbery Sentencing Guidelines 2016"],
        appeal_outcome="allowed_sentence_more_lenient",
        reasons={
            "sentence_excessive": [
                "Strong personal mitigation",
                "Realistic prospect of rehabilitation",
                "First offence of this nature"
            ]
        }
    )
)
```

## Next Steps

1. **Apply the updated schema:**
   ```bash
   # Copy schema_updated.sql to Supabase SQL Editor
   cat supabase/schema_updated.sql
   ```

2. **Use the models in your code:**
   ```python
   # Python
   from app.models.judgment_models import Judgment, JudgmentCreateRequest
   ```

   ```typescript
   // TypeScript
   import type { Judgment, JudgmentCreateRequest } from '@/types/judgment';
   ```

3. **Query with filters:**
   ```python
   # Filter by language and country
   results = supabase.table('judgments')\
       .select('*')\
       .eq('language', 'pl')\
       .eq('country', 'PL')\
       .execute()
   ```

## Reference

- **Database Schema**: `supabase/schema_updated.sql` (560 lines)
- **Python Models**: `backend/app/models/judgment_models.py` (358 lines)
- **TypeScript Types**: `frontend/types/judgment.ts` (384 lines)
- **Implementation Summary**: `FILTERING_IMPLEMENTATION_SUMMARY.md`

-- =============================================================================
-- Migration: seed the EN/PL base schemas into extraction_schemas
-- =============================================================================
-- The base schemas live as JSON files in
-- backend/packages/juddges_search/config/schema/base_legal_schema_{pl,en}.json
-- and are served by GET /extractions/base-schema/definition (the /schemas/base
-- page). extraction_schemas was created empty in 20260810000002 and nothing ever
-- seeded it, so the /schemas list and the extraction schema picker showed no
-- schemas at all.
--
-- These rows are system schemas (user_id NULL): readable by every signed-in
-- user through the extraction_schemas_read RLS policy, writable by nobody
-- through the anon/authenticated client.
--
-- The `text` bodies below are copies of the JSON files.
-- backend/tests/app/test_base_schema_seed_migration.py fails if they drift.
-- Fixed ids keep the seed idempotent (ON CONFLICT DO NOTHING); the
-- create_schema_version_trigger records version 1 for each inserted row.
-- =============================================================================

INSERT INTO public.extraction_schemas (
    id, name, description, type, category, text,
    user_id, status, is_verified, last_edited_mode, field_count
) VALUES (
    '3b6f1c2e-5a4d-4e8b-9c1a-0b5e7d2f4a01'::uuid,
    'Base Schema (PL)',
    'Ujednolicony schemat do ekstrakcji ustrukturyzowanych danych z dokumentow prawnych w jezyku polskim.',
    'extraction',
    'base',
    $json${
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Polish Base Schema",
  "description": "Ujednolicony schemat do ekstrakcji ustrukturyzowanych danych z dokumentow prawnych w jezyku polskim.",
  "type": "object",
  "required": [
    "keywords",
    "neutral_citation_number",
    "case_number",
    "date_of_appeal_court_judgment",
    "appeal_court_judges_names",
    "case_name",
    "offender_representative_name",
    "crown_attorney_general_representative_name",
    "conv_court_names",
    "convict_plea_dates",
    "convict_offences",
    "acquit_offences",
    "did_offender_confess",
    "plea_point",
    "remand_decision",
    "remand_custody_time",
    "sent_court_name",
    "sentences_received",
    "sentence_serve",
    "what_ancilliary_orders",
    "offender_gender",
    "offender_age_offence",
    "offender_job_offence",
    "offender_home_offence",
    "offender_mental_offence",
    "offender_intox_offence",
    "offender_victim_relationship",
    "victim_type",
    "num_victims",
    "victim_gender",
    "victim_age_offence",
    "victim_job_offence",
    "victim_home_offence",
    "victim_mental_offence",
    "victim_intox_offence",
    "pros_evid_type_trial",
    "def_evid_type_trial",
    "pre_sent_report",
    "agg_fact_sent",
    "mit_fact_sent",
    "vic_impact_statement",
    "appellant",
    "co_def_acc_num",
    "appeal_against",
    "appeal_ground",
    "sent_guide_which",
    "appeal_outcome",
    "reason_quash_conv",
    "reason_sent_excessive",
    "reason_sent_lenient",
    "reason_dismiss"
  ],
  "properties": {
    "keywords": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Słowa kluczowe/tagi sprawy",
      "x-filter-type": "array_contains",
      "x-ui-label": "Słowa kluczowe/tagi sprawy",
      "x-ui-order": 1
    },
    "neutral_citation_number": {
      "type": "string",
      "description": "Sygnatura akt (np. II AKa 123/24)",
      "x-filter-type": "text_search",
      "x-ui-label": "Sygnatura akt (np. II AKa 123/24)",
      "x-ui-order": 2
    },
    "case_number": {
      "type": "number",
      "description": "Numer sprawy",
      "x-filter-type": "range",
      "x-ui-label": "Numer sprawy",
      "x-ui-order": 3
    },
    "date_of_appeal_court_judgment": {
      "type": "string",
      "description": "Data wyroku sądu odwoławczego",
      "x-filter-type": "date_range",
      "x-ui-label": "Data wyroku sądu odwoławczego",
      "x-ui-order": 4
    },
    "appeal_court_judges_names": {
      "type": "string",
      "description": "Skład sędziowski sądu odwoławczego",
      "x-filter-type": "text_search",
      "x-ui-label": "Skład sędziowski sądu odwoławczego",
      "x-ui-order": 5
    },
    "case_name": {
      "type": "string",
      "description": "Nazwa sprawy (np. Prokuratura Rejonowa przeciwko Kowalskiemu)",
      "x-filter-type": "text_search",
      "x-ui-label": "Nazwa sprawy (np. Prokuratura Rejonowa przeciwko Kowalskiemu)",
      "x-ui-order": 6
    },
    "offender_representative_name": {
      "type": "string",
      "description": "Obrońca oskarżonego (imię i nazwisko)",
      "x-filter-type": "text_search",
      "x-ui-label": "Obrońca oskarżonego (imię i nazwisko)",
      "x-ui-order": 7
    },
    "crown_attorney_general_representative_name": {
      "type": "string",
      "description": "Prokurator (imię i nazwisko)",
      "x-filter-type": "text_search",
      "x-ui-label": "Prokurator (imię i nazwisko)",
      "x-ui-order": 8
    },
    "conv_court_names": {
      "type": "string",
      "description": "Nazwa sądu/sądów, w których oskarżony został skazany",
      "x-filter-type": "text_search",
      "x-ui-label": "Nazwa sądu/sądów, w których oskarżony został skazany",
      "x-ui-order": 9
    },
    "convict_plea_dates": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Data/daty skazania lub przyznania się do winy",
      "x-filter-type": "array_contains",
      "x-ui-label": "Data/daty skazania lub przyznania się do winy",
      "x-ui-order": 10
    },
    "convict_offences": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Przestępstwo/przestępstwa, za które oskarżony został skazany",
      "x-filter-type": "array_contains",
      "x-ui-label": "Przestępstwo/przestępstwa, za które oskarżony został skazany",
      "x-ui-order": 11
    },
    "acquit_offences": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Przestępstwo/przestępstwa, od których oskarżony został uniewinniony",
      "x-filter-type": "array_contains",
      "x-ui-label": "Przestępstwo/przestępstwa, od których oskarżony został uniewinniony",
      "x-ui-order": 12
    },
    "did_offender_confess": {
      "type": "boolean",
      "description": "Czy oskarżony przyznał się do winy?",
      "x-filter-type": "facet",
      "x-ui-label": "Czy oskarżony przyznał się do winy?",
      "x-ui-order": 13
    },
    "plea_point": {
      "type": "string",
      "enum": [
        "police_presence",
        "first_court_appearance",
        "before_trial",
        "first_day_of_trial",
        "after_first_day_of_trial",
        "dont_know"
      ],
      "description": "W jakim momencie oskarżony przyznał się do winy?",
      "x-filter-type": "facet",
      "x-ui-label": "W jakim momencie oskarżony przyznał się do winy?",
      "x-ui-order": 14,
      "x-enum-labels": {
        "police_presence": "Podczas zatrzymania przez policję",
        "first_court_appearance": "Na pierwszym posiedzeniu sądu",
        "before_trial": "Przed rozprawą",
        "first_day_of_trial": "W pierwszym dniu rozprawy",
        "after_first_day_of_trial": "Po pierwszym dniu rozprawy",
        "dont_know": "Nieznane"
      }
    },
    "remand_decision": {
      "type": "string",
      "enum": [
        "unconditional_bail",
        "conditional_bail",
        "remanded_in_custody",
        "dont_know"
      ],
      "description": "Jaka była decyzja o tymczasowym aresztowaniu?",
      "x-filter-type": "facet",
      "x-ui-label": "Jaka była decyzja o tymczasowym aresztowaniu?",
      "x-ui-order": 15,
      "x-enum-labels": {
        "unconditional_bail": "Zwolnienie bez warunków",
        "conditional_bail": "Zwolnienie warunkowe (dozór)",
        "remanded_in_custody": "Tymczasowe aresztowanie",
        "dont_know": "Nieznane"
      }
    },
    "remand_custody_time": {
      "type": "string",
      "description": "Czas trwania tymczasowego aresztowania",
      "x-filter-type": "text_search",
      "x-ui-label": "Czas trwania tymczasowego aresztowania",
      "x-ui-order": 16
    },
    "sent_court_name": {
      "type": "string",
      "description": "Nazwa sądu wymierzającego karę",
      "x-filter-type": "text_search",
      "x-ui-label": "Nazwa sądu wymierzającego karę",
      "x-ui-order": 17
    },
    "sentences_received": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Wymierzona kara/kary",
      "x-filter-type": "array_contains",
      "x-ui-label": "Wymierzona kara/kary",
      "x-ui-order": 18
    },
    "sentence_serve": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "serve_concurrent",
          "serve_consecutive",
          "serve_unknown"
        ]
      },
      "uniqueItems": true,
      "description": "Jak mają być odbywane kary?",
      "x-filter-type": "array_contains",
      "x-ui-label": "Jak mają być odbywane kary?",
      "x-ui-order": 19,
      "x-enum-labels": {
        "serve_concurrent": "Łącznie (kary biegną równolegle)",
        "serve_consecutive": "Kolejno (kary biegną po sobie)",
        "serve_unknown": "Nieznane"
      }
    },
    "what_ancilliary_orders": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Środki karne i zabezpieczające",
      "x-filter-type": "array_contains",
      "x-ui-label": "Środki karne i zabezpieczające",
      "x-ui-order": 20
    },
    "offender_gender": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "gender_male",
          "gender_female",
          "gender_unknown"
        ]
      },
      "uniqueItems": true,
      "description": "Płeć oskarżonego/oskarżonych",
      "x-filter-type": "array_contains",
      "x-ui-label": "Płeć oskarżonego/oskarżonych",
      "x-ui-order": 21,
      "x-enum-labels": {
        "gender_male": "Mężczyzna",
        "gender_female": "Kobieta",
        "gender_unknown": "Nieznane"
      }
    },
    "offender_age_offence": {
      "type": "string",
      "description": "Wiek oskarżonego w czasie popełnienia przestępstwa",
      "x-filter-type": "text_search",
      "x-ui-label": "Wiek oskarżonego w czasie popełnienia przestępstwa",
      "x-ui-order": 22
    },
    "offender_job_offence": {
      "type": "string",
      "enum": [
        "employed",
        "self_employed",
        "unemployed",
        "student",
        "retired",
        "other",
        "dont_know"
      ],
      "description": "Status zatrudnienia oskarżonego w czasie popełnienia przestępstwa",
      "x-filter-type": "facet",
      "x-ui-label": "Status zatrudnienia oskarżonego w czasie popełnienia przestępstwa",
      "x-ui-order": 23,
      "x-enum-labels": {
        "employed": "Zatrudniony",
        "self_employed": "Samozatrudniony",
        "unemployed": "Bezrobotny",
        "student": "Student/uczeń",
        "retired": "Emeryt/rencista",
        "other": "Inny",
        "dont_know": "Nieznane"
      }
    },
    "offender_home_offence": {
      "type": "string",
      "enum": [
        "fixed_address",
        "homeless",
        "temporary_accommodation",
        "dont_know"
      ],
      "description": "Sytuacja mieszkaniowa oskarżonego w czasie popełnienia przestępstwa",
      "x-filter-type": "facet",
      "x-ui-label": "Sytuacja mieszkaniowa oskarżonego w czasie popełnienia przestępstwa",
      "x-ui-order": 24,
      "x-enum-labels": {
        "fixed_address": "Stałe miejsce zamieszkania",
        "homeless": "Bezdomny",
        "temporary_accommodation": "Tymczasowe zakwaterowanie",
        "dont_know": "Nieznane"
      }
    },
    "offender_mental_offence": {
      "type": "string",
      "description": "Stan zdrowia psychicznego oskarżonego w czasie popełnienia przestępstwa",
      "x-filter-type": "text_search",
      "x-ui-label": "Stan zdrowia psychicznego oskarżonego w czasie popełnienia przestępstwa",
      "x-ui-order": 25
    },
    "offender_intox_offence": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "intox_alcohol",
          "intox_drugs",
          "intox_unknown"
        ]
      },
      "uniqueItems": true,
      "description": "Czy oskarżony był pod wpływem alkoholu lub środków odurzających? Pusta lista oznacza brak odurzenia.",
      "x-filter-type": "array_contains",
      "x-ui-label": "Czy oskarżony był pod wpływem alkoholu lub środków odurzających?",
      "x-ui-order": 26,
      "x-enum-labels": {
        "intox_alcohol": "Alkohol",
        "intox_drugs": "Narkotyki",
        "intox_unknown": "Nieznane"
      }
    },
    "offender_victim_relationship": {
      "type": "string",
      "enum": [
        "stranger",
        "relative",
        "acquaintance",
        "dont_know"
      ],
      "description": "Relacja sprawca-pokrzywdzony",
      "x-filter-type": "facet",
      "x-ui-label": "Relacja sprawca-pokrzywdzony",
      "x-ui-order": 27,
      "x-enum-labels": {
        "stranger": "Nieznajomy",
        "relative": "Krewny/członek rodziny",
        "acquaintance": "Znajomy",
        "dont_know": "Nieznane"
      }
    },
    "victim_type": {
      "type": "string",
      "enum": [
        "individual_person",
        "organisation"
      ],
      "description": "Typ pokrzywdzonego",
      "x-filter-type": "facet",
      "x-ui-label": "Typ pokrzywdzonego",
      "x-ui-order": 28,
      "x-enum-labels": {
        "individual_person": "Osoba fizyczna",
        "organisation": "Organizacja/firma"
      }
    },
    "num_victims": {
      "type": "number",
      "description": "Liczba pokrzywdzonych",
      "x-filter-type": "range",
      "x-ui-label": "Liczba pokrzywdzonych",
      "x-ui-order": 29
    },
    "victim_gender": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "gender_male",
          "gender_female",
          "gender_unknown"
        ]
      },
      "uniqueItems": true,
      "description": "Płeć pokrzywdzonego/pokrzywdzonych",
      "x-filter-type": "array_contains",
      "x-ui-label": "Płeć pokrzywdzonego/pokrzywdzonych",
      "x-ui-order": 30,
      "x-enum-labels": {
        "gender_male": "Mężczyzna",
        "gender_female": "Kobieta",
        "gender_unknown": "Nieznane"
      }
    },
    "victim_age_offence": {
      "type": "number",
      "description": "Wiek pokrzywdzonego w czasie popełnienia przestępstwa",
      "x-filter-type": "range",
      "x-ui-label": "Wiek pokrzywdzonego w czasie popełnienia przestępstwa",
      "x-ui-order": 31
    },
    "victim_job_offence": {
      "type": "string",
      "description": "Status zatrudnienia pokrzywdzonego",
      "x-filter-type": "text_search",
      "x-ui-label": "Status zatrudnienia pokrzywdzonego",
      "x-ui-order": 32
    },
    "victim_home_offence": {
      "type": "string",
      "description": "Sytuacja mieszkaniowa pokrzywdzonego",
      "x-filter-type": "text_search",
      "x-ui-label": "Sytuacja mieszkaniowa pokrzywdzonego",
      "x-ui-order": 33
    },
    "victim_mental_offence": {
      "type": "string",
      "description": "Stan zdrowia psychicznego pokrzywdzonego",
      "x-filter-type": "text_search",
      "x-ui-label": "Stan zdrowia psychicznego pokrzywdzonego",
      "x-ui-order": 34
    },
    "victim_intox_offence": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "intox_alcohol",
          "intox_drugs",
          "intox_unknown"
        ]
      },
      "uniqueItems": true,
      "description": "Czy pokrzywdzony był pod wpływem alkoholu lub środków odurzających? Pusta lista oznacza brak odurzenia.",
      "x-filter-type": "array_contains",
      "x-ui-label": "Czy pokrzywdzony był pod wpływem alkoholu lub środków odurzających?",
      "x-ui-order": 35,
      "x-enum-labels": {
        "intox_alcohol": "Alkohol",
        "intox_drugs": "Narkotyki",
        "intox_unknown": "Nieznane"
      }
    },
    "pros_evid_type_trial": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Rodzaje dowodów przedstawionych przez oskarżenie",
      "x-filter-type": "array_contains",
      "x-ui-label": "Rodzaje dowodów przedstawionych przez oskarżenie",
      "x-ui-order": 36
    },
    "def_evid_type_trial": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Rodzaje dowodów przedstawionych przez obronę",
      "x-filter-type": "array_contains",
      "x-ui-label": "Rodzaje dowodów przedstawionych przez obronę",
      "x-ui-order": 37
    },
    "pre_sent_report": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high",
        "dont_know"
      ],
      "description": "Ocena z raportu przedsądowego",
      "x-filter-type": "facet",
      "x-ui-label": "Ocena z raportu przedsądowego",
      "x-ui-order": 38,
      "x-enum-labels": {
        "low": "Niskie ryzyko",
        "medium": "Średnie ryzyko",
        "high": "Wysokie ryzyko",
        "dont_know": "Nieznane"
      }
    },
    "agg_fact_sent": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Okoliczności obciążające wymienione przy wymiarze kary",
      "x-filter-type": "array_contains",
      "x-ui-label": "Okoliczności obciążające wymienione przy wymiarze kary",
      "x-ui-order": 39
    },
    "mit_fact_sent": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Okoliczności łagodzące wymienione przy wymiarze kary",
      "x-filter-type": "array_contains",
      "x-ui-label": "Okoliczności łagodzące wymienione przy wymiarze kary",
      "x-ui-order": 40
    },
    "vic_impact_statement": {
      "type": "boolean",
      "description": "Czy złożono oświadczenie o wpływie na pokrzywdzonego?",
      "x-filter-type": "facet",
      "x-ui-label": "Czy złożono oświadczenie o wpływie na pokrzywdzonego?",
      "x-ui-order": 41
    },
    "appellant": {
      "type": "string",
      "enum": [
        "offender",
        "attorney_general",
        "other"
      ],
      "description": "Kto jest stroną apelującą?",
      "x-filter-type": "facet",
      "x-ui-label": "Kto jest stroną apelującą?",
      "x-ui-order": 42,
      "x-enum-labels": {
        "offender": "Oskarżony",
        "attorney_general": "Prokurator Generalny/Prokuratura",
        "other": "Inny"
      }
    },
    "co_def_acc_num": {
      "type": "number",
      "description": "Liczba współoskarżonych w sprawie",
      "x-filter-type": "range",
      "x-ui-label": "Liczba współoskarżonych w sprawie",
      "x-ui-order": 43
    },
    "appeal_against": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "appeal_conviction_unsafe",
          "appeal_sentence_excessive",
          "appeal_sentence_lenient",
          "appeal_other",
          "appeal_unknown"
        ]
      },
      "uniqueItems": true,
      "description": "Przedmiot apelacji",
      "x-filter-type": "array_contains",
      "x-ui-label": "Przedmiot apelacji",
      "x-ui-order": 44,
      "x-enum-labels": {
        "appeal_conviction_unsafe": "Skazanie wadliwe",
        "appeal_sentence_excessive": "Kara rażąco surowa",
        "appeal_sentence_lenient": "Kara rażąco łagodna",
        "appeal_other": "Inne",
        "appeal_unknown": "Nieznane"
      }
    },
    "appeal_ground": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Podstawy apelacji",
      "x-filter-type": "array_contains",
      "x-ui-label": "Podstawy apelacji",
      "x-ui-order": 45
    },
    "sent_guide_which": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Wytyczne/przepisy dotyczące wymiaru kary przywołane przez sąd",
      "x-filter-type": "array_contains",
      "x-ui-label": "Wytyczne/przepisy dotyczące wymiaru kary przywołane przez sąd",
      "x-ui-order": 46
    },
    "appeal_outcome": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "outcome_dismissed_or_refused",
          "outcome_conviction_quashed",
          "outcome_sentence_more_severe",
          "outcome_sentence_more_lenient",
          "outcome_other",
          "outcome_unknown"
        ]
      },
      "uniqueItems": true,
      "description": "Wynik apelacji. W przypadku decyzji mieszanej podaj kilka wartości.",
      "x-filter-type": "array_contains",
      "x-ui-label": "Wynik apelacji",
      "x-ui-order": 47,
      "x-enum-labels": {
        "outcome_dismissed_or_refused": "Oddalona/Odrzucona",
        "outcome_conviction_quashed": "Uwzględniona - Skazanie uchylone",
        "outcome_sentence_more_severe": "Uwzględniona - Zastąpiono surowszą karą",
        "outcome_sentence_more_lenient": "Uwzględniona - Zastąpiono łagodniejszą karą",
        "outcome_other": "Inne",
        "outcome_unknown": "Nieznane"
      }
    },
    "reason_quash_conv": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Podstawy uchylenia skazania przez sąd odwoławczy",
      "x-filter-type": "array_contains",
      "x-ui-label": "Podstawy uchylenia skazania przez sąd odwoławczy",
      "x-ui-order": 48
    },
    "reason_sent_excessive": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Podstawy uznania kary za rażąco surową",
      "x-filter-type": "array_contains",
      "x-ui-label": "Podstawy uznania kary za rażąco surową",
      "x-ui-order": 49
    },
    "reason_sent_lenient": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Podstawy uznania kary za rażąco łagodną",
      "x-filter-type": "array_contains",
      "x-ui-label": "Podstawy uznania kary za rażąco łagodną",
      "x-ui-order": 50
    },
    "reason_dismiss": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Podstawy oddalenia apelacji",
      "x-filter-type": "array_contains",
      "x-ui-label": "Podstawy oddalenia apelacji",
      "x-ui-order": 51
    }
  },
  "additionalProperties": false
}$json$::jsonb,
    NULL,
    'published',
    true,
    'code',
    51
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.extraction_schemas (
    id, name, description, type, category, text,
    user_id, status, is_verified, last_edited_mode, field_count
) VALUES (
    '3b6f1c2e-5a4d-4e8b-9c1a-0b5e7d2f4a02'::uuid,
    'Base Schema (EN)',
    'Unified schema for extracting structured data from legal documents in English.',
    'extraction',
    'base',
    $json${
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "English Base Schema",
  "description": "Unified schema for extracting structured data from legal documents in English.",
  "type": "object",
  "required": [
    "keywords",
    "neutral_citation_number",
    "case_number",
    "date_of_appeal_court_judgment",
    "appeal_court_judges_names",
    "case_name",
    "offender_representative_name",
    "crown_attorney_general_representative_name",
    "conv_court_names",
    "convict_plea_dates",
    "convict_offences",
    "acquit_offences",
    "did_offender_confess",
    "plea_point",
    "remand_decision",
    "remand_custody_time",
    "sent_court_name",
    "sentences_received",
    "sentence_serve",
    "what_ancilliary_orders",
    "offender_gender",
    "offender_age_offence",
    "offender_job_offence",
    "offender_home_offence",
    "offender_mental_offence",
    "offender_intox_offence",
    "offender_victim_relationship",
    "victim_type",
    "num_victims",
    "victim_gender",
    "victim_age_offence",
    "victim_job_offence",
    "victim_home_offence",
    "victim_mental_offence",
    "victim_intox_offence",
    "pros_evid_type_trial",
    "def_evid_type_trial",
    "pre_sent_report",
    "agg_fact_sent",
    "mit_fact_sent",
    "vic_impact_statement",
    "appellant",
    "co_def_acc_num",
    "appeal_against",
    "appeal_ground",
    "sent_guide_which",
    "appeal_outcome",
    "reason_quash_conv",
    "reason_sent_excessive",
    "reason_sent_lenient",
    "reason_dismiss"
  ],
  "properties": {
    "keywords": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Keywords/Tags for the Case",
      "x-filter-type": "array_contains",
      "x-ui-label": "Keywords",
      "x-ui-order": 1
    },
    "neutral_citation_number": {
      "type": "string",
      "description": "Neutral Citation Number (e.g., [2024] EWCA Crim 123)",
      "x-filter-type": "text_search",
      "x-ui-label": "Citation Number",
      "x-ui-order": 2
    },
    "case_number": {
      "type": "number",
      "description": "Case Number",
      "x-filter-type": "range",
      "x-ui-label": "Case Number",
      "x-ui-order": 3
    },
    "date_of_appeal_court_judgment": {
      "type": "string",
      "description": "Date of Appeal Court Judgment",
      "x-filter-type": "date_range",
      "x-ui-label": "Appeal Judgment Date",
      "x-ui-order": 4
    },
    "appeal_court_judges_names": {
      "type": "string",
      "description": "Appeal Court Judges Names (e.g., Lord Justice Smith, Mr Justice Jones)",
      "x-filter-type": "text_search",
      "x-ui-label": "Appeal Judges",
      "x-ui-order": 5
    },
    "case_name": {
      "type": "string",
      "description": "Case Name (e.g., R v Smith)",
      "x-filter-type": "text_search",
      "x-ui-label": "Case Name",
      "x-ui-order": 6
    },
    "offender_representative_name": {
      "type": "string",
      "description": "Offender's Representative Name (Barrister/Solicitor)",
      "x-filter-type": "text_search",
      "x-ui-label": "Defense Attorney",
      "x-ui-order": 7
    },
    "crown_attorney_general_representative_name": {
      "type": "string",
      "description": "Crown/Attorney General Representative Name",
      "x-filter-type": "text_search",
      "x-ui-label": "Prosecutor",
      "x-ui-order": 8
    },
    "conv_court_names": {
      "type": "string",
      "description": "Court Name(s) where Offender Convicted/Pled Guilty",
      "x-filter-type": "text_search",
      "x-ui-label": "Conviction Court",
      "x-ui-order": 9
    },
    "convict_plea_dates": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Conviction/Guilty Plea Date(s)",
      "x-filter-type": "array_contains",
      "x-ui-label": "Plea Dates",
      "x-ui-order": 10
    },
    "convict_offences": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Offence(s) Offender was Convicted of",
      "x-filter-type": "array_contains",
      "x-ui-label": "Convicted Offences",
      "x-ui-order": 11
    },
    "acquit_offences": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Offence(s) Offender was Acquitted of",
      "x-filter-type": "array_contains",
      "x-ui-label": "Acquitted Offences",
      "x-ui-order": 12
    },
    "did_offender_confess": {
      "type": "boolean",
      "description": "Did Offender Confess/Plead Guilty?",
      "x-filter-type": "facet",
      "x-ui-label": "Confession/Guilty Plea",
      "x-ui-order": 13
    },
    "plea_point": {
      "type": "string",
      "enum": [
        "police_presence",
        "first_court_appearance",
        "before_trial",
        "first_day_of_trial",
        "after_first_day_of_trial",
        "dont_know"
      ],
      "description": "At what point did Offender plead guilty?",
      "x-filter-type": "facet",
      "x-ui-label": "Plea Point",
      "x-ui-order": 14,
      "x-enum-labels": {
        "police_presence": "At police presence/arrest",
        "first_court_appearance": "At first court appearance",
        "before_trial": "Before trial",
        "first_day_of_trial": "On first day of trial",
        "after_first_day_of_trial": "After first day of trial",
        "dont_know": "Unknown"
      }
    },
    "remand_decision": {
      "type": "string",
      "enum": [
        "unconditional_bail",
        "conditional_bail",
        "remanded_in_custody",
        "dont_know"
      ],
      "description": "What was the Remand Decision for Offender?",
      "x-filter-type": "facet",
      "x-ui-label": "Remand Decision",
      "x-ui-order": 15,
      "x-enum-labels": {
        "unconditional_bail": "Unconditional bail",
        "conditional_bail": "Conditional bail",
        "remanded_in_custody": "Remanded in custody",
        "dont_know": "Unknown"
      }
    },
    "remand_custody_time": {
      "type": "string",
      "description": "If remanded in custody, for how long?",
      "x-filter-type": "text_search",
      "x-ui-label": "Custody Duration",
      "x-ui-order": 16
    },
    "sent_court_name": {
      "type": "string",
      "description": "Court Name where Offender Sentenced",
      "x-filter-type": "text_search",
      "x-ui-label": "Sentencing Court",
      "x-ui-order": 17
    },
    "sentences_received": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Sentence(s) Received",
      "x-filter-type": "array_contains",
      "x-ui-label": "Sentences",
      "x-ui-order": 18
    },
    "sentence_serve": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "serve_concurrent",
          "serve_consecutive",
          "serve_unknown"
        ]
      },
      "uniqueItems": true,
      "description": "How are sentences to be served?",
      "x-filter-type": "array_contains",
      "x-ui-label": "Sentence Type",
      "x-ui-order": 19,
      "x-enum-labels": {
        "serve_concurrent": "Concurrently",
        "serve_consecutive": "Consecutively",
        "serve_unknown": "Unknown"
      }
    },
    "what_ancilliary_orders": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Ancillary Orders Applied",
      "x-filter-type": "array_contains",
      "x-ui-label": "Ancillary Orders",
      "x-ui-order": 20
    },
    "offender_gender": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "gender_male",
          "gender_female",
          "gender_unknown"
        ]
      },
      "uniqueItems": true,
      "description": "Offender(s) Gender",
      "x-filter-type": "array_contains",
      "x-ui-label": "Offender Gender",
      "x-ui-order": 21,
      "x-enum-labels": {
        "gender_male": "Male",
        "gender_female": "Female",
        "gender_unknown": "Unknown"
      }
    },
    "offender_age_offence": {
      "type": "string",
      "description": "Offender(s) Age at Time of Offence",
      "x-filter-type": "text_search",
      "x-ui-label": "Offender Age",
      "x-ui-order": 22
    },
    "offender_job_offence": {
      "type": "string",
      "enum": [
        "employed",
        "self_employed",
        "unemployed",
        "student",
        "retired",
        "other",
        "dont_know"
      ],
      "description": "Offender(s) Employment Status at Time of Offence",
      "x-filter-type": "facet",
      "x-ui-label": "Offender Employment",
      "x-ui-order": 23,
      "x-enum-labels": {
        "employed": "Employed",
        "self_employed": "Self-employed",
        "unemployed": "Unemployed",
        "student": "Student",
        "retired": "Retired",
        "other": "Other",
        "dont_know": "Unknown"
      }
    },
    "offender_home_offence": {
      "type": "string",
      "enum": [
        "fixed_address",
        "homeless",
        "temporary_accommodation",
        "dont_know"
      ],
      "description": "Offender(s) Accommodation Status at Time of Offence",
      "x-filter-type": "facet",
      "x-ui-label": "Offender Housing",
      "x-ui-order": 24,
      "x-enum-labels": {
        "fixed_address": "Fixed address",
        "homeless": "Homeless",
        "temporary_accommodation": "Temporary accommodation",
        "dont_know": "Unknown"
      }
    },
    "offender_mental_offence": {
      "type": "string",
      "description": "Offender(s) Mental Health at Time of Offence",
      "x-filter-type": "text_search",
      "x-ui-label": "Offender Mental Health",
      "x-ui-order": 25
    },
    "offender_intox_offence": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "intox_alcohol",
          "intox_drugs",
          "intox_unknown"
        ]
      },
      "uniqueItems": true,
      "description": "Was offender intoxicated at time of offence? Use an empty array to represent no intoxication.",
      "x-filter-type": "array_contains",
      "x-ui-label": "Offender Intoxication",
      "x-ui-order": 26,
      "x-enum-labels": {
        "intox_alcohol": "Alcohol",
        "intox_drugs": "Drugs",
        "intox_unknown": "Unknown"
      }
    },
    "offender_victim_relationship": {
      "type": "string",
      "enum": [
        "stranger",
        "relative",
        "acquaintance",
        "dont_know"
      ],
      "description": "Offender-Victim Relationship",
      "x-filter-type": "facet",
      "x-ui-label": "Relationship",
      "x-ui-order": 27,
      "x-enum-labels": {
        "stranger": "Stranger",
        "relative": "Relative/Family member",
        "acquaintance": "Acquaintance",
        "dont_know": "Unknown"
      }
    },
    "victim_type": {
      "type": "string",
      "enum": [
        "individual_person",
        "organisation"
      ],
      "description": "Victim Type",
      "x-filter-type": "facet",
      "x-ui-label": "Victim Type",
      "x-ui-order": 28,
      "x-enum-labels": {
        "individual_person": "Individual person",
        "organisation": "Organisation/Company"
      }
    },
    "num_victims": {
      "type": "number",
      "description": "Number of Victims",
      "x-filter-type": "range",
      "x-ui-label": "Number of Victims",
      "x-ui-order": 29
    },
    "victim_gender": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "gender_male",
          "gender_female",
          "gender_unknown"
        ]
      },
      "uniqueItems": true,
      "description": "Victim(s) Gender",
      "x-filter-type": "array_contains",
      "x-ui-label": "Victim Gender",
      "x-ui-order": 30,
      "x-enum-labels": {
        "gender_male": "Male",
        "gender_female": "Female",
        "gender_unknown": "Unknown"
      }
    },
    "victim_age_offence": {
      "type": "number",
      "description": "Victim(s) Age at Time of Offence",
      "x-filter-type": "range",
      "x-ui-label": "Victim Age",
      "x-ui-order": 31
    },
    "victim_job_offence": {
      "type": "string",
      "description": "Victim(s) Employment Status at Time of Offence",
      "x-filter-type": "text_search",
      "x-ui-label": "Victim Employment",
      "x-ui-order": 32
    },
    "victim_home_offence": {
      "type": "string",
      "description": "Victim(s) Accommodation Status at Time of Offence",
      "x-filter-type": "text_search",
      "x-ui-label": "Victim Housing",
      "x-ui-order": 33
    },
    "victim_mental_offence": {
      "type": "string",
      "description": "Victim(s) Mental Health at Time of Offence",
      "x-filter-type": "text_search",
      "x-ui-label": "Victim Mental Health",
      "x-ui-order": 34
    },
    "victim_intox_offence": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "intox_alcohol",
          "intox_drugs",
          "intox_unknown"
        ]
      },
      "uniqueItems": true,
      "description": "Was victim intoxicated at time of offence? Use an empty array to represent no intoxication.",
      "x-filter-type": "array_contains",
      "x-ui-label": "Victim Intoxication",
      "x-ui-order": 35,
      "x-enum-labels": {
        "intox_alcohol": "Alcohol",
        "intox_drugs": "Drugs",
        "intox_unknown": "Unknown"
      }
    },
    "pros_evid_type_trial": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Types of Evidence Prosecution Presented at Trial",
      "x-filter-type": "array_contains",
      "x-ui-label": "Prosecution Evidence",
      "x-ui-order": 36
    },
    "def_evid_type_trial": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Types of Evidence Defence Presented at Trial",
      "x-filter-type": "array_contains",
      "x-ui-label": "Defence Evidence",
      "x-ui-order": 37
    },
    "pre_sent_report": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high",
        "dont_know"
      ],
      "description": "Pre-sentence Report Assessment",
      "x-filter-type": "facet",
      "x-ui-label": "Pre-Sentence Report",
      "x-ui-order": 38,
      "x-enum-labels": {
        "low": "Low risk",
        "medium": "Medium risk",
        "high": "High risk",
        "dont_know": "Unknown"
      }
    },
    "agg_fact_sent": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Aggravating Factors Mentioned When Sentencing",
      "x-filter-type": "array_contains",
      "x-ui-label": "Aggravating Factors",
      "x-ui-order": 39
    },
    "mit_fact_sent": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Mitigating Factors Mentioned When Sentencing",
      "x-filter-type": "array_contains",
      "x-ui-label": "Mitigating Factors",
      "x-ui-order": 40
    },
    "vic_impact_statement": {
      "type": "boolean",
      "description": "Was Victim Impact Statement Given?",
      "x-filter-type": "facet",
      "x-ui-label": "Victim Impact Statement",
      "x-ui-order": 41
    },
    "appellant": {
      "type": "string",
      "enum": [
        "offender",
        "attorney_general",
        "other"
      ],
      "description": "Who is the Appellant?",
      "x-filter-type": "facet",
      "x-ui-label": "Appellant",
      "x-ui-order": 42,
      "x-enum-labels": {
        "offender": "Offender/Defendant",
        "attorney_general": "Attorney General/Crown",
        "other": "Other"
      }
    },
    "co_def_acc_num": {
      "type": "number",
      "description": "Number of Co-defendants/Co-accused in Case",
      "x-filter-type": "range",
      "x-ui-label": "Co-Defendants",
      "x-ui-order": 43
    },
    "appeal_against": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "appeal_conviction_unsafe",
          "appeal_sentence_excessive",
          "appeal_sentence_lenient",
          "appeal_other",
          "appeal_unknown"
        ]
      },
      "uniqueItems": true,
      "description": "What is the appeal against?",
      "x-filter-type": "array_contains",
      "x-ui-label": "Appeal Against",
      "x-ui-order": 44,
      "x-enum-labels": {
        "appeal_conviction_unsafe": "Conviction unsafe",
        "appeal_sentence_excessive": "Sentence unduly excessive",
        "appeal_sentence_lenient": "Sentence unduly lenient",
        "appeal_other": "Other",
        "appeal_unknown": "Unknown"
      }
    },
    "appeal_ground": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Ground(s) for Appeal",
      "x-filter-type": "array_contains",
      "x-ui-label": "Appeal Grounds",
      "x-ui-order": 45
    },
    "sent_guide_which": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Sentencing Guideline/Law/Act Mentioned by Appeal Court",
      "x-filter-type": "array_contains",
      "x-ui-label": "Sentencing Guidelines",
      "x-ui-order": 46
    },
    "appeal_outcome": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "outcome_dismissed_or_refused",
          "outcome_conviction_quashed",
          "outcome_sentence_more_severe",
          "outcome_sentence_more_lenient",
          "outcome_other",
          "outcome_unknown"
        ]
      },
      "uniqueItems": true,
      "description": "Outcome of appeal. Mixed decisions should contain multiple values.",
      "x-filter-type": "array_contains",
      "x-ui-label": "Appeal Outcome",
      "x-ui-order": 47,
      "x-enum-labels": {
        "outcome_dismissed_or_refused": "Dismissed/Failed/Refused",
        "outcome_conviction_quashed": "Allowed - Conviction quashed",
        "outcome_sentence_more_severe": "Allowed - Replaced by more severe sentence",
        "outcome_sentence_more_lenient": "Allowed - Replaced by more lenient sentence",
        "outcome_other": "Other",
        "outcome_unknown": "Unknown"
      }
    },
    "reason_quash_conv": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Appeal Court Basis for Why Conviction is Quashed",
      "x-filter-type": "array_contains",
      "x-ui-label": "Quash Reasons",
      "x-ui-order": 48
    },
    "reason_sent_excessive": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Appeal Court Basis for Why Sentence is Unduly Excessive",
      "x-filter-type": "array_contains",
      "x-ui-label": "Excessive Sentence Reasons",
      "x-ui-order": 49
    },
    "reason_sent_lenient": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Appeal Court Basis for Why Sentence is Unduly Lenient",
      "x-filter-type": "array_contains",
      "x-ui-label": "Lenient Sentence Reasons",
      "x-ui-order": 50
    },
    "reason_dismiss": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Appeal Court Basis for Why Appeal Dismissed",
      "x-filter-type": "array_contains",
      "x-ui-label": "Dismissal Reasons",
      "x-ui-order": 51
    }
  },
  "additionalProperties": false
}$json$::jsonb,
    NULL,
    'published',
    true,
    'code',
    51
)
ON CONFLICT (id) DO NOTHING;

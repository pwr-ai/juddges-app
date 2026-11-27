-- =============================================================================
-- Migration: reframe the CHF reasoning line as "borrower vs bank"
-- =============================================================================
-- Reasoning line e2fbd45e-e9f8-4588-bc21-f7ed6eb12c5b (CHF loans, 5090
-- members) was classified against the question "is the contract void?". Its
-- for/against/mixed split therefore answered nullity, not who won: a judgment
-- that removed the abusive clauses but kept the contract landed in "mixed".
-- The question researchers ask of this line is whether the borrower or the
-- bank wins.
--
-- 1. Reword label + legal_question to borrower vs bank and set
--    metadata.outcome_labels so the timeline chart names its series after the
--    parties (read by GET /reasoning-lines/{id}/timeline).
-- 2. Re-derive members' outcome_direction from the structured CHF extraction
--    (judgments.metadata.chf_extraction.wynik_sprawy, read from the sentencja):
--      'Wygrana kredytobiorcy'                       -> for
--      'Wygrana banku'                               -> against
--      'Częściowe uwzględnienie roszczeń obu stron'  -> mixed
--    Members without that field (the chf-loans-606 import, ~620 rows) are
--    reset to NULL so POST /reasoning-lines/{id}/analyze-outcomes reclassifies
--    them against the new question.
--
-- Scoped to one line id: a no-op on any database that does not hold it.
-- =============================================================================

UPDATE public.reasoning_lines
   SET label          = 'Kredyty frankowe — kto wygrywa: kredytobiorca czy bank',
       legal_question = 'Czy w sporze o kredyt indeksowany lub denominowany do '
                        'franka szwajcarskiego (CHF) sąd rozstrzygnął na korzyść '
                        'kredytobiorcy (konsumenta), a nie banku?',
       metadata       = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                          'outcome_labels', jsonb_build_object(
                            'for',        'Kredytobiorca wygrywa',
                            'against',    'Bank wygrywa',
                            'mixed',      'Częściowo',
                            'procedural', 'Proceduralne'
                          ),
                          'outcome_source', 'judgments.metadata.chf_extraction.wynik_sprawy'
                        ),
       updated_at     = now()
 WHERE id = 'e2fbd45e-e9f8-4588-bc21-f7ed6eb12c5b';

UPDATE public.reasoning_line_members m
   SET outcome_direction = CASE j.metadata -> 'chf_extraction' ->> 'wynik_sprawy'
           WHEN 'Wygrana kredytobiorcy' THEN 'for'
           WHEN 'Wygrana banku' THEN 'against'
           WHEN 'Częściowe uwzględnienie roszczeń obu stron' THEN 'mixed'
           ELSE NULL
       END
  FROM public.judgments j
 WHERE j.id = m.judgment_id
   AND m.reasoning_line_id = 'e2fbd45e-e9f8-4588-bc21-f7ed6eb12c5b';

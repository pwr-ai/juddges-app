import { useCallback } from 'react';

import logger from '@/lib/logger';
import { queryRewriteEnvelopeSchema } from '@/lib/validation/query-rewrite-schema';
import {
  useSearchStore,
  type BaseFilters,
  type BaseFilterValue,
} from '@/lib/store/searchStore';
import type {
  NumericRange,
  QueryRewriteRequest,
  RewrittenQueryEnvelope,
} from '@/types/query-rewrite';

const hookLogger = logger.child('useQueryRewrite');

interface UseQueryRewriteReturn {
  run: (req: QueryRewriteRequest) => Promise<RewrittenQueryEnvelope>;
}

/**
 * Calls the BFF `/api/query_rewrite` route, validates the envelope with the
 * shared Zod schema, and (when not degraded) hydrates the search store with
 * the extracted filters. Snake_case envelope keys map onto camelCase store
 * fields here so callers don't have to know about the wire format.
 */
export function useQueryRewrite(): UseQueryRewriteReturn {
  const setBaseFilters = useSearchStore((s) => s.setBaseFilters);
  const setSelectedLanguages = useSearchStore((s) => s.setSelectedLanguages);
  const toggleFilter = useSearchStore((s) => s.toggleFilter);
  const setDateFilter = useSearchStore((s) => s.setDateFilter);
  const toggleCustomMetadataFilter = useSearchStore(
    (s) => s.toggleCustomMetadataFilter,
  );

  const run = useCallback<UseQueryRewriteReturn['run']>(
    async (req) => {
      const response = await fetch('/api/query_rewrite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
      });

      const json = await response.json();
      const envelope = queryRewriteEnvelopeSchema.parse(
        json,
      ) as RewrittenQueryEnvelope;

      if (envelope.degraded) {
        hookLogger.warn('query rewrite degraded', { query: req.query });
        return envelope;
      }

      // Base filters: wire (base_*) → store keys + discriminated union values.
      const base = envelope.filters.base;
      const asRange = (
        kind: 'numeric_range' | 'date_range',
        r?: NumericRange,
      ): BaseFilterValue | undefined =>
        r && (r.min !== undefined || r.max !== undefined)
          ? { kind, range: { min: r.min, max: r.max } }
          : undefined;

      const mapped: Array<[string, BaseFilterValue | undefined]> = [
        ['num_victims', asRange('numeric_range', base.base_num_victims)],
        ['victim_age_offence', asRange('numeric_range', base.base_victim_age_offence)],
        ['case_number', asRange('numeric_range', base.base_case_number)],
        ['co_def_acc_num', asRange('numeric_range', base.base_co_def_acc_num)],
        [
          'date_of_appeal_court_judgment',
          asRange('date_range', base.base_date_of_appeal_court_judgment_ts),
        ],
      ];

      const next: BaseFilters = {};
      for (const [key, value] of mapped) {
        if (value !== undefined) next[key] = value;
      }
      setBaseFilters(next);

      // Language hint
      if (envelope.filters.languages.length > 0) {
        setSelectedLanguages(new Set(envelope.filters.languages));
      }

      // keywords / legal_topics / cited_legislation → facet sidebar chips
      envelope.filters.arrays.keywords.forEach((v) =>
        toggleFilter('keywords', v),
      );
      envelope.filters.arrays.legal_topics.forEach((v) =>
        toggleFilter('legalConcepts', v),
      );
      envelope.filters.arrays.cited_legislation.forEach((v) =>
        toggleCustomMetadataFilter('cited_legislation', v),
      );

      // Categorical facets
      const facets = envelope.filters.facets;
      if (facets.jurisdiction)
        toggleFilter('jurisdictions', facets.jurisdiction);
      if (facets.court_level) toggleFilter('courtLevels', facets.court_level);
      if (facets.case_type)
        toggleCustomMetadataFilter('case_type', facets.case_type);
      if (facets.decision_type)
        toggleCustomMetadataFilter('decision_type', facets.decision_type);
      if (facets.outcome)
        toggleCustomMetadataFilter('outcome', facets.outcome);

      // Decision date window → dateFrom / dateTo
      if (envelope.filters.decision_date?.from) {
        setDateFilter('dateFrom', new Date(envelope.filters.decision_date.from));
      }
      if (envelope.filters.decision_date?.to) {
        setDateFilter('dateTo', new Date(envelope.filters.decision_date.to));
      }

      return envelope;
    },
    [
      setBaseFilters,
      setSelectedLanguages,
      toggleFilter,
      setDateFilter,
      toggleCustomMetadataFilter,
    ],
  );

  return { run };
}

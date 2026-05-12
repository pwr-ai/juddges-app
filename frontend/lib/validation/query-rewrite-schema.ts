import { z } from 'zod';

const numericRangeSchema = z
  .object({ min: z.number().optional(), max: z.number().optional() })
  .partial();

const baseFiltersSchema = z
  .object({
    base_num_victims: numericRangeSchema.optional(),
    base_victim_age_offence: numericRangeSchema.optional(),
    base_case_number: numericRangeSchema.optional(),
    base_co_def_acc_num: numericRangeSchema.optional(),
    base_date_of_appeal_court_judgment_ts: numericRangeSchema.optional(),
  })
  .partial()
  .default({});

const arraysSchema = z
  .object({
    keywords: z.array(z.string()).default([]),
    legal_topics: z.array(z.string()).default([]),
    cited_legislation: z.array(z.string()).default([]),
  })
  .default({ keywords: [], legal_topics: [], cited_legislation: [] });

export const queryRewriteEnvelopeSchema = z.object({
  rewritten_query: z.string().min(1),
  filters: z
    .object({
      base: baseFiltersSchema,
      facets: z
        .object({
          jurisdiction: z.enum(['PL', 'UK']).optional(),
          court_level: z
            .enum([
              'supreme',
              'constitutional',
              'appellate',
              'regional',
              'district',
              'local',
              'administrative',
            ])
            .optional(),
          case_type: z
            .enum(['criminal', 'civil', 'administrative', 'commercial'])
            .optional(),
          decision_type: z.enum(['judgment', 'order', 'resolution']).optional(),
          outcome: z
            .enum(['granted', 'dismissed', 'partial', 'remanded'])
            .optional(),
        })
        .default({}),
      arrays: arraysSchema,
      decision_date: z
        .object({ from: z.string().optional(), to: z.string().optional() })
        .partial()
        .optional(),
      languages: z.array(z.string()).default([]),
    })
    .default({
      base: {},
      facets: {},
      arrays: { keywords: [], legal_topics: [], cited_legislation: [] },
      languages: [],
    }),
  diagnostics: z
    .object({
      dropped_terms: z.array(z.string()).default([]),
      latency_ms: z.number().int().nonnegative().default(0),
      model: z.string().default('gpt-5-mini'),
    })
    .default({ dropped_terms: [], latency_ms: 0, model: 'gpt-5-mini' }),
  degraded: z.boolean().default(false),
});

export const queryRewriteRequestSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(2000)
    .refine((v) => v.trim().length > 0, 'query must not be blank'),
  languages_hint: z.array(z.string()).optional(),
});

export type QueryRewriteEnvelope = z.infer<typeof queryRewriteEnvelopeSchema>;
export type QueryRewriteRequestBody = z.infer<typeof queryRewriteRequestSchema>;

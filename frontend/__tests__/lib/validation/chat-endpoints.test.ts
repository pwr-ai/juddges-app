/**
 * Tests for validation/chat-endpoints.ts
 *
 * Covers: chatMessageSchema, chatRequestSchema, searchQueryRequestSchema,
 * enhanceQueryRequestSchema.
 */

import {
  chatMessageSchema as chatHistoryMessageSchema,
  chatRequestSchema,
  searchQueryRequestSchema,
  enhanceQueryRequestSchema,
} from '@/lib/validation/chat-endpoints';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('chatMessageSchema (chat history)', () => {
  it.each(['human', 'ai', 'user', 'assistant', 'system'] as const)(
    'accepts role "%s"',
    (role) => {
      const result = chatHistoryMessageSchema.safeParse({ role, content: 'Hello' });
      expect(result.success).toBe(true);
    }
  );

  it('rejects unknown role', () => {
    const result = chatHistoryMessageSchema.safeParse({ role: 'bot', content: 'Hi' });
    expect(result.success).toBe(false);
  });

  it('rejects empty content', () => {
    const result = chatHistoryMessageSchema.safeParse({ role: 'user', content: '' });
    expect(result.success).toBe(false);
  });
});

describe('chatRequestSchema', () => {
  it('accepts minimal valid request', () => {
    const result = chatRequestSchema.safeParse({ question: 'What is tort law?' });
    expect(result.success).toBe(true);
  });

  it('applies default values', () => {
    const result = chatRequestSchema.safeParse({ question: 'Hello' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.response_format).toBe('detailed');
    }
  });

  it('rejects empty question', () => {
    const result = chatRequestSchema.safeParse({ question: '' });
    expect(result.success).toBe(false);
  });

  it('rejects question over 10000 chars', () => {
    const result = chatRequestSchema.safeParse({ question: 'x'.repeat(10001) });
    expect(result.success).toBe(false);
  });

  it('accepts valid response_format values', () => {
    for (const format of ['detailed', 'concise', 'structured', 'short', 'adaptive']) {
      const result = chatRequestSchema.safeParse({
        question: 'test',
        response_format: format,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid response_format', () => {
    const result = chatRequestSchema.safeParse({
      question: 'test',
      response_format: 'verbose',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid chat_history', () => {
    const result = chatRequestSchema.safeParse({
      question: 'Follow up',
      chat_history: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects chat_history with more than 50 messages', () => {
    const history = Array.from({ length: 51 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
    }));
    const result = chatRequestSchema.safeParse({
      question: 'test',
      chat_history: history,
    });
    expect(result.success).toBe(false);
  });

  it('validates score_threshold range', () => {
    expect(chatRequestSchema.safeParse({ question: 'q', score_threshold: -0.1 }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ question: 'q', score_threshold: 1.1 }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ question: 'q', score_threshold: 0.5 }).success).toBe(true);
  });

  it('validates max_documents range', () => {
    expect(chatRequestSchema.safeParse({ question: 'q', max_documents: 0 }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ question: 'q', max_documents: 101 }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ question: 'q', max_documents: 50 }).success).toBe(true);
  });

  it('rejects unknown properties (strict mode)', () => {
    const result = chatRequestSchema.safeParse({
      question: 'test',
      extra_field: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('searchQueryRequestSchema', () => {
  it('accepts minimal query', () => {
    const result = searchQueryRequestSchema.safeParse({ query: 'test' });
    expect(result.success).toBe(true);
  });

  it('rejects empty query', () => {
    const result = searchQueryRequestSchema.safeParse({ query: '' });
    expect(result.success).toBe(false);
  });

  it('rejects query over 1000 chars', () => {
    const result = searchQueryRequestSchema.safeParse({ query: 'x'.repeat(1001) });
    expect(result.success).toBe(false);
  });

  it('validates collection_id as UUID', () => {
    expect(
      searchQueryRequestSchema.safeParse({ query: 'test', collection_id: 'not-uuid' }).success
    ).toBe(false);
    expect(
      searchQueryRequestSchema.safeParse({ query: 'test', collection_id: VALID_UUID }).success
    ).toBe(true);
  });

  it('validates limit range', () => {
    expect(searchQueryRequestSchema.safeParse({ query: 'test', limit: 0 }).success).toBe(false);
    expect(searchQueryRequestSchema.safeParse({ query: 'test', limit: 101 }).success).toBe(false);
  });

  it('validates offset non-negative', () => {
    expect(searchQueryRequestSchema.safeParse({ query: 'test', offset: -1 }).success).toBe(false);
    expect(searchQueryRequestSchema.safeParse({ query: 'test', offset: 0 }).success).toBe(true);
  });
});

describe('enhanceQueryRequestSchema', () => {
  it('accepts minimal request', () => {
    const result = enhanceQueryRequestSchema.safeParse({ query: 'improve this' });
    expect(result.success).toBe(true);
  });

  it('rejects empty query', () => {
    const result = enhanceQueryRequestSchema.safeParse({ query: '' });
    expect(result.success).toBe(false);
  });

  it('accepts optional context', () => {
    const result = enhanceQueryRequestSchema.safeParse({
      query: 'test',
      context: 'some context',
    });
    expect(result.success).toBe(true);
  });

  it('rejects context over 5000 chars', () => {
    const result = enhanceQueryRequestSchema.safeParse({
      query: 'test',
      context: 'x'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid language values', () => {
    for (const lang of ['pl', 'en', 'uk']) {
      const result = enhanceQueryRequestSchema.safeParse({
        query: 'test',
        language: lang,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid language', () => {
    const result = enhanceQueryRequestSchema.safeParse({
      query: 'test',
      language: 'fr',
    });
    expect(result.success).toBe(false);
  });
});

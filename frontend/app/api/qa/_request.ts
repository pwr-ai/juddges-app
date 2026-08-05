export function buildQaRequest(body: unknown): unknown {
  const input = body && typeof body === 'object'
    ? (body as Record<string, unknown>)
    : {};

  return {
    input: {
      question: input.question,
      max_documents: input.max_documents ?? 0,
      score_threshold: input.score_threshold ?? 0,
      chat_history: input.chat_history ?? [],
    },
    config: {},
    kwargs: {},
  };
}

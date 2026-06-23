import {
  fetchTopicModeling,
  topicModelingQueryKey,
  TREND_META,
  DEFAULT_TOPIC_MODELING_REQUEST,
  type TopicModelingResponse,
} from "@/lib/api/topic-modeling";

const sampleResponse: TopicModelingResponse = {
  topics: [
    {
      topic_id: 0,
      label: "umowa / najmu / lokalu",
      keywords: [
        { word: "umowa", weight: 0.42 },
        { word: "najmu", weight: 0.31 },
      ],
      document_count: 18,
      coherence_score: 0.62,
      trend: "emerging",
      trend_slope: 0.004,
      time_series: [
        {
          period_label: "2021",
          start_date: "2021-01-01",
          end_date: "2021-12-31",
          document_count: 5,
          topic_weight: 0.1,
        },
      ],
      top_documents: [
        {
          document_id: "pl-judgment-123",
          title: "Wyrok w sprawie najmu",
          document_type: "judgment",
          date_issued: "2021-05-01",
          relevance: 0.88,
        },
      ],
    },
  ],
  statistics: {
    total_documents: 200,
    documents_with_dates: 180,
    num_topics: 1,
    num_time_periods: 1,
    date_range_start: "2021-01-01",
    date_range_end: "2021-12-31",
    avg_topic_coherence: 0.62,
    processing_time_ms: 1234.5,
  },
};

describe("topic-modeling client", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("posts the request body to the proxy route and returns parsed data", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => sampleResponse,
    });

    const result = await fetchTopicModeling(DEFAULT_TOPIC_MODELING_REQUEST);

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/topic-modeling/analyze",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(DEFAULT_TOPIC_MODELING_REQUEST),
      }),
    );
    expect(result.topics[0].label).toBe("umowa / najmu / lokalu");
    expect(result.statistics.num_topics).toBe(1);
  });

  it("throws with the backend error message on failure", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Rate limit exceeded" }),
    });

    await expect(fetchTopicModeling({})).rejects.toThrow("Rate limit exceeded");
  });

  it("throws a default message when the error body is unparseable", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error("not json");
      },
    });

    await expect(fetchTopicModeling({})).rejects.toThrow(
      "Failed to analyze topics",
    );
  });

  it("builds a stable, request-scoped query key", () => {
    const req = { num_topics: 5 };
    expect(topicModelingQueryKey(req)).toEqual([
      "topic-modeling",
      "analyze",
      req,
    ]);
  });

  it("exposes trend metadata for every trend direction", () => {
    expect(TREND_META.emerging.label).toBe("Emerging");
    expect(TREND_META.stable.label).toBe("Stable");
    expect(TREND_META.declining.label).toBe("Declining");
  });
});

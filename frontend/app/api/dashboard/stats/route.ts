import { NextResponse } from "next/server";
import { getBackendUrl } from "../../utils/backend-url";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const backendUrl = getBackendUrl();

    const response = await fetch(
      `${backendUrl}/dashboard/stats`,
      {
        headers: {
          "X-API-Key": process.env.BACKEND_API_KEY || "",
        },
        // Disable cache temporarily to get fresh data
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("[Dashboard Stats] Error response: ", errorText);
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const data = await response.json();

    // Return with Cache-Control headers for CDN/browser caching
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=14400, s-maxage=14400',
      },
    });
  } catch (error) {
    logger.error("[Dashboard Stats] Error fetching dashboard stats: ", error);
    // Return default values on error
    const defaultData = {
      total_judgments: 0,
      jurisdictions: { PL: 0, UK: 0 },
      court_levels: [],
      top_courts: [],
      decisions_per_year: [],
      date_range: { oldest: null, newest: null },
      case_types: [],
      data_completeness: {
        embeddings_pct: 0,
        structure_extraction_pct: 0,
        deep_analysis_pct: 0,
        with_summary_pct: 0,
        with_keywords_pct: 0,
        with_legal_topics_pct: 0,
        with_cited_legislation_pct: 0,
        avg_text_length_chars: 0,
      },
      top_legal_domains: [],
      top_keywords: [],
      top_cited_legislation: [],
      complexity_metrics: {
        avg_complexity: null,
        avg_reasoning_quality: null,
        precedential_value_distribution: {},
        research_value_distribution: {},
      },
      judicial_tones: [],
      computed_at: null,
    };
    return NextResponse.json(defaultData);
  }
}

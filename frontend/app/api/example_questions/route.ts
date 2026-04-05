import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

const BACKEND_URL = process.env.API_BASE_URL || "http://localhost:8000";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY;

interface ExampleQuestionsResponse {
  questions: string[];
}

interface CacheEntry {
  data: string[];
  timestamp: number;
}

// In-memory cache for example questions
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Generate cache key from request parameters
function getCacheKey(numPolish: string, numEnglish: string): string {
  return `example_questions:${numPolish}:${numEnglish}`;
}

// Get cached questions if available and not expired
function getCachedQuestions(key: string): string[] | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  // Remove expired entry
  if (cached) {
    cache.delete(key);
  }
  return null;
}

// Generate ETag from data
function generateETag(data: string[]): string {
  const content = JSON.stringify(data);
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `"${Math.abs(hash).toString(36)}"`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const numPolish = searchParams.get("num_polish") || "2";
    const numEnglish = searchParams.get("num_english") || "2";
    const cacheKey = getCacheKey(numPolish, numEnglish);

    // Check cache first
    const cachedData = getCachedQuestions(cacheKey);
    if (cachedData) {
      const etag = generateETag(cachedData);
      const ifNoneMatch = request.headers.get("if-none-match");

      // Return 304 Not Modified if ETag matches
      if (ifNoneMatch === etag) {
        return new NextResponse(null, { status: 304 });
      }

      return NextResponse.json(
        { questions: cachedData },
        {
          headers: {
            "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
            "ETag": etag,
          },
        }
      );
    }

    // Cache miss - fetch from backend
    const url = `${BACKEND_URL}/example_questions?num_polish=${numPolish}&num_english=${numEnglish}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": BACKEND_API_KEY || "",
      },
      // Add cache control to backend request
      next: { revalidate: 300 }, // Revalidate every 5 minutes
    });

    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status}`);
    }

    const data: ExampleQuestionsResponse = await response.json();

    // Store in cache
    cache.set(cacheKey, {
      data: data.questions,
      timestamp: Date.now(),
    });

    // Clean up old cache entries (keep cache size reasonable)
    if (cache.size > 100) {
      const oldestKey = Array.from(cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0]?.[0];
      if (oldestKey) {
        cache.delete(oldestKey);
      }
    }

    const etag = generateETag(data.questions);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
        "ETag": etag,
      },
    });
  } catch (error) {
    logger.error("Error fetching example questions: ", error);
    return NextResponse.json(
      { error: "Failed to fetch example questions" },
      { status: 500 }
    );
  }
}

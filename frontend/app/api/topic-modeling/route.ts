import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';

const routeLogger = logger.child('topic-modeling');

/**
 * POST /api/topic-modeling - Run topic modeling analysis
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const backendUrl = process.env.API_BASE_URL || 'http://backend:8000';
    const apiKey = process.env.BACKEND_API_KEY || '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    const response = await fetch(`${backendUrl}/topic-modeling/analyze`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      routeLogger.error('Backend error', { status: response.status, data });
      return NextResponse.json(
        { error: data.detail || 'Failed to analyze topics' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    routeLogger.error('Error in topic-modeling proxy', error);
    return NextResponse.json(
      { error: 'Failed to connect to backend service' },
      { status: 503 }
    );
  }
}

/**
 * GET /api/topic-modeling - Quick trending topics
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const backendUrl = process.env.API_BASE_URL || 'http://backend:8000';
    const apiKey = process.env.BACKEND_API_KEY || '';

    const { searchParams } = new URL(request.url);
    const numTopics = searchParams.get('num_topics') || '5';
    const sampleSize = searchParams.get('sample_size') || '200';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    const response = await fetch(
      `${backendUrl}/topic-modeling/trending?num_topics=${numTopics}&sample_size=${sampleSize}`,
      { headers }
    );

    const data = await response.json();

    if (!response.ok) {
      routeLogger.error('Backend error', { status: response.status, data });
      return NextResponse.json(
        { error: data.detail || 'Failed to fetch trending topics' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    routeLogger.error('Error in trending topics proxy', error);
    return NextResponse.json(
      { error: 'Failed to connect to backend service' },
      { status: 503 }
    );
  }
}

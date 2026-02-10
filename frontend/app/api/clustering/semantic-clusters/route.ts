import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';

const routeLogger = logger.child('clustering-semantic');

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

    const response = await fetch(`${backendUrl}/clustering/semantic-clusters`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      routeLogger.error('Backend error', { status: response.status, data });
      return NextResponse.json(
        { error: data.detail || 'Failed to generate semantic clusters' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    routeLogger.error('Error in clustering proxy', error);
    return NextResponse.json(
      { error: 'Failed to connect to backend service' },
      { status: 503 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';

const routeLogger = logger.child('search');

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();

    // Use API_BASE_URL to match other API routes in the codebase
    const backendUrl = process.env.API_BASE_URL || 'http://backend:8000';
    const apiKey = process.env.BACKEND_API_KEY || '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    // Ensure api_version is set to "enhanced" (default) if not provided
    const requestBody = {
      ...body,
      api_version: body.api_version || 'enhanced',
    };

    const response = await fetch(`${backendUrl}/documents/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorDetail = 'Failed to search documents';
      try {
        const data = await response.json();
        errorDetail = data.detail || errorDetail;
      } catch {
        const text = await response.text();
        errorDetail = `Backend error ${response.status}: ${text.slice(0, 200)}`;
      }
      routeLogger.error('Backend error', { status: response.status, error: errorDetail });
      return NextResponse.json(
        { error: errorDetail },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    routeLogger.error('Error in search proxy', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: 'Failed to connect to backend service',
        details: errorMessage,
        hint: 'Check if backend service is running and API_BASE_URL environment variable is set correctly'
      },
      { status: 503 }
    );
  }
}

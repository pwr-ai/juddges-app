import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';

const routeLogger = logger.child('graphql');

/**
 * Proxy GraphQL requests from the frontend to the backend GraphQL endpoint.
 * Follows the same pattern as other API routes in this project.
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

    const response = await fetch(`${backendUrl}/graphql`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      routeLogger.error('GraphQL backend error', { status: response.status, data });
      return NextResponse.json(
        { errors: [{ message: data.detail || 'GraphQL request failed' }] },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    routeLogger.error('Error in GraphQL proxy', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        errors: [
          {
            message: 'Failed to connect to GraphQL backend service',
            extensions: {
              details: errorMessage,
              hint: 'Check if backend service is running and API_BASE_URL is set correctly',
            },
          },
        ],
      },
      { status: 503 }
    );
  }
}

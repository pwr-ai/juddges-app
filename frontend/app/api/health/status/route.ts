/**
 * Next.js API Route: Health Status Proxy
 * This route proxies requests to the backend health status endpoint
 * with server-side API key authentication
 */

import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.API_BASE_URL || 'http://localhost:8004';
const API_KEY = process.env.BACKEND_API_KEY;

export async function GET() {
  try {
    if (!API_KEY) {
      console.error('BACKEND_API_KEY not configured');
      return NextResponse.json(
        { error: 'Server configuration error: API key not set' },
        { status: 500 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/health/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      cache: 'no-store', // Don't cache the response
    });

    const data = await response.json();

    // For 503, backend includes status in detail field
    if (!response.ok) {
      if (response.status === 503) {
        return NextResponse.json(data.detail || data, { status: 200 });
      }
      return NextResponse.json(
        { error: `Backend error: ${response.statusText}` },
        { status: response.status }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('Failed to fetch health status:', error);
    return NextResponse.json(
      {
        error: 'Failed to connect to backend',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

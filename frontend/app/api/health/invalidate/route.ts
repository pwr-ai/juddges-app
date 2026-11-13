/**
 * Next.js API Route: Invalidate Health Status Cache
 * This route proxies requests to invalidate the backend health status cache
 * with server-side API key authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { withClientIp } from '@/app/api/_lib/client-ip';
import { logger } from "@/lib/logger";

const BACKEND_URL = process.env.API_BASE_URL || 'http://localhost:8004';
const API_KEY = process.env.BACKEND_API_KEY;

export async function POST(request: NextRequest) {
  try {
    if (!API_KEY) {
      logger.error('BACKEND_API_KEY not configured');
      return NextResponse.json(
        { error: 'Server configuration error: API key not set' },
        { status: 500 }
      );
    }

    const response = await fetch(`${BACKEND_URL}/health/status/invalidate`, {
      method: 'POST',
      headers: withClientIp({
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      }, request),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Backend error: ${response.statusText}` },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error('Failed to invalidate cache:', error);
    return NextResponse.json(
      {
        error: 'Failed to connect to backend',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

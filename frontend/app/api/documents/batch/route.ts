import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';

const backendUrl = getBackendUrl();
const apiKey = process.env.BACKEND_API_KEY || '';

/**
 * GET /api/documents/batch?ids=id1,id2,id3
 * Fetches multiple documents by their IDs (used by chat sources)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids');

    if (!idsParam) {
      return NextResponse.json(
        { error: 'Missing required parameter: ids' },
        { status: 400 }
      );
    }

    // Split comma-separated IDs
    const documentIds = idsParam.split(',').map(id => id.trim()).filter(id => id.length > 0);

    if (documentIds.length === 0) {
      return NextResponse.json(
        { error: 'No valid document IDs provided' },
        { status: 400 }
      );
    }

    // Prepare backend request body with minimal return_properties for source cards
    // Only fetch essential fields needed for displaying source cards in chat
    const body = {
      document_ids: documentIds,
      return_vectors: false,
      return_properties: [
        'document_id',
        'title',
        'document_type',
        'date_issued',
        'document_number',
        'summary',
      ],
    };

    // Call backend API
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'X-User-ID': userData.user.id,
    };

    const response = await fetch(`${backendUrl}/documents/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[documents/batch GET] Backend error: ${response.status}`, data);
      return NextResponse.json(
        { error: data.detail || 'Failed to fetch documents by IDs' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in documents/batch GET proxy:', error);
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

/**
 * POST /api/documents/batch
 * Fetches multiple documents by their IDs (legacy endpoint, kept for compatibility)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Connecting to backend
    logger.debug('[documents/batch POST] Calling backend', { url: `${backendUrl}/documents/batch` });
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'X-User-ID': userData.user.id,
    };
    
    const response = await fetch(`${backendUrl}/documents/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[documents/batch POST] Backend error: ${response.status}`, data);
      return NextResponse.json(
        { error: data.detail || 'Failed to fetch documents by IDs' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in documents/batch POST proxy:', error);
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

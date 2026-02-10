import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    
    // Use API_BASE_URL to match other API routes in the codebase
    const backendUrl = process.env.API_BASE_URL || 'http://backend:8000';
    const apiKey = process.env.BACKEND_API_KEY || '';
    
    // Connecting to backend
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }
    
    const response = await fetch(`${backendUrl}/documents/chunks/fetch`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[chunks/fetch] Backend error: ${response.status}`, data);
      return NextResponse.json(
        { error: data.detail || 'Failed to fetch chunks by UUID' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in chunks/fetch proxy:', error);
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


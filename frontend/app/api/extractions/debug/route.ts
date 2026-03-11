import { NextResponse, NextRequest } from "next/server";
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * TEMPORARY DEBUG ENDPOINT - NO DATABASE ACCESS, NO AUTH
 * This endpoint returns sample extraction results from JSON file only.
 * Completely bypasses middleware and authentication.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');

    // Read sample file directly - NO DATABASE ACCESS
    const samplePath = join(process.cwd(), 'frontend', 'samples', 'extraction-results-sample.json');
    const sampleData = await readFile(samplePath, 'utf-8');
    const parsed = JSON.parse(sampleData);

    // Apply limit if specified
    const results = limit > 0 ? parsed.slice(0, limit) : parsed;

    return NextResponse.json({
      count: results.length,
      results: results,
      source: 'sample_file',
      total_available: parsed.length
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    });
  } catch (error) {
    console.error("Error reading sample file: ", error);
    return NextResponse.json(
      {
        error: "Failed to read sample file",
        details: error instanceof Error ? error.message : String(error),
        path: join(process.cwd(), 'frontend', 'samples', 'extraction-results-sample.json')
      },
      { status: 500 }
    );
  }
}

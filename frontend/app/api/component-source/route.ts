import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { logger } from "@/lib/logger";

/**
 * API route to read component source files
 * This allows the frontend to get component source code for automatic color extraction
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const componentPath = searchParams.get('path');

    if (!componentPath) {
      return NextResponse.json(
        { error: 'Component path is required' },
        { status: 400 }
      );
    }

    // Security: Only allow reading from lib/styles/components directory
    if (!componentPath.startsWith('@/lib/styles/components/') &&
        !componentPath.startsWith('lib/styles/components/')) {
      return NextResponse.json(
        { error: 'Invalid component path' },
        { status: 403 }
      );
    }

    // Resolve the actual file path
    // Handle both @/lib/styles/components/... and lib/styles/components/... paths
    let relativePath = componentPath.replace('@/', '');
    if (!relativePath.startsWith('lib/')) {
      relativePath = `lib/${relativePath}`;
    }

    // In Next.js, process.cwd() is the app root (frontend directory)
    // So we can directly join with the relative path
    const filePath = join(process.cwd(), relativePath);

    // Read the file
    const sourceCode = await readFile(filePath, 'utf-8');

    return NextResponse.json({ sourceCode });
  } catch (error) {
    logger.error('Error reading component source:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read component source' },
      { status: 500 }
    );
  }
}

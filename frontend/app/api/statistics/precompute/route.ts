import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { withWeaviateClient, getWeaviateCollection } from '@/lib/weaviate-connection';
import { weaviateToSearchDocument, createFullTextPreview } from '@/lib/weaviate-utils';
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  AppError,
  ErrorCode
} from '@/lib/errors';

const apiLogger = logger.child('precompute-api');

// Enhanced cache with precomputed statistics
interface PrecomputedData {
  data: unknown;
  timestamp: number;
  isPrecomputed: boolean;
}

const precomputedCache = new Map<string, PrecomputedData>();

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('POST /api/statistics/precompute started', { requestId });

    // Check if we should clear cache first
    const { searchParams } = new URL(request.url);
    const clearCache = searchParams.get('clearCache') === 'true';

    if (clearCache) {
      precomputedCache.clear();
      apiLogger.info('Cache cleared', { requestId });
    }

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Use centralized Weaviate connection utility
    try {
      const result = await withWeaviateClient(async (client) => {
        apiLogger.info('Starting precomputation of statistics', { requestId });

        const [documentsCollection, chunksCollection] = await Promise.all([
          getWeaviateCollection(client, 'LegalDocuments'),
          getWeaviateCollection(client, 'DocumentChunks')
        ]);

        // Get basic counts
        const [documentsCount, chunksCount] = await Promise.all([
          documentsCollection.aggregate.overAll(),
          chunksCollection.aggregate.overAll()
        ]);

        // Get document type and country distributions - disabled for now
        // const [documentTypeStats, countryStats] = await Promise.all([
        //   documentsCollection.aggregate.overAll({
        //     returnMetrics: documentsCollection.metrics.aggregate('document_type')
        //       .text(
        //         ['count'],
        //         1 // minOccurrences - threshold minimum count
        //       )
        //   }),
        //   documentsCollection.aggregate.overAll({
        //     returnMetrics: documentsCollection.metrics.aggregate('country')
        //       .text(
        //         ['count'],
        //         1 // minOccurrences - threshold minimum count
        //       )
        //   })
        // ]);

        // Log exact Weaviate response for debugging
        // console.log('Weaviate document type response:', JSON.stringify(documentTypeStats, null, 2));
        // console.log('Weaviate country response:', JSON.stringify(countryStats, null, 2));

        // Get a sample document
        const sampleDocumentResult = await documentsCollection.query.fetchObjects({
          limit: 100,
        });

        const randomIndex = Math.floor(Math.random() * sampleDocumentResult.objects.length);
        const sampleDocumentObj = sampleDocumentResult.objects[randomIndex];

        const precomputedStats = {
          totalDocuments: documentsCount.totalCount || 0,
          totalChunks: chunksCount.totalCount || 0,
          documentTypes: [],
          countries: [],
          sampleDocument: sampleDocumentObj ? (() => {
            const convertedDoc = weaviateToSearchDocument(sampleDocumentObj, sampleDocumentObj.uuid);
            return {
              ...convertedDoc,
              full_text_preview: createFullTextPreview(convertedDoc.full_text, 500)
            };
          })() : null,
          precomputedAt: new Date().toISOString()
        };

        // Store in cache with precomputed flag
        precomputedCache.set('statistics', {
          data: precomputedStats,
          timestamp: Date.now(),
          isPrecomputed: true
        });

        apiLogger.info('Precomputation completed successfully', { requestId });

        return {
          message: 'Statistics precomputed successfully',
          completedAt: new Date().toISOString()
        };
      });

      apiLogger.info('POST /api/statistics/precompute completed', { requestId });

      return NextResponse.json(result);

    } catch (weaviateError) {
      apiLogger.error('Failed to connect to Weaviate', weaviateError, { requestId });
      throw new AppError(
        "Weaviate connection failed. Please ensure Weaviate is running.",
        ErrorCode.INTERNAL_ERROR,
        503
      );
    }

  } catch (error) {
    apiLogger.error("POST /api/statistics/precompute failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to precompute statistics",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}

/**
 * GET /api/statistics/precompute - Retrieve precomputed statistics from cache
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('GET /api/statistics/precompute started', { requestId });

    const precomputed = precomputedCache.get('statistics');

    if (precomputed && precomputed.isPrecomputed) {
      apiLogger.info('GET /api/statistics/precompute completed', {
        requestId,
        cacheAge: Date.now() - precomputed.timestamp
      });

      return NextResponse.json({
        ...(precomputed.data as object),
        fromPrecomputed: true,
        cacheAge: Date.now() - precomputed.timestamp
      });
    }

    apiLogger.warn('No precomputed statistics available', { requestId });

    return NextResponse.json(
      new AppError(
        "No precomputed statistics available. Run POST to precompute.",
        ErrorCode.NOT_FOUND,
        404
      ).toErrorDetail(),
      { status: 404 }
    );
  } catch (error) {
    apiLogger.error("GET /api/statistics/precompute failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to retrieve precomputed statistics",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
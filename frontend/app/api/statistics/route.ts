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

const apiLogger = logger.child('statistics-api');

// Cache for storing statistics data
interface CacheData {
  data: unknown;
  timestamp: number;
}

interface PrecomputedCacheData {
  data: unknown;
  timestamp: number;
  isPrecomputed: boolean;
}

const cache = new Map<string, CacheData>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Import precomputed cache (shared)
const precomputedCache = new Map<string, PrecomputedCacheData>();

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('GET /api/statistics started', { requestId });

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Check precomputed cache first (highest priority)
    const precomputed = precomputedCache.get('statistics');
    if (precomputed && precomputed.isPrecomputed) {
      return NextResponse.json({
        ...(precomputed.data as object),
        fromPrecomputed: true,
        cacheAge: Date.now() - precomputed.timestamp
      });
    }

    // Check regular cache second (only for counts, not for sample document)
    const cacheKey = 'statistics_counts';
    const cachedData = cache.get(cacheKey);
    const now = Date.now();

    let totalDocuments: number | null = null;
    let totalChunks: number | null = null;
    let documentTypes: Array<{ type: string; count: number }> | null = null;
    let countries: Array<{ country: string; count: number }> | null = null;
    let cachedCountsData: {
      totalDocuments?: number;
      totalChunks?: number;
      documentTypes?: Array<{ type: string; count: number }>;
      countries?: Array<{ country: string; count: number }>;
    } | null = null;

    // Use cached counts if available
    if (cachedData && (now - cachedData.timestamp) < CACHE_TTL) {
      cachedCountsData = cachedData.data as {
        totalDocuments?: number;
        totalChunks?: number;
        documentTypes?: Array<{ type: string; count: number }>;
        countries?: Array<{ country: string; count: number }>;
      };
      totalDocuments = cachedCountsData.totalDocuments ?? null;
      totalChunks = cachedCountsData.totalChunks ?? null;
      documentTypes = cachedCountsData.documentTypes ?? null;
      countries = cachedCountsData.countries ?? null;
    }

    // Use centralized Weaviate connection utility
    try {
      const statistics = await withWeaviateClient(async (client) => {
        // Get collections
        const [documentsCollection, chunksCollection] = await Promise.all([
          getWeaviateCollection(client, 'LegalDocuments'),
          getWeaviateCollection(client, 'DocumentChunks')
        ]);

        const errors: string[] = [];

        // If counts are not cached, fetch them
        if (!cachedCountsData) {
          const [
            documentsCountResult,
            chunksCountResult,
          ] = await Promise.allSettled([
            documentsCollection.aggregate.overAll(),
            chunksCollection.aggregate.overAll(),
          ]);

          totalDocuments = documentsCountResult.status === 'fulfilled'
            ? (documentsCountResult.value.totalCount || 0)
            : null;

          totalChunks = chunksCountResult.status === 'fulfilled'
            ? (chunksCountResult.value.totalCount || 0)
            : null;

          if (documentsCountResult.status === 'rejected') {
            apiLogger.error('Documents count failed', documentsCountResult.reason, { requestId });
            errors.push('documents_count');
          }
          if (chunksCountResult.status === 'rejected') {
            apiLogger.error('Chunks count failed', chunksCountResult.reason, { requestId });
            errors.push('chunks_count');
          }

          // Cache the counts for 24 hours
          cache.set(cacheKey, {
            data: { totalDocuments, totalChunks, documentTypes, countries },
            timestamp: now
          });
        }

        // Always fetch a fresh random document (never cached)
        let sampleDocument = null;

        try {
          // Fetch a larger batch and filter client-side for documents with factual_state
          // Note: We can&apos;t use server-side null filtering because factual_state doesn&apos;t have indexNullState enabled
          apiLogger.info('Fetching random documents', { requestId, limit: 500 });
          const sampleDocumentResult = await documentsCollection.query.fetchObjects({
            limit: 500  // Fetch more to increase chances of finding docs with factual_state
          });

          if (sampleDocumentResult?.objects && sampleDocumentResult.objects.length > 0) {
            apiLogger.info('Fetched documents', {
              requestId,
              count: sampleDocumentResult.objects.length
            });

            // Filter client-side for documents with factual_state
            const docsWithFactualState = sampleDocumentResult.objects.filter(doc => {
              const props = doc.properties as Record<string, unknown>;
              return props.factual_state &&
                     typeof props.factual_state === 'string' &&
                     props.factual_state.trim().length > 10;  // At least 10 characters
            });

            apiLogger.info('Filtered documents with factual_state', {
              requestId,
              docsWithFactualState: docsWithFactualState.length
            });

            // Use docs with factual_state if available, otherwise use all
            const availableDocs = docsWithFactualState.length > 0 ? docsWithFactualState : sampleDocumentResult.objects;

            if (availableDocs.length > 0) {
              // Pick a random document from the results
              const randomIndex = Math.floor(Math.random() * availableDocs.length);
              const selectedDoc = availableDocs[randomIndex];
              const convertedDoc = weaviateToSearchDocument(selectedDoc, selectedDoc.uuid);
              sampleDocument = {
                ...convertedDoc,
                full_text_preview: createFullTextPreview(convertedDoc.full_text, 500)
              };
              apiLogger.info('Selected sample document', {
                requestId,
                documentId: convertedDoc.document_id,
                hasFactualState: !!convertedDoc.factual_state,
                factualStateLength: convertedDoc.factual_state?.length || 0
              });
            }
          } else {
            apiLogger.warn('No documents found in Weaviate', { requestId });
          }
        } catch (sampleError) {
          apiLogger.error('Sample document failed', sampleError, { requestId });
          errors.push('sample_document');
        }

        const statisticsData = {
          totalDocuments,
          totalChunks,
          documentTypes,
          countries,
          sampleDocument,
          errors: errors.length > 0 ? errors : undefined,
          computedAt: new Date().toISOString()
        };

        return statisticsData;
      });

      apiLogger.info('GET /api/statistics completed', {
        requestId,
        hasPrecomputed: false,
        hasData: !!statistics.sampleDocument
      });

      return NextResponse.json(statistics);

    } catch (weaviateError) {
      apiLogger.error('Failed to connect to Weaviate', weaviateError, { requestId });
      // Return statistics with null values and appropriate error
      return NextResponse.json({
        totalDocuments: null,
        totalChunks: null,
        documentTypes: null,
        countries: null,
        sampleDocument: null,
        errors: ['weaviate_connection'],
        computedAt: new Date().toISOString()
      });
    }

  } catch (error) {
    apiLogger.error("GET /api/statistics failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to fetch statistics",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}

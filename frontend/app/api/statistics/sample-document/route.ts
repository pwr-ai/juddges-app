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

const apiLogger = logger.child('sample-document-api');

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('GET /api/statistics/sample-document started', { requestId });

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Use centralized Weaviate connection utility
    try {
      const sampleDocument = await withWeaviateClient(async (client) => {
        // Get the documents collection
        const documentsCollection = await getWeaviateCollection(client, 'LegalDocuments');

        // Fetch a larger batch and filter client-side for documents with factual_state
        // Note: We can&apos;t use server-side null filtering because factual_state doesn&apos;t have indexNullState enabled
        const batchSize = 500; // Fetch 500 documents to increase chances of finding docs with factual_state
        apiLogger.info('Fetching documents for new sample', { requestId, batchSize });

        const sampleDocumentResult = await documentsCollection.query.fetchObjects({
          limit: batchSize
        });

        if (!sampleDocumentResult?.objects || sampleDocumentResult.objects.length === 0) {
          throw new AppError("No documents found", ErrorCode.NOT_FOUND, 404);
        }

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

        // Pick a random document from the batch
        const randomIndex = Math.floor(Math.random() * availableDocs.length);
        const sampleDocumentObj = availableDocs[randomIndex];

        const convertedDoc = weaviateToSearchDocument(sampleDocumentObj, sampleDocumentObj.uuid);
        apiLogger.info('New sample document selected', {
          requestId,
          documentId: convertedDoc.document_id,
          hasFactualState: !!convertedDoc.factual_state,
          factualStateLength: convertedDoc.factual_state?.length || 0
        });

        return {
          ...convertedDoc,
          full_text_preview: createFullTextPreview(convertedDoc.full_text, 500)
        };
      });

      apiLogger.info('GET /api/statistics/sample-document completed', {
        requestId,
        documentId: sampleDocument.document_id
      });

      return NextResponse.json({ sampleDocument });

    } catch (weaviateError) {
      apiLogger.error('Failed to connect to Weaviate', weaviateError, { requestId });
      throw new AppError(
        "Weaviate connection failed. Please ensure Weaviate is running.",
        ErrorCode.INTERNAL_ERROR,
        503
      );
    }

  } catch (error) {
    apiLogger.error("GET /api/statistics/sample-document failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to fetch sample document",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
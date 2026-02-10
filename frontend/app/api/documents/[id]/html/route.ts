import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import {
  ValidationError,
  AppError,
  ErrorCode,
} from '@/lib/errors';

import {
  convertXmlTagsToHtml,
  fixHtmlContentServer,
  buildDocumentHtml,
} from '@/lib/parsing';

const apiLogger = logger.child('documents-html-api');
const API_KEY = process.env.BACKEND_API_KEY as string;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  let lastDiag: string[] | undefined;

  try {
    apiLogger.info('GET /api/documents/[id]/html started', { requestId });

    const { id: documentId } = await params;

    if (!documentId) {
      throw new ValidationError('Document ID is required', {
        code: ErrorCode.MISSING_REQUIRED_FIELD,
        field: 'id'
      });
    }

    const backendUrl = getBackendUrl();
    const url = `${backendUrl}/documents/${documentId}`;

    apiLogger.debug('Fetching document from backend', {
      requestId,
      documentId,
      url
    });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-API-Key': API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      apiLogger.error('Backend error fetching document HTML', {
        requestId,
        documentId,
        status: response.status,
        statusText: response.statusText,
        errorText
      });

      if (response.status === 404) {
        throw new AppError(
          `Document '${documentId}' not found`,
          ErrorCode.DOCUMENT_NOT_FOUND,
          404,
          { documentId }
        );
      }

      throw new AppError(
        `Failed to fetch document HTML: ${response.statusText}`,
        ErrorCode.INTERNAL_ERROR,
        response.status,
        { documentId, backendError: errorText }
      );
    }

    const payload = await response.json();
    const doc = payload?.document ?? payload ?? {};

    // Use whichever has content: HTML or plain text
    const content = (doc.raw_content || doc.full_text || '').toString().trim();
    const docTitle = (doc.title || 'Document').toString().trim();

    // Capture diagnostics from processing by temporarily wrapping the processor
    let fixed: string;
    try {
      // First, convert any XML tags to HTML (for Polish court documents)
      const htmlContent = convertXmlTagsToHtml(content);
      // Then process the HTML content
      fixed = buildDocumentHtml(String(fixHtmlContentServer(htmlContent)), docTitle);
    } catch (e: unknown) {
      // try to pull diag info if present
      const errorObj = e as Record<string, unknown>;
      lastDiag = (errorObj?.diagLog || (errorObj?.details as Record<string, unknown>)?.diagLog || (errorObj?.context as Record<string, unknown>)?.diagLog) as string[] | undefined;
      throw e;
    }

    return new NextResponse(fixed, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    const err = error as Record<string, unknown> || {};
    apiLogger.error('Error in documents route', {
      requestId,
      name: err?.name,
      message: err?.message,
      stack: err?.stack,
    });

    // Build HTML with embedded diagnostics (also for AppError)
    const esc = (s: string | undefined): string =>
      (s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    const errorRecord = error as Record<string, unknown>;
    const diagLines: string[] =
      lastDiag ||
      (errorRecord?.diagLog as string[]) ||
      ((errorRecord?.details as Record<string, unknown>)?.diagLog as string[]) ||
      [];
    const diagBlock = diagLines && diagLines.length
      ? `<div style="margin-top:12px"><div style="font-weight:bold">Diagnostics:</div><pre style="white-space:pre-wrap; color:#ccc">${esc(diagLines.join('\n\n'))}</pre></div>`
      : '';
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const topMsg = (err?.message as string) || (error instanceof AppError ? error.message : 'An unexpected error occurred while fetching the document html');
    const stageInfo = errorRecord?.stage ? `<div>stage: <code>${esc(String(errorRecord.stage))}</code></div>` : '';
    const diagHtml = `
<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><title>Doc HTML error</title></head>
<body style="font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; padding:16px; background:#0b0b0b; color:#eee">
  <div style="border:2px solid #c00; padding:16px; background:#1a1a1a">
    <div style="font-weight:bold; margin-bottom:8px;">[documents-html] Błąd generowania HTML</div>
    <div>message: <code>${esc(topMsg)}</code></div>
    <div>requestId: <code>${esc(requestId)}</code></div>
    <div>name: <code>${esc(String(err?.name || ''))}</code></div>
    ${stageInfo}
    <pre style="white-space:pre-wrap; margin-top:12px; color:#ccc">${esc(String(err?.stack || ''))}</pre>
    ${diagBlock}
  </div>
</body></html>`;

    return new NextResponse(diagHtml, {
      status: statusCode,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

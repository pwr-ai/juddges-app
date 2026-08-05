import { getBackendUrl } from '@/app/api/utils/backend-url'
import {
  DOCUMENT_METADATA_HEADER,
  DOCUMENT_METADATA_SIGNATURE_HEADER,
  VERIFIED_USER_HEADER,
  encodeDocumentMetadataHeader,
  isDocumentMetadata,
  signDocumentMetadataHeader,
} from '@/lib/documents/metadata-transport'
import {
  EXTRACTION_SNAPSHOT_HEADER,
  EXTRACTION_SNAPSHOT_SIGNATURE_HEADER,
  EXTRACTION_VERIFIED_USER_HEADER,
  encodeExtractionSnapshot,
  isValidExtractionJobId,
  normalizeExtractionJobPayload,
  signExtractionSnapshot,
  toExtractionJobSnapshot,
} from '@/lib/extractions/detail-contract'
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, isValidLocale } from '@/lib/i18n/config'
import type { LocaleCode } from '@/lib/i18n/types'
import { updateSessionWithAuth } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'

const DOCUMENT_PAGE_PATTERN = /^\/documents\/([^/]+)$/
const DOCUMENT_ID_PATTERN = /^[a-zA-Z0-9_.-]{1,255}$/
const DOCUMENT_METADATA_API_PATTERN =
  /^\/api\/documents\/[a-zA-Z0-9_.-]{1,255}\/metadata$/
const EXTRACTION_DETAIL_PATTERN = /^\/extractions\/([^/]+)$/

type DocumentPreflight =
  | { kind: 'not-document' }
  | { kind: 'metadata'; value: string; documentId: string }
  | { kind: 'response'; response: NextResponse }

function documentStatusResponse(status: number): NextResponse {
  const notFound = status === 404
  const title = notFound ? 'Document not found' : 'Document temporarily unavailable'
  const message = notFound
    ? 'The requested document does not exist or is not accessible.'
    : 'The service could not load this judgment. Please try again.'
  const retry = notFound ? '' : '<a href="">Try again</a>'
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head>` +
      `<body><main><p>Document service ${status}</p><h1>${title}</h1>` +
      `<p>${message}</p>${retry}</main></body></html>`,
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    },
  )
}

function metadataTimeoutMs(): number {
  const configured = Number(process.env.DOCUMENT_METADATA_TIMEOUT_MS ?? 10_000)
  return Number.isFinite(configured) && configured > 0 ? configured : 10_000
}

function isTimeoutFailure(error: unknown, signal: AbortSignal): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'TimeoutError'
  ) {
    return true
  }
  return (
    signal.aborted &&
    typeof signal.reason === 'object' &&
    signal.reason !== null &&
    'name' in signal.reason &&
    signal.reason.name === 'TimeoutError'
  )
}

async function preflightDocumentPage(
  request: NextRequest,
  userId: string,
): Promise<DocumentPreflight> {
  const match = DOCUMENT_PAGE_PATTERN.exec(request.nextUrl.pathname)
  if (!match) return { kind: 'not-document' }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return {
      kind: 'response',
      response: NextResponse.json(
        { error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
        { status: 405, headers: { Allow: 'GET, HEAD' } },
      ),
    }
  }

  let documentId: string
  try {
    documentId = decodeURIComponent(match[1])
  } catch {
    return { kind: 'response', response: documentStatusResponse(404) }
  }
  if (!DOCUMENT_ID_PATTERN.test(documentId)) {
    return { kind: 'response', response: documentStatusResponse(404) }
  }

  const timeoutSignal = AbortSignal.timeout(metadataTimeoutMs())
  try {
    const backendUrl = process.env.API_BASE_URL || 'http://localhost:8004'
    const response = await fetch(
      `${backendUrl}/documents/${encodeURIComponent(documentId)}/metadata`,
      {
        headers: {
          Accept: 'application/json',
          'X-API-Key': process.env.BACKEND_API_KEY ?? '',
          'X-User-ID': userId,
        },
        cache: 'no-store',
        signal: timeoutSignal,
      },
    )

    if (response.status === 404 || response.status === 403) {
      return { kind: 'response', response: documentStatusResponse(404) }
    }
    if (!response.ok) {
      const status = response.status >= 500 ? response.status : 502
      return { kind: 'response', response: documentStatusResponse(status) }
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return { kind: 'response', response: documentStatusResponse(502) }
    }
    if (!isDocumentMetadata(payload) || payload.document_id !== documentId) {
      return { kind: 'response', response: documentStatusResponse(502) }
    }

    return {
      kind: 'metadata',
      value: await encodeDocumentMetadataHeader(payload),
      documentId,
    }
  } catch (error) {
    return {
      kind: 'response',
      response: documentStatusResponse(
        isTimeoutFailure(error, timeoutSignal) ? 504 : 503,
      ),
    }
  }
}

function extractionStatusResponse(
  status: number,
  method: string,
): NextResponse {
  const notFound = status === 404
  const title = notFound
    ? 'Extraction job not found'
    : status === 422
      ? 'Invalid extraction job response'
      : 'Extraction job temporarily unavailable'
  const message = notFound
    ? 'The requested extraction job does not exist or is not accessible.'
    : status === 422
      ? 'The extraction service could not process this job status request.'
      : `The extraction service failed with status ${status}. Please try again.`
  const body =
    method === 'HEAD'
      ? null
      : `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head>` +
        `<body><main><p>Extraction service ${status}</p><h1>${title}</h1>` +
        `<p>${message}</p>${notFound ? '' : '<a href="">Try again</a>'}</main></body></html>`
  return new NextResponse(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  })
}

function extractionTimeoutMs(): number {
  const configured = Number(process.env.EXTRACTION_DETAIL_TIMEOUT_MS ?? 10_000)
  return Number.isFinite(configured) && configured > 0 ? configured : 10_000
}

function isExtractionTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  )
}

function copyCookies(source: NextResponse, target: NextResponse): void {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie))
}

function finishResponse(
  target: NextResponse,
  sessionResponse: NextResponse,
  locale: LocaleCode,
  localeNeedsWrite: boolean,
): NextResponse {
  if (target !== sessionResponse) copyCookies(sessionResponse, target)
  if (localeNeedsWrite) {
    target.cookies.set(LOCALE_COOKIE_NAME, locale, {
      path: '/',
      maxAge: 31536000,
      sameSite: 'lax',
    })
  }
  target.headers.set('x-locale', locale)
  return target
}

function detectLocale(request: NextRequest): LocaleCode {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value
  if (cookieLocale && isValidLocale(cookieLocale)) return cookieLocale

  const acceptLanguage = request.headers.get('accept-language')
  if (acceptLanguage) {
    const languages = acceptLanguage
      .split(',')
      .map((lang) => {
        const [code, q = '1'] = lang.trim().split(';q=')
        return { code: code.split('-')[0].toLowerCase(), quality: parseFloat(q) }
      })
      .sort((a, b) => b.quality - a.quality)
    for (const lang of languages) {
      if (isValidLocale(lang.code)) return lang.code
    }
  }
  return DEFAULT_LOCALE
}

export async function middleware(incomingRequest: NextRequest) {
  const locale = detectLocale(incomingRequest)
  const existingLocale = incomingRequest.cookies.get(LOCALE_COOKIE_NAME)?.value
  const localeNeedsWrite = existingLocale !== locale
  const {
    response: sessionResponse,
    userId,
    accessToken,
    request,
  } = await updateSessionWithAuth(incomingRequest)

  if (sessionResponse.status >= 300 && sessionResponse.status < 400) {
    return finishResponse(
      sessionResponse,
      sessionResponse,
      locale,
      localeNeedsWrite,
    )
  }

  const isDocumentBffRead =
    (request.method === 'GET' || request.method === 'HEAD') &&
    DOCUMENT_METADATA_API_PATTERN.test(request.nextUrl.pathname)
  if (!userId && isDocumentBffRead) {
    return finishResponse(
      new NextResponse(
        request.method === 'HEAD'
          ? null
          : JSON.stringify({
              error: 'UNAUTHORIZED',
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
            }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'private, no-store',
          },
        },
      ),
      sessionResponse,
      locale,
      localeNeedsWrite,
    )
  }

  const isExtractionBffRead =
    (request.method === 'GET' || request.method === 'HEAD') &&
    request.nextUrl.pathname === '/api/extractions' &&
    request.nextUrl.searchParams.has('job_id')
  if (!userId && isExtractionBffRead) {
    return finishResponse(
      NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 },
      ),
      sessionResponse,
      locale,
      localeNeedsWrite,
    )
  }

  if (userId) {
    const preflight = await preflightDocumentPage(request, userId)
    if (preflight.kind === 'response') {
      return finishResponse(
        preflight.response,
        sessionResponse,
        locale,
        localeNeedsWrite,
      )
    }
    if (preflight.kind === 'metadata') {
      const headers = new Headers(request.headers)
      headers.delete(DOCUMENT_METADATA_HEADER)
      headers.delete(DOCUMENT_METADATA_SIGNATURE_HEADER)
      headers.delete(VERIFIED_USER_HEADER)
      headers.set(DOCUMENT_METADATA_HEADER, preflight.value)
      headers.set(
        DOCUMENT_METADATA_SIGNATURE_HEADER,
        await signDocumentMetadataHeader(
          preflight.value,
          userId,
          preflight.documentId,
          process.env.BACKEND_API_KEY ?? '',
        ),
      )
      headers.set(VERIFIED_USER_HEADER, userId)
      return finishResponse(
        NextResponse.next({ request: { headers } }),
        sessionResponse,
        locale,
        localeNeedsWrite,
      )
    }
  }

  const extractionMatch = EXTRACTION_DETAIL_PATTERN.exec(request.nextUrl.pathname)
  if (userId && extractionMatch) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const response = NextResponse.json(
        { error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
        { status: 405, headers: { Allow: 'GET, HEAD' } },
      )
      return finishResponse(response, sessionResponse, locale, localeNeedsWrite)
    }

    let jobId: string
    try {
      jobId = decodeURIComponent(extractionMatch[1])
    } catch {
      return finishResponse(
        extractionStatusResponse(404, request.method),
        sessionResponse,
        locale,
        localeNeedsWrite,
      )
    }
    if (!isValidExtractionJobId(jobId)) {
      return finishResponse(
        extractionStatusResponse(404, request.method),
        sessionResponse,
        locale,
        localeNeedsWrite,
      )
    }
    if (!accessToken) {
      const login = request.nextUrl.clone()
      login.pathname = '/auth/login'
      login.search = ''
      login.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
      return finishResponse(
        NextResponse.redirect(login),
        sessionResponse,
        locale,
        localeNeedsWrite,
      )
    }

    try {
      const upstream = await fetch(
        `${getBackendUrl()}/extractions/${encodeURIComponent(jobId)}?include_results=false`,
        {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'X-API-Key': process.env.BACKEND_API_KEY ?? '',
            Authorization: `Bearer ${accessToken}`,
          },
          signal: AbortSignal.timeout(extractionTimeoutMs()),
        },
      )
      if (upstream.status === 404 || upstream.status === 403) {
        return finishResponse(
          extractionStatusResponse(404, request.method),
          sessionResponse,
          locale,
          localeNeedsWrite,
        )
      }
      if (!upstream.ok) {
        return finishResponse(
          extractionStatusResponse(upstream.status, request.method),
          sessionResponse,
          locale,
          localeNeedsWrite,
        )
      }

      let payload: unknown
      try {
        payload = await upstream.json()
      } catch {
        return finishResponse(
          extractionStatusResponse(502, request.method),
          sessionResponse,
          locale,
          localeNeedsWrite,
        )
      }
      const job = normalizeExtractionJobPayload(payload, jobId)
      if (!job) {
        return finishResponse(
          extractionStatusResponse(502, request.method),
          sessionResponse,
          locale,
          localeNeedsWrite,
        )
      }

      const encoded = encodeExtractionSnapshot(toExtractionJobSnapshot(job))
      if (!encoded) {
        return finishResponse(
          extractionStatusResponse(502, request.method),
          sessionResponse,
          locale,
          localeNeedsWrite,
        )
      }
      const headers = new Headers(request.headers)
      headers.delete(EXTRACTION_SNAPSHOT_HEADER)
      headers.delete(EXTRACTION_SNAPSHOT_SIGNATURE_HEADER)
      headers.delete(EXTRACTION_VERIFIED_USER_HEADER)
      headers.set(EXTRACTION_SNAPSHOT_HEADER, encoded)
      headers.set(
        EXTRACTION_SNAPSHOT_SIGNATURE_HEADER,
        await signExtractionSnapshot(
          encoded,
          userId,
          `/extractions/${jobId}`,
          process.env.BACKEND_API_KEY ?? '',
        ),
      )
      headers.set(EXTRACTION_VERIFIED_USER_HEADER, userId)
      return finishResponse(
        NextResponse.next({ request: { headers } }),
        sessionResponse,
        locale,
        localeNeedsWrite,
      )
    } catch (error) {
      return finishResponse(
        extractionStatusResponse(
          isExtractionTimeout(error) ? 504 : 503,
          request.method,
        ),
        sessionResponse,
        locale,
        localeNeedsWrite,
      )
    }
  }

  return finishResponse(
    sessionResponse,
    sessionResponse,
    locale,
    localeNeedsWrite,
  )
}

export const config = {
  matcher: [
    '/documents/:path*',
    '/extractions/:path*',
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|chunk-error-handler\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|js|css|map|txt|xml|ico)$).*)',
  ],
}

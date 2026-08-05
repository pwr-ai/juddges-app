import { updateSessionWithAuth } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { LOCALE_COOKIE_NAME, DEFAULT_LOCALE, isValidLocale } from '@/lib/i18n/config'
import type { LocaleCode } from '@/lib/i18n/types'
import {
  DOCUMENT_METADATA_HEADER,
  VERIFIED_USER_HEADER,
  encodeDocumentMetadataHeader,
  isDocumentMetadata,
} from '@/lib/documents/metadata-transport'

const DOCUMENT_PAGE_PATTERN = /^\/documents\/([^/]+)$/
const DOCUMENT_ID_PATTERN = /^[a-zA-Z0-9_.-]{1,255}$/
const DOCUMENT_METADATA_API_PATTERN =
  /^\/api\/documents\/[a-zA-Z0-9_.-]{1,255}\/metadata$/

type DocumentPreflight =
  | { kind: 'not-document' }
  | { kind: 'metadata'; value: string }
  | { kind: 'response'; response: NextResponse }

function documentStatusResponse(status: number): NextResponse {
  const notFound = status === 404
  const title = notFound ? 'Document not found' : 'Document temporarily unavailable'
  const message = notFound
    ? 'The requested document does not exist or is not accessible.'
    : 'The service could not load this judgment. Please try again.'
  const retry = notFound
    ? ''
    : '<a href="">Try again</a>'
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
    }
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
  ) return true
  return signal.aborted &&
    typeof signal.reason === 'object' &&
    signal.reason !== null &&
    'name' in signal.reason &&
    signal.reason.name === 'TimeoutError'
}

async function preflightDocumentPage(
  request: NextRequest,
  userId: string
): Promise<DocumentPreflight> {
  const match = DOCUMENT_PAGE_PATTERN.exec(request.nextUrl.pathname)
  if (!match) return { kind: 'not-document' }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return {
      kind: 'response',
      response: NextResponse.json(
        { error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
        { status: 405, headers: { Allow: 'GET, HEAD' } }
      ),
    }
  }

  let documentId: string
  try {
    documentId = decodeURIComponent(match[1])
  } catch {
    return {
      kind: 'response',
      response: documentStatusResponse(404),
    }
  }
  if (!DOCUMENT_ID_PATTERN.test(documentId)) {
    return {
      kind: 'response',
      response: documentStatusResponse(404),
    }
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
      }
    )

    if (response.status === 404 || response.status === 403) {
      return {
        kind: 'response',
        response: documentStatusResponse(404),
      }
    }
    if (!response.ok) {
      const status = response.status >= 500 ? response.status : 502
      return {
        kind: 'response',
        response: documentStatusResponse(status),
      }
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return {
        kind: 'response',
        response: documentStatusResponse(502),
      }
    }
    if (!isDocumentMetadata(payload) || payload.document_id !== documentId) {
      return {
        kind: 'response',
        response: documentStatusResponse(502),
      }
    }

    return {
      kind: 'metadata',
      value: await encodeDocumentMetadataHeader(payload),
    }
  } catch (error) {
    const status = isTimeoutFailure(error, timeoutSignal) ? 504 : 503
    return {
      kind: 'response',
      response: documentStatusResponse(status),
    }
  }
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

function finishResponse(
  target: NextResponse,
  sessionResponse: NextResponse,
  locale: LocaleCode,
  localeNeedsWrite: boolean
): NextResponse {
  if (target !== sessionResponse) {
    sessionResponse.cookies.getAll().forEach((cookie) => target.cookies.set(cookie))
  }
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

export async function middleware(incomingRequest: NextRequest) {
  const locale = detectLocale(incomingRequest)
  const existingLocale = incomingRequest.cookies.get(LOCALE_COOKIE_NAME)?.value
  const localeNeedsWrite = existingLocale !== locale
  const {
    response: sessionResponse,
    userId,
    request,
  } = await updateSessionWithAuth(incomingRequest)

  if (sessionResponse.status >= 300 && sessionResponse.status < 400) {
    return finishResponse(sessionResponse, sessionResponse, locale, localeNeedsWrite)
  }

  if (
    !userId &&
    request.method === 'GET' &&
    DOCUMENT_METADATA_API_PATTERN.test(request.nextUrl.pathname)
  ) {
    return finishResponse(
      NextResponse.json(
        {
          error: 'UNAUTHORIZED',
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
        { status: 401 }
      ),
      sessionResponse,
      locale,
      localeNeedsWrite
    )
  }

  if (userId) {
    const preflight = await preflightDocumentPage(request, userId)
    if (preflight.kind === 'response') {
      return finishResponse(
        preflight.response,
        sessionResponse,
        locale,
        localeNeedsWrite
      )
    }
    if (preflight.kind === 'metadata') {
      const headers = new Headers(request.headers)
      headers.delete(DOCUMENT_METADATA_HEADER)
      headers.delete(VERIFIED_USER_HEADER)
      headers.set(DOCUMENT_METADATA_HEADER, preflight.value)
      headers.set(VERIFIED_USER_HEADER, userId)
      return finishResponse(
        NextResponse.next({ request: { headers } }),
        sessionResponse,
        locale,
        localeNeedsWrite
      )
    }
  }

  return finishResponse(sessionResponse, sessionResponse, locale, localeNeedsWrite)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|chunk-error-handler\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|js|css|map|txt|xml|ico)$).*)',
  ],
}

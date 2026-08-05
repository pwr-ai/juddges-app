import { updateSessionWithAuth } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { LOCALE_COOKIE_NAME, DEFAULT_LOCALE, isValidLocale } from '@/lib/i18n/config'
import type { LocaleCode } from '@/lib/i18n/types'
import { getBackendUrl } from '@/app/api/utils/backend-url'
import {
  EXTRACTION_SNAPSHOT_HEADER,
  EXTRACTION_SNAPSHOT_SIGNATURE_HEADER,
  EXTRACTION_VERIFIED_USER_HEADER,
  encodeExtractionSnapshot,
  isValidExtractionJobId,
  normalizeExtractionJobPayload,
  signExtractionSnapshot,
} from '@/lib/extractions/detail-contract'

const EXTRACTION_DETAIL_PATTERN = /^\/extractions\/([^/]+)$/

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
  const body = method === 'HEAD'
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

function timeoutMs(): number {
  const configured = Number(process.env.EXTRACTION_DETAIL_TIMEOUT_MS ?? 10_000)
  return Number.isFinite(configured) && configured > 0 ? configured : 10_000
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
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

/**
 * Detect the best locale from the request
 * Priority: Cookie > Accept-Language header > Default
 */
function detectLocale(request: NextRequest): LocaleCode {
  // 1. Check cookie first (user's explicit preference)
  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value
  if (cookieLocale && isValidLocale(cookieLocale)) {
    return cookieLocale
  }

  // 2. Try Accept-Language header
  const acceptLanguage = request.headers.get('accept-language')
  if (acceptLanguage) {
    // Parse Accept-Language header (e.g., "en-US,en;q=0.9,pl;q=0.8")
    const languages = acceptLanguage
      .split(',')
      .map((lang) => {
        const [code, q = '1'] = lang.trim().split(';q=')
        return {
          code: code.split('-')[0].toLowerCase(), // Get primary language code
          quality: parseFloat(q),
        }
      })
      .sort((a, b) => b.quality - a.quality)

    // Find the first matching supported locale
    for (const lang of languages) {
      if (isValidLocale(lang.code)) {
        return lang.code
      }
    }
  }

  // 3. Fall back to default
  return DEFAULT_LOCALE
}

export async function middleware(incomingRequest: NextRequest) {
  // Detect locale
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

  const match = EXTRACTION_DETAIL_PATTERN.exec(request.nextUrl.pathname)
  if (userId && match) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const response = NextResponse.json(
        { error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
        { status: 405, headers: { Allow: 'GET, HEAD' } },
      )
      return finishResponse(response, sessionResponse, locale, localeNeedsWrite)
    }

    let jobId: string
    try {
      jobId = decodeURIComponent(match[1])
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
        `${getBackendUrl()}/extractions/${encodeURIComponent(jobId)}`,
        {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'X-API-Key': process.env.BACKEND_API_KEY ?? '',
            Authorization: `Bearer ${accessToken}`,
          },
          signal: AbortSignal.timeout(timeoutMs()),
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
      const snapshot = normalizeExtractionJobPayload(payload, jobId)
      if (!snapshot) {
        return finishResponse(
          extractionStatusResponse(502, request.method),
          sessionResponse,
          locale,
          localeNeedsWrite,
        )
      }

      const encoded = encodeExtractionSnapshot(snapshot)
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
          request.nextUrl.pathname,
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
        extractionStatusResponse(isTimeout(error) ? 504 : 503, request.method),
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
    '/extractions/:path*',
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|chunk-error-handler\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|js|css|map|txt|xml|ico)$).*)',
  ],
}

import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { LOCALE_COOKIE_NAME, DEFAULT_LOCALE, isValidLocale } from '@/lib/i18n/config'
import type { LocaleCode } from '@/lib/i18n/types'

const DOCUMENT_PAGE_PATTERN = /^\/documents\/([^/]+)$/
const DOCUMENT_ID_PATTERN = /^[a-zA-Z0-9_.-]{1,255}$/

function exactNotFoundRewrite(request: NextRequest) {
  const notFoundUrl = request.nextUrl.clone()
  notFoundUrl.pathname = '/_document-not-found'
  notFoundUrl.search = ''
  return NextResponse.rewrite(notFoundUrl, { status: 404 })
}

async function preflightDocumentPage(
  request: NextRequest,
  userId: string
): Promise<NextResponse | null> {
  const match = DOCUMENT_PAGE_PATTERN.exec(request.nextUrl.pathname)
  if (!match || request.method !== 'GET') return null

  let documentId: string
  try {
    documentId = decodeURIComponent(match[1])
  } catch {
    return exactNotFoundRewrite(request)
  }

  if (!DOCUMENT_ID_PATTERN.test(documentId)) {
    return exactNotFoundRewrite(request)
  }

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
        signal: AbortSignal.timeout(10_000),
      }
    )
    if (response.status === 404 || response.status === 403) {
      return exactNotFoundRewrite(request)
    }
  } catch {
    // Availability failures belong to the page error boundary, not the 404
    // path. The server page repeats the request and classifies the failure.
  }

  return null
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

export async function middleware(request: NextRequest) {
  // Detect locale
  const locale = detectLocale(request)

  // Get the session response from Supabase middleware
  const response = await updateSession(request)

  const verifiedUserId = response.headers.get('x-juddges-verified-user-id')
  response.headers.delete('x-juddges-verified-user-id')

  // Only (re)write the locale cookie when it is missing or actually changed.
  // Rewriting it on every request adds a needless Set-Cookie header to every
  // RSC navigation (issue #178).
  const existingLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value
  const localeNeedsWrite = existingLocale !== locale

  // If updateSession returned a redirect, return it as-is
  if (response.status >= 300 && response.status < 400) {
    if (localeNeedsWrite) {
      response.cookies.set(LOCALE_COOKIE_NAME, locale, {
        path: '/',
        maxAge: 31536000, // 1 year
        sameSite: 'lax',
      })
    }
    return response
  }

  if (verifiedUserId) {
    const documentNotFound = await preflightDocumentPage(request, verifiedUserId)
    if (documentNotFound) {
      response.cookies.getAll().forEach((cookie) => {
        documentNotFound.cookies.set(cookie)
      })
      if (localeNeedsWrite) {
        documentNotFound.cookies.set(LOCALE_COOKIE_NAME, locale, {
          path: '/',
          maxAge: 31536000,
          sameSite: 'lax',
        })
      }
      return documentNotFound
    }
  }

  if (localeNeedsWrite) {
    response.cookies.set(LOCALE_COOKIE_NAME, locale, {
      path: '/',
      maxAge: 31536000, // 1 year
      sameSite: 'lax',
    })
  }

  // Add locale header for server components to read
  response.headers.set('x-locale', locale)

  return response
}

export const config = {
  matcher: [
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

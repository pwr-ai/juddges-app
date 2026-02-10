import { updateSession } from '@/lib/supabase/middleware'
import { type NextRequest } from 'next/server'
import { LOCALE_COOKIE_NAME, DEFAULT_LOCALE, isValidLocale } from '@/lib/i18n/config'
import type { LocaleCode } from '@/lib/i18n/types'

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

  // If updateSession returned a redirect, return it as-is
  if (response.status >= 300 && response.status < 400) {
    // Set locale cookie on redirects too
    response.cookies.set(LOCALE_COOKIE_NAME, locale, {
      path: '/',
      maxAge: 31536000, // 1 year
      sameSite: 'lax',
    })
    return response
  }

  // Set locale cookie if not already set or different
  const existingLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value
  if (!existingLocale || existingLocale !== locale) {
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
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

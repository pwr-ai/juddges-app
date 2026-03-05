import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function sanitizeNextPath(nextParam: string | null): string {
  if (!nextParam) {
    return '/'
  }

  // Only allow in-app relative redirects.
  if (!nextParam.startsWith('/') || nextParam.startsWith('//')) {
    return '/'
  }

  return nextParam
}

function resolveAllowedHosts(): Set<string> {
  const allowed = new Set<string>()

  const explicitHosts = (process.env.AUTH_REDIRECT_ALLOWED_HOSTS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)

  for (const host of explicitHosts) {
    allowed.add(host)
  }

  const virtualHost = process.env.VIRTUAL_HOST_FRONTEND?.trim().toLowerCase()
  if (virtualHost) {
    allowed.add(virtualHost)
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (siteUrl) {
    try {
      const parsed = new URL(siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`)
      allowed.add(parsed.host.toLowerCase())
    } catch {
      // Ignore invalid NEXT_PUBLIC_SITE_URL values
    }
  }

  return allowed
}

/**
 * OAuth/SSO callback handler.
 *
 * After authenticating with an SSO provider (SAML or OAuth), Supabase redirects
 * the user here with an authorization code. We exchange that code for a session,
 * then redirect to the app.
 *
 * This handles both:
 * - OAuth 2.0 PKCE flow (Azure AD, Google Workspace)
 * - SAML 2.0 flow (Okta, Azure AD SAML, OneLogin)
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = sanitizeNextPath(searchParams.get('next'))
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  // Handle error responses from the IdP
  if (error) {
    const errorMsg = errorDescription || error
    return NextResponse.redirect(
      `${origin}/auth/error?error=${encodeURIComponent(errorMsg)}`
    )
  }

  if (code) {
    const supabase = await createClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (!exchangeError) {
      const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim().toLowerCase()
      const isLocalEnv = process.env.NODE_ENV === 'development'
      const allowedHosts = resolveAllowedHosts()

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost && allowedHosts.has(forwardedHost)) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }

    // Exchange failed — redirect to error page
    return NextResponse.redirect(
      `${origin}/auth/error?error=${encodeURIComponent(exchangeError.message)}`
    )
  }

  // No code provided — redirect to error page
  return NextResponse.redirect(
    `${origin}/auth/error?error=${encodeURIComponent('No authorization code received from identity provider')}`
  )
}

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
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
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
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

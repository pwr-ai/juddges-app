'use client'

import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { PrimaryButton } from '@/lib/styles/components'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Logo } from '@/components/ui/logo'
import { Separator } from '@/components/ui/separator'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useCallback } from 'react'
import logger from '@/lib/logger'
import {
  Mail,
  Lock,
  ArrowRight,
  Shield,
  Zap,
  FileSearch,
  Brain,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BookOpen,
  Building2,
  KeyRound,
} from 'lucide-react'

interface SSOInfo {
  sso_enabled: boolean
  provider_type?: string
  connection_id?: string
  connection_name?: string
  organization?: string
}

export function LoginFormEnhanced({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>): React.ReactElement {
  const pageLogger = logger.child('LoginFormEnhanced')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSSOLoading, setIsSSOLoading] = useState(false)
  const [ssoInfo, setSSOInfo] = useState<SSOInfo | null>(null)
  const [ssoCheckDomain, setSSOCheckDomain] = useState<string | null>(null)
  const router = useRouter()

  pageLogger.info('LoginFormEnhanced component mounted')

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email) {
      setEmailError('Email is required')
      return false
    }
    if (!emailRegex.test(email)) {
      setEmailError('Please enter a valid email address')
      return false
    }
    setEmailError(null)
    return true
  }

  const checkDomainSSO = useCallback(async (emailValue: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(emailValue)) return

    const domain = emailValue.split('@')[1]?.toLowerCase()
    if (!domain || domain === ssoCheckDomain) return

    setSSOCheckDomain(domain)

    try {
      const response = await fetch(`/api/sso/check-domain?domain=${encodeURIComponent(domain)}`)
      if (response.ok) {
        const data: SSOInfo = await response.json()
        setSSOInfo(data)
      }
    } catch {
      // Silently fail — SSO check is optional
    }
  }, [ssoCheckDomain])

  const handleSSOLogin = async (): Promise<void> => {
    if (!ssoInfo?.sso_enabled || !email) return

    setIsSSOLoading(true)
    setError(null)

    const domain = email.split('@')[1]?.toLowerCase()
    pageLogger.info('SSO login initiated', { domain, provider: ssoInfo.provider_type })

    try {
      const supabase = createClient()
      const { data, error: ssoError } = await supabase.auth.signInWithSSO({
        domain,
      })

      if (ssoError) throw ssoError

      if (data?.url) {
        try {
          const url = new URL(data.url, window.location.origin)
          if (url.protocol === 'https:' || url.protocol === 'http:' || url.origin === window.location.origin) {
            window.location.href = url.toString()
          }
        } catch {
          pageLogger.error('Invalid SSO redirect URL', { url: data.url })
        }
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'SSO authentication failed'
      pageLogger.error('SSO login failed', error, { domain, errorMessage })
      setError(errorMessage)
      setIsSSOLoading(false)
    }
  }

  const handleEmailBlur = (): void => {
    if (email) {
      validateEmail(email)
      checkDomainSSO(email)
    }
  }

  const handleLogin = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)
    setEmailError(null)

    // Validate email before submission
    if (!validateEmail(email)) {
      setIsLoading(false)
      return
    }

    pageLogger.info('Login attempt initiated', {
      email,
      hasPassword: !!password,
      passwordLength: password.length,
      rememberMe,
    })

    try {
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      pageLogger.info('Login successful', {
        email,
        userId: data.user?.id,
        userEmail: data.user?.email,
        sessionId: data.session?.access_token ? 'present' : 'missing',
      })

      // Required for App Router + @supabase/ssr: refresh() invalidates the
      // RSC cache so Server Components and middleware see the new auth
      // cookies on the next navigation. Without it, router.push() can be
      // served from a pre-login cache and middleware will bounce the user
      // back to /auth/login on the first protected route.
      router.refresh()
      router.push('/')
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'An error occurred'
      pageLogger.error('Login failed', error, {
        email,
        errorMessage,
        context: 'handleLogin',
      })
      setError(errorMessage)
    } finally {
      setIsLoading(false)
      pageLogger.debug('Login process completed', { email })
    }
  }

  const features = [
    {
      icon: FileSearch,
      title: 'Advanced Legal Search',
      description: 'Quickly find relevant cases and documents across vast legal databases',
    },
    {
      icon: Brain,
      title: 'AI-Powered Analysis',
      description: 'Get intelligent insights and summaries of complex legal documents',
    },
    {
      icon: Shield,
      title: 'Secure & Compliant',
      description: 'Enterprise-grade security with full GDPR compliance',
    },
    {
      icon: Zap,
      title: 'Lightning Fast',
      description: 'Process thousands of documents in seconds with cutting-edge AI',
    },
  ]

  return (
    <div className={cn('flex w-full', className)} {...props}>
      {/* Left Side - Marketing Content */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary/5 via-primary/10 to-accent/5 p-12 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, oklch(var(--primary) / 0.15) 1px, transparent 1px)`,
            backgroundSize: '32px 32px',
          }} />
        </div>

        <div className="relative z-10 flex flex-col justify-between max-w-lg">
          {/* Logo and Tagline */}
          <div className="space-y-6 animate-fade-in-up">
            <Logo size="xl" />
            <div className="space-y-3">
	              <h1 className="text-4xl font-bold tracking-tight text-foreground">
	                AI-Powered Judgment Analysis
	              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Transform how you work with legal documents using advanced AI technology.
                Access instant insights, automated analysis, and intelligent search.
              </p>
            </div>
          </div>

          {/* Features List */}
          <div className="space-y-6 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="space-y-4">
              {/* Explore Use Cases Card - First */}
              <Link href="/use-cases" className="block group">
                <div className="flex items-start gap-4 p-4 rounded-lg bg-gradient-to-br from-primary/10 via-primary/5 to-accent/5 backdrop-blur-sm border-2 border-primary/30 hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10">
                  <div className="p-2 rounded-lg bg-primary/20 text-primary">
                    <BookOpen className="size-5" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm text-foreground">
                        Explore Use Cases
                      </h3>
                      <span className="text-xs text-primary font-medium">
                        Open →
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Discover examples and tutorials to see how our platform works
                    </p>
                  </div>
                </div>
              </Link>

              {features.map((feature, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 p-4 rounded-lg bg-background/50 backdrop-blur-sm border border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-md"
                >
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <feature.icon className="size-5" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <h3 className="font-semibold text-sm text-foreground">
                      {feature.title}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Trust Indicators */}
            <div className="flex items-center gap-4 pt-4 border-t border-border/50">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-success" />
                <span>GDPR Compliant</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          {/* Mobile Logo */}
          <div className="lg:hidden flex justify-center">
            <Logo size="lg" />
          </div>

          {/* Form Header */}
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">Welcome back</h2>
            <p className="text-muted-foreground">
              Sign in to access JuDDGES
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (emailError) setEmailError(null)
                  }}
                  onBlur={handleEmailBlur}
                  required
                  disabled={isLoading}
                  className="pl-10"
                  aria-invalid={!!emailError}
                  aria-describedby={emailError ? 'email-error' : undefined}
                />
              </div>
              {emailError && (
                <div
                  id="email-error"
                  className="flex items-center gap-2 text-sm text-destructive animate-fade-in-down"
                  role="alert"
                >
                  <AlertCircle className="size-4" />
                  <span>{emailError}</span>
                </div>
              )}
            </div>

            {/* SSO Login Option */}
            {ssoInfo?.sso_enabled && (
              <div className="space-y-4 animate-fade-in-down">
                <button
                  type="button"
                  onClick={handleSSOLogin}
                  disabled={isSSOLoading || isLoading}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all duration-200 text-sm font-medium text-foreground disabled:opacity-50"
                  aria-label={`Sign in with ${ssoInfo.organization || 'SSO'}`}
                >
                  {isSSOLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Building2 className="size-4 text-primary" />
                  )}
                  <span>
                    {isSSOLoading
                      ? 'Redirecting to identity provider...'
                      : `Sign in with ${ssoInfo.organization || 'Enterprise SSO'}`}
                  </span>
                  {ssoInfo.provider_type && (
                    <span className="ml-auto text-xs text-muted-foreground uppercase">
                      {ssoInfo.provider_type}
                    </span>
                  )}
                </button>

                <div className="relative">
                  <Separator />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3 text-xs text-muted-foreground">
                    or use password
                  </span>
                </div>
              </div>
            )}

            {/* Password Field */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <Link
                  href="/auth/forgot-password"
                  className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                  tabIndex={-1}
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="pl-10"
                  aria-label="Password"
                />
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
                disabled={isLoading}
                aria-label="Remember me"
              />
              <Label
                htmlFor="remember"
                className="text-sm text-muted-foreground cursor-pointer select-none"
              >
                Remember me for 30 days
              </Label>
            </div>

            {/* Error Message */}
            {error && (
              <div
                className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 animate-fade-in-down"
                role="alert"
              >
                <AlertCircle className="size-5 text-destructive shrink-0" />
                <p className="text-sm text-destructive font-medium">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <PrimaryButton
              type="submit"
              className="w-full group"
              disabled={isLoading || isSSOLoading}
              icon={isLoading ? undefined : ArrowRight}
              size="md"
              enhancedHover
              enhancedFocus
              aria-label={isLoading ? 'Signing in...' : 'Sign in'}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  <span>Signing in...</span>
                </span>
              ) : (
                <span>Sign in</span>
              )}
            </PrimaryButton>

            {/* Sign Up Link */}
            <div className="text-center text-sm">
              <span className="text-muted-foreground">
                Don&apos;t have an account?{' '}
              </span>
              <Link
                href="/auth/sign-up"
                className="text-primary hover:text-primary/80 font-semibold transition-colors"
              >
                Sign up
              </Link>
            </div>
          </form>

          {/* Footer Links */}
          <div className="pt-6 border-t border-border">
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <Link
                href="/privacy"
                className="hover:text-foreground transition-colors underline-offset-4 hover:underline"
              >
                Privacy Policy
              </Link>
              <span className="text-border">•</span>
              <Link
                href="/terms"
                className="hover:text-foreground transition-colors underline-offset-4 hover:underline"
              >
                Terms of Service
              </Link>
              <span className="text-border">•</span>
              <div className="flex items-center gap-1.5">
                <Shield className="size-3 text-success" />
                <span>Secure Login</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

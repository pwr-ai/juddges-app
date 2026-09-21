'use client'

import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { VariantButton } from '@/lib/styles/components'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Logo } from '@/components/ui/logo'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import logger from '@/lib/logger'
import { sanitizeNextPath } from '@/lib/auth/next-path'
import {
  Mail,
  Lock,
  ArrowRight,
  Shield,
  Clock,
  FileSearch,
  Brain,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BookOpen,
} from 'lucide-react'

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
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = sanitizeNextPath(searchParams?.get('next'))

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

  const validatePassword = (password: string): boolean => {
    if (!password) {
      setPasswordError('Password is required')
      return false
    }
    setPasswordError(null)
    return true
  }

  // Validate on blur so a bad field is reported before the user submits.
  const handleEmailBlur = (): void => {
    if (email) {
      validateEmail(email)
    }
  }

  const handlePasswordBlur = (): void => {
    validatePassword(password)
  }

  const handleLogin = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)
    setEmailError(null)
    setPasswordError(null)

    // Validate every field before submission so each message lands next to the
    // input that produced it rather than in a single generic form-level line.
    const emailValid = validateEmail(email)
    const passwordValid = validatePassword(password)
    if (!emailValid || !passwordValid) {
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
      router.push(nextPath)
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
      title: 'AI Analysis',
      description: 'Structured insights and summaries of complex legal documents',
    },
    {
      icon: Shield,
      title: 'Secure & Compliant',
      description: 'Enterprise-grade security with full GDPR compliance',
    },
    {
      icon: Clock,
      title: 'Fast Retrieval',
      description: 'Process documents in seconds with semantic indexing',
    },
  ]

  return (
    <div className={cn('flex w-full', className)} {...props}>
      {/* Left Side - Editorial Context Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-parchment-deep border-r border-rule p-12 relative overflow-hidden">
        <div className="relative z-10 flex flex-col justify-between max-w-lg">
          {/* Logo and Tagline */}
          <div className="space-y-6">
            <Logo size="xl" />
            <div className="space-y-3">
              <h1 className="font-serif text-4xl font-bold tracking-tight text-ink">
                Judicial Decision Research
              </h1>
              <p className="text-base text-ink-soft leading-relaxed">
                Work with legal documents using semantic search and structured extraction.
                Access instant insights, automated analysis, and case law intelligence.
              </p>
            </div>
          </div>

          {/* Features List */}
          <div className="space-y-6">
            <div className="space-y-3">
              {/* Explore Use Cases Card */}
              <Link href="/use-cases" className="block group">
                <div className="flex items-start gap-4 p-4 rounded-none bg-parchment border border-rule hover:border-oxblood transition-colors">
                  <div className="p-2 rounded-none bg-parchment-deep text-oxblood border border-rule">
                    <BookOpen className="size-5" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-serif font-bold text-sm text-ink group-hover:text-oxblood transition-colors">
                        Explore Use Cases
                      </h3>
                      <span className="font-mono text-xs text-oxblood font-medium">
                        Open →
                      </span>
                    </div>
                    <p className="text-xs text-ink-soft leading-relaxed">
                      Discover examples and tutorials to see how our platform works
                    </p>
                  </div>
                </div>
              </Link>

              {features.map((feature, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 p-4 rounded-none bg-parchment border border-rule hover:border-rule-strong transition-colors"
                >
                  <div className="p-2 rounded-none bg-parchment-deep text-ink-soft border border-rule">
                    <feature.icon className="size-5" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <h3 className="font-serif font-bold text-sm text-ink">
                      {feature.title}
                    </h3>
                    <p className="text-xs text-ink-soft leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Trust Indicators */}
            <div className="flex items-center gap-4 pt-4 border-t border-rule font-mono text-xs text-ink-soft">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-ink-soft" />
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
                  name="email"
                  type="email"
                  autoComplete="email"
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

            {/* Password Field */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                {/* Was tabIndex={-1}, which made password recovery unreachable
                    by keyboard. Kept in the tab order with a 24px hit area. */}
                <Link
                  href="/auth/forgot-password"
                  className="inline-flex min-h-6 items-center text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (passwordError) setPasswordError(null)
                  }}
                  onBlur={handlePasswordBlur}
                  required
                  disabled={isLoading}
                  className="pl-10"
                  aria-invalid={!!passwordError}
                  aria-describedby={passwordError ? 'password-error' : undefined}
                />
              </div>
              {passwordError && (
                <div
                  id="password-error"
                  className="flex items-center gap-2 text-sm text-destructive animate-fade-in-down"
                  role="alert"
                >
                  <AlertCircle className="size-4" />
                  <span>{passwordError}</span>
                </div>
              )}
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="remember"
                name="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
                disabled={isLoading}
                // Radix renders the checkbox as a <button>, so keep an explicit
                // name that matches the visible label text verbatim (SC 2.5.3).
                aria-label="Remember me for 30 days"
                // The glyph stays 16px; the ::after pseudo-element extends the
                // pointer target to 28px so it clears the 24px WCAG 2.5.8 floor.
                className="relative after:absolute after:-inset-1.5 after:content-['']"
              />
              <Label
                htmlFor="remember"
                className="flex min-h-6 items-center text-sm text-muted-foreground cursor-pointer select-none"
              >
                Remember me for 30 days
              </Label>
            </div>

            {/* Error Message */}
            {error && (
              <div
                id="login-form-error"
                className="flex items-center gap-3 p-4 rounded-none bg-parchment-deep border border-oxblood animate-fade-in-down"
                role="alert"
                aria-live="assertive"
              >
                <AlertCircle className="size-5 text-oxblood shrink-0" />
                <p className="text-sm text-oxblood font-medium">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <VariantButton intent="primary"
              type="submit"
              className="w-full group"
              disabled={isLoading}
              icon={isLoading ? undefined : ArrowRight}
              size="md"
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
            </VariantButton>

            {/* Sign Up Link */}
            <div className="text-center text-sm">
              <span className="text-muted-foreground">
                Don&apos;t have an account?{' '}
              </span>
              <Link
                href="/auth/sign-up"
                className="inline-flex min-h-6 items-center text-primary hover:text-primary/80 font-semibold transition-colors"
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
                className="inline-flex min-h-6 items-center hover:text-foreground transition-colors underline-offset-4 hover:underline"
              >
                Privacy Policy
              </Link>
              <span className="text-border">•</span>
              <Link
                href="/terms"
                className="inline-flex min-h-6 items-center hover:text-foreground transition-colors underline-offset-4 hover:underline"
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

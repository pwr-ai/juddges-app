'use client'

import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { VariantButton, LightCard } from '@/lib/styles/components'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Logo } from '@/components/ui/logo'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Loader2, UserPlus } from 'lucide-react'

export function SignUpForm({ className, ...props }: React.ComponentPropsWithoutRef<'div'>): React.ReactElement {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [repeatPasswordError, setRepeatPasswordError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const validateEmail = (value: string): boolean => {
    if (!value) {
      setEmailError('Email is required')
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError('Please enter a valid email address')
      return false
    }
    setEmailError(null)
    return true
  }

  const validatePassword = (value: string): boolean => {
    if (!value) {
      setPasswordError('Password is required')
      return false
    }
    if (value.length < 6) {
      setPasswordError('Password must be at least 6 characters')
      return false
    }
    setPasswordError(null)
    return true
  }

  const validateRepeatPassword = (value: string, original: string): boolean => {
    if (!value) {
      setRepeatPasswordError('Please repeat your password')
      return false
    }
    if (value !== original) {
      setRepeatPasswordError(
        "Passwords don't match — retype them so both fields are identical."
      )
      return false
    }
    setRepeatPasswordError(null)
    return true
  }

  const handleSignUp = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    // Validate on submit as well as on blur, so each message stays attached to
    // the field that produced it instead of a single generic form-level line.
    const emailValid = validateEmail(email)
    const passwordValid = validatePassword(password)
    const repeatValid = validateRepeatPassword(repeatPassword, password)
    if (!emailValid || !passwordValid || !repeatValid) {
      setIsLoading(false)
      return
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      })
      if (error) throw error
      router.push('/auth/sign-up-success')
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      {/* Logo */}
      <div className="flex justify-center mb-2">
        <Logo size="lg" />
      </div>

      <LightCard padding="lg">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Sign up</h2>
          <p className="text-sm text-muted-foreground">Create a new account</p>
        </div>

        <form onSubmit={handleSignUp}>
          <div className="flex flex-col gap-5">
              <div className="grid gap-2">
                <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (emailError) setEmailError(null)
                  }}
                  onBlur={(e) => validateEmail(e.target.value)}
                  disabled={isLoading}
                  className="transition-all duration-200 hover:border-primary/50 focus:border-primary"
                  aria-invalid={!!emailError}
                  aria-describedby={emailError ? 'signup-email-error' : undefined}
                />
                {emailError && (
                  <p id="signup-email-error" role="alert" className="text-sm text-destructive">
                    {emailError}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (passwordError) setPasswordError(null)
                  }}
                  onBlur={(e) => validatePassword(e.target.value)}
                  disabled={isLoading}
                  className="transition-all duration-200 hover:border-primary/50 focus:border-primary"
                  aria-invalid={!!passwordError}
                  aria-describedby={passwordError ? 'signup-password-error' : undefined}
                />
                {passwordError && (
                  <p id="signup-password-error" role="alert" className="text-sm text-destructive">
                    {passwordError}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="repeat-password" className="text-sm font-medium">Repeat Password</Label>
                <Input
                  id="repeat-password"
                  name="repeat-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={repeatPassword}
                  onChange={(e) => {
                    setRepeatPassword(e.target.value)
                    if (repeatPasswordError) setRepeatPasswordError(null)
                  }}
                  onBlur={(e) => validateRepeatPassword(e.target.value, password)}
                  disabled={isLoading}
                  className="transition-all duration-200 hover:border-primary/50 focus:border-primary"
                  aria-invalid={!!repeatPasswordError}
                  aria-describedby={
                    repeatPasswordError ? 'signup-repeat-password-error' : undefined
                  }
                />
                {repeatPasswordError && (
                  <p
                    id="signup-repeat-password-error"
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {repeatPasswordError}
                  </p>
                )}
              </div>

              {error && (
                <p
                  id="signup-form-error"
                  role="alert"
                  aria-live="assertive"
                  className="text-sm text-destructive"
                >
                  {error}
                </p>
              )}
              <VariantButton intent="primary"
                type="submit"
                className="w-full"
                disabled={isLoading}
                icon={isLoading ? undefined : UserPlus}
                size="md"
                aria-label={isLoading ? 'Creating account...' : 'Sign up'}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    <span>Creating an account...</span>
                  </span>
                ) : (
                  <span>Sign up</span>
                )}
              </VariantButton>
            </div>
            <div className="mt-4 text-center text-sm">
              Already have an account?{' '}
              <Link
                href="/auth/login"
                className="inline-flex min-h-6 items-center underline underline-offset-4"
              >
                Login
              </Link>
            </div>
          </form>
      </LightCard>

      {/* Terms and Privacy - Outside the card */}
      <div className="text-center text-xs text-muted-foreground">
        By signing up, you agree to our{' '}
        <Link
          href="/terms"
          className="inline-flex min-h-6 items-center text-primary underline underline-offset-4"
        >
          Terms of Service
        </Link>
        {' '}and{' '}
        <Link
          href="/privacy"
          className="inline-flex min-h-6 items-center text-primary underline underline-offset-4"
        >
          Privacy Policy
        </Link>
      </div>
    </div>
  )
}

'use client'

import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { PrimaryButton, LightCard } from '@/lib/styles/components'
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
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSignUp = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    if (password !== repeatPassword) {
      setError('Passwords do not match')
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
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="transition-all duration-200 hover:border-primary/50 focus:border-primary"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="transition-all duration-200 hover:border-primary/50 focus:border-primary"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="repeat-password" className="text-sm font-medium">Repeat Password</Label>
                <Input
                  id="repeat-password"
                  type="password"
                  required
                  value={repeatPassword}
                  onChange={(e) => setRepeatPassword(e.target.value)}
                  disabled={isLoading}
                  className="transition-all duration-200 hover:border-primary/50 focus:border-primary"
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
              <PrimaryButton
                type="submit"
                className="w-full"
                disabled={isLoading}
                icon={isLoading ? undefined : UserPlus}
                size="md"
                enhancedHover
                enhancedFocus
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
              </PrimaryButton>
            </div>
            <div className="mt-4 text-center text-sm">
              Already have an account?{' '}
              <Link href="/auth/login" className="underline underline-offset-4">
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
          className="text-primary hover:underline underline-offset-4"
        >
          Terms of Service
        </Link>
        {' '}and{' '}
        <Link
          href="/privacy"
          className="text-primary hover:underline underline-offset-4"
        >
          Privacy Policy
        </Link>
      </div>
    </div>
  )
}

import { redirect } from 'next/navigation'

import { LogoutButton } from '@/components/logout-button'
import { createClient } from '@/lib/supabase/server'

export default async function ProtectedPage() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect('/login')
  }

  return (
    <div className="container mx-auto px-6 py-8 md:px-8 lg:px-12 max-w-[1200px]">
      <div className="flex min-h-[calc(100vh-8rem)] w-full items-center justify-center gap-2">
        <p>
          Hello <span>{data.user.email}</span>
        </p>
        <LogoutButton />
      </div>
    </div>
  )
}

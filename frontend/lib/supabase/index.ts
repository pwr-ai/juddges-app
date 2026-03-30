import { createClient } from './client'

/**
 * Pre-instantiated Supabase browser client for use in client components
 * that import directly from '@/lib/supabase'.
 *
 * This singleton is suitable for hooks and components that need a stable
 * reference (e.g. real-time subscriptions, Zustand stores). For one-off
 * usage in client components, prefer importing { createClient } from
 * '@/lib/supabase/client' instead.
 *
 * Usage:
 *   import { supabase } from '@/lib/supabase'
 *   const { data } = await supabase.from('table').select()
 */
export const supabase = createClient()

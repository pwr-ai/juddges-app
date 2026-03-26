// Single Supabase instance for direct imports
import { createClient } from "@/lib/supabase/client";

export const supabase = createClient();

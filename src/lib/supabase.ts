import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://mlrrnplhcyijxwovopkc.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1scnJucGxoY3lpanh3b3ZvcGtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDUyMzQsImV4cCI6MjA5MzIyMTIzNH0.aRlthVHMtQt35O2lyV_NjsovCMCeDfrr9KMrtfVT7V4'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

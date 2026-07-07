import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ALLOWED_ORIGINS = new Set([
  'https://aurelius-login.vercel.app',
  'https://login.aureliuspropertymanagement.co.uk',
])

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://login.aureliuspropertymanagement.co.uk'
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ALLOWED_ROLES = ['landlord', 'tenant', 'contractor']

serve(async (req) => {
  const origin = req.headers.get('Origin')
  const CORS = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    // Verify the caller is an authenticated admin
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '').trim()
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { data: { user: caller }, error: callerErr } = await adminClient.auth.getUser(token)
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Read role from users table — never trust user_metadata which is client-writable
    const { data: callerProfile } = await adminClient
      .from('users')
      .select('role')
      .eq('id', caller.id)
      .single()

    const callerRole = callerProfile?.role ?? ''
    if (callerRole !== 'admin' && callerRole !== 'master admin') {
      return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { email, role, name } = await req.json()

    if (!email || !role) {
      return new Response(JSON.stringify({ ok: false, error: 'email and role are required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid role' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        ...(name?.trim() ? { full_name: name.trim() } : {}),
      },
      redirectTo: 'https://login.aureliuspropertymanagement.co.uk',
    })

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // The handle_new_user trigger always defaults new users to 'tenant'.
    // Explicitly set the correct role server-side using the service role key.
    const userId = data.user?.id
    if (userId) {
      await adminClient
        .from('users')
        .update({ role, ...(name?.trim() ? { full_name: name.trim() } : {}) })
        .eq('id', userId.toLowerCase())

      await adminClient
        .from('profiles')
        .update({ role, ...(name?.trim() ? { full_name: name.trim() } : {}) })
        .eq('id', userId)
    }

    return new Response(JSON.stringify({ ok: true, userId }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[send-invite]', err)
    return new Response(JSON.stringify({ ok: false, error: 'An error occurred. Please try again.' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})

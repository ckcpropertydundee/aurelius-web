import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ALLOWED_ROLES = ['landlord', 'tenant', 'contractor']

serve(async (req) => {
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

    const callerRole = caller.user_metadata?.role ?? ''
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
        role,
        ...(name?.trim() ? { full_name: name.trim() } : {}),
      },
      redirectTo: 'https://login.aureliuspropertymanagement.co.uk',
    })

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true, userId: data.user?.id }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})

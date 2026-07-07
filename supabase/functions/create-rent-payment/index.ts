import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const DEFAULT_MANAGEMENT_FEE_PCT = 8

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    // Verify caller identity from JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)

    const anonClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authErr } = await anonClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const { tenancy_id } = await req.json() as { tenancy_id: string }
    if (!tenancy_id) return json({ error: 'tenancy_id required' }, 400)

    // Use service role to read sensitive data
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Fetch tenancy → verify caller is the tenant
    const { data: tenancy, error: tenancyErr } = await db
      .from('tenancies')
      .select('id, monthly_rent, tenant_id, property_id, properties(landlord_id)')
      .eq('id', tenancy_id)
      .eq('is_current', true)
      .single()

    if (tenancyErr || !tenancy) return json({ error: 'Tenancy not found' }, 404)
    if (tenancy.tenant_id !== user.id) return json({ error: 'Forbidden' }, 403)

    const landlordId = (tenancy.properties as { landlord_id: string } | null)?.landlord_id
    if (!landlordId) return json({ error: 'Property has no landlord assigned' }, 422)

    // Get management fee rate for this landlord
    const { data: landlordRow } = await db
      .from('landlords')
      .select('management_fee_percentage')
      .eq('id', landlordId)
      .maybeSingle()

    const feePct = landlordRow?.management_fee_percentage ?? DEFAULT_MANAGEMENT_FEE_PCT

    // Get the landlord's Stripe Connect account
    const { data: paymentAccount } = await db
      .from('landlord_payment_accounts')
      .select('stripe_account_id, onboarding_complete, charges_enabled')
      .eq('profile_id', landlordId)
      .maybeSingle()

    // Fetch maintenance request IDs for this tenancy
    const { data: mrRows } = await db
      .from('maintenance_requests')
      .select('id')
      .eq('tenancy_id', tenancy_id)

    const mrIds = (mrRows ?? []).map((r: { id: string }) => r.id)

    // Fetch any approved invoices queued for deduction against this tenancy
    const { data: queuedInvoices } = mrIds.length > 0
      ? await db
          .from('contractor_invoices')
          .select('id, total')
          .eq('deduction_queued', true)
          .eq('status', 'approved')
          .is('deducted_at', null)
          .in('maintenance_request_id', mrIds)
      : { data: [] }

    const repairDeductions = (queuedInvoices ?? []).reduce((sum: number, inv: { total: number }) => sum + inv.total, 0)
    const billedRent = Math.max(0, tenancy.monthly_rent - repairDeductions)

    const amountPence = Math.round(billedRent * 100)
    const feePence = Math.round(amountPence * feePct / 100)

    // If the landlord has a connected Stripe account with charges enabled, use destination charge
    const useConnect = paymentAccount?.charges_enabled === true

    const paymentIntentBody: Record<string, unknown> = {
      amount: amountPence,
      currency: 'gbp',
      automatic_payment_methods: { enabled: true },
      metadata: {
        tenancy_id,
        tenant_id: user.id,
        landlord_id: landlordId,
        management_fee_pct: feePct,
        repair_deductions: repairDeductions,
      },
    }

    if (useConnect && paymentAccount?.stripe_account_id) {
      paymentIntentBody.application_fee_amount = feePence
      paymentIntentBody.transfer_data = { destination: paymentAccount.stripe_account_id }
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: encodeBody(paymentIntentBody),
    })

    const pi = await stripeRes.json() as { id: string; client_secret: string; error?: { message: string } }
    if (!stripeRes.ok || pi.error) {
      return json({ error: pi.error?.message ?? 'Stripe error' }, 500)
    }

    // Record the pending payment
    const { data: rentPaymentRow } = await db.from('rent_payments').insert({
      tenancy_id,
      amount: billedRent,
      status: 'pending',
      stripe_payment_intent_id: pi.id,
      management_fee: billedRent * feePct / 100,
      landlord_payout_amount: billedRent * (1 - feePct / 100),
      repair_deductions: repairDeductions,
    }).select('id').single()

    // Mark invoices as deducted so they don't apply again next month
    if (repairDeductions > 0 && rentPaymentRow?.id && queuedInvoices && queuedInvoices.length > 0) {
      const invoiceIds = (queuedInvoices as { id: string }[]).map(inv => inv.id)
      await db.from('contractor_invoices')
        .update({ deducted_at: new Date().toISOString(), deduction_rent_payment_id: rentPaymentRow.id })
        .in('id', invoiceIds)
    }

    return json({
      client_secret: pi.client_secret,
      amount: billedRent,
      full_rent: tenancy.monthly_rent,
      repair_deductions: repairDeductions,
      management_fee: billedRent * feePct / 100,
      landlord_receives: billedRent * (1 - feePct / 100),
    })
  } catch (err) {
    console.error('[create-rent-payment]', err)
    return json({ error: String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function encodeBody(obj: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      parts.push(encodeBody(v as Record<string, unknown>, key))
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`)
    }
  }
  return parts.join('&')
}

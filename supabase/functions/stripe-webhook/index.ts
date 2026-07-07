import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

if (!STRIPE_WEBHOOK_SECRET) {
  throw new Error('STRIPE_WEBHOOK_SECRET env var is not set — refusing to start')
}

async function verifyStripeSignature(rawBody: string, sigHeader: string, secret: string): Promise<boolean> {
  const parts: Record<string, string> = {}
  for (const part of sigHeader.split(',')) {
    const idx = part.indexOf('=')
    if (idx > 0) parts[part.slice(0, idx)] = part.slice(idx + 1)
  }
  const timestamp = parts['t']
  const signature = parts['v1']
  if (!timestamp || !signature) return false

  const payload = `${timestamp}.${rawBody}`
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return hex === signature
}

serve(async (req) => {
  const sigHeader = req.headers.get('Stripe-Signature') ?? ''
  const rawBody = await req.text()

  const valid = await verifyStripeSignature(rawBody, sigHeader, STRIPE_WEBHOOK_SECRET)
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 })
  }

  let event: { type: string; data: { object: Record<string, unknown> } }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const obj = event.data.object

  try {
    if (event.type === 'account.updated') {
      const accountId = obj['id'] as string
      await db.from('landlord_payment_accounts')
        .update({
          onboarding_complete: obj['details_submitted'] === true,
          charges_enabled: obj['charges_enabled'] === true,
          payouts_enabled: obj['payouts_enabled'] === true,
        })
        .eq('stripe_account_id', accountId)

    } else if (event.type === 'payment_intent.succeeded') {
      const piId = obj['id'] as string
      const amountReceived = obj['amount_received'] as number
      const amountGBP = amountReceived != null ? amountReceived / 100 : null

      const { data: payment } = await db.from('rent_payments')
        .update({
          status: 'succeeded',
          paid_at: new Date().toISOString(),
          ...(amountGBP != null ? { amount: amountGBP } : {}),
        })
        .eq('stripe_payment_intent_id', piId)
        .select('tenancy_id, amount')
        .single()

      // Look up landlord and send email notification
      if (payment?.tenancy_id) {
        const { data: tenancy } = await db
          .from('tenancies')
          .select('monthly_rent, properties(address, landlord_id)')
          .eq('id', payment.tenancy_id)
          .single()

        const prop = (tenancy?.properties ?? null) as { address: string; landlord_id: string } | null

        if (prop?.landlord_id) {
          const { data: landlord } = await db
            .from('profiles')
            .select('email, full_name')
            .eq('id', prop.landlord_id)
            .single()

          if (landlord?.email) {
            await fetch(`${SUPABASE_URL}/functions/v1/send-rent-paid-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
              },
              body: JSON.stringify({
                landlordEmail: landlord.email,
                landlordName: landlord.full_name ?? 'Landlord',
                propertyAddress: prop.address,
                amount: payment.amount ?? tenancy?.monthly_rent ?? 0,
                paidDate: new Date().toISOString().slice(0, 10),
                paymentMethod: 'Card',
              }),
            }).catch(err => console.error('[stripe-webhook] email error:', err))
          }
        }
      }

    } else if (event.type === 'payment_intent.payment_failed') {
      const piId = obj['id'] as string
      const lastError = obj['last_payment_error'] as Record<string, string> | null
      await db.from('rent_payments')
        .update({
          status: 'failed',
          failure_reason: lastError?.message ?? 'Payment failed',
          failure_code: lastError?.code ?? null,
          last_failed_at: new Date().toISOString(),
        })
        .eq('stripe_payment_intent_id', piId)
    }
  } catch (err) {
    console.error('[stripe-webhook] handler error:', err)
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

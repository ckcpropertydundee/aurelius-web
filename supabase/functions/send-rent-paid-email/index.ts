import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM = 'Aurelius Property Management <noreply@aureliuspropertymanagement.co.uk>'
const DASHBOARD_URL = 'https://login.aureliuspropertymanagement.co.uk'

interface RentPaidPayload {
  landlordEmail: string
  landlordName: string
  propertyAddress: string
  amount: number
  paidDate: string        // ISO date e.g. '2026-07-05'
  paymentMethod?: string  // e.g. 'Bank Transfer', 'Cash'
}

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function gbp(amount: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(amount)
}

function emailBase(bodyHtml: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{margin:0;padding:0;background:#f4f4f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:300}
  .wrap{max-width:540px;margin:40px auto;background:#fff;border:0.5px solid #e0ded8}
  .hdr{background:#0d1b3e;padding:28px 32px}
  .hdr-title{font-family:Georgia,serif;font-size:13px;letter-spacing:8px;text-transform:uppercase;color:#fff;margin:0}
  .body{padding:32px}
  .footer{padding:20px 32px;border-top:0.5px solid #e0ded8;font-size:11px;color:#aaa;letter-spacing:1px;text-transform:uppercase}
  h2{font-family:Georgia,serif;font-size:22px;font-weight:400;color:#0d1b3e;margin:0 0 20px}
  p{font-size:14px;color:#4a5878;line-height:1.7;margin:0 0 14px}
  .detail{background:#f8f7f4;border:0.5px solid #e0ded8;padding:16px 20px;margin:20px 0}
  .detail p{margin:4px 0;font-size:13px}
  .detail .label{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#aaa;margin-bottom:10px}
  .amount{font-family:Georgia,serif;font-size:28px;color:#0d1b3e;margin:4px 0}
  .btn{display:inline-block;margin-top:8px;padding:12px 24px;background:#0d1b3e;color:#fff;text-decoration:none;font-size:11px;letter-spacing:2px;text-transform:uppercase}
  </style></head><body><div class="wrap">
  <div class="hdr"><p class="hdr-title">Aurelius</p></div>
  <div class="body">${bodyHtml}</div>
  <div class="footer">Aurelius Property Management · Dundee · aureliuspropertymanagement.co.uk</div>
  </div></body></html>`
}

function rentPaidEmail(p: RentPaidPayload) {
  const firstName = p.landlordName.split(' ')[0]
  return {
    subject: `Rent Received — ${p.propertyAddress}`,
    html: emailBase(`
      <h2>Rent Payment Received</h2>
      <p>Hi ${firstName},</p>
      <p>A rent payment has been received for your property at <strong style="color:#0d1b3e">${p.propertyAddress}</strong>.</p>
      <div class="detail">
        <p class="label">Payment details</p>
        <p class="amount">${gbp(p.amount)}</p>
        <p style="color:#4a5878">${fmtDate(p.paidDate)}${p.paymentMethod ? ` · ${p.paymentMethod}` : ''}</p>
      </div>
      <p>You can view this payment and your full payment history in your dashboard.</p>
      <a href="${DASHBOARD_URL}" class="btn">View Dashboard</a>
    `),
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const payload = await req.json() as RentPaidPayload

    if (!payload?.landlordEmail) {
      return new Response(JSON.stringify({ ok: false, error: 'missing landlordEmail' }), { status: 400 })
    }

    const { subject, html } = rentPaidEmail(payload)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: payload.landlordEmail,
        subject,
        html,
      }),
    })

    const data = await res.json()
    return new Response(JSON.stringify({ ok: res.ok, data }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: res.ok ? 200 : 500,
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 })
  }
})

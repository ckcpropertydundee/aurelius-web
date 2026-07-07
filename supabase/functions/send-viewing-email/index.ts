import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM = 'Aurelius Property Management <viewings@aureliuspropertymanagement.co.uk>'
const REPLY_TO = 'aureliuspropertymanagement@gmail.com'
const LISTINGS_URL = 'https://login.aureliuspropertymanagement.co.uk/for-let'

interface ViewingPayload {
  name: string
  email: string
  address: string
  date: string   // ISO date e.g. '2026-07-10'
  time: string   // e.g. '10:00 am'
}

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
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
  .btn{display:inline-block;margin-top:8px;padding:12px 24px;background:#0d1b3e;color:#fff;text-decoration:none;font-size:11px;letter-spacing:2px;text-transform:uppercase}
  </style></head><body><div class="wrap">
  <div class="hdr"><p class="hdr-title">Aurelius</p></div>
  <div class="body">${bodyHtml}</div>
  <div class="footer">Aurelius Property Management · Dundee · aureliuspropertymanagement.co.uk</div>
  </div></body></html>`
}

function confirmedEmail(v: ViewingPayload) {
  return {
    subject: `Viewing Confirmed — ${esc(v.address)}`,
    html: emailBase(`
      <h2>Your Viewing is Confirmed</h2>
      <p>Hi ${esc(v.name)},</p>
      <p>Your viewing has been confirmed. We look forward to seeing you.</p>
      <div class="detail">
        <p class="label">Viewing details</p>
        <p><strong style="color:#0d1b3e">${esc(v.address)}</strong></p>
        <p>${fmtDate(v.date)} at ${esc(v.time)}</p>
      </div>
      <p>If you have any questions, reply to this email or contact us at <a href="mailto:${REPLY_TO}" style="color:#0d1b3e">${REPLY_TO}</a>.</p>
    `),
  }
}

function receivedEmail(v: ViewingPayload) {
  return {
    subject: `Viewing Request Received — ${esc(v.address)}`,
    html: emailBase(`
      <h2>Request Received</h2>
      <p>Hi ${esc(v.name)},</p>
      <p>We've received your viewing request and will be in touch shortly to confirm.</p>
      <div class="detail">
        <p class="label">Requested viewing</p>
        <p><strong style="color:#0d1b3e">${esc(v.address)}</strong></p>
        <p>${fmtDate(v.date)} at ${esc(v.time)}</p>
      </div>
      <p>If you need to change anything in the meantime, reply to this email or contact us at <a href="mailto:${REPLY_TO}" style="color:#0d1b3e">${REPLY_TO}</a>.</p>
    `),
  }
}

function cancelledEmail(v: ViewingPayload) {
  return {
    subject: `Viewing Cancelled — ${esc(v.address)}`,
    html: emailBase(`
      <h2>Viewing Cancelled</h2>
      <p>Hi ${esc(v.name)},</p>
      <p>Unfortunately your viewing at <strong style="color:#0d1b3e">${esc(v.address)}</strong> on ${fmtDate(v.date)} at ${esc(v.time)} has been cancelled.</p>
      <p>This may be because the property has been let to another applicant. Please browse our other available properties — we may have something that suits you.</p>
      <a href="${LISTINGS_URL}" class="btn">View Available Properties</a>
      <p style="margin-top:20px">If you have any questions, reply to this email or contact us at <a href="mailto:${REPLY_TO}" style="color:#0d1b3e">${REPLY_TO}</a>.</p>
    `),
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const { type, viewing } = await req.json() as { type: 'confirmed' | 'received' | 'cancelled'; viewing: ViewingPayload }

    if (!viewing?.email) return new Response(JSON.stringify({ ok: false, error: 'no email' }), { status: 400 })

    const emailContent = type === 'confirmed' ? confirmedEmail(viewing)
      : type === 'received' ? receivedEmail(viewing)
      : cancelledEmail(viewing)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to: viewing.email, ...emailContent }),
    })

    const data = await res.json()
    return new Response(JSON.stringify({ ok: res.ok, data }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: res.ok ? 200 : 500,
    })
  } catch (err) {
    console.error('[send-viewing-email]', err)
    return new Response(JSON.stringify({ ok: false, error: 'Failed to send email. Please try again.' }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

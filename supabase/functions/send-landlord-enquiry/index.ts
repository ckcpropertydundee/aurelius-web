import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM = 'Aurelius Property Management <noreply@aureliuspropertymanagement.co.uk>'
const NOTIFY_TO = 'aureliuspropertymanagement.ltd@gmail.com'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EnquiryPayload {
  name: string
  email: string
  phone?: string
  properties: string
  message?: string
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
  .detail p{margin:6px 0;font-size:13px;color:#4a5878}
  .detail .label{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#aaa;margin-bottom:10px}
  strong{color:#0d1b3e}
  </style></head><body><div class="wrap">
  <div class="hdr"><p class="hdr-title">Aurelius</p></div>
  <div class="body">${bodyHtml}</div>
  <div class="footer">Aurelius Property Management · aureliuspropertymanagement.co.uk</div>
  </div></body></html>`
}

function notifyEmail(p: EnquiryPayload) {
  return {
    subject: `New Landlord Enquiry — ${p.name}`,
    html: emailBase(`
      <h2>New Landlord Enquiry</h2>
      <p>A landlord has submitted an access request through the website.</p>
      <div class="detail">
        <p class="label">Enquiry details</p>
        <p><strong>Name</strong><br>${p.name}</p>
        <p><strong>Email</strong><br><a href="mailto:${p.email}" style="color:#0d1b3e">${p.email}</a></p>
        ${p.phone ? `<p><strong>Phone</strong><br>${p.phone}</p>` : ''}
        <p><strong>Number of properties</strong><br>${p.properties}</p>
        ${p.message ? `<p><strong>Message</strong><br>${p.message}</p>` : ''}
      </div>
      <p>Reply directly to this email to respond to the enquiry.</p>
    `),
  }
}

function confirmationEmail(p: EnquiryPayload) {
  const firstName = p.name.split(' ')[0]
  return {
    subject: 'We\'ve received your enquiry — Aurelius',
    html: emailBase(`
      <h2>Enquiry Received</h2>
      <p>Hi ${firstName},</p>
      <p>Thanks for getting in touch. We've received your request and will be in touch within one business day to discuss getting your portfolio set up on Aurelius.</p>
      <div class="detail">
        <p class="label">Your details</p>
        <p><strong>Name</strong><br>${p.name}</p>
        <p><strong>Properties</strong><br>${p.properties}</p>
        ${p.message ? `<p><strong>Notes</strong><br>${p.message}</p>` : ''}
      </div>
      <p>If you have any questions in the meantime, reply to this email.</p>
    `),
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const payload = await req.json() as EnquiryPayload

    if (!payload?.name || !payload?.email || !payload?.properties) {
      return new Response(JSON.stringify({ ok: false, error: 'missing required fields' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const send = (to: string, subject: string, html: string) =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, reply_to: payload.email, to, subject, html }),
      })

    const { subject: notifySubject, html: notifyHtml } = notifyEmail(payload)
    const { subject: confirmSubject, html: confirmHtml } = confirmationEmail(payload)

    const [notifyRes, confirmRes] = await Promise.all([
      send(NOTIFY_TO, notifySubject, notifyHtml),
      send(payload.email, confirmSubject, confirmHtml),
    ])

    if (!notifyRes.ok) {
      const err = await notifyRes.json()
      return new Response(JSON.stringify({ ok: false, error: err }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[send-landlord-enquiry]', err)
    return new Response(JSON.stringify({ ok: false, error: 'Failed to send enquiry. Please try again.' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})

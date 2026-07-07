import { useState, useEffect, useRef, type ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { gbp, shortDate, greeting, initials, fmtDate, fmtDateTime, docUrl } from '../lib/utils'
import DashShell from '../components/DashShell'
import SectionHeader from '../components/SectionHeader'
import EmptyState from '../components/EmptyState'
import SettingsPage from './SettingsPage'
import PayRentModal from '../components/PayRentModal'
import MessageThread from '../components/MessageThread'
import { IconHouse, IconSterling, IconWrench, IconDoc, IconGear, IconCreditCard } from '../components/icons'

function IconCard() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.11 0-2 .89-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>
}
function IconPin() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
}
function IconCal() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3h-1V1h-2v2H8V1H6v2H5C3.9 3 3 3.9 3 5v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5c0-1.1-.9-2-2-2zm0 18H5V9h14v12zM5 7V5h14v2H5z"/></svg>
}
function IconDownload() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5v-2z"/></svg>
}
function IconMail() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>
}
function IconChevronRight() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
}
function IconCheckCircle() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
}

const TABS = [
  { id: 'home',        label: 'Home',        icon: <IconHouse /> },
  { id: 'payments',    label: 'Payments',    icon: <IconSterling /> },
  { id: 'maintenance', label: 'Maintenance', icon: <IconWrench /> },
  { id: 'documents',   label: 'Documents',   icon: <IconDoc /> },
  { id: 'settings',    label: 'Settings',    icon: <IconGear /> },
]

interface TenancyData {
  id: string; address: string; monthly_rent: number
  start_date: string; end_date: string | null; property_id: string
  deposit: number | null
  deposit_scheme: string | null; deposit_registered_date: string | null
  last_rent_increase_date: string | null
  epc_rating: string | null; landlord_registration_number: string | null
}
interface RentPayment {
  id: string; amount: number; created_at: string; status: string
  stripe_payment_intent_id: string | null
}
interface MaintRequest {
  id: string; title: string | null; description: string | null
  created_at: string | null; status: string | null; priority: string | null
  scheduled_at: string | null
  tenant_home_at_scheduled: boolean | null
  tenant_keys_ok: boolean | null
  tenant_alt_datetime: string | null
}
interface TenantDoc {
  id: string; label: string; type: string; uploaded_at: string; url: string
}
interface TenantComplianceItem {
  id: string; type: string; issue_date: string | null; expiry_date: string | null; document_url: string | null
}

const DIVIDER: React.CSSProperties = { height: 1, background: 'rgba(255,255,255,0.07)', margin: '0 16px' }
const CARD: React.CSSProperties = { background: '#112240', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }

function maintBadge(status: string | null) {
  switch (status) {
    case 'resolved': case 'closed': return { bg: 'rgba(74,222,128,0.12)', color: '#4ade80' }
    case 'in_progress': case 'assigned': return { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' }
    default: return { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' }
  }
}

import type React from 'react'

interface AppNotification {
  id: string; type: string; title: string; body: string; read_at: string | null; created_at: string
}

export default function TenantDashboard() {
  const { user } = useAuth()
  const [tab, setTab] = useState('home')
  const [showPayRent, setShowPayRent] = useState(false)
  const [showNewRequest, setShowNewRequest] = useState(false)
  const [showHandInNotice, setShowHandInNotice] = useState(false)
  const [tenancy, setTenancy] = useState<TenancyData | null>(null)
  const [payments, setPayments] = useState<RentPayment[]>([])
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintRequest[]>([])
  const [documents, setDocuments] = useState<TenantDoc[]>([])
  const [complianceItems, setComplianceItems] = useState<TenantComplianceItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    async function load() {
      try {
        const { data: tenancyRow } = await supabase
          .from('tenancies')
          .select('id, monthly_rent, start_date, end_date, property_id, deposit, deposit_scheme, deposit_registered_date, last_rent_increase_date, properties(address, epc_rating, landlord_registration_number)')
          .eq('tenant_id', user!.id).eq('is_current', true).limit(1).maybeSingle()
        if (tenancyRow) {
          const raw = tenancyRow as unknown as {
            id: string; monthly_rent: number; start_date: string; end_date: string | null
            property_id: string; deposit: number | null
            deposit_scheme: string | null; deposit_registered_date: string | null
            last_rent_increase_date: string | null
            properties: { address: string; epc_rating: string | null; landlord_registration_number: string | null } | null
          }
          const t: TenancyData = {
            id: raw.id, address: raw.properties?.address ?? '',
            monthly_rent: raw.monthly_rent, start_date: raw.start_date,
            end_date: raw.end_date, property_id: raw.property_id,
            deposit: raw.deposit,
            deposit_scheme: raw.deposit_scheme, deposit_registered_date: raw.deposit_registered_date,
            last_rent_increase_date: raw.last_rent_increase_date,
            epc_rating: raw.properties?.epc_rating ?? null,
            landlord_registration_number: raw.properties?.landlord_registration_number ?? null,
          }
          setTenancy(t)
          const [{ data: pays }, { data: maints }, { data: docs }, { data: compliance }] = await Promise.all([
            supabase.from('rent_payments').select('id, amount, created_at, status, stripe_payment_intent_id')
              .eq('tenancy_id', raw.id).order('created_at', { ascending: false }).limit(20),
            supabase.from('maintenance_requests').select('id, title, description, created_at, status, priority, scheduled_at, tenant_home_at_scheduled, tenant_keys_ok, tenant_alt_datetime')
              .eq('tenancy_id', raw.id).order('created_at', { ascending: false }),
            supabase.from('documents').select('id, label, type, uploaded_at, url')
              .eq('property_id', raw.property_id).order('uploaded_at', { ascending: false }),
            supabase.from('compliance_items').select('id, type, issue_date, expiry_date, document_url')
              .eq('property_id', raw.property_id).order('expiry_date', { ascending: true }),
          ])
          setPayments((pays ?? []) as RentPayment[])
          setMaintenanceRequests((maints ?? []) as MaintRequest[])
          setDocuments((docs ?? []) as TenantDoc[])
          setComplianceItems((compliance ?? []) as TenantComplianceItem[])
        }
      } catch (e) { console.error(e) }
      finally { setIsLoading(false) }
    }
    load()
  }, [user])

  // Real-time notification subscription
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('tenant-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as AppNotification
          setToast(n.title + (n.body ? `: ${n.body}` : ''))
          setTimeout(() => setToast(null), 5000)
          // If it's a maintenance update, refresh requests
          if (n.type === 'job_scheduled' || n.type === 'job_resolved') {
            supabase.from('maintenance_requests')
              .select('id, title, description, created_at, status, priority, scheduled_at, tenant_home_at_scheduled, tenant_keys_ok, tenant_alt_datetime')
              .eq('tenancy_id', tenancy?.id ?? '')
              .order('created_at', { ascending: false })
              .then(({ data }) => { if (data) setMaintenanceRequests(data as MaintRequest[]) })
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, tenancy?.id])

  const now = new Date()
  const isPaidThisMonth = payments.some((p) => {
    const d = new Date(p.created_at)
    return (p.status === 'succeeded' || p.status === 'paid') &&
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })

  const firstName = user?.full_name?.split(' ')[0] ?? 'Tenant'
  const userInitials = initials(user?.full_name, user?.email ?? '')
  const tenancyStart = tenancy?.start_date ? new Date(tenancy.start_date) : null
  const tenancyEnd = tenancy?.end_date ? new Date(tenancy.end_date) : null
  const tenancyTotal = tenancyStart && tenancyEnd ? tenancyEnd.getTime() - tenancyStart.getTime() : 1
  const tenancyElapsed = tenancyStart ? Date.now() - tenancyStart.getTime() : 0
  const tenancyProgress = Math.min(1, Math.max(0, tenancyElapsed / tenancyTotal))
  const monthsRemaining = tenancyEnd ? Math.max(0, Math.floor((tenancyEnd.getTime() - Date.now()) / (30 * 86400000))) : null

  const metrics = [
    { label: 'Monthly Rent', value: tenancy ? gbp(tenancy.monthly_rent) : '—' },
    { label: 'Due', value: '1st Monthly' },
    ...(monthsRemaining !== null ? [{ label: 'Months Remaining', value: String(monthsRemaining) }] : []),
    { label: 'Maintenance', value: String(maintenanceRequests.filter((r) => r.status === 'open').length) + ' open' },
  ]

  function exportInfoPack() {
    if (!tenancy) return
    const generated = fmtDateTime(new Date().toISOString())
    const compRows = complianceItems.map(c => {
      const expired = c.expiry_date ? new Date(c.expiry_date) < new Date() : false
      const status = expired ? 'Expired' : 'Valid'
      const statusColor = expired ? '#dc2626' : '#15803d'
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827">${c.type}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151">${fmtDate(c.issue_date)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151">${fmtDate(c.expiry_date)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px">
          <span style="color:${statusColor};font-weight:600">${status}</span>
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px">${c.document_url ? `<a href="${docUrl(c.document_url) ?? c.document_url}" style="color:#2563eb">View PDF</a>` : '—'}</td>
      </tr>`
    }).join('')
    const docRows = documents.map(d => `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827">${d.label}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280">${d.type}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px"><a href="${d.url}" style="color:#2563eb">View</a></td>
      </tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Tenant Information Pack — ${tenancy.address}</title>
    <style>
      body { font-family: -apple-system, Arial, sans-serif; margin: 0; padding: 32px 40px; color: #111827; }
      h1 { font-size: 22px; margin: 0 0 4px; }
      h2 { font-size: 14px; font-weight: 600; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #e5e7eb; color: #374151; }
      .sub { font-size: 13px; color: #6b7280; margin: 0 0 0; }
      table { width: 100%; border-collapse: collapse; }
      thead th { padding: 8px 10px; background: #f9fafb; border-bottom: 2px solid #e5e7eb; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 4px; }
      .info-item { background: #f9fafb; border-radius: 8px; padding: 12px 16px; }
      .info-label { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #9ca3af; margin-bottom: 4px; }
      .info-value { font-size: 16px; font-weight: 600; color: #111827; }
      @media print { a { color: #2563eb !important; } }
    </style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
      <div>
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#9ca3af;margin-bottom:6px">Aurelius Property Management</div>
        <h1>Tenant Information Pack</h1>
        <p class="sub">${tenancy.address}</p>
      </div>
      <div style="text-align:right;font-size:12px;color:#6b7280">
        <div>Generated</div>
        <div style="font-weight:600;color:#111827">${generated}</div>
      </div>
    </div>

    <h2>Tenancy Details</h2>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Tenant</div><div class="info-value">${user?.full_name ?? user?.email ?? '—'}</div></div>
      <div class="info-item"><div class="info-label">Monthly Rent</div><div class="info-value">${gbp(tenancy.monthly_rent)}</div></div>
      <div class="info-item"><div class="info-label">Tenancy Start</div><div class="info-value">${fmtDate(tenancy.start_date)}</div></div>
      <div class="info-item"><div class="info-label">Tenancy End</div><div class="info-value">${tenancy.end_date ? fmtDate(tenancy.end_date) : 'Ongoing'}</div></div>
    </div>

    <h2>Compliance Certificates</h2>
    ${complianceItems.length === 0
      ? '<p style="font-size:13px;color:#6b7280">No compliance certificates on record.</p>'
      : `<table><thead><tr><th>Certificate</th><th>Issued</th><th>Expires</th><th>Status</th><th>Document</th></tr></thead><tbody>${compRows}</tbody></table>`}

    ${documents.length > 0 ? `
    <h2>Shared Documents</h2>
    <table><thead><tr><th>Document</th><th>Type</th><th>Link</th></tr></thead><tbody>${docRows}</tbody></table>` : ''}

    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af">
      Generated ${generated} · Aurelius Property Management · This document is for information purposes only.
    </div>
    </body></html>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 400)
  }

  return (
    <DashShell tabs={TABS} active={tab} onChange={setTab} metrics={metrics} userInitials={userInitials}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: '#1d4ed8', color: '#fff', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 500, boxShadow: '0 4px 20px rgba(0,0,0,0.4)', maxWidth: '90vw', textAlign: 'center' }}>
          {toast}
        </div>
      )}

      {/* ── HOME ── */}
      {tab === 'home' && (
        <div className="px-4 py-5 flex flex-col gap-5">
          <div>
            <p style={{ fontSize: 12, color: '#8899aa' }}>{greeting()}</p>
            <p style={{ fontSize: 26, fontWeight: 300, color: '#e8edf5', marginTop: 2, fontFamily: 'Georgia, serif' }}>{firstName}</p>
          </div>

          {/* Rent card */}
          {isLoading ? (
            <div style={{ ...CARD, height: 112, opacity: 0.4 }} className="animate-pulse" />
          ) : tenancy ? (
            <div style={CARD}>
              <div style={{ padding: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa' }}>Monthly Rent</p>
                  <p style={{ fontSize: 32, fontWeight: 300, color: '#e8edf5', lineHeight: 1.1, marginTop: 4, fontFamily: 'Georgia, serif' }}>{gbp(tenancy.monthly_rent)}</p>
                  <p style={{ fontSize: 12, color: '#8899aa', marginTop: 4 }}>Due 1st of each month</p>
                </div>
                <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', padding: '4px 10px', borderRadius: 4, background: isPaidThisMonth ? 'rgba(74,222,128,0.12)' : 'rgba(251,191,36,0.15)', color: isPaidThisMonth ? '#4ade80' : '#fbbf24' }}>
                  {isPaidThisMonth ? 'PAID' : 'DUE'}
                </span>
              </div>
              <div style={DIVIDER} />
              <button type="button" onClick={() => setShowPayRent(true)}
                style={{ width: '100%', padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, fontWeight: 500, color: '#e8edf5', background: 'transparent' }}>
                <IconCard /> Pay Rent
              </button>
            </div>
          ) : (
            <EmptyState icon={<IconHouse />} title="No active tenancy" subtitle="Contact your landlord if this is incorrect" />
          )}

          {/* Property info */}
          {tenancy && (
            <div>
              <SectionHeader title="Your Property" />
              <div style={CARD}>
                <PropertyInfoRow icon={<IconPin />} label="Address" value={tenancy.address} />
                {tenancyStart && (
                  <>
                    <div style={DIVIDER} />
                    <PropertyInfoRow icon={<IconCal />} label="Start Date" value={shortDate(tenancyStart)} />
                  </>
                )}
                {tenancyEnd && (
                  <div style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: '#8899aa' }}>{monthsRemaining} months remaining</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 2, background: '#8899aa', width: `${tenancyProgress * 100}%`, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                )}
                {(tenancy.epc_rating || tenancy.landlord_registration_number) && (
                  <>
                    <div style={DIVIDER} />
                    <div style={{ padding: '12px 16px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {tenancy.epc_rating && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa' }}>EPC</span>
                          <span style={{ fontSize: 13, fontWeight: 700, padding: '2px 10px', borderRadius: 4, background: 'rgba(96,165,250,0.15)', color: '#60a5fa', letterSpacing: '0.05em' }}>{tenancy.epc_rating}</span>
                        </div>
                      )}
                      {tenancy.landlord_registration_number && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa' }}>Landlord Reg</span>
                          <span style={{ fontSize: 11, color: '#c8d4e0' }}>{tenancy.landlord_registration_number}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Deposit & PRT Rights */}
          {tenancy && (
            <div>
              <SectionHeader title="Deposit & Tenancy Rights" />
              <div style={CARD}>
                {/* Deposit scheme */}
                <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: tenancy.deposit_scheme ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {tenancy.deposit_scheme
                      ? <svg width="15" height="15" viewBox="0 0 24 24" fill="#4ade80"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                      : <svg width="15" height="15" viewBox="0 0 24 24" fill="#f87171"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                    }
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 2 }}>Deposit Protection</p>
                    {tenancy.deposit_scheme ? (
                      <>
                        <p style={{ fontSize: 13, color: '#4ade80' }}>{tenancy.deposit_scheme}</p>
                        {tenancy.deposit_registered_date && (
                          <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>Registered {fmtDate(tenancy.deposit_registered_date)}</p>
                        )}
                        {tenancy.deposit != null && (
                          <p style={{ fontSize: 11, color: '#8899aa' }}>Amount: {gbp(tenancy.deposit)}</p>
                        )}
                      </>
                    ) : (
                      <>
                        <p style={{ fontSize: 13, color: '#f87171' }}>Not registered</p>
                        <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2, lineHeight: 1.4 }}>
                          Your landlord must register your deposit with an approved scheme within 30 working days. If not, you may be entitled to a penalty of up to 3× the deposit amount.
                        </p>
                      </>
                    )}
                  </div>
                </div>
                <div style={DIVIDER} />
                {/* Rent increase rights */}
                <div style={{ padding: '13px 16px' }}>
                  <p style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 6 }}>Rent Increase Rights (PRT)</p>
                  {tenancy.last_rent_increase_date ? (() => {
                    const nextEligible = new Date(tenancy.last_rent_increase_date!)
                    nextEligible.setFullYear(nextEligible.getFullYear() + 1)
                    const eligible = nextEligible <= new Date()
                    return (
                      <>
                        <p style={{ fontSize: 12, color: '#8899aa' }}>Last increase: {fmtDate(tenancy.last_rent_increase_date)}</p>
                        <p style={{ fontSize: 12, color: eligible ? '#fbbf24' : '#4ade80', marginTop: 3 }}>
                          {eligible ? `Next eligible increase possible — landlord must give 3 months written notice` : `Next eligible: ${fmtDate(nextEligible.toISOString().slice(0, 10))}`}
                        </p>
                      </>
                    )
                  })() : (
                    <p style={{ fontSize: 12, color: '#4ade80' }}>No rent increases recorded</p>
                  )}
                  <p style={{ fontSize: 11, color: '#8899aa', marginTop: 6, lineHeight: 1.5 }}>
                    Your landlord can only increase rent once per 12 months and must give you 3 full months' written notice.
                  </p>
                </div>
                <div style={DIVIDER} />
                {/* Notice rights */}
                <div style={{ padding: '12px 16px' }}>
                  <p style={{ fontSize: 11, color: '#8899aa', lineHeight: 1.5 }}>
                    <span style={{ color: '#c8d4e0', fontWeight: 500 }}>Your notice rights: </span>
                    Give at least 28 days written notice to end your tenancy. Notice begins 2 days after you send it. All joint tenants must agree and sign.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Maintenance */}
          <div>
            <SectionHeader title="Maintenance" action={tenancy ? { label: '+ Report', onClick: () => setShowNewRequest(true) } : undefined} />
            {isLoading ? (
              <div style={{ ...CARD, height: 64, opacity: 0.4 }} className="animate-pulse" />
            ) : maintenanceRequests.length === 0 ? (
              <EmptyState icon={<IconWrench />} title="No requests" subtitle="Tap '+ New' to report an issue" />
            ) : (
              <div style={CARD}>
                {maintenanceRequests.slice(0, 3).map((r, i) => {
                  const b = maintBadge(r.status)
                  return (
                    <div key={r.id}>
                      <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }} className="truncate">{r.title ?? 'Untitled'}</p>
                          {r.description && <p style={{ fontSize: 12, color: '#8899aa', marginTop: 2 }} className="truncate">{r.description}</p>}
                          <p style={{ fontSize: 10, color: '#8899aa', marginTop: 3 }}>
                            {r.created_at ? shortDate(new Date(r.created_at)) : ''}{r.priority ? ` · ${r.priority}` : ''}
                          </p>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4, background: b.bg, color: b.color, flexShrink: 0, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                          {r.status ?? 'open'}
                        </span>
                      </div>
                      {i < Math.min(maintenanceRequests.length, 3) - 1 && <div style={DIVIDER} />}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Documents */}
          <div>
            <SectionHeader title="My Documents" />
            {isLoading ? (
              <div style={{ ...CARD, height: 64, opacity: 0.4 }} className="animate-pulse" />
            ) : (
              <div style={CARD}>
                {tenancy && (
                  <>
                    <button type="button" onClick={exportInfoPack}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(96,165,250,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="#60a5fa"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zm-3 6h4v1.5H9V15zm0-3h6v1.5H9V12zm0-3h2v1.5H9V9z"/></svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>Tenant Information Pack</p>
                        <p style={{ fontSize: 11, color: '#8899aa' }}>Tap to download · Your tenancy guide</p>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#8899aa"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                    </button>
                    {documents.length > 0 && <div style={DIVIDER} />}
                  </>
                )}
                {documents.map((d, i) => (
                  <div key={d.id}>
                    <a href={d.url} target="_blank" rel="noreferrer"
                      style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#8899aa' }}>
                        <IconDoc />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }} className="truncate">{d.label}</p>
                        <p style={{ fontSize: 11, color: '#8899aa' }}>{d.type} · {shortDate(new Date(d.uploaded_at))}</p>
                      </div>
                      <span style={{ color: '#8899aa' }}><IconDownload /></span>
                    </a>
                    {i < documents.length - 1 && <div style={DIVIDER} />}
                  </div>
                ))}
                {!tenancy && documents.length === 0 && (
                  <p style={{ padding: '16px', fontSize: 12, color: '#8899aa', textAlign: 'center' }}>Shared documents will appear here</p>
                )}
              </div>
            )}
          </div>

          {/* Property Compliance */}
          {!isLoading && (
            <div>
              <SectionHeader title="Property Compliance" />
              {(() => {
                const today = new Date()
                const requiredKeys = ['gas', 'eicr', 'epc', 'legionella', 'smoke']
                const missingOrExpired = requiredKeys.filter(key => {
                  const match = complianceItems.find(c => c.type.toLowerCase().includes(key))
                  if (!match) return true
                  if (key === 'smoke') return false
                  return match.expiry_date ? new Date(match.expiry_date) < today : false
                })
                return missingOrExpired.length > 0 ? (
                  <div style={{ ...CARD, padding: '13px 16px', marginBottom: 8, borderColor: 'rgba(248,113,113,0.3)' }}>
                    <p style={{ fontSize: 12, color: '#f87171', fontWeight: 500, marginBottom: 6 }}>Action required — contact your agent</p>
                    <p style={{ fontSize: 11, color: '#8899aa', lineHeight: 1.5, marginBottom: 6 }}>
                      The following required certificates are missing or expired. Your landlord has a legal obligation to provide these. You may apply to the First-tier Tribunal if they fail to comply.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {missingOrExpired.map(key => {
                        const labels: Record<string, string> = { gas: 'Gas Safety Certificate', eicr: 'EICR (Electrical)', epc: 'EPC', legionella: 'Legionella Risk Assessment', smoke: 'Smoke / Heat / CO Alarms' }
                        const match = complianceItems.find(c => c.type.toLowerCase().includes(key))
                        const isExpired = match?.expiry_date && new Date(match.expiry_date) < today
                        return (
                          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f87171', flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: '#f87171' }}>{labels[key]}{isExpired ? ' (expired)' : ' (missing)'}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null
              })()}
              {complianceItems.length > 0 && (
                <div style={CARD}>
                  {complianceItems.map((item, i) => {
                    const expiry = item.expiry_date ? new Date(item.expiry_date) : null
                    const daysUntil = expiry ? Math.ceil((expiry.getTime() - Date.now()) / 86400000) : null
                    const color = daysUntil == null ? '#8899aa' : daysUntil < 0 ? '#f87171' : daysUntil < 60 ? '#fbbf24' : '#4ade80'
                    const bg = daysUntil == null ? 'rgba(136,153,170,0.1)' : daysUntil < 0 ? 'rgba(248,113,113,0.1)' : daysUntil < 60 ? 'rgba(251,191,36,0.1)' : 'rgba(74,222,128,0.1)'
                    const label = daysUntil == null ? '—' : daysUntil < 0 ? 'Expired' : daysUntil < 60 ? `${daysUntil}d` : fmtDate(item.expiry_date)
                    return (
                      <div key={item.id}>
                        <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }} className="truncate">{item.type}</p>
                            {item.expiry_date && <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>Expires {fmtDate(item.expiry_date)}</p>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            {item.document_url && (
                              <a href={docUrl(item.document_url) ?? '#'} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 11, color: '#60a5fa', textDecoration: 'none', padding: '2px 8px', borderRadius: 4, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}>
                                View
                              </a>
                            )}
                            <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 4, background: bg, color }}>
                              {label}
                            </span>
                          </div>
                        </div>
                        {i < complianceItems.length - 1 && <div style={DIVIDER} />}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Hand in notice */}
          <button type="button" onClick={() => setShowHandInNotice(true)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16, borderRadius: 12, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)', color: '#f87171' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <IconMail />
              <span style={{ fontSize: 14, fontWeight: 500 }}>Hand In Notice</span>
            </div>
            <IconChevronRight />
          </button>
        </div>
      )}

      {/* ── PAYMENTS ── */}
      {tab === 'payments' && (
        <div className="px-4 py-5 flex flex-col gap-4">
          {tenancy && (
            <button type="button" onClick={() => setShowPayRent(true)}
              style={{ width: '100%', padding: '14px', background: '#112240', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, fontSize: 14, fontWeight: 500, color: '#e8edf5', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <IconCard /> Pay Rent — {gbp(tenancy.monthly_rent)}
            </button>
          )}
          <SectionHeader title="Payment History" />
          {isLoading ? (
            <div style={{ ...CARD, height: 64, opacity: 0.4 }} className="animate-pulse" />
          ) : payments.length === 0 ? (
            <EmptyState icon={<IconCreditCard />} title="No payments yet" subtitle="Your payment history will appear here" />
          ) : (
            <div style={CARD}>
              {payments.map((p, i) => {
                const isPaid = p.status === 'succeeded' || p.status === 'paid'
                return (
                  <div key={p.id}>
                    <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isPaid ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)', color: isPaid ? '#4ade80' : '#f87171' }}>
                        <IconCheckCircle />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>{gbp(p.amount)}</p>
                        <p style={{ fontSize: 11, color: '#8899aa' }}>{shortDate(new Date(p.created_at))}</p>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 500, color: isPaid ? '#4ade80' : '#fbbf24' }}>
                        {isPaid ? 'Paid' : p.status}
                      </span>
                    </div>
                    {i < payments.length - 1 && <div style={DIVIDER} />}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MAINTENANCE ── */}
      {tab === 'maintenance' && (
        <div className="px-4 py-5 flex flex-col gap-3">
          {tenancy && (
            <button type="button" onClick={() => setShowNewRequest(true)}
              style={{ alignSelf: 'flex-end', fontSize: 11, fontWeight: 500, padding: '5px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e8edf5', cursor: 'pointer' }}>
              + Report Issue
            </button>
          )}
          {isLoading ? (
            [...Array(2)].map((_, i) => <div key={i} style={{ ...CARD, height: 80, opacity: 0.4 }} className="animate-pulse" />)
          ) : maintenanceRequests.length === 0 ? (
            <EmptyState icon={<IconWrench />} title="No requests" subtitle="Tap '+ New Request' to report an issue" />
          ) : maintenanceRequests.map((r) => {
            const b = maintBadge(r.status)
            return (
              <div key={r.id} style={{ ...CARD, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>{r.title ?? 'Untitled'}</p>
                    {r.description && <p style={{ fontSize: 12, color: '#8899aa', marginTop: 3 }}>{r.description}</p>}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4, background: b.bg, color: b.color, flexShrink: 0, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {r.status ?? 'open'}
                  </span>
                </div>
                {r.created_at && (
                  <p style={{ fontSize: 10, color: '#8899aa', marginTop: 8 }}>
                    {shortDate(new Date(r.created_at))}{r.priority ? ` · ${r.priority} priority` : ''}
                  </p>
                )}
                {r.scheduled_at && (
                  <AccessQuestionnaire
                    request={r}
                    onUpdate={(patch) => {
                      setMaintenanceRequests((prev) =>
                        prev.map((x) => x.id === r.id ? { ...x, ...patch } : x)
                      )
                    }}
                  />
                )}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                  <MessageThread requestId={r.id} threadParticipant="tenant" label="Messages with admin" />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── DOCUMENTS ── */}
      {tab === 'documents' && (
        <div className="px-4 py-5">
          {tenancy && (
            <button type="button" onClick={exportInfoPack}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 0', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e8edf5', fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 16 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
              Tenant Information Pack
            </button>
          )}
          {isLoading ? (
            <div style={{ ...CARD, height: 64, opacity: 0.4 }} className="animate-pulse" />
          ) : documents.length === 0 ? (
            <EmptyState icon={<IconDoc />} title="No documents" subtitle="Documents shared by your landlord will appear here" />
          ) : (
            <div style={CARD}>
              {documents.map((d, i) => (
                <div key={d.id}>
                  <a href={d.url} target="_blank" rel="noreferrer"
                    style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#8899aa' }}>
                      <IconDoc />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 500, color: '#e8edf5' }} className="truncate">{d.label}</p>
                      <p style={{ fontSize: 11, color: '#8899aa' }}>{d.type} · {shortDate(new Date(d.uploaded_at))}</p>
                    </div>
                    <span style={{ color: '#8899aa' }}><IconDownload /></span>
                  </a>
                  {i < documents.length - 1 && <div style={DIVIDER} />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'settings' && <SettingsPage />}

      {/* Modals */}
      {showPayRent && tenancy && (
        <PayRentModal
          tenancyId={tenancy.id}
          amount={tenancy.monthly_rent}
          dueDate={new Date()}
          onClose={() => setShowPayRent(false)}
          onPaid={async () => {
            const { data } = await supabase.from('rent_payments')
              .select('id, amount, created_at, status, stripe_payment_intent_id')
              .eq('tenancy_id', tenancy.id)
              .order('created_at', { ascending: false })
              .limit(20)
            if (data) setPayments(data as RentPayment[])
          }}
        />
      )}
      {showNewRequest && tenancy && (
        <NewRequestModal
          tenancy={tenancy}
          onClose={() => setShowNewRequest(false)}
          onSubmitted={(req) => { setMaintenanceRequests((prev) => [req, ...prev]); setShowNewRequest(false) }}
        />
      )}
      {showHandInNotice && (
        <HandInNoticeModal
          tenancyId={tenancy?.id ?? null}
          propertyId={tenancy?.property_id ?? null}
          onClose={() => setShowHandInNotice(false)}
        />
      )}
    </DashShell>
  )
}

function PropertyInfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <span style={{ color: '#8899aa', marginTop: 1 }}>{icon}</span>
      <span style={{ fontSize: 12, color: '#8899aa', width: 90, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: '#e8edf5', flex: 1, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function NewRequestModal({ tenancy, onClose, onSubmitted }: {
  tenancy: TenancyData
  onClose: () => void
  onSubmitted: (req: MaintRequest) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
    const files = Array.from(e.target.files ?? []).slice(0, 3 - photos.length)
    if (!files.length) return
    const oversized = files.find(f => f.size > MAX_FILE_SIZE)
    if (oversized) { setError('Photos must be under 10 MB each.'); e.target.value = ''; return }
    const newPhotos = [...photos, ...files].slice(0, 3)
    setPhotos(newPhotos)
    const newPreviews = newPhotos.map((f) => URL.createObjectURL(f))
    setPreviews((old) => { old.forEach((u) => URL.revokeObjectURL(u)); return newPreviews })
    e.target.value = ''
  }

  function removePhoto(i: number) {
    URL.revokeObjectURL(previews[i])
    setPhotos((p) => p.filter((_, idx) => idx !== i))
    setPreviews((p) => p.filter((_, idx) => idx !== i))
  }

  async function handleSubmit() {
    if (!title.trim()) return
    setSubmitting(true); setError(null)
    const uploadedUrls: string[] = []
    for (const file of photos) {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${tenancy.property_id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('maintenance-images').upload(path, file, { contentType: file.type })
      if (upErr) { setError('Photo upload failed. Please try again.'); setSubmitting(false); return }
      const { data: urlData } = supabase.storage.from('maintenance-images').getPublicUrl(path)
      uploadedUrls.push(urlData.publicUrl)
    }
    const { data, error: err } = await supabase
      .from('maintenance_requests')
      .insert({ title: title.trim(), description: description.trim() || null, status: 'open', tenancy_id: tenancy.id, property_id: tenancy.property_id, photo_urls: uploadedUrls.length > 0 ? uploadedUrls : null })
      .select('id, title, description, created_at, status, priority')
    if (err) { setError('Failed to submit. Please try again.'); setSubmitting(false); return }
    const row = (data ?? [])[0] ?? { id: crypto.randomUUID(), title: title.trim(), description: description.trim() || null, created_at: new Date().toISOString(), status: 'open', priority: null }
    onSubmitted(row as MaintRequest)
  }

  const canAddMore = photos.length < 3

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative rounded-t-3xl flex flex-col gap-4 max-h-[90dvh] overflow-y-auto" style={{ background: '#112240', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: '#e8edf5' }}>Report an Issue</span>
          <button type="button" onClick={onClose} style={{ fontSize: 12, color: '#8899aa' }}>Cancel</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa' }}>Issue Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Leaking tap in bathroom"
            maxLength={150}
            style={{ width: '100%', padding: '10px 12px', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, fontSize: 14, color: '#e8edf5', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa' }}>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the issue in detail…" rows={3}
            maxLength={2000}
            style={{ width: '100%', padding: '10px 12px', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, fontSize: 14, color: '#e8edf5', outline: 'none', resize: 'none' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa' }}>Photos (up to 3)</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {previews.map((src, i) => (
              <div key={i} style={{ position: 'relative', width: 80, height: 80, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                <img src={src} alt={`Photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button type="button" onClick={() => removePhoto(i)}
                  style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  ×
                </button>
              </div>
            ))}
            {canAddMore && (
              <label style={{ width: 80, height: 80, borderRadius: 8, border: '1px dashed rgba(255,255,255,0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', color: '#8899aa', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                <span style={{ fontSize: 9, letterSpacing: '0.05em' }}>Add Photo</span>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ display: 'none' }} />
              </label>
            )}
          </div>
        </div>
        {error && <p style={{ fontSize: 12, color: '#f87171' }}>{error}</p>}
        <button type="button" onClick={handleSubmit} disabled={!title.trim() || submitting}
          style={{ width: '100%', padding: 14, borderRadius: 10, fontSize: 14, fontWeight: 500, background: title.trim() && !submitting ? '#e8edf5' : 'rgba(255,255,255,0.08)', color: title.trim() && !submitting ? '#0d1b2e' : '#8899aa', opacity: title.trim() && !submitting ? 1 : 0.5 }}>
          {submitting ? 'Uploading…' : 'Submit Report'}
        </button>
      </div>
    </div>
  )
}

function HandInNoticeModal({
  tenancyId,
  propertyId,
  onClose,
}: {
  tenancyId: string | null
  propertyId: string | null
  onClose: () => void
}) {
  const { user } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [vacateDate, setVacateDate] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    if (!tenancyId || !propertyId || !user) return
    setSubmitting(true)
    setError(null)

    // notice_date = today; vacate_date = today + 30 days (28-day notice + 2 day delivery)
    const today = new Date()
    const vacate = new Date(today)
    vacate.setDate(vacate.getDate() + 30)
    const noticeDateStr = today.toISOString().slice(0, 10)
    const vacateDateStr = vacate.toISOString().slice(0, 10)

    const { error: noticeErr } = await supabase.from('tenancy_notices').insert({
      tenancy_id: tenancyId,
      tenant_id: user.id,
      property_id: propertyId,
      notice_date: noticeDateStr,
      vacate_date: vacateDateStr,
      status: 'pending',
    })

    if (noticeErr) {
      setError('Failed to submit notice. Please try again.')
      setSubmitting(false)
      return
    }

    // Notify the landlord — best-effort, don't block on failure
    await supabase.from('landlord_notifications').insert({
      property_id: propertyId,
      type: 'tenancy_notice',
      channel: 'in_app',
      subject: 'Tenant has handed in notice',
      body: `Your tenant has served a notice to vacate. Vacate date: ${vacateDateStr}.`,
      metadata: { tenancy_id: tenancyId, tenant_id: user.id, notice_date: noticeDateStr, vacate_date: vacateDateStr },
      sent_at: new Date().toISOString(),
    })

    // Email the landlord
    const tenantName = user.full_name ?? user.email ?? 'Your tenant'
    supabase.functions.invoke('send-notification-email', {
      body: {
        event: 'tenancy_notice',
        data: { property_id: propertyId, tenant_name: tenantName, notice_date: noticeDateStr, vacate_date: vacateDateStr },
      },
    })

    setVacateDate(vacateDateStr)
    setSubmitting(false)
    setSubmitted(true)
  }

  if (submitted && vacateDate) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ background: '#0d1b2e', padding: 24 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="#4ade80"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>
        </div>
        <p style={{ fontSize: 18, fontWeight: 600, color: '#e8edf5', marginBottom: 8, textAlign: 'center' }}>Notice Submitted</p>
        <p style={{ fontSize: 13, color: '#8899aa', textAlign: 'center', lineHeight: 1.6, maxWidth: 300, marginBottom: 6 }}>
          Your notice has been recorded and your landlord has been notified.
        </p>
        <p style={{ fontSize: 13, color: '#4ade80', textAlign: 'center', marginBottom: 32 }}>
          Vacate by: <strong>{fmtDate(vacateDate)}</strong>
        </p>
        <button type="button" onClick={onClose}
          style={{ padding: '13px 40px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: '#e8edf5', color: '#0d1b2e' }}>
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0d1b2e' }}>
      <header style={{ background: '#091422', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button type="button" onClick={onClose} style={{ fontSize: 12, color: '#8899aa' }}>Cancel</button>
        <span style={{ fontSize: 14, fontWeight: 500, color: '#e8edf5' }}>Hand In Notice</span>
        <div style={{ width: 48 }} />
      </header>
      <div className="flex-1 overflow-y-auto" style={{ padding: '16px' }}
        onScroll={(e) => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) setScrolled(true) }}>
        {[
          ['1. Your Right to Give Notice (Private Residential Tenancy)', 'Under a Private Residential Tenancy (PRT), you have the right to end your tenancy at any time by giving your landlord at least 28 days written notice. If you have agreed a different period in writing after moving in, that period applies instead.'],
          ['2. When Your Notice Starts', 'Your notice period begins 2 days after you send the notice — allowing for delivery. If you share the tenancy with others, all joint tenants must agree and sign the notice. You must continue to pay rent in full throughout the notice period, even if you leave earlier.'],
          ['3. Condition of the Property', 'You are expected to return the property in the same condition it was in at the start of your tenancy, allowing for fair wear and tear. Landlords cannot charge you for reasonable use and the natural passage of time. Where an item is damaged but not fully beyond its useful life, costs should be apportioned — you should not bear the full replacement cost.'],
          ['4. Your Deposit Rights', 'Your deposit is protected in an approved Scottish Tenancy Deposit Scheme. The landlord must return your deposit promptly after your tenancy ends, with any deductions clearly itemised and justified. If you dispute deductions, you can use the scheme\'s Alternative Dispute Resolution (ADR) process — you do not need to prove your case. The landlord must prove entitlement to any deduction.'],
          ['5. Utilities and Council Tax', 'You are responsible for notifying all utility providers and your local council of your move-out date. You remain liable for all utility charges and council tax up to and including your last day of tenancy.'],
          ['6. Inventory & Check-Out', 'Keep your copies of the original inventory and check-in report. An inventory or check-out report should be carried out at the end of your tenancy. Photographs taken at the start and end of your tenancy can protect you in any deposit dispute.'],
        ].map(([title, body]) => (
          <div key={title} style={{ background: '#112240', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 14, marginBottom: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#e8edf5', marginBottom: 6 }}>{title}</p>
            <p style={{ fontSize: 12, color: '#8899aa', lineHeight: 1.6 }}>{body}</p>
          </div>
        ))}
      </div>
      <div style={{ background: '#091422', borderTop: '1px solid rgba(255,255,255,0.07)', padding: '14px 16px' }}>
        {!scrolled && <p style={{ fontSize: 11, color: '#8899aa', textAlign: 'center', marginBottom: 8 }}>Scroll to read all terms before continuing</p>}
        {error && <p style={{ fontSize: 12, color: '#f87171', textAlign: 'center', marginBottom: 8 }}>{error}</p>}
        <button type="button" onClick={handleConfirm} disabled={!scrolled || submitting || !tenancyId}
          style={{ width: '100%', padding: 14, borderRadius: 10, fontSize: 14, fontWeight: 500, background: scrolled ? 'rgba(248,113,113,0.18)' : 'rgba(255,255,255,0.05)', color: scrolled ? '#f87171' : '#8899aa', border: scrolled ? '1px solid rgba(248,113,113,0.2)' : '1px solid rgba(255,255,255,0.07)', opacity: (scrolled && !submitting) ? 1 : 0.6 }}>
          {submitting ? 'Submitting…' : 'I Understand & Confirm Notice'}
        </button>
      </div>
    </div>
  )
}

type AccessPatch = Pick<MaintRequest, 'tenant_home_at_scheduled' | 'tenant_keys_ok' | 'tenant_alt_datetime'>

function AccessQuestionnaire({ request, onUpdate }: {
  request: MaintRequest
  onUpdate: (patch: AccessPatch) => void
}) {
  const [saving, setSaving] = useState(false)
  const [altInput, setAltInput] = useState(request.tenant_alt_datetime?.slice(0, 16) ?? '')
  const [altError, setAltError] = useState<string | null>(null)

  async function respond(patch: AccessPatch) {
    setSaving(true)
    await supabase.from('maintenance_requests').update(patch).eq('id', request.id)
    // Best-effort: alert staff if tenant cannot accommodate access
    if (patch.tenant_keys_ok === false) {
      try {
        await supabase.rpc('notify_staff_of_event', {
          p_type: 'access_issue',
          p_title: 'Tenant access issue',
          p_body: `Tenant cannot provide access for job "${request.title ?? 'Untitled'}". Keys not permitted — awaiting alternative time.`,
          p_data: { request_id: request.id },
        })
      } catch { /* best-effort */ }
    }
    onUpdate(patch)
    setSaving(false)
  }

  async function submitAlt() {
    if (!altInput) return
    setAltError(null)
    const dt = new Date(altInput)
    if (isNaN(dt.getTime())) { setAltError('Enter a valid date and time'); return }
    setSaving(true)
    const patch: AccessPatch = { tenant_home_at_scheduled: false, tenant_keys_ok: false, tenant_alt_datetime: dt.toISOString() }
    await supabase.from('maintenance_requests').update(patch).eq('id', request.id)
    try {
      await supabase.rpc('notify_staff_of_event', {
        p_type: 'access_alternative',
        p_title: 'Tenant proposed alternative time',
        p_body: `Tenant suggested a new visit time for "${request.title ?? 'Untitled'}": ${dt.toLocaleString('en-GB')}.`,
        p_data: { request_id: request.id, alt_datetime: dt.toISOString() },
      })
    } catch { /* best-effort */ }
    onUpdate(patch)
    setSaving(false)
  }

  const scheduledLabel = request.scheduled_at ? fmtDateTime(request.scheduled_at) : null

  const ROW: React.CSSProperties = { marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)' }
  const TOGGLE: React.CSSProperties = { display: 'flex', gap: 6, marginTop: 8 }
  function Btn({ label, active, colour, onClick }: { label: string; active: boolean; colour: string; onClick: () => void }) {
    return (
      <button type="button" onClick={onClick} disabled={saving}
        style={{ flex: 1, padding: '7px 0', borderRadius: 6, fontSize: 12, fontWeight: 500, border: `1px solid ${active ? colour : 'rgba(255,255,255,0.08)'}`, background: active ? `${colour}22` : 'transparent', color: active ? colour : '#8899aa', cursor: saving ? 'default' : 'pointer' }}>
        {label}
      </button>
    )
  }

  return (
    <div style={ROW}>
      <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 4 }}>Scheduled Visit</p>
      <p style={{ fontSize: 13, color: '#60a5fa', fontWeight: 500 }}>{scheduledLabel}</p>

      {/* Q1: will you be in? */}
      <p style={{ fontSize: 12, color: '#c8d4e0', marginTop: 10 }}>Will you be home at this time?</p>
      <div style={TOGGLE}>
        <Btn label="Yes, I'll be in" active={request.tenant_home_at_scheduled === true} colour="#4ade80"
          onClick={() => respond({ tenant_home_at_scheduled: true, tenant_keys_ok: null, tenant_alt_datetime: null })} />
        <Btn label="No, I won't" active={request.tenant_home_at_scheduled === false} colour="#fbbf24"
          onClick={() => respond({ tenant_home_at_scheduled: false, tenant_keys_ok: null, tenant_alt_datetime: null })} />
      </div>

      {/* Confirmed home */}
      {request.tenant_home_at_scheduled === true && (
        <p style={{ fontSize: 11, color: '#4ade80', marginTop: 8 }}>Great — your agent will let the contractor know you'll be home.</p>
      )}

      {/* Q2: keys? */}
      {request.tenant_home_at_scheduled === false && (
        <>
          <p style={{ fontSize: 12, color: '#c8d4e0', marginTop: 12 }}>Can we use the keys to gain entry while you're out?</p>
          <div style={TOGGLE}>
            <Btn label="Yes, use keys" active={request.tenant_keys_ok === true} colour="#4ade80"
              onClick={() => respond({ tenant_home_at_scheduled: false, tenant_keys_ok: true, tenant_alt_datetime: null })} />
            <Btn label="No, keys not OK" active={request.tenant_keys_ok === false} colour="#f87171"
              onClick={() => respond({ tenant_home_at_scheduled: false, tenant_keys_ok: false, tenant_alt_datetime: null })} />
          </div>
        </>
      )}

      {/* Confirmed keys */}
      {request.tenant_home_at_scheduled === false && request.tenant_keys_ok === true && (
        <p style={{ fontSize: 11, color: '#4ade80', marginTop: 8 }}>Noted — the contractor will access using the property keys.</p>
      )}

      {/* Q3: alternative datetime */}
      {request.tenant_home_at_scheduled === false && request.tenant_keys_ok === false && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12, color: '#c8d4e0', marginBottom: 8 }}>Suggest an alternative date and time when you'll be home:</p>
          <input
            type="datetime-local"
            value={altInput}
            onChange={(e) => setAltInput(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            style={{ width: '100%', padding: '9px 12px', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 13, color: '#e8edf5', outline: 'none', colorScheme: 'dark' }}
          />
          {altError && <p style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>{altError}</p>}
          {request.tenant_alt_datetime ? (
            <p style={{ fontSize: 11, color: '#4ade80', marginTop: 8 }}>
              Alternative submitted: {fmtDateTime(request.tenant_alt_datetime)}. Your agent will confirm.
            </p>
          ) : (
            <button type="button" onClick={submitAlt} disabled={!altInput || saving}
              style={{ marginTop: 10, width: '100%', padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 500, background: altInput && !saving ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.05)', color: altInput && !saving ? '#60a5fa' : '#8899aa', border: '1px solid rgba(96,165,250,0.2)' }}>
              {saving ? 'Saving…' : 'Submit Alternative Time'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, type ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { gbp, shortDate, greeting, initials } from '../lib/utils'
import DashShell from '../components/DashShell'
import SectionHeader from '../components/SectionHeader'
import EmptyState from '../components/EmptyState'
import SettingsPage from './SettingsPage'
import PayRentModal from '../components/PayRentModal'
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
}
interface RentPayment {
  id: string; amount: number; created_at: string; status: string
  stripe_payment_intent_id: string | null
}
interface MaintRequest {
  id: string; title: string | null; description: string | null
  created_at: string | null; status: string | null; priority: string | null
}
interface TenantDoc {
  id: string; label: string; type: string; uploaded_at: string; url: string
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
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    async function load() {
      try {
        const { data: tenancyRow } = await supabase
          .from('tenancies')
          .select('id, monthly_rent, start_date, end_date, property_id, properties(address)')
          .eq('tenant_id', user!.id).eq('is_current', true).limit(1).maybeSingle()
        if (tenancyRow) {
          const raw = tenancyRow as unknown as {
            id: string; monthly_rent: number; start_date: string; end_date: string | null
            property_id: string; properties: { address: string } | null
          }
          const t: TenancyData = {
            id: raw.id, address: raw.properties?.address ?? '',
            monthly_rent: raw.monthly_rent, start_date: raw.start_date,
            end_date: raw.end_date, property_id: raw.property_id,
          }
          setTenancy(t)
          const [{ data: pays }, { data: maints }, { data: docs }] = await Promise.all([
            supabase.from('rent_payments').select('id, amount, created_at, status, stripe_payment_intent_id')
              .eq('tenancy_id', raw.id).order('created_at', { ascending: false }).limit(20),
            supabase.from('maintenance_requests').select('id, title, description, created_at, status, priority')
              .eq('tenancy_id', raw.id).order('created_at', { ascending: false }),
            supabase.from('documents').select('id, label, type, uploaded_at, url')
              .eq('property_id', raw.property_id).order('uploaded_at', { ascending: false }),
          ])
          setPayments((pays ?? []) as RentPayment[])
          setMaintenanceRequests((maints ?? []) as MaintRequest[])
          setDocuments((docs ?? []) as TenantDoc[])
        }
      } catch (e) { console.error(e) }
      finally { setIsLoading(false) }
    }
    load()
  }, [user])

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

  return (
    <DashShell tabs={TABS} active={tab} onChange={setTab} metrics={metrics} userInitials={userInitials}>

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
                <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', padding: '4px 10px', borderRadius: 4, background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>
                  DUE
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
              </div>
            </div>
          )}

          {/* Maintenance */}
          <div>
            <SectionHeader title="Maintenance" action={{ label: '+ New', onClick: () => setShowNewRequest(true) }} />
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
            ) : documents.length === 0 ? (
              <EmptyState icon={<IconDoc />} title="No documents" subtitle="Shared documents will appear here" />
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
                        <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }} className="truncate">{d.label}</p>
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
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setShowNewRequest(true)}
              style={{ fontSize: 11, fontWeight: 500, padding: '5px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e8edf5' }}>
              + New Request
            </button>
          </div>
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
              </div>
            )
          })}
        </div>
      )}

      {/* ── DOCUMENTS ── */}
      {tab === 'documents' && (
        <div className="px-4 py-5">
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
        <PayRentModal tenancyId={tenancy.id} amount={tenancy.monthly_rent} dueDate={new Date()} onClose={() => setShowPayRent(false)} />
      )}
      {showNewRequest && <NewRequestModal onClose={() => setShowNewRequest(false)} />}
      {showHandInNotice && <HandInNoticeModal onClose={() => setShowHandInNotice(false)} />}
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

function NewRequestModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative rounded-t-3xl flex flex-col gap-4 max-h-[90dvh] overflow-y-auto"
        style={{ background: '#112240', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: '#e8edf5' }}>Report an Issue</span>
          <button type="button" onClick={onClose} style={{ fontSize: 12, color: '#8899aa' }}>Cancel</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa' }}>Issue Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Leaking tap in bathroom"
            style={{ width: '100%', padding: '10px 12px', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, fontSize: 14, color: '#e8edf5', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa' }}>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the issue in detail…" rows={4}
            style={{ width: '100%', padding: '10px 12px', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, fontSize: 14, color: '#e8edf5', outline: 'none', resize: 'none' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa' }}>Priority</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['low', 'medium', 'high', 'emergency'].map((p) => (
              <button key={p} type="button" onClick={() => setPriority(p)}
                style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, textTransform: 'capitalize', background: priority === p ? '#e8edf5' : 'rgba(255,255,255,0.06)', color: priority === p ? '#0d1b2e' : '#8899aa', border: '1px solid rgba(255,255,255,0.1)' }}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <button type="button" onClick={onClose} disabled={!title.trim()}
          style={{ width: '100%', padding: 14, borderRadius: 10, fontSize: 14, fontWeight: 500, background: title.trim() ? '#e8edf5' : 'rgba(255,255,255,0.08)', color: title.trim() ? '#0d1b2e' : '#8899aa', opacity: title.trim() ? 1 : 0.5 }}>
          Submit Request
        </button>
      </div>
    </div>
  )
}

function HandInNoticeModal({ onClose }: { onClose: () => void }) {
  const [scrolled, setScrolled] = useState(false)
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
          ['1. Your Right to Give Notice', 'As a tenant, you have the legal right to end your tenancy by giving your landlord the appropriate notice. The required notice period is typically set out in your tenancy agreement. For most assured shorthold tenancies in Scotland, this is a minimum of 28 days.'],
          ['2. Notice Period', 'Your notice period begins on the day your landlord receives written notice. You must continue to pay rent in full throughout the entire notice period, even if you vacate the property before it expires.'],
          ['3. Condition of the Property', 'You are expected to return the property in the same condition it was in at the start of your tenancy, allowing for fair wear and tear. The landlord may deduct costs from your deposit for any damage beyond fair wear and tear.'],
          ['4. Deposit Return', 'Your deposit is protected under a government-approved tenancy deposit scheme. Following the end of your tenancy, the landlord has up to 30 days to return your deposit or raise a formal dispute.'],
          ['5. Utilities and Council Tax', 'You are responsible for notifying all utility providers and the local council of your move-out date. You remain liable for all utility charges and council tax up to and including the last day of your tenancy.'],
        ].map(([title, body]) => (
          <div key={title} style={{ background: '#112240', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 14, marginBottom: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#e8edf5', marginBottom: 6 }}>{title}</p>
            <p style={{ fontSize: 12, color: '#8899aa', lineHeight: 1.6 }}>{body}</p>
          </div>
        ))}
      </div>
      <div style={{ background: '#091422', borderTop: '1px solid rgba(255,255,255,0.07)', padding: '14px 16px' }}>
        {!scrolled && <p style={{ fontSize: 11, color: '#8899aa', textAlign: 'center', marginBottom: 8 }}>Scroll to read all terms before continuing</p>}
        <button type="button" onClick={onClose} disabled={!scrolled}
          style={{ width: '100%', padding: 14, borderRadius: 10, fontSize: 14, fontWeight: 500, background: scrolled ? 'rgba(248,113,113,0.18)' : 'rgba(255,255,255,0.05)', color: scrolled ? '#f87171' : '#8899aa', border: scrolled ? '1px solid rgba(248,113,113,0.2)' : '1px solid rgba(255,255,255,0.07)', opacity: scrolled ? 1 : 0.6 }}>
          I Understand & Confirm Notice
        </button>
      </div>
    </div>
  )
}

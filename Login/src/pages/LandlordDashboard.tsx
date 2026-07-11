import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import type { Property, MaintenanceRequest, PropertyDocument } from '../lib/types'
import { gbp, percent, shortDate, greeting, initials, fmtDate, fmtDateTime } from '../lib/utils'
import DashShell from '../components/DashShell'
import KPICard from '../components/KPICard'
import SectionHeader from '../components/SectionHeader'
import EmptyState from '../components/EmptyState'
import SettingsPage from './SettingsPage'
import { IconGrid, IconHouse, IconWrench, IconDoc, IconGear, IconCheck, IconSearch, IconSterling } from '../components/icons'

const TABS = [
  { id: 'dashboard',   label: 'Dashboard',   icon: <IconGrid /> },
  { id: 'properties',  label: 'Properties',  icon: <IconHouse /> },
  { id: 'maintenance', label: 'Maintenance', icon: <IconWrench /> },
  { id: 'documents',   label: 'Documents',   icon: <IconDoc /> },
  { id: 'statements',  label: 'Statements',  icon: <IconSterling /> },
  { id: 'settings',    label: 'Settings',    icon: <IconGear /> },
]

interface StripePayout {
  id: string; amount: number; currency: string
  arrival_date: number; status: string; description: string | null
}
interface LandlordFinancials {
  connected: boolean; onboarding_complete: boolean
  charges_enabled: boolean; payouts_enabled: boolean
  balance?: { available: { amount: number; currency: string }[]; pending: { amount: number; currency: string }[] }
  payouts?: StripePayout[]
}

interface Statement {
  id: string
  property_id: string | null
  period: string
  gross_amount: number
  management_fee: number
  net_amount: number
  pdf_url: string | null
  status: string
  notes: string | null
  created_at: string
}

interface TenancyDetail {
  id: string; monthly_rent: number | null; start_date: string | null
  end_date: string | null; arrears_balance: number | null
  tenant_id: string | null; tenantName: string | null; tenantEmail: string | null
  deposit_scheme: string | null; deposit_registered_date: string | null
  last_rent_increase_date: string | null
}

interface PortfolioComplianceItem {
  id: string; property_id: string; type: string; expiry_date: string | null
}
interface StatusEntry {
  id: string; old_status: string | null; new_status: string | null
  notes: string | null; created_at: string | null
}
interface Stats {
  totalProperties: number; occupiedProperties: number; vacantProperties: number
  totalMonthlyRent: number; paidThisMonth: number; openMaintenance: number
}

// ── Style helpers ──

const CARD: React.CSSProperties = { background: '#112240', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }
const DIVIDER: React.CSSProperties = { height: 1, background: 'rgba(255,255,255,0.07)', margin: '0 16px' }

function statusBadge(status: string) {
  const s = status.toLowerCase()
  if (s === 'paid' || s === 'let' || s === 'resolved' || s === 'closed')
    return { bg: 'rgba(74,222,128,0.12)', color: '#4ade80' }
  if (s === 'overdue' || s === 'open' || s === 'emergency')
    return { bg: 'rgba(248,113,113,0.15)', color: '#f87171' }
  if (s === 'late' || s === 'in_progress' || s === 'assigned' || s === 'vacant')
    return { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' }
  return { bg: 'rgba(136,153,170,0.12)', color: '#8899aa' }
}

import type React from 'react'

export default function LandlordDashboard() {
  const { user } = useAuth()
  const [tab, setTab] = useState('dashboard')
  const [properties, setProperties] = useState<Property[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceRequest[]>([])
  const [documents, setDocuments] = useState<PropertyDocument[]>([])
  const [allComplianceItems, setAllComplianceItems] = useState<PortfolioComplianceItem[]>([])
  const [paidThisMonth, setPaidThisMonth] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [statements, setStatements] = useState<Statement[]>([])
  const [statementsLoading, setStatementsLoading] = useState(false)
  const [statementsLoaded, setStatementsLoaded] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)
  const [selectedMaintenance, setSelectedMaintenance] = useState<MaintenanceRequest | null>(null)
  const [financials, setFinancials] = useState<LandlordFinancials | null>(null)
  const [financialsLoading, setFinancialsLoading] = useState(false)
  const [setupBanner, setSetupBanner] = useState<'complete' | 'refresh' | null>(null)

  const loadData = useCallback(async () => {
    if (!user) return
    setIsLoading(true)
    setPaidThisMonth(0)
    try {
      const { data: props } = await supabase.from('properties').select('*').eq('landlord_id', user.id).order('created_at', { ascending: false })
      const propList = (props ?? []) as Property[]
      setProperties(propList)
      if (propList.length > 0) {
        const propIds = propList.map((p) => p.id)
        const [{ data: maint }, { data: docs }, { data: compliance }, { data: tenancyRows }] = await Promise.all([
          supabase.from('maintenance_requests').select('*').in('property_id', propIds).order('created_at', { ascending: false }),
          supabase.from('documents').select('*').in('property_id', propIds).order('expiry_date', { ascending: true }),
          supabase.from('compliance_items').select('id, property_id, type, expiry_date').in('property_id', propIds),
          supabase.from('tenancies').select('id').in('property_id', propIds).eq('is_current', true),
        ])
        setMaintenance((maint ?? []) as MaintenanceRequest[])
        setDocuments((docs ?? []) as PropertyDocument[])
        setAllComplianceItems((compliance ?? []) as PortfolioComplianceItem[])

        const tenancyIds = (tenancyRows ?? []).map((t) => (t as { id: string }).id)
        if (tenancyIds.length > 0) {
          const monthStart = new Date()
          monthStart.setDate(1)
          monthStart.setHours(0, 0, 0, 0)
          const monthStartStr = monthStart.toISOString().slice(0, 10)
          const [{ data: stripePays }, { data: manualPays }] = await Promise.all([
            supabase.from('rent_payments').select('amount').in('tenancy_id', tenancyIds)
              .in('status', ['succeeded', 'paid']).gte('paid_at', monthStart.toISOString()),
            supabase.from('payments').select('amount').in('tenancy_id', tenancyIds)
              .eq('status', 'paid').gte('paid_date', monthStartStr),
          ])
          const stripeTotal = (stripePays ?? []).reduce((s, p) => s + ((p as { amount: number }).amount ?? 0), 0)
          const manualTotal = (manualPays ?? []).reduce((s, p) => s + ((p as { amount: number }).amount ?? 0), 0)
          setPaidThisMonth(stripeTotal + manualTotal)
        }
      }
    } catch (e) { console.error(e) }
    finally { setIsLoading(false) }
  }, [user])

  useEffect(() => { loadData() }, [loadData])

  const openMaintenance = maintenance.filter((m) => m.status === 'open' || m.status === 'in_progress' || m.status === 'assigned')
  const stats: Stats = {
    totalProperties: properties.length,
    occupiedProperties: properties.filter((p) => p.is_active).length,
    vacantProperties: properties.filter((p) => !p.is_active).length,
    totalMonthlyRent: properties.reduce((s, p) => s + (p.monthly_rent ?? 0), 0),
    paidThisMonth,
    openMaintenance: openMaintenance.length,
  }

  const occupancyRate = stats.totalProperties > 0 ? (stats.occupiedProperties / stats.totalProperties) * 100 : 0
  const collectionRate = stats.totalMonthlyRent > 0 ? (stats.paidThisMonth / stats.totalMonthlyRent) * 100 : 0

  const urgentDocCount = documents.filter(d => {
    if (!d.expiry_date) return false
    const days = Math.ceil((new Date(d.expiry_date).getTime() - Date.now()) / 86400000)
    return days < 60
  }).length

  const metrics = [
    { label: 'Monthly Rent', value: gbp(stats.totalMonthlyRent) },
    { label: 'Properties', value: `${stats.totalProperties} total` },
    { label: 'Occupancy', value: percent(occupancyRate, 0) },
    { label: 'Open Tickets', value: String(stats.openMaintenance) },
    { label: 'Certs Due', value: String(urgentDocCount) },
  ]

  async function loadFinancials() {
    setFinancialsLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('get-landlord-financials')
      if (!error && data) setFinancials(data as LandlordFinancials)
    } catch { /* silent */ }
    setFinancialsLoading(false)
  }

  async function loadStatements() {
    setStatementsLoading(true)
    const { data } = await supabase
      .from('statements')
      .select('id, property_id, period, gross_amount, management_fee, net_amount, pdf_url, status, notes, created_at')
      .order('period', { ascending: false })
    setStatements((data ?? []) as Statement[])
    setStatementsLoaded(true)
    setStatementsLoading(false)
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const setup = params.get('setup') as 'complete' | 'refresh' | null
    if (setup === 'complete' || setup === 'refresh') {
      setSetupBanner(setup)
      setTab('statements')
      window.history.replaceState({}, '', window.location.pathname)
      loadFinancials()
      loadStatements()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleTabChange(newTab: string) {
    setSelectedProperty(null)
    setTab(newTab)
    if (newTab === 'statements') {
      if (!statementsLoaded) loadStatements()
      if (!financials) loadFinancials()
    }
  }

  return (
    <>
      <DashShell tabs={TABS} active={tab} onChange={handleTabChange} metrics={metrics} userInitials={initials(user?.full_name, user?.email ?? '')}>

        {/* ── DASHBOARD ── */}
        {tab === 'dashboard' && (
          <div className="px-4 py-5 flex flex-col gap-5">
            <div>
              <p style={{ fontSize: 12, color: '#8899aa' }}>{greeting()}</p>
              <p style={{ fontSize: 26, fontWeight: 300, color: '#e8edf5', marginTop: 2, fontFamily: 'Georgia, serif' }}>{user?.full_name ?? 'Landlord'}</p>
            </div>

            {isLoading ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[...Array(4)].map((_, i) => <div key={i} style={{ ...CARD, height: 80, opacity: 0.4 }} className="animate-pulse" />)}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <KPICard title="Monthly Rent" value={gbp(stats.totalMonthlyRent)} subtitle={`${stats.occupiedProperties} of ${stats.totalProperties} let`} onClick={() => handleTabChange('statements')} />
                <KPICard title="Paid" value={gbp(stats.paidThisMonth)} subtitle={percent(collectionRate) + ' this month'} accent={collectionRate >= 95 ? '#4ade80' : '#fbbf24'} />
                <KPICard title="Occupancy" value={percent(occupancyRate, 0)} subtitle={`${stats.vacantProperties} vacant`} accent={occupancyRate === 100 ? '#4ade80' : '#e8edf5'} />
                <KPICard title="Open Issues" value={String(stats.openMaintenance)} subtitle={stats.openMaintenance === 0 ? 'All clear' : 'Need attention'} accent={stats.openMaintenance > 0 ? '#f87171' : '#4ade80'} />
              </div>
            )}

            {/* Properties */}
            <div>
              <SectionHeader title="Properties" />
              {isLoading ? (
                <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, margin: '0 -16px', paddingLeft: 16, paddingRight: 16 }}>
                  {[...Array(2)].map((_, i) => <div key={i} style={{ width: 160, height: 140, ...CARD, flexShrink: 0, opacity: 0.4 }} className="animate-pulse" />)}
                </div>
              ) : properties.length === 0 ? (
                <EmptyState icon={<IconHouse />} title="No properties yet" subtitle="Your management company will add properties here" />
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
                  {properties.map((p) => (
                    <button key={p.id} type="button" onClick={() => setSelectedProperty(p)} className="flex-shrink-0 snap-start active:opacity-70 transition-opacity">
                      <PropertyCarouselCard property={p} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Maintenance */}
            <div>
              <SectionHeader title="Maintenance" />
              {isLoading ? (
                <div className="flex flex-col gap-2">
                  {[...Array(2)].map((_, i) => <div key={i} style={{ ...CARD, height: 64, opacity: 0.4 }} className="animate-pulse" />)}
                </div>
              ) : openMaintenance.length === 0 ? (
                <EmptyState icon={<IconWrench />} title="No open issues" subtitle="All maintenance requests are resolved" />
              ) : (
                <div className="flex flex-col gap-2">
                  {openMaintenance.slice(0, 3).map((r) => (
                    <button key={r.id} type="button" onClick={() => setSelectedMaintenance(r)} className="w-full text-left">
                      <MaintenanceIssueRow request={r} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Expiring certs — show top 3 soonest-expiring on the home tab */}
            {documents.filter(d => d.expiry_date).length > 0 && (() => {
              const today = new Date()
              const soonest = [...documents].filter(d => d.expiry_date).sort((a, b) => new Date(a.expiry_date!).getTime() - new Date(b.expiry_date!).getTime()).slice(0, 3)
              const hasUrgent = soonest.some(d => { const days = Math.ceil((new Date(d.expiry_date!).getTime() - today.getTime()) / 86400000); return days < 60 })
              if (!hasUrgent) return null
              return (
                <div>
                  <SectionHeader title="Certificates Requiring Attention" />
                  <div style={CARD}>
                    {soonest.filter(d => { const days = Math.ceil((new Date(d.expiry_date!).getTime() - new Date().getTime()) / 86400000); return days < 60 }).map((d, i, arr) => (
                      <div key={d.id}>
                        <ExpiringDocRow doc={d} />
                        {i < arr.length - 1 && <div style={DIVIDER} />}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Required compliance overview across portfolio */}
            {!isLoading && properties.length > 0 && (() => {
              const today = new Date()
              const issues: { address: string; missing: string[] }[] = []
              for (const prop of properties) {
                const propItems = allComplianceItems.filter(c => c.property_id === prop.id)
                const required = [
                  ...(prop.has_gas ? [{ key: 'gas', label: 'Gas Safety Certificate' }] : []),
                  { key: 'eicr', label: 'EICR (Electrical)' },
                  { key: 'epc', label: 'EPC' },
                  { key: 'legionella', label: 'Legionella Risk Assessment' },
                  { key: 'smoke', label: 'Smoke / Heat / CO Alarms' },
                ]
                const missing: string[] = []
                for (const cert of required) {
                  const match = propItems.find(c => c.type.toLowerCase().includes(cert.key))
                  if (!match) { missing.push(cert.label); continue }
                  if (cert.key === 'smoke') continue
                  if (match.expiry_date && new Date(match.expiry_date) < today) missing.push(`${cert.label} (expired)`)
                }
                if (missing.length > 0) issues.push({ address: prop.address, missing })
              }
              if (issues.length === 0) return null
              return (
                <div>
                  <SectionHeader title="Compliance Actions Required" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {issues.map(({ address, missing }) => (
                      <div key={address} style={{ ...CARD, padding: '12px 14px', borderColor: 'rgba(248,113,113,0.3)' }}>
                        <p style={{ fontSize: 13, color: '#e8edf5', fontFamily: 'Georgia, serif', marginBottom: 6 }} className="truncate">{address}</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {missing.map(m => (
                            <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f87171', flexShrink: 0 }} />
                              <span style={{ fontSize: 11, color: '#f87171' }}>{m}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── PROPERTIES ── */}
        {tab === 'properties' && (
          <div className="px-4 py-5 flex flex-col gap-3">
            {isLoading ? (
              [...Array(3)].map((_, i) => <div key={i} style={{ ...CARD, height: 96, opacity: 0.4 }} className="animate-pulse" />)
            ) : properties.length === 0 ? (
              <EmptyState icon={<IconHouse />} title="No properties" subtitle="Properties will appear here once added" />
            ) : (
              properties.map((p) => (
                <button key={p.id} type="button" onClick={() => setSelectedProperty(p)} className="w-full text-left active:opacity-70 transition-opacity">
                  <PropertyListCard property={p} />
                </button>
              ))
            )}
          </div>
        )}

        {/* ── MAINTENANCE ── */}
        {tab === 'maintenance' && (
          <MaintenanceTab requests={maintenance} isLoading={isLoading} onSelect={setSelectedMaintenance} />
        )}

        {tab === 'documents' && (
          <div className="px-4 py-5 flex flex-col gap-3">
            {isLoading ? (
              [...Array(3)].map((_, i) => <div key={i} style={{ ...CARD, height: 64, opacity: 0.4 }} className="animate-pulse" />)
            ) : documents.length === 0 ? (
              <EmptyState icon={<IconDoc />} title="No documents" subtitle="Property certificates and documents will appear here" />
            ) : (
              <div style={CARD}>
                {documents.map((d, i) => (
                  <div key={d.id}>
                    <ExpiringDocRow doc={d} />
                    {i < documents.length - 1 && <div style={DIVIDER} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'statements' && (
          <StatementsTab
            statements={statements}
            isLoading={statementsLoading}
            properties={properties}
            financials={financials}
            financialsLoading={financialsLoading}
            setupBanner={setupBanner}
            onDismissBanner={() => setSetupBanner(null)}
            collectedThisMonth={paidThisMonth}
            totalMonthlyRent={stats.totalMonthlyRent}
            landlordName={user?.company_name ?? user?.full_name ?? 'Landlord'}
          />
        )}

        {tab === 'settings' && <SettingsPage />}
      </DashShell>

      {/* Property detail overlay */}
      {selectedProperty && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0d1b2e' }}>
          <PropertyDetailPanel property={selectedProperty} onBack={() => setSelectedProperty(null)} onMaintenanceSelect={setSelectedMaintenance} />
        </div>
      )}

      {/* Maintenance detail sheet */}
      {selectedMaintenance && (
        <MaintenanceDetailSheet request={selectedMaintenance} onClose={() => setSelectedMaintenance(null)} />
      )}
    </>
  )
}

// ── Maintenance Tab ──

function MaintenanceTab({ requests, isLoading, onSelect }: { requests: MaintenanceRequest[]; isLoading: boolean; onSelect: (m: MaintenanceRequest) => void }) {
  const [filter, setFilter] = useState('all')
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const openCount = requests.filter((r) => r.status === 'open' || r.status === 'assigned').length
  const inProgressCount = requests.filter((r) => r.status === 'in_progress').length
  const emergencyCount = requests.filter((r) => r.priority === 'emergency' && (r.status === 'open' || r.status === 'assigned' || r.status === 'in_progress')).length
  const resolvedCount = requests.filter((r) => {
    if (r.status !== 'resolved' && r.status !== 'closed') return false
    const d = r.updated_at ? new Date(r.updated_at) : null
    return d && d >= monthStart
  }).length
  const filtered = requests.filter((r) => {
    if (filter === 'all') return true
    if (filter === 'open') return r.status === 'open' || r.status === 'assigned'
    return r.status === filter
  })

  return (
    <div className="px-4 py-5 flex flex-col gap-4">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <KPICard title="Open" value={String(openCount)} subtitle={emergencyCount > 0 ? `${emergencyCount} emergency` : 'No emergencies'} accent={emergencyCount > 0 ? '#f87171' : '#e8edf5'} />
        <KPICard title="In Progress" value={String(inProgressCount)} subtitle="With contractor" accent="#fbbf24" />
        <KPICard title="Resolved" value={String(resolvedCount)} subtitle="This month" accent="#4ade80" />
        <KPICard title="All Issues" value={String(requests.length)} subtitle="Total requests" />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {[{ key: 'all', label: 'All' }, { key: 'open', label: 'Open' }, { key: 'in_progress', label: 'In Progress' }, { key: 'resolved', label: 'Resolved' }].map(({ key, label }) => (
          <button key={key} type="button" onClick={() => setFilter(key)}
            className="flex-shrink-0 px-4 py-1.5 rounded-full text-[12px] font-medium transition-colors"
            style={{ background: filter === key ? '#e8edf5' : 'rgba(255,255,255,0.06)', color: filter === key ? '#0d1b2e' : '#8899aa', border: '1px solid rgba(255,255,255,0.08)' }}>
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        [...Array(3)].map((_, i) => <div key={i} style={{ height: 80, ...{background:'#112240',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12}, opacity: 0.4 }} className="animate-pulse" />)
      ) : filtered.length === 0 ? (
        <EmptyState icon={filter === 'all' ? <IconCheck /> : <IconSearch />} title={filter === 'all' ? 'No issues' : `No ${filter.replace('_', ' ')} issues`} subtitle={filter === 'all' ? 'All clear across your portfolio' : 'Nothing matches this filter'} />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((r) => (
            <button key={r.id} type="button" onClick={() => onSelect(r)} className="w-full text-left active:opacity-70 transition-opacity">
              <MaintenanceIssueRow request={r} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Property Detail Panel ──

interface LandlordComplianceItem { id: string; type: string; issue_date: string | null; expiry_date: string | null; document_url: string | null }

function PropertyDetailPanel({ property, onBack, onMaintenanceSelect }: { property: Property; onBack: () => void; onMaintenanceSelect: (m: MaintenanceRequest) => void }) {
  const [tenancy, setTenancy] = useState<TenancyDetail | null | undefined>(undefined)
  const [requests, setRequests] = useState<MaintenanceRequest[]>([])
  const [propertyDocs, setPropertyDocs] = useState<PropertyDocument[]>([])
  const [complianceItems, setComplianceItems] = useState<LandlordComplianceItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [tenancyRes, maintRes, docsRes, complianceRes] = await Promise.all([
          supabase.from('tenancies').select('id, monthly_rent, start_date, end_date, arrears_balance, tenant_id, deposit_scheme, deposit_registered_date, last_rent_increase_date, profiles!tenant_id(full_name, email)').eq('property_id', property.id).eq('is_current', true).limit(1).maybeSingle(),
          supabase.from('maintenance_requests').select('id, title, description, priority, status, created_at, property_id, updated_at, resolved_at, assigned_contractor_id, cost, request_type, scheduled_at, completion_photo_urls, completion_document_url').eq('property_id', property.id).order('created_at', { ascending: false }).limit(10),
          supabase.from('documents').select('*').eq('property_id', property.id).order('expiry_date', { ascending: true }),
          supabase.from('compliance_items').select('id, type, issue_date, expiry_date, document_url').eq('property_id', property.id).order('expiry_date', { ascending: true }),
        ])
        if (tenancyRes.data) {
          const raw = tenancyRes.data as unknown as { id: string; monthly_rent: number | null; start_date: string | null; end_date: string | null; arrears_balance: number | null; tenant_id: string | null; deposit_scheme: string | null; deposit_registered_date: string | null; last_rent_increase_date: string | null; profiles: { full_name: string | null; email: string } | null }
          setTenancy({ id: raw.id, monthly_rent: raw.monthly_rent, start_date: raw.start_date, end_date: raw.end_date, arrears_balance: raw.arrears_balance, tenant_id: raw.tenant_id, tenantName: raw.profiles?.full_name ?? null, tenantEmail: raw.profiles?.email ?? null, deposit_scheme: raw.deposit_scheme, deposit_registered_date: raw.deposit_registered_date, last_rent_increase_date: raw.last_rent_increase_date })
        } else { setTenancy(null) }
        setRequests((maintRes.data ?? []) as MaintenanceRequest[])
        setPropertyDocs((docsRes.data ?? []) as PropertyDocument[])
        setComplianceItems((complianceRes.data ?? []) as LandlordComplianceItem[])
      } catch (e) { console.error(e); setTenancy(null) }
      finally { setLoading(false) }
    }
    load()
  }, [property.id])

  const b = statusBadge(property.is_active ? 'let' : 'vacant')

  function exportPropertyPack() {
    const generated = fmtDateTime(new Date().toISOString())
    const compRows = complianceItems.map(c => {
      const expired = c.expiry_date ? new Date(c.expiry_date) < new Date() : false
      const status = expired ? 'Expired' : 'Valid'
      const statusColor = expired ? '#dc2626' : '#15803d'
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827">${c.type}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151">${fmtDate(c.issue_date)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151">${fmtDate(c.expiry_date)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px"><span style="color:${statusColor};font-weight:600">${status}</span></td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px">${c.document_url ? `<a href="${c.document_url}" style="color:#2563eb">View PDF</a>` : '—'}</td>
      </tr>`
    }).join('')
    const docRows = propertyDocs.map(d => `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827">${d.label}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280">${d.type}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px"><a href="${d.url}" style="color:#2563eb">View</a></td>
      </tr>`).join('')
    const maintRows = requests.slice(0, 10).map(r => `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827">${r.title}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280">${r.priority ?? '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280">${r.status}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280">${fmtDateTime(r.created_at)}</td>
      </tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Property Information Pack — ${property.address}</title>
    <style>
      body { font-family: -apple-system, Arial, sans-serif; margin: 0; padding: 32px 40px; color: #111827; }
      h1 { font-size: 22px; margin: 0 0 4px; }
      h2 { font-size: 14px; font-weight: 600; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #e5e7eb; color: #374151; }
      .sub { font-size: 13px; color: #6b7280; margin: 0; }
      table { width: 100%; border-collapse: collapse; }
      thead th { padding: 8px 10px; background: #f9fafb; border-bottom: 2px solid #e5e7eb; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .info-item { background: #f9fafb; border-radius: 8px; padding: 12px 16px; }
      .info-label { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #9ca3af; margin-bottom: 4px; }
      .info-value { font-size: 15px; font-weight: 600; color: #111827; }
      @media print { a { color: #2563eb !important; } }
    </style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
      <div>
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#9ca3af;margin-bottom:6px">Aurelius Property Management</div>
        <h1>Property Information Pack</h1>
        <p class="sub">${property.address}</p>
      </div>
      <div style="text-align:right;font-size:12px;color:#6b7280">
        <div>Generated</div>
        <div style="font-weight:600;color:#111827">${generated}</div>
      </div>
    </div>

    <h2>Property Details</h2>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Address</div><div class="info-value">${property.address}</div></div>
      <div class="info-item"><div class="info-label">Status</div><div class="info-value">${property.is_active ? 'Let' : 'Vacant'}</div></div>
      ${tenancy ? `<div class="info-item"><div class="info-label">Monthly Rent</div><div class="info-value">${tenancy.monthly_rent != null ? gbp(tenancy.monthly_rent) : '—'}</div></div>` : ''}
      ${tenancy?.arrears_balance ? `<div class="info-item"><div class="info-label">Arrears</div><div class="info-value" style="color:#dc2626">${gbp(tenancy.arrears_balance)}</div></div>` : ''}
    </div>

    ${tenancy ? `
    <h2>Current Tenancy</h2>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Tenant</div><div class="info-value">${tenancy.tenantName ?? tenancy.tenantEmail ?? '—'}</div></div>
      ${tenancy.tenantEmail ? `<div class="info-item"><div class="info-label">Email</div><div class="info-value" style="font-size:13px">${tenancy.tenantEmail}</div></div>` : ''}
      <div class="info-item"><div class="info-label">Start Date</div><div class="info-value">${fmtDate(tenancy.start_date)}</div></div>
      <div class="info-item"><div class="info-label">End Date</div><div class="info-value">${tenancy.end_date ? fmtDate(tenancy.end_date) : 'Ongoing'}</div></div>
    </div>` : ''}

    <h2>Compliance Certificates</h2>
    ${complianceItems.length === 0
      ? '<p style="font-size:13px;color:#6b7280">No compliance certificates on record.</p>'
      : `<table><thead><tr><th>Certificate</th><th>Issued</th><th>Expires</th><th>Status</th><th>Document</th></tr></thead><tbody>${compRows}</tbody></table>`}

    ${propertyDocs.length > 0 ? `
    <h2>Property Documents</h2>
    <table><thead><tr><th>Document</th><th>Type</th><th>Link</th></tr></thead><tbody>${docRows}</tbody></table>` : ''}

    ${requests.length > 0 ? `
    <h2>Maintenance Requests</h2>
    <table><thead><tr><th>Title</th><th>Priority</th><th>Status</th><th>Raised</th></tr></thead><tbody>${maintRows}</tbody></table>` : ''}

    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af">
      Generated ${generated} · Aurelius Property Management · Confidential — for authorised use only.
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
    <div className="flex flex-col h-full overflow-auto" style={{ background: '#0d1b2e' }}>
      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 py-3"
        style={{ background: '#091422', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button type="button" onClick={onBack} className="w-8 h-8 flex items-center justify-center -ml-1 active:opacity-60">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#8899aa"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <p style={{ fontSize: 16, color: '#e8edf5', flex: 1, fontFamily: 'Georgia, serif' }} className="truncate">{property.address}</p>
        <button type="button" onClick={exportPropertyPack} title="Export Information Pack"
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e8edf5', fontSize: 11, fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
          Export PDF
        </button>
      </header>

      <div className="px-4 py-5 flex flex-col gap-4">
        {/* Property info */}
        <div style={CARD}>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 500, padding: '4px 10px', borderRadius: 4, letterSpacing: '0.08em', textTransform: 'uppercase', background: b.bg, color: b.color }}>
                {property.is_active ? 'Let' : 'Vacant'}
              </span>
              <p style={{ fontSize: 24, fontWeight: 300, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>
                {gbp(property.monthly_rent ?? 0)}<span style={{ fontSize: 13, color: '#8899aa' }}>/mo</span>
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#8899aa', flexWrap: 'wrap' }}>
              {property.property_type && <span>{property.property_type.charAt(0).toUpperCase() + property.property_type.slice(1)}</span>}
              {property.bedrooms != null && <span>{property.bedrooms} bedroom{property.bedrooms !== 1 ? 's' : ''}</span>}
              {property.postcode && <span style={{ marginLeft: 'auto', fontSize: 11 }}>{property.postcode}</span>}
            </div>
          </div>
        </div>

        {/* Tenancy + Compliance KPIs */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[...Array(2)].map((_, i) => <div key={i} style={{ ...CARD, height: 96, opacity: 0.4 }} className="animate-pulse" />)}
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <TenancyKPI tenancy={tenancy ?? null} />
              <ComplianceKPI docs={propertyDocs} />
            </div>

            {tenancy && (
              <div style={CARD}>
                {(tenancy.tenantName || tenancy.tenantEmail) && (
                  <>
                    <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 600, color: '#e8edf5' }}>
                        {initials(tenancy.tenantName, tenancy.tenantEmail ?? '')}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>{tenancy.tenantName ?? 'Tenant'}</p>
                        {tenancy.tenantEmail && <p style={{ fontSize: 11, color: '#8899aa' }} className="truncate">{tenancy.tenantEmail}</p>}
                      </div>
                    </div>
                    <div style={DIVIDER} />
                  </>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '0 16px 16px' }}>
                  {tenancy.start_date && <DetailItem label="Start" value={fmtDate(tenancy.start_date)} />}
                  {tenancy.end_date && <DetailItem label="End" value={fmtDate(tenancy.end_date)} />}
                  {tenancy.monthly_rent != null && <DetailItem label="Monthly Rent" value={gbp(tenancy.monthly_rent)} />}
                  {tenancy.arrears_balance != null && tenancy.arrears_balance > 0 && (
                    <DetailItem label="Arrears" value={gbp(tenancy.arrears_balance)} valueColor="#f87171" />
                  )}
                </div>
                <div style={DIVIDER} />
                {/* Deposit compliance */}
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa' }}>Deposit Compliance</p>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <p style={{ fontSize: 11, color: '#8899aa' }}>Scheme</p>
                      <p style={{ fontSize: 13, color: tenancy.deposit_scheme ? '#4ade80' : '#f87171', marginTop: 2 }}>
                        {tenancy.deposit_scheme ?? 'Not registered — required within 30 working days'}
                      </p>
                    </div>
                    {tenancy.deposit_registered_date && (
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 11, color: '#8899aa' }}>Registered</p>
                        <p style={{ fontSize: 12, color: '#e8edf5', marginTop: 2 }}>{fmtDate(tenancy.deposit_registered_date)}</p>
                      </div>
                    )}
                  </div>
                  {tenancy.last_rent_increase_date && (() => {
                    const nextEligible = new Date(tenancy.last_rent_increase_date!)
                    nextEligible.setFullYear(nextEligible.getFullYear() + 1)
                    const eligible = nextEligible <= new Date()
                    return (
                      <div>
                        <p style={{ fontSize: 11, color: '#8899aa' }}>Rent Increase</p>
                        <p style={{ fontSize: 12, color: eligible ? '#4ade80' : '#8899aa', marginTop: 2 }}>
                          {eligible ? 'Eligible now (12-month interval met)' : `Next eligible: ${fmtDate(nextEligible.toISOString().slice(0, 10))} — 3 months written notice required`}
                        </p>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}

            {propertyDocs.length > 0 && (
              <div style={CARD}>
                {propertyDocs.map((d, i) => (
                  <div key={d.id}>
                    <ExpiringDocRow doc={d} />
                    {i < propertyDocs.length - 1 && <div style={DIVIDER} />}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Maintenance */}
        <div>
          <SectionHeader title="Maintenance" />
          {loading ? (
            <div className="flex flex-col gap-2">
              {[...Array(2)].map((_, i) => <div key={i} style={{ ...CARD, height: 64, opacity: 0.4 }} className="animate-pulse" />)}
            </div>
          ) : requests.length === 0 ? (
            <EmptyState icon={<IconCheck />} title="No issues" subtitle="No maintenance requests for this property" />
          ) : (
            <div className="flex flex-col gap-2">
              {requests.map((r) => (
                <button key={r.id} type="button" onClick={() => onMaintenanceSelect(r)} className="w-full text-left active:opacity-70 transition-opacity">
                  <MaintenanceIssueRow request={r} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pre-tenancy Repairing Standard status */}
        <div style={{ ...CARD, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, borderColor: property.pre_tenancy_check_completed ? 'rgba(255,255,255,0.07)' : 'rgba(248,113,113,0.3)' }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: property.pre_tenancy_check_completed ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {property.pre_tenancy_check_completed
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="#4ade80"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="#f87171"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            }
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 2 }}>Pre-Tenancy Repairing Standard Check</p>
            <p style={{ fontSize: 12, color: property.pre_tenancy_check_completed ? '#4ade80' : '#f87171', lineHeight: 1.4 }}>
              {property.pre_tenancy_check_completed
                ? `Completed${property.pre_tenancy_check_date ? ` — ${fmtDate(property.pre_tenancy_check_date)}` : ''}`
                : 'Not completed — required by law before advertising or letting'}
            </p>
          </div>
        </div>

        {/* Required Certifications Checklist */}
        {!loading && (() => {
          const today = new Date()
          const in60 = new Date(); in60.setDate(today.getDate() + 60)
          const required = [
            ...(property.has_gas ? [{ key: 'gas', label: 'Gas Safety Certificate', hint: 'Annual — Gas Safe registered contractor' }] : []),
            { key: 'eicr', label: 'EICR (Electrical)', hint: 'Every 5 years' },
            { key: 'epc', label: 'EPC', hint: '10-year validity — required on all adverts' },
            { key: 'legionella', label: 'Legionella Risk Assessment', hint: 'Legally required — duty of care' },
            { key: 'smoke', label: 'Smoke / Heat / CO Alarms', hint: 'Tolerable Standard from Feb 2022' },
          ]
          type CertStatus = 'missing' | 'expired' | 'expiring' | 'valid'
          const certs = required.map(cert => {
            const match = complianceItems.find(c => c.type.toLowerCase().includes(cert.key))
            if (!match) return { ...cert, status: 'missing' as CertStatus, expiry: null }
            if (cert.key === 'smoke' || !match.expiry_date) return { ...cert, status: 'valid' as CertStatus, expiry: match.expiry_date ?? null }
            const expiry = new Date(match.expiry_date)
            if (expiry < today) return { ...cert, status: 'expired' as CertStatus, expiry: match.expiry_date }
            if (expiry <= in60) return { ...cert, status: 'expiring' as CertStatus, expiry: match.expiry_date }
            return { ...cert, status: 'valid' as CertStatus, expiry: match.expiry_date }
          })
          const hasIssues = certs.some(c => c.status !== 'valid')
          if (!hasIssues) return null
          return (
            <div>
              <SectionHeader title="Required Certifications" />
              <div style={CARD}>
                {certs.map((cert, i) => {
                  const color = cert.status === 'valid' ? '#4ade80' : cert.status === 'expiring' ? '#fbbf24' : '#f87171'
                  const label = cert.status === 'missing' ? 'Missing' : cert.status === 'expired' ? 'Expired' : cert.status === 'expiring' ? `Exp ${fmtDate(cert.expiry)}` : 'Valid'
                  return (
                    <div key={cert.key}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px' }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, color: '#e8edf5' }}>{cert.label}</p>
                          <p style={{ fontSize: 10, color: '#8899aa', marginTop: 2 }}>{cert.hint}</p>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 500, color, flexShrink: 0 }}>{label}</span>
                      </div>
                      {i < certs.length - 1 && <div style={DIVIDER} />}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* Compliance Certificates */}
        {complianceItems.length > 0 && (
          <div>
            <SectionHeader title="Compliance Certificates" />
            <div style={CARD}>
              {complianceItems.map((item, i) => {
                const expiry = item.expiry_date ? new Date(item.expiry_date) : null
                const daysUntil = expiry ? Math.ceil((expiry.getTime() - Date.now()) / 86400000) : null
                const color = daysUntil == null ? '#8899aa' : daysUntil < 0 ? '#f87171' : daysUntil < 60 ? '#fbbf24' : '#4ade80'
                const bg = daysUntil == null ? 'rgba(136,153,170,0.1)' : daysUntil < 0 ? 'rgba(248,113,113,0.1)' : daysUntil < 60 ? 'rgba(251,191,36,0.1)' : 'rgba(74,222,128,0.1)'
                const statusLabel = daysUntil == null ? '—' : daysUntil < 0 ? 'Expired' : daysUntil < 60 ? `${daysUntil}d` : 'Valid'
                return (
                  <div key={item.id}>
                    <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }} className="truncate">{item.type}</p>
                        {item.expiry_date && <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>Expires {fmtDate(item.expiry_date)}</p>}
                        {item.issue_date && <p style={{ fontSize: 11, color: '#8899aa' }}>Issued {fmtDate(item.issue_date)}</p>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {item.document_url && (
                          <a href={item.document_url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 11, color: '#60a5fa', textDecoration: 'none', padding: '2px 8px', borderRadius: 4, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}>
                            PDF
                          </a>
                        )}
                        <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 4, background: bg, color }}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                    {i < complianceItems.length - 1 && <div style={DIVIDER} />}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Maintenance Detail Sheet ──

function MaintenanceDetailSheet({ request, onClose }: { request: MaintenanceRequest; onClose: () => void }) {
  const [history, setHistory] = useState<StatusEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [contractorName, setContractorName] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('maintenance_status_history').select('id, old_status, new_status, notes, created_at').eq('maintenance_request_id', request.id).order('created_at', { ascending: true })
      .then(({ data }) => { setHistory((data ?? []) as StatusEntry[]); setHistoryLoading(false) })
    if (request.assigned_contractor_id) {
      supabase.rpc('get_contractor_name_for_request', { request_id: request.id })
        .then(({ data }) => { if (data) setContractorName(data as string) })
    }
  }, [request.id, request.assigned_contractor_id])

  const priority = request.priority ?? 'low'
  const status = request.status ?? 'open'
  const pb = statusBadge(priority === 'emergency' || priority === 'high' ? 'overdue' : priority === 'medium' ? 'late' : 'let')
  const sb = statusBadge(status)
  const ageInDays = request.created_at ? Math.floor((Date.now() - new Date(request.created_at).getTime()) / 86400000) : 0

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] rounded-t-3xl flex flex-col" style={{ background: '#112240' }}>
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
        </div>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <p style={{ fontSize: 16, color: '#e8edf5', flex: 1, fontFamily: 'Georgia, serif' }} className="truncate pr-4">
            {request.title ?? 'Maintenance Request'}
          </p>
          <button type="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="#8899aa"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={CARD}>
            <div style={{ padding: 14 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4, letterSpacing: '0.08em', textTransform: 'uppercase', background: pb.bg, color: pb.color }}>{priority}</span>
                <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4, letterSpacing: '0.08em', textTransform: 'uppercase', background: sb.bg, color: sb.color }}>{maintenanceStatusText(status)}</span>
              </div>
              {request.description && (
                <>
                  <p style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.6, marginBottom: 12 }}>{request.description}</p>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', marginBottom: 12 }} />
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa' }}>Reported</p>
                  <p style={{ fontSize: 12, color: '#e8edf5', marginTop: 3 }}>{request.created_at ? shortDate(request.created_at) : '—'}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {request.resolved_at ? (
                    <>
                      <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa' }}>Resolved</p>
                      <p style={{ fontSize: 12, color: '#4ade80', marginTop: 3 }}>{shortDate(request.resolved_at)}</p>
                    </>
                  ) : (
                    <>
                      <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa' }}>Age</p>
                      <p style={{ fontSize: 12, fontWeight: 500, marginTop: 3, color: ageInDays > 7 ? '#f87171' : '#e8edf5' }}>
                        {ageInDays === 0 ? 'Today' : `${ageInDays}d`}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Contractor */}
              {contractorName && (
                <>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '12px 0' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 6, background: 'rgba(251,191,36,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#fbbf24"><path d="M15.5 2.1a6.5 6.5 0 0 0-6.22 8.5L3 17.1a2.1 2.1 0 1 0 3 3l6.3-6.3a6.5 6.5 0 1 0 3.2-11.7zm0 11a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg>
                    </div>
                    <div>
                      <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa' }}>Contractor</p>
                      <p style={{ fontSize: 13, color: '#e8edf5', marginTop: 2 }}>{contractorName}</p>
                    </div>
                  </div>
                </>
              )}

              {/* Scheduled visit — all job types */}
              {request.scheduled_at && (
                <>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '12px 0' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 6, background: 'rgba(96,165,250,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#60a5fa"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>
                    </div>
                    <div>
                      <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa' }}>Scheduled Visit</p>
                      <p style={{ fontSize: 13, color: '#60a5fa', marginTop: 2 }}>
                        {new Date(request.scheduled_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                        {' at '}
                        {new Date(request.scheduled_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* Job cost — shown once resolved */}
              {request.cost != null && (request.status === 'resolved' || request.status === 'closed' || request.status === 'pending_review') && (
                <>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '12px 0' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 6, background: 'rgba(74,222,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#4ade80"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>
                    </div>
                    <div>
                      <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa' }}>Job Cost</p>
                      <p style={{ fontSize: 13, color: '#4ade80', marginTop: 2 }}>{gbp(request.cost)}</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Completion photos */}
          {request.completion_photo_urls && request.completion_photo_urls.length > 0 && (
            <div>
              <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 8 }}>Completion Photos</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {request.completion_photo_urls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', borderRadius: 8, overflow: 'hidden', aspectRatio: '4/3' }}>
                    <img src={url} alt={`Completion photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Compliance certificate */}
          {request.completion_document_url && (
            <div>
              <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 8 }}>Compliance Certificate</p>
              <a
                href={request.completion_document_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', textDecoration: 'none' }}
              >
                <div style={{ width: 30, height: 30, borderRadius: 6, background: 'rgba(74,222,128,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#4ade80"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zm-3 6h4v1.5H9V15zm0-3h6v1.5H9V12z"/></svg>
                </div>
                <div>
                  <p style={{ fontSize: 13, color: '#4ade80', fontWeight: 500 }}>View Certificate PDF</p>
                  <p style={{ fontSize: 11, color: '#8899aa', marginTop: 1 }}>Uploaded by contractor</p>
                </div>
                <svg style={{ marginLeft: 'auto' }} width="12" height="12" viewBox="0 0 24 24" fill="#8899aa"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
              </a>
            </div>
          )}

          {/* Timeline */}
          <div>
            <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 8 }}>Timeline</p>
            {historyLoading ? (
              <div style={{ ...CARD, height: 64, opacity: 0.4 }} className="animate-pulse" />
            ) : history.length === 0 ? (
              <div style={CARD}><p style={{ padding: '12px 16px', fontSize: 12, color: '#8899aa' }}>No updates yet</p></div>
            ) : (
              <div style={CARD}>
                {history.map((entry, i) => (
                  <div key={entry.id} style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#8899aa', flexShrink: 0 }} />
                      {i < history.length - 1 && <div style={{ width: 1, flex: 1, minHeight: 16, background: 'rgba(255,255,255,0.07)', marginTop: 4 }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {entry.old_status && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#8899aa' }}>{maintenanceStatusText(entry.old_status)}</span>}
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="#8899aa"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                        {entry.new_status && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#e8edf5', fontWeight: 500 }}>{maintenanceStatusText(entry.new_status)}</span>}
                      </div>
                      {entry.notes && <p style={{ fontSize: 11, color: '#8899aa', marginTop: 4 }}>{entry.notes}</p>}
                      {entry.created_at && <p style={{ fontSize: 10, color: '#8899aa', opacity: 0.6, marginTop: 3 }}>{fmtDateTime(entry.created_at)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ height: 16 }} />
        </div>
      </div>
    </>
  )
}

// ── Sub-components ──

function PropertyCarouselCard({ property }: { property: Property }) {
  const b = statusBadge(property.is_active ? 'let' : 'vacant')
  return (
    <div style={{ width: 160, height: 140, ...CARD, padding: 14, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: b.color }} />
        <span style={{ fontSize: 10, fontWeight: 500, color: b.color }}>{property.is_active ? 'Let' : 'Vacant'}</span>
      </div>
      <div style={{ flex: 1 }} />
      <p style={{ fontSize: 13, color: '#e8edf5', lineHeight: 1.3, fontFamily: 'Georgia, serif' }} className="line-clamp-2">{property.address}</p>
      <p style={{ fontSize: 12, color: '#8899aa', marginTop: 4 }}>{gbp(property.monthly_rent ?? 0)}/mo</p>
    </div>
  )
}

function PropertyListCard({ property }: { property: Property }) {
  const b = statusBadge(property.is_active ? 'let' : 'vacant')
  return (
    <div style={{ ...CARD, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }} className="truncate">{property.address}</p>
          {property.postcode && <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>{property.postcode}</p>}
          <p style={{ fontSize: 13, color: '#e8edf5', marginTop: 6, fontFamily: 'Georgia, serif' }}>{gbp(property.monthly_rent ?? 0)}/mo</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4, letterSpacing: '0.08em', textTransform: 'uppercase', background: b.bg, color: b.color }}>
            {property.is_active ? 'Let' : 'Vacant'}
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="#8899aa"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
        </div>
      </div>
      {(property.bedrooms != null || property.property_type) && (
        <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 11, color: '#8899aa' }}>
          {property.bedrooms != null && <span>{property.bedrooms} bed</span>}
          {property.property_type && <span>{property.property_type.charAt(0).toUpperCase() + property.property_type.slice(1)}</span>}
        </div>
      )}
    </div>
  )
}

function MaintenanceIssueRow({ request }: { request: MaintenanceRequest }) {
  const priority = request.priority ?? 'low'
  const status = request.status ?? 'open'
  const isActive = status !== 'resolved' && status !== 'closed'
  const sb = statusBadge(isActive ? (priority === 'emergency' || priority === 'high' ? 'overdue' : 'late') : 'let')
  const priorityColor = priority === 'emergency' ? '#f87171' : priority === 'high' ? '#fb923c' : priority === 'medium' ? '#fbbf24' : '#8899aa'
  const ageInDays = request.created_at ? Math.floor((Date.now() - new Date(request.created_at).getTime()) / 86400000) : 0

  return (
    <div style={{ ...CARD, display: 'flex', overflow: 'hidden' }}>
      <div style={{ width: 3, background: priorityColor, flexShrink: 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', flex: 1, minWidth: 0 }}>
        <div style={{ width: 40, height: 40, borderRadius: 8, background: `${priorityColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill={priorityColor}><path d="M15.5 2.1a6.5 6.5 0 0 0-6.22 8.5L3 17.1a2.1 2.1 0 1 0 3 3l6.3-6.3a6.5 6.5 0 1 0 3.2-11.7zm0 11a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" /></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, color: '#e8edf5', fontFamily: 'Georgia, serif' }} className="truncate">{request.title ?? 'Untitled'}</p>
          {request.description && <p style={{ fontSize: 11, color: '#8899aa' }} className="truncate">{request.description}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: sb.color }}>{maintenanceStatusText(status)}</span>
            <span style={{ fontSize: 10, color: '#8899aa' }}>·</span>
            <span style={{ fontSize: 10, color: '#8899aa' }}>{ageInDays === 0 ? 'Today' : `${ageInDays}d ago`}</span>
          </div>
        </div>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="#8899aa" style={{ flexShrink: 0 }}><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
      </div>
    </div>
  )
}

function TenancyKPI({ tenancy }: { tenancy: TenancyDetail | null }) {
  if (!tenancy) return (
    <div style={CARD}>
      <div style={{ padding: 14 }}>
        <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 6 }}>Tenancy</p>
        <p style={{ fontSize: 18, fontWeight: 300, color: '#f87171', fontFamily: 'Georgia, serif' }}>Vacant</p>
        <p style={{ fontSize: 11, color: '#8899aa', marginTop: 3 }}>No active tenancy</p>
      </div>
    </div>
  )
  return (
    <div style={CARD}>
      <div style={{ padding: 14 }}>
        <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 6 }}>Tenancy</p>
        <p style={{ fontSize: 15, color: '#4ade80', fontFamily: 'Georgia, serif' }} className="truncate">{tenancy.tenantName ?? 'Tenant'}</p>
        <p style={{ fontSize: 11, color: '#8899aa', marginTop: 3 }}>{tenancy.monthly_rent != null ? `${gbp(tenancy.monthly_rent)}/mo` : 'Active'}</p>
      </div>
    </div>
  )
}

function ComplianceKPI({ docs }: { docs: PropertyDocument[] }) {
  const today = new Date(); const in30 = new Date(); in30.setDate(today.getDate() + 30)
  const expiredCount = docs.filter((d) => d.expiry_date && new Date(d.expiry_date) < today).length
  const expiringSoonCount = docs.filter((d) => { if (!d.expiry_date) return false; const exp = new Date(d.expiry_date); return exp >= today && exp <= in30 }).length
  const allClear = expiredCount === 0 && expiringSoonCount === 0
  const color = expiredCount > 0 ? '#f87171' : expiringSoonCount > 0 ? '#fbbf24' : '#4ade80'
  const value = allClear ? 'All Clear' : expiredCount > 0 ? `${expiredCount} Expired` : `${expiringSoonCount} Due`
  const subtitle = allClear ? (docs.length === 0 ? 'No documents' : `${docs.length} current`) : expiredCount > 0 ? 'Action required' : 'Expiring soon'
  return (
    <div style={CARD}>
      <div style={{ padding: 14 }}>
        <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 6 }}>Compliance</p>
        <p style={{ fontSize: 18, fontWeight: 300, color, fontFamily: 'Georgia, serif' }}>{value}</p>
        <p style={{ fontSize: 11, color: '#8899aa', marginTop: 3 }}>{subtitle}</p>
      </div>
    </div>
  )
}

function ExpiringDocRow({ doc }: { doc: PropertyDocument }) {
  const expiry = doc.expiry_date ? new Date(doc.expiry_date) : null
  const days = expiry ? Math.floor((expiry.getTime() - Date.now()) / 86400000) : null
  const isExpired = days !== null && days < 0
  const isSoon = days !== null && days >= 0 && days <= 30
  const color = isExpired ? '#f87171' : isSoon ? '#fbbf24' : '#4ade80'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
      <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#8899aa' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, color: '#e8edf5', fontFamily: 'Georgia, serif' }} className="truncate">{doc.label}</p>
        <p style={{ fontSize: 10, color: '#8899aa', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>{doc.type}</p>
      </div>
      {expiry && (
        <span style={{ fontSize: 11, fontWeight: 500, color, flexShrink: 0 }}>
          {isExpired ? 'Expired' : `${days}d`}
        </span>
      )}
    </div>
  )
}

function DetailItem({ label, value, valueColor = '#e8edf5' }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa' }}>{label}</p>
      <p style={{ fontSize: 12, fontWeight: 500, color: valueColor, marginTop: 3 }}>{value}</p>
    </div>
  )
}

function maintenanceStatusText(status: string | null): string {
  switch (status) {
    case 'open': return 'Open'; case 'assigned': return 'Assigned'
    case 'in_progress': return 'In Progress'; case 'pending_review': return 'Pending Review'
    case 'resolved': return 'Resolved'; case 'closed': return 'Closed'
    default: return status ?? 'Open'
  }
}

// ── Statements Tab ──

function StatementsTab({ statements, isLoading, properties, financials, financialsLoading, setupBanner, onDismissBanner, collectedThisMonth, totalMonthlyRent, landlordName }: {
  statements: Statement[]
  isLoading: boolean
  properties: Property[]
  financials: LandlordFinancials | null
  financialsLoading: boolean
  setupBanner: 'complete' | 'refresh' | null
  onDismissBanner: () => void
  collectedThisMonth: number
  totalMonthlyRent: number
  landlordName: string
}) {
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [viewingStatement, setViewingStatement] = useState<Statement | null>(null)
  const propMap = Object.fromEntries(properties.map(p => [p.id, p.address]))

  async function handleConnectBank() {
    setConnecting(true); setConnectError(null)
    try {
      const { data, error } = await supabase.functions.invoke('create-connect-account')
      if (error || !data?.url) throw new Error(error?.message ?? 'Failed to create account link')
      window.location.href = data.url
    } catch (err) {
      setConnectError(String(err))
      setConnecting(false)
    }
  }

  function buildStatementHtml(stmt: Statement) {
    const address = stmt.property_id ? (propMap[stmt.property_id] ?? 'Property') : 'Property'
    const period = new Date(stmt.period).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    const stmtRef = stmt.id.slice(0, 8).toUpperCase()
    const feePct = stmt.gross_amount > 0 ? ((stmt.management_fee / stmt.gross_amount) * 100).toFixed(1) : '0'
    const generated = fmtDateTime(stmt.created_at)

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Rental Statement — ${address} — ${period}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-weight: 300; background: #fff; color: #111827; padding: 40px; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; padding-bottom: 24px; border-bottom: 1px solid #e5e7eb; }
      .brand { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #0d1b3e; font-weight: 600; }
      .brand-sub { font-size: 10px; color: #9ca3af; margin-top: 3px; }
      .ref { text-align: right; }
      .ref-label { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #9ca3af; }
      .ref-value { font-size: 13px; font-weight: 600; color: #111827; margin-top: 2px; }
      h1 { font-size: 22px; font-weight: 300; color: #0d1b3e; margin-bottom: 4px; }
      .subtitle { font-size: 13px; color: #6b7280; margin-bottom: 28px; }
      .meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 32px; }
      .meta-item { background: #f9fafb; border-radius: 8px; padding: 12px 14px; }
      .meta-label { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #9ca3af; margin-bottom: 4px; }
      .meta-value { font-size: 14px; font-weight: 600; color: #111827; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
      thead th { padding: 10px 14px; background: #0d1b3e; color: #fff; text-align: left; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 500; }
      tbody td { padding: 14px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #374151; }
      tbody tr:last-child td { border-bottom: none; }
      .amount { text-align: right; font-variant-numeric: tabular-nums; }
      .total-row td { background: #f9fafb; font-weight: 600; font-size: 14px; color: #111827; border-top: 2px solid #e5e7eb; }
      .net-row td { background: #f0fdf4; font-weight: 700; font-size: 16px; color: #15803d; border-top: 2px solid #86efac; }
      .negative { color: #dc2626; }
      .status { display: inline-block; padding: 3px 10px; border-radius: 4px; background: #dcfce7; color: #15803d; font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
      .notes { background: #fefce8; border-left: 3px solid #fbbf24; padding: 10px 14px; font-size: 12px; color: #92400e; margin-bottom: 24px; border-radius: 0 6px 6px 0; }
      .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }
      @media print { body { padding: 20px; } }
    </style></head><body>
    <div class="header">
      <div>
        <div class="brand">Aurelius Property Management</div>
        <div class="brand-sub">aureliuspropertymanagement.co.uk</div>
      </div>
      <div class="ref">
        <div class="ref-label">Statement Ref</div>
        <div class="ref-value">AUR-${stmtRef}</div>
      </div>
    </div>

    <h1>Rental Statement</h1>
    <p class="subtitle">${period}</p>

    <div class="meta-grid">
      <div class="meta-item">
        <div class="meta-label">Landlord</div>
        <div class="meta-value">${landlordName}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Property</div>
        <div class="meta-value">${address}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Status</div>
        <div class="meta-value"><span class="status">${stmt.status}</span></div>
      </div>
    </div>

    <table>
      <thead>
        <tr><th>Description</th><th class="amount">Amount</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Gross rent received</td>
          <td class="amount">${gbp(stmt.gross_amount)}</td>
        </tr>
        <tr>
          <td>Management fee (${feePct}%)</td>
          <td class="amount negative">−${gbp(stmt.management_fee)}</td>
        </tr>
        <tr class="net-row">
          <td>Net amount to landlord</td>
          <td class="amount">${gbp(stmt.net_amount)}</td>
        </tr>
      </tbody>
    </table>

    ${stmt.notes ? `<div class="notes"><strong>Notes:</strong> ${stmt.notes}</div>` : ''}

    <div class="footer">
      <span>Generated ${generated}</span>
      <span>Aurelius Property Management · Dundee · This statement is for information purposes only.</span>
    </div>
    </body></html>`

    return { html, address, period }
  }

  function handleView(stmt: Statement) {
    setViewingStatement(stmt)
  }

  function handleDownload(stmt: Statement) {
    const { html, address, period } = buildStatementHtml(stmt)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Aurelius-Statement-${period.replace(/\s/g, '-')}-${(address).replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-')}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const gbpFromStripe = (amount: number) => gbp(amount / 100)
  const fmtUnix = (ts: number) => new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  const payoutStatusStyle = (status: string) => {
    if (status === 'paid') return { bg: 'rgba(74,222,128,0.12)', color: '#4ade80' }
    if (status === 'failed') return { bg: 'rgba(248,113,113,0.12)', color: '#f87171' }
    return { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24' }
  }

  const byYear: Record<string, Statement[]> = {}
  for (const s of statements) {
    const yr = s.period.slice(0, 4)
    if (!byYear[yr]) byYear[yr] = []
    byYear[yr].push(s)
  }
  const years = Object.keys(byYear).sort((a, b) => Number(b) - Number(a))

  return (
    <div className="px-4 py-5 flex flex-col gap-5">

      {/* Setup banner */}
      {setupBanner && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: setupBanner === 'complete' ? 'rgba(74,222,128,0.1)' : 'rgba(251,191,36,0.1)', border: `1px solid ${setupBanner === 'complete' ? 'rgba(74,222,128,0.25)' : 'rgba(251,191,36,0.25)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <p style={{ fontSize: 13, color: setupBanner === 'complete' ? '#4ade80' : '#fbbf24' }}>
            {setupBanner === 'complete' ? 'Bank account connected. Payouts will appear below once rent is processed.' : 'Setup incomplete — click "Continue Setup" to finish connecting your bank account.'}
          </p>
          <button type="button" onClick={onDismissBanner} style={{ background: 'none', border: 'none', color: '#8899aa', cursor: 'pointer', fontSize: 18, lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>
      )}

      {/* Bank account / payouts section */}
      <div>
        <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 12 }}>Bank Account & Payouts</p>

        {financialsLoading ? (
          <div style={{ ...CARD, height: 100, opacity: 0.4 }} className="animate-pulse" />
        ) : !financials?.connected ? (
          <div style={{ ...CARD, padding: '20px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif', marginBottom: 6 }}>Connect your bank account</p>
            <p style={{ fontSize: 12, color: '#8899aa', marginBottom: 16 }}>Receive rent payments directly to your UK bank account via Stripe.</p>
            {connectError && <p style={{ fontSize: 12, color: '#f87171', marginBottom: 12 }}>{connectError}</p>}
            <button type="button" onClick={handleConnectBank} disabled={connecting}
              style={{ padding: '10px 24px', borderRadius: 8, background: '#4ade80', color: '#0d1b2e', fontWeight: 600, fontSize: 13, border: 'none', cursor: connecting ? 'not-allowed' : 'pointer', opacity: connecting ? 0.6 : 1 }}>
              {connecting ? 'Redirecting…' : 'Connect Bank Account'}
            </button>
          </div>
        ) : !financials.onboarding_complete ? (
          <div style={{ ...CARD, padding: '20px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#fbbf24', fontFamily: 'Georgia, serif', marginBottom: 6 }}>Setup incomplete</p>
            <p style={{ fontSize: 12, color: '#8899aa', marginBottom: 16 }}>Complete your bank account setup to start receiving rent payments.</p>
            {connectError && <p style={{ fontSize: 12, color: '#f87171', marginBottom: 12 }}>{connectError}</p>}
            <button type="button" onClick={handleConnectBank} disabled={connecting}
              style={{ padding: '10px 24px', borderRadius: 8, background: '#fbbf24', color: '#0d1b2e', fontWeight: 600, fontSize: 13, border: 'none', cursor: connecting ? 'not-allowed' : 'pointer', opacity: connecting ? 0.6 : 1 }}>
              {connecting ? 'Redirecting…' : 'Continue Setup'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Rent KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ ...CARD, padding: '14px 16px' }}>
                <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 4 }}>Collected</p>
                <p style={{ fontSize: 22, color: '#4ade80', fontFamily: 'Georgia, serif' }}>{gbp(collectedThisMonth)}</p>
                <p style={{ fontSize: 10, color: '#8899aa', marginTop: 2 }}>Paid this month</p>
              </div>
              <div style={{ ...CARD, padding: '14px 16px' }}>
                <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 4 }}>Outstanding</p>
                <p style={{ fontSize: 22, color: totalMonthlyRent - collectedThisMonth > 0 ? '#fbbf24' : '#4ade80', fontFamily: 'Georgia, serif' }}>{gbp(Math.max(0, totalMonthlyRent - collectedThisMonth))}</p>
                <p style={{ fontSize: 10, color: '#8899aa', marginTop: 2 }}>{totalMonthlyRent - collectedThisMonth <= 0 ? 'All rent received' : 'Still to be paid'}</p>
              </div>
            </div>

            {/* Payout history */}
            {financials.payouts && financials.payouts.length > 0 && (
              <div style={CARD}>
                <div style={{ padding: '12px 16px 8px' }}>
                  <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa' }}>Recent Payouts</p>
                </div>
                {financials.payouts.map((p, i) => {
                  const st = payoutStatusStyle(p.status)
                  return (
                    <div key={p.id}>
                      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                          <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>{gbpFromStripe(p.amount)}</p>
                          <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>Paid to bank {fmtUnix(p.arrival_date)}</p>
                        </div>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: st.bg, color: st.color, textTransform: 'capitalize', letterSpacing: '0.06em', flexShrink: 0 }}>{p.status.replace('_', ' ')}</span>
                      </div>
                      {i < (financials.payouts?.length ?? 0) - 1 && <div style={DIVIDER} />}
                    </div>
                  )
                })}
              </div>
            )}

            {financials.payouts?.length === 0 && (
              <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center', padding: '8px 0' }}>No bank payments yet — they'll appear here once rent is processed.</p>
            )}
          </div>
        )}
      </div>

      <div>
        <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 4 }}>Rent Statements</p>
        <p style={{ fontSize: 13, color: '#8899aa', fontWeight: 300 }}>Monthly statements showing rent collected, management fees, and net payments.</p>
      </div>

      {isLoading ? (
        [...Array(3)].map((_, i) => <div key={i} style={{ ...CARD, height: 64, opacity: 0.4 }} className="animate-pulse" />)
      ) : statements.length === 0 ? (
        <div style={{ ...CARD, padding: 32, textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#8899aa' }}>
            <IconSterling />
          </div>
          <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif', marginBottom: 6 }}>No statements yet</p>
          <p style={{ fontSize: 12, color: '#8899aa' }}>Statements will appear here each month once rent is processed.</p>
        </div>
      ) : (
        years.map(yr => (
          <div key={yr}>
            <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 8 }}>{yr}</p>
            <div style={CARD}>
              {byYear[yr].map((stmt, i) => {
                const period = new Date(stmt.period).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
                const addr = stmt.property_id ? propMap[stmt.property_id] : null
                return (
                  <div key={stmt.id}>
                    <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>{period}</p>
                        {addr && <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }} className="truncate">{addr}</p>}
                        <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, color: '#8899aa' }}>Gross <span style={{ color: '#e8edf5' }}>{gbp(stmt.gross_amount)}</span></span>
                          {stmt.management_fee > 0 && <span style={{ fontSize: 10, color: '#8899aa' }}>Fee <span style={{ color: '#f87171' }}>−{gbp(stmt.management_fee)}</span></span>}
                          <span style={{ fontSize: 10, color: '#8899aa' }}>Net <span style={{ color: '#4ade80', fontWeight: 600 }}>{gbp(stmt.net_amount)}</span></span>
                        </div>
                        {stmt.notes && <p style={{ fontSize: 11, color: '#8899aa', marginTop: 4, fontStyle: 'italic' }}>{stmt.notes}</p>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(74,222,128,0.1)', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{stmt.status}</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" onClick={() => handleView(stmt)}
                            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#c8d4e0', cursor: 'pointer' }}>
                            View
                          </button>
                          <button type="button" onClick={() => handleDownload(stmt)}
                            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', color: '#60a5fa', cursor: 'pointer' }}>
                            Download
                          </button>
                        </div>
                      </div>
                    </div>
                    {i < byYear[yr].length - 1 && <div style={DIVIDER} />}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      {viewingStatement && (
        <StatementViewModal
          stmt={viewingStatement}
          html={buildStatementHtml(viewingStatement).html}
          onClose={() => setViewingStatement(null)}
          onDownload={() => handleDownload(viewingStatement)}
        />
      )}
    </div>
  )
}

function StatementViewModal({ stmt, html, onClose, onDownload }: {
  stmt: Statement
  html: string
  onClose: () => void
  onDownload: () => void
}) {
  const blobUrl = useMemo(() => {
    const blob = new Blob([html], { type: 'text/html' })
    return URL.createObjectURL(blob)
  }, [html])

  useEffect(() => {
    return () => URL.revokeObjectURL(blobUrl)
  }, [blobUrl])

  const period = new Date(stmt.period).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0d1b2e' }}>
      <header style={{ background: '#091422', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <button type="button" onClick={onClose} style={{ fontSize: 13, color: '#8899aa', background: 'none', border: 'none', cursor: 'pointer' }}>✕ Close</button>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#e8edf5' }}>{period}</span>
        <button type="button" onClick={onDownload}
          style={{ fontSize: 12, fontWeight: 500, color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>
          Download
        </button>
      </header>
      <iframe
        src={blobUrl}
        title={`Statement ${period}`}
        style={{ flex: 1, border: 'none', background: '#fff' }}
      />
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import type { Property, MaintenanceRequest, PropertyDocument } from '../lib/types'
import { gbp, percent, shortDate, greeting, initials } from '../lib/utils'
import DashShell from '../components/DashShell'
import KPICard from '../components/KPICard'
import SectionHeader from '../components/SectionHeader'
import EmptyState from '../components/EmptyState'
import SettingsPage from './SettingsPage'
import { IconGrid, IconHouse, IconWrench, IconDoc, IconGear, IconCheck, IconSearch } from '../components/icons'

const TABS = [
  { id: 'dashboard',   label: 'Dashboard',   icon: <IconGrid /> },
  { id: 'properties',  label: 'Properties',  icon: <IconHouse /> },
  { id: 'maintenance', label: 'Maintenance', icon: <IconWrench /> },
  { id: 'documents',   label: 'Documents',   icon: <IconDoc /> },
  { id: 'settings',    label: 'Settings',    icon: <IconGear /> },
]

interface TenancyDetail {
  id: string; monthly_rent: number | null; start_date: string | null
  end_date: string | null; arrears_balance: number | null
  tenant_id: string | null; tenantName: string | null; tenantEmail: string | null
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
  const [isLoading, setIsLoading] = useState(true)
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)
  const [selectedMaintenance, setSelectedMaintenance] = useState<MaintenanceRequest | null>(null)

  const loadData = useCallback(async () => {
    if (!user) return
    setIsLoading(true)
    try {
      const { data: props } = await supabase.from('properties').select('*').eq('landlord_id', user.id).order('created_at', { ascending: false })
      const propList = (props ?? []) as Property[]
      setProperties(propList)
      if (propList.length > 0) {
        const propIds = propList.map((p) => p.id)
        const in60 = new Date(); in60.setDate(in60.getDate() + 60)
        const [{ data: maint }, { data: docs }] = await Promise.all([
          supabase.from('maintenance_requests').select('*').in('property_id', propIds).order('created_at', { ascending: false }),
          supabase.from('documents').select('*').in('property_id', propIds).lte('expiry_date', in60.toISOString().split('T')[0]).order('expiry_date', { ascending: true }),
        ])
        setMaintenance((maint ?? []) as MaintenanceRequest[])
        setDocuments((docs ?? []) as PropertyDocument[])
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
    paidThisMonth: 0,
    openMaintenance: openMaintenance.length,
  }

  const occupancyRate = stats.totalProperties > 0 ? (stats.occupiedProperties / stats.totalProperties) * 100 : 0
  const collectionRate = stats.totalMonthlyRent > 0 ? (stats.paidThisMonth / stats.totalMonthlyRent) * 100 : 0

  const metrics = [
    { label: 'Monthly Rent', value: gbp(stats.totalMonthlyRent) },
    { label: 'Properties', value: `${stats.totalProperties} total` },
    { label: 'Occupancy', value: percent(occupancyRate, 0) },
    { label: 'Open Tickets', value: String(stats.openMaintenance) },
    { label: 'Expiring Docs', value: String(documents.length) },
  ]

  function handleTabChange(newTab: string) {
    setSelectedProperty(null)
    setTab(newTab)
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
                <KPICard title="Monthly Rent" value={gbp(stats.totalMonthlyRent)} subtitle={`${stats.occupiedProperties} of ${stats.totalProperties} let`} />
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

            {/* Expiring certs */}
            {documents.length > 0 && (
              <div>
                <SectionHeader title="Expiring Certificates" />
                <div style={CARD}>
                  {documents.slice(0, 3).map((d, i) => (
                    <div key={d.id}>
                      <ExpiringDocRow doc={d} />
                      {i < Math.min(documents.length, 3) - 1 && <div style={DIVIDER} />}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
              <EmptyState icon={<IconDoc />} title="No expiring documents" subtitle="Certificates expiring within 60 days will appear here" />
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

function PropertyDetailPanel({ property, onBack, onMaintenanceSelect }: { property: Property; onBack: () => void; onMaintenanceSelect: (m: MaintenanceRequest) => void }) {
  const [tenancy, setTenancy] = useState<TenancyDetail | null | undefined>(undefined)
  const [requests, setRequests] = useState<MaintenanceRequest[]>([])
  const [propertyDocs, setPropertyDocs] = useState<PropertyDocument[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [tenancyRes, maintRes, docsRes] = await Promise.all([
          supabase.from('tenancies').select('id, monthly_rent, start_date, end_date, arrears_balance, tenant_id, profiles!tenant_id(full_name, email)').eq('property_id', property.id).eq('is_current', true).limit(1).maybeSingle(),
          supabase.from('maintenance_requests').select('id, title, description, priority, status, created_at, property_id, updated_at, resolved_at').eq('property_id', property.id).order('created_at', { ascending: false }).limit(10),
          supabase.from('documents').select('*').eq('property_id', property.id).order('expiry_date', { ascending: true }),
        ])
        if (tenancyRes.data) {
          const raw = tenancyRes.data as unknown as { id: string; monthly_rent: number | null; start_date: string | null; end_date: string | null; arrears_balance: number | null; tenant_id: string | null; profiles: { full_name: string | null; email: string } | null }
          setTenancy({ id: raw.id, monthly_rent: raw.monthly_rent, start_date: raw.start_date, end_date: raw.end_date, arrears_balance: raw.arrears_balance, tenant_id: raw.tenant_id, tenantName: raw.profiles?.full_name ?? null, tenantEmail: raw.profiles?.email ?? null })
        } else { setTenancy(null) }
        setRequests((maintRes.data ?? []) as MaintenanceRequest[])
        setPropertyDocs((docsRes.data ?? []) as PropertyDocument[])
      } catch (e) { console.error(e); setTenancy(null) }
      finally { setLoading(false) }
    }
    load()
  }, [property.id])

  const b = statusBadge(property.is_active ? 'let' : 'vacant')

  return (
    <div className="flex flex-col h-full overflow-auto" style={{ background: '#0d1b2e' }}>
      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 py-3"
        style={{ background: '#091422', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button type="button" onClick={onBack} className="w-8 h-8 flex items-center justify-center -ml-1 active:opacity-60">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#8899aa"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <p style={{ fontSize: 16, color: '#e8edf5', flex: 1, fontFamily: 'Georgia, serif' }} className="truncate">{property.address}</p>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 16 }}>
                  {tenancy.start_date && <DetailItem label="Start" value={tenancy.start_date} />}
                  {tenancy.end_date && <DetailItem label="End" value={tenancy.end_date} />}
                  {tenancy.monthly_rent != null && <DetailItem label="Monthly Rent" value={gbp(tenancy.monthly_rent)} />}
                  {tenancy.arrears_balance != null && tenancy.arrears_balance > 0 && (
                    <DetailItem label="Arrears" value={gbp(tenancy.arrears_balance)} valueColor="#f87171" />
                  )}
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
      </div>
    </div>
  )
}

// ── Maintenance Detail Sheet ──

function MaintenanceDetailSheet({ request, onClose }: { request: MaintenanceRequest; onClose: () => void }) {
  const [history, setHistory] = useState<StatusEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  useEffect(() => {
    supabase.from('maintenance_status_history').select('id, old_status, new_status, notes, created_at').eq('maintenance_request_id', request.id).order('created_at', { ascending: true })
      .then(({ data }) => { setHistory((data ?? []) as StatusEntry[]); setHistoryLoading(false) })
  }, [request.id])

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
            </div>
          </div>

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
                      {entry.created_at && <p style={{ fontSize: 10, color: '#8899aa', opacity: 0.6, marginTop: 3 }}>{entry.created_at.slice(0, 16).replace('T', ' ')}</p>}
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

import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { initials, gbp } from '../lib/utils'
import DashShell from '../components/DashShell'
import EmptyState from '../components/EmptyState'
import SettingsPage from './SettingsPage'
import { IconChart, IconPeople, IconHouse, IconGear, IconStaff, IconWrench } from '../components/icons'

const TABS = [
  { id: 'analytics',   label: 'Dashboard',   icon: <IconChart /> },
  { id: 'users',       label: 'Users',       icon: <IconPeople /> },
  { id: 'staff',       label: 'Staff',       icon: <IconStaff /> },
  { id: 'properties',  label: 'Properties',  icon: <IconHouse /> },
  { id: 'maintenance', label: 'Maintenance', icon: <IconWrench /> },
  { id: 'settings',    label: 'Settings',    icon: <IconGear /> },
]

// ── Types (unchanged) ──

interface MonthlySnapshot { month: string; date: string; rentCollected: number; rentExpected: number; maintenanceCost: number }
interface PropertyPerf { address: string; monthlyRent: number; netYield: number; trend: 'up' | 'flat' | 'down' }
type SignalCategory = 'rent' | 'voids' | 'maintenance' | 'compliance'
interface ImprovementSignal { id: string; category: SignalCategory; title: string; detail: string; potentialUplift?: number }
type AnalyticsPeriod = '3M' | '6M' | '12M'
interface UserRow { id: string; email: string; full_name: string | null; role: string; status: string | null }
type UserRoleFilter = 'all' | 'admin' | 'landlord' | 'tenant' | 'contractor'
interface StaffMember { id: string; full_name: string; email: string; role: 'admin' | 'master admin'; status: string | null }
type StaffRoleFilter = 'all' | 'admin' | 'master admin'
interface MaintenanceRow { id: string; title: string | null; description: string | null; priority: string | null; status: string | null; created_at: string | null; property_id: string | null }
type MaintenanceFilter = 'all' | 'open' | 'in_progress' | 'resolved'
interface AdminPropRow { id: string; address: string; postcode: string | null; property_type: string | null; bedrooms: number | null; monthly_rent: number | null; is_active: boolean; created_at: string; landlord_id: string; profiles: { full_name: string | null; email: string } | null }

// ── Theme ──

const CARD: React.CSSProperties = { background: '#112240', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }
const DIVIDER: React.CSSProperties = { height: 1, background: 'rgba(255,255,255,0.07)', margin: '0 16px' }

function badge(s: string | null, variant: 'status' | 'priority' | 'role' = 'status'): React.CSSProperties {
  if (variant === 'priority') {
    if (s === 'emergency' || s === 'high') return { background: 'rgba(248,113,113,0.15)', color: '#f87171' }
    if (s === 'medium') return { background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }
    return { background: 'rgba(74,222,128,0.12)', color: '#4ade80' }
  }
  if (variant === 'role') {
    if (s === 'admin' || s === 'master admin') return { background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }
    if (s === 'landlord') return { background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }
    if (s === 'contractor') return { background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }
    return { background: 'rgba(136,153,170,0.12)', color: '#8899aa' }
  }
  const v = (s ?? '').toLowerCase()
  if (v === 'resolved' || v === 'closed' || v === 'active') return { background: 'rgba(74,222,128,0.12)', color: '#4ade80' }
  if (v === 'open' || v === 'stale') return { background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }
  if (v === 'in_progress') return { background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }
  return { background: 'rgba(136,153,170,0.12)', color: '#8899aa' }
}

import type React from 'react'

export default function AdminDashboard() {
  const { user } = useAuth()
  const [tab, setTab] = useState('analytics')
  const userInitials = initials(user?.full_name, user?.email ?? '')

  const [snapshots, setSnapshots] = useState<MonthlySnapshot[]>([])
  const [properties, setProperties] = useState<PropertyPerf[]>([])
  const [propertyCount, setPropertyCount] = useState<number | null>(null)
  const [signals, setSignals] = useState<ImprovementSignal[]>([])
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>('6M')
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false)

  const [users, setUsers] = useState<UserRow[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userFilter, setUserFilter] = useState<UserRoleFilter>('all')
  const [userSearch, setUserSearch] = useState('')

  const [staff, setStaff] = useState<StaffMember[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffFilter, setStaffFilter] = useState<StaffRoleFilter>('all')
  const [staffSearch, setStaffSearch] = useState('')
  const [staffLoaded, setStaffLoaded] = useState(false)

  const [maintenanceItems, setMaintenanceItems] = useState<MaintenanceRow[]>([])
  const [maintenanceLoading, setMaintenanceLoading] = useState(false)
  const [maintenanceFilter, setMaintenanceFilter] = useState<MaintenanceFilter>('all')
  const [maintenanceLoaded, setMaintenanceLoaded] = useState(false)

  const [adminProps, setAdminProps] = useState<AdminPropRow[]>([])
  const [adminPropsLoading, setAdminPropsLoading] = useState(false)
  const [adminPropsLoaded, setAdminPropsLoaded] = useState(false)
  const [propSearch, setPropSearch] = useState('')

  useEffect(() => {
    if (tab === 'analytics' && !analyticsLoaded) loadAnalytics()
    if (tab === 'users' && users.length === 0) loadUsers()
    if (tab === 'staff' && !staffLoaded) loadStaff()
    if (tab === 'properties' && !adminPropsLoaded) loadAdminProps()
    if (tab === 'maintenance' && !maintenanceLoaded) loadMaintenance()
  }, [tab])

  async function loadAnalytics() {
    setAnalyticsLoading(true)
    try {
      const [incomeRes, collectionRes, rentsRes, countRes] = await Promise.all([
        supabase.from('analytics_monthly_income').select('year, month, total_rent, total_repairs, total_mgmt_fee').gte('year', 2024),
        supabase.from('Monthly Rent Analysis').select('month, expected_rent, actual_paid').gte('month', '2024-01'),
        supabase.from('Monthly Rents').select('Property, Rent, "Net Rent Yield"'),
        supabase.from('properties').select('id', { count: 'exact', head: true }),
      ])
      if (countRes.count != null) setPropertyCount(countRes.count)
      const collectionMap: Record<string, { expected: number; actual: number }> = {}
      for (const row of collectionRes.data ?? []) {
        const key = String(row.month).slice(0, 7)
        const existing = collectionMap[key] ?? { expected: 0, actual: 0 }
        collectionMap[key] = { expected: existing.expected + (row.expected_rent ?? 0), actual: existing.actual + (row.actual_paid ?? 0) }
      }
      const incomeRows = (incomeRes.data ?? []) as { year: number; month: number; total_rent: number; total_repairs: number; total_mgmt_fee: number }[]
      const snaps: MonthlySnapshot[] = incomeRows.map((row) => {
        const key = `${row.year}-${String(row.month).padStart(2, '0')}`
        const col = collectionMap[key]
        const date = new Date(row.year, row.month - 1, 1)
        return { month: date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }), date: key, rentCollected: col?.actual ?? row.total_rent, rentExpected: col?.expected ?? row.total_rent, maintenanceCost: (row.total_repairs ?? 0) + (row.total_mgmt_fee ?? 0) }
      }).sort((a, b) => a.date.localeCompare(b.date))
      setSnapshots(snaps)
      const rentsRows = (rentsRes.data ?? []) as { Property: string | null; Rent: number | null; 'Net Rent Yield': string | null }[]
      const props: PropertyPerf[] = rentsRows.filter((r) => r.Property && (r.Rent ?? 0) > 0).map((r) => {
        const yield_ = parseFloat((r['Net Rent Yield'] ?? '0').replace('%', '').trim()) || 0
        return { address: r.Property!, monthlyRent: r.Rent ?? 0, netYield: yield_, trend: (yield_ >= 6 ? 'up' : yield_ >= 4 ? 'flat' : 'down') as 'up' | 'flat' | 'down' }
      }).sort((a, b) => b.netYield - a.netYield)
      setProperties(props)
      setSignals(buildSignals(snaps, props))
      setAnalyticsLoaded(true)
    } finally { setAnalyticsLoading(false) }
  }

  function buildSignals(snaps: MonthlySnapshot[], props: PropertyPerf[]): ImprovementSignal[] {
    const result: ImprovementSignal[] = []
    const lowYield = props.filter((p) => p.netYield > 0 && p.netYield < 5)
    if (lowYield.length > 0) result.push({ id: 'rent', category: 'rent', title: 'Below-market rents detected', detail: `${lowYield.length} propert${lowYield.length === 1 ? 'y' : 'ies'} with net yield under 5%` })
    const last = snaps[snaps.length - 1]
    if (last && last.rentExpected > 0) {
      const rate = (last.rentCollected / last.rentExpected) * 100
      if (rate < 90) result.push({ id: 'voids', category: 'voids', title: `Low rent collection — ${last.month}`, detail: `Only ${rate.toFixed(0)}% of expected rent collected`, potentialUplift: last.rentExpected - last.rentCollected })
    }
    const expensive = snaps.filter((s) => s.maintenanceCost > 800)
    if (expensive.length > 0) result.push({ id: 'maintenance', category: 'maintenance', title: 'High cost months in period', detail: `${expensive.length} month${expensive.length === 1 ? '' : 's'} with costs over £800` })
    result.push({ id: 'compliance', category: 'compliance', title: 'Review gas & electrical certificates', detail: 'Confirm renewal dates to avoid compliance breach' })
    return result
  }

  async function loadUsers() {
    setUsersLoading(true)
    const { data } = await supabase.from('users').select('id, email, full_name, role, status').order('created_at', { ascending: false })
    setUsers((data ?? []) as UserRow[])
    setUsersLoading(false)
  }

  async function loadStaff() {
    setStaffLoading(true)
    const { data: userRows } = await supabase.from('users').select('id, email, full_name, role, status').in('role', ['admin', 'master admin']).order('full_name')
    const members: StaffMember[] = ((userRows ?? []) as UserRow[]).filter((u) => u.role === 'admin' || u.role === 'master admin').map((u) => ({ id: u.id, full_name: u.full_name ?? u.email, email: u.email, role: u.role as 'admin' | 'master admin', status: u.status }))
    setStaff(members); setStaffLoaded(true); setStaffLoading(false)
  }

  async function loadAdminProps() {
    setAdminPropsLoading(true)
    const { data } = await supabase.from('properties').select('id, address, postcode, property_type, bedrooms, monthly_rent, is_active, created_at, landlord_id, profiles(full_name, email)').order('created_at', { ascending: false })
    setAdminProps((data ?? []) as unknown as AdminPropRow[]); setAdminPropsLoaded(true); setAdminPropsLoading(false)
  }

  async function loadMaintenance() {
    setMaintenanceLoading(true)
    const { data } = await supabase.from('maintenance_requests').select('id, title, description, priority, status, created_at, property_id').order('created_at', { ascending: false })
    setMaintenanceItems((data ?? []) as MaintenanceRow[]); setMaintenanceLoaded(true); setMaintenanceLoading(false)
  }

  const filteredSnaps = (() => { const n = analyticsPeriod === '3M' ? 3 : analyticsPeriod === '6M' ? 6 : 12; return snapshots.slice(-n) })()
  const totalCollected = filteredSnaps.reduce((s, r) => s + r.rentCollected, 0)
  const totalExpected = filteredSnaps.reduce((s, r) => s + r.rentExpected, 0)
  const totalMaintenance = filteredSnaps.reduce((s, r) => s + r.maintenanceCost, 0)
  const netIncome = totalCollected - totalMaintenance
  const collectionRate = totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0
  const avgMonthly = filteredSnaps.length > 0 ? totalCollected / filteredSnaps.length : 0
  const rentGrowth = (() => { if (filteredSnaps.length < 2) return 0; const first = filteredSnaps[0].rentCollected; const last = filteredSnaps[filteredSnaps.length - 1].rentCollected; return first > 0 ? ((last - first) / first) * 100 : 0 })()

  const filteredUsers = users.filter((u) => {
    const matchRole = userFilter === 'all' || u.role === userFilter
    const q = userSearch.toLowerCase()
    return matchRole && (!q || (u.full_name ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  })
  const filteredStaff = staff.filter((m) => {
    const matchRole = staffFilter === 'all' || m.role === staffFilter
    const q = staffSearch.toLowerCase()
    return matchRole && (!q || m.full_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
  })
  const filteredMaintenance = maintenanceItems.filter((m) => maintenanceFilter === 'all' ? true : m.status === maintenanceFilter)
  const filteredAdminProps = adminProps.filter((p) => {
    if (!propSearch) return true
    const q = propSearch.toLowerCase()
    return p.address.toLowerCase().includes(q) || (p.postcode ?? '').toLowerCase().includes(q) || (p.profiles?.full_name ?? '').toLowerCase().includes(q) || (p.profiles?.email ?? '').toLowerCase().includes(q)
  })

  const metrics = [
    { label: 'Properties', value: propertyCount != null ? String(propertyCount) : '—' },
    { label: `Net Income (${analyticsPeriod})`, value: gbp(netIncome) },
    { label: 'Collection', value: `${collectionRate.toFixed(1)}%` },
    { label: 'Avg Monthly', value: gbp(avgMonthly) },
    { label: 'Rent Growth', value: `${rentGrowth >= 0 ? '+' : ''}${rentGrowth.toFixed(1)}%` },
  ]

  return (
    <DashShell tabs={TABS} active={tab} onChange={setTab} metrics={metrics} userInitials={userInitials}>

      {/* ── ANALYTICS ── */}
      {tab === 'analytics' && (
        <div className="px-4 py-5 flex flex-col gap-5">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa' }}>Portfolio Performance</p>
              <p style={{ fontSize: 22, fontWeight: 300, color: '#e8edf5', marginTop: 4, fontFamily: 'Georgia, serif' }}>Master Overview</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {propertyCount != null && (
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 20, fontWeight: 300, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>{propertyCount}</span>
                  <span style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8899aa', marginLeft: 4 }}>properties</span>
                </div>
              )}
              <button type="button" onClick={() => { setAnalyticsLoaded(false); loadAnalytics() }}
                style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.08)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
              </button>
            </div>
          </div>

          {analyticsLoading && snapshots.length === 0 ? (
            <div className="flex flex-col gap-3">{[...Array(4)].map((_, i) => <div key={i} style={{ ...CARD, height: 80, opacity: 0.4 }} className="animate-pulse" />)}</div>
          ) : (
            <>
              {/* Hero */}
              <div style={CARD}>
                <div style={{ padding: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                  <div>
                    <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 6 }}>Net Income ({analyticsPeriod})</p>
                    <p style={{ fontSize: 32, fontWeight: 300, color: '#e8edf5', lineHeight: 1, fontFamily: 'Georgia, serif' }}>{gbp(netIncome)}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill={rentGrowth >= 0 ? '#4ade80' : '#f87171'}>
                        <path d={rentGrowth >= 0 ? 'M7 14l5-5 5 5z' : 'M7 10l5 5 5-5z'} />
                      </svg>
                      <span style={{ fontSize: 11, color: rentGrowth >= 0 ? '#4ade80' : '#f87171' }}>{rentGrowth >= 0 ? '+' : ''}{rentGrowth.toFixed(1)}% rent growth</span>
                      <span style={{ fontSize: 11, color: '#8899aa' }}>· After maintenance & fees</span>
                    </div>
                  </div>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="rgba(255,255,255,0.06)"><path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/></svg>
                </div>
              </div>

              {/* KPI grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <DarkKPI title="Avg Monthly" value={gbp(avgMonthly)} />
                <DarkKPI title="Collection Rate" value={`${collectionRate.toFixed(1)}%`} accent={collectionRate >= 97 ? '#4ade80' : '#fbbf24'} />
                <DarkKPI title={`Maintenance (${analyticsPeriod})`} value={gbp(totalMaintenance)} accent="#fbbf24" />
                <DarkKPI title="Rent Growth" value={`${rentGrowth >= 0 ? '+' : ''}${rentGrowth.toFixed(1)}%`} accent={rentGrowth >= 0 ? '#4ade80' : '#f87171'} />
              </div>

              {/* Period picker */}
              <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                {(['3M', '6M', '12M'] as AnalyticsPeriod[]).map((p) => (
                  <button key={p} type="button" onClick={() => setAnalyticsPeriod(p)}
                    style={{ flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 500, background: analyticsPeriod === p ? '#e8edf5' : 'transparent', color: analyticsPeriod === p ? '#0d1b2e' : '#8899aa', transition: 'all 0.15s' }}>
                    {p}
                  </button>
                ))}
              </div>

              {/* Bar chart */}
              <div style={CARD}>
                <div style={{ padding: 16 }}>
                  <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 12 }}>Rent Income vs Expected</p>
                  {filteredSnaps.length > 0 ? (
                    <>
                      <BarChart snapshots={filteredSnaps} />
                      <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
                        <LegendDot color="#60a5fa" label="Collected" />
                        <LegendDot color="rgba(255,255,255,0.15)" label="Expected" />
                      </div>
                    </>
                  ) : <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center', padding: '32px 0' }}>No income data</p>}
                </div>
              </div>

              {/* Line chart */}
              <div style={CARD}>
                <div style={{ padding: 16 }}>
                  <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 12 }}>Collection Rate Trend</p>
                  {filteredSnaps.length > 0 ? <LineChart snapshots={filteredSnaps} /> : <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center', padding: '32px 0' }}>No data</p>}
                </div>
              </div>

              {/* Property league */}
              {properties.length > 0 && (
                <div>
                  <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 10 }}>Property League Table</p>
                  <div className="flex flex-col gap-2">
                    {properties.map((prop, i) => <PropertyLeagueRow key={prop.address} rank={i + 1} property={prop} />)}
                  </div>
                </div>
              )}

              {/* Signals */}
              {signals.length > 0 && (
                <div>
                  <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 10 }}>Improvement Signals</p>
                  <div className="flex flex-col gap-2">
                    {signals.map((sig) => <SignalCard key={sig.id} signal={sig} />)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── USERS ── */}
      {tab === 'users' && (
        <div className="flex flex-col">
          <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <input type="search" placeholder="Search by name or email…" value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
              style={{ width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#e8edf5', outline: 'none' }} />
          </div>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8, overflowX: 'auto' }}>
            {([
              { key: 'all', label: 'All', count: users.length },
              { key: 'admin', label: 'Admins', count: users.filter(u => u.role === 'admin' || u.role === 'master admin').length },
              { key: 'landlord', label: 'Landlords', count: users.filter(u => u.role === 'landlord').length },
              { key: 'tenant', label: 'Tenants', count: users.filter(u => u.role === 'tenant').length },
              { key: 'contractor', label: 'Maintenance', count: users.filter(u => u.role === 'contractor').length },
            ] as { key: UserRoleFilter; label: string; count: number }[]).map(({ key, label, count }) => (
              <button key={key} type="button" onClick={() => setUserFilter(key)}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors"
                style={{ background: userFilter === key ? '#e8edf5' : 'rgba(255,255,255,0.06)', color: userFilter === key ? '#0d1b2e' : '#8899aa', border: '1px solid rgba(255,255,255,0.08)' }}>
                {label}
                <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: userFilter === key ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.1)' }}>{count}</span>
              </button>
            ))}
          </div>
          <div className="px-4 py-4 flex flex-col gap-2">
            {usersLoading ? (
              [...Array(5)].map((_, i) => <div key={i} style={{ ...CARD, height: 64, opacity: 0.4 }} className="animate-pulse" />)
            ) : filteredUsers.length === 0 ? (
              <EmptyState icon={<IconPeople />} title="No users" subtitle="No users match this filter" />
            ) : (
              <div style={CARD}>
                {filteredUsers.map((u, i) => {
                  const rb = badge(u.role, 'role')
                  return (
                    <div key={u.id}>
                      <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontFamily: 'Georgia, serif', color: '#e8edf5' }}>
                          {initials(u.full_name, u.email)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }} className="truncate">{u.full_name ?? u.email}</p>
                          <p style={{ fontSize: 11, color: '#8899aa' }} className="truncate">{u.email}</p>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4, letterSpacing: '0.08em', textTransform: 'capitalize', flexShrink: 0, ...rb }}>
                          {u.role}
                        </span>
                      </div>
                      {i < filteredUsers.length - 1 && <div style={DIVIDER} />}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── STAFF ── */}
      {tab === 'staff' && (
        <div className="flex flex-col">
          <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <input type="search" placeholder="Search by name, email or role…" value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)}
              style={{ width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#e8edf5', outline: 'none' }} />
          </div>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8, overflowX: 'auto' }}>
            {([
              { key: 'all', label: 'All', count: staff.length },
              { key: 'admin', label: 'Admins', count: staff.filter(m => m.role === 'admin').length },
              { key: 'master admin', label: 'Master Admin', count: staff.filter(m => m.role === 'master admin').length },
            ] as { key: StaffRoleFilter; label: string; count: number }[]).map(({ key, label, count }) => (
              <button key={key} type="button" onClick={() => setStaffFilter(key)}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium"
                style={{ background: staffFilter === key ? '#e8edf5' : 'rgba(255,255,255,0.06)', color: staffFilter === key ? '#0d1b2e' : '#8899aa', border: '1px solid rgba(255,255,255,0.08)' }}>
                {label}
                <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: staffFilter === key ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.1)' }}>{count}</span>
              </button>
            ))}
          </div>
          <div className="px-4 py-4">
            {staffLoading ? (
              <div className="flex flex-col gap-2">{[...Array(4)].map((_, i) => <div key={i} style={{ ...CARD, height: 72, opacity: 0.4 }} className="animate-pulse" />)}</div>
            ) : filteredStaff.length === 0 ? (
              <EmptyState icon={<IconStaff />} title="No staff" subtitle="No staff match this filter" />
            ) : (
              <div style={CARD}>
                {filteredStaff.map((m, i) => {
                  const rb = badge(m.role, 'role')
                  return (
                    <div key={m.id}>
                      <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(167,139,250,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14, fontWeight: 600, color: '#a78bfa' }}>
                          {initials(m.full_name !== m.email ? m.full_name : null, m.email)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <p style={{ fontSize: 14, fontWeight: 500, color: '#e8edf5' }} className="truncate">{m.full_name}</p>
                            <span style={{ fontSize: 9, fontWeight: 500, padding: '2px 8px', borderRadius: 4, letterSpacing: '0.08em', textTransform: 'capitalize', flexShrink: 0, ...rb }}>
                              {m.role === 'master admin' ? 'Master Admin' : 'Admin'}
                            </span>
                          </div>
                          <p style={{ fontSize: 11, color: '#8899aa' }} className="truncate">{m.email}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: m.status === 'inactive' ? '#8899aa' : '#4ade80' }} />
                          <span style={{ fontSize: 10, color: m.status === 'inactive' ? '#8899aa' : '#4ade80' }}>
                            {m.status === 'inactive' ? 'Inactive' : 'Active'}
                          </span>
                        </div>
                      </div>
                      {i < filteredStaff.length - 1 && <div style={DIVIDER} />}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PROPERTIES ── */}
      {tab === 'properties' && (
        <div className="flex flex-col">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', gap: 10 }}>
            <input type="search" placeholder="Search address, postcode or landlord…" value={propSearch} onChange={(e) => setPropSearch(e.target.value)}
              style={{ flex: 1, background: '#0f1e35', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#e8edf5', outline: 'none' }} />
            <button type="button" onClick={() => { setAdminPropsLoaded(false); loadAdminProps() }}
              style={{ padding: '7px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            </button>
          </div>
          <div className="px-4 py-4 flex flex-col gap-3">
            {adminPropsLoading ? (
              [...Array(4)].map((_, i) => <div key={i} style={{ ...CARD, height: 96, opacity: 0.4 }} className="animate-pulse" />)
            ) : filteredAdminProps.length === 0 ? (
              <EmptyState icon={<IconHouse />} title={propSearch ? 'No results' : 'No properties'} subtitle={propSearch ? 'Try a different search term' : 'Properties will appear here once added'} />
            ) : (
              filteredAdminProps.map((p) => <AdminPropertyCard key={p.id} property={p} />)
            )}
          </div>
        </div>
      )}

      {/* ── MAINTENANCE ── */}
      {tab === 'maintenance' && (
        <div className="flex flex-col">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', flex: 1 }}>
              {([
                { key: 'all', label: 'All' },
                { key: 'open', label: 'Open' },
                { key: 'in_progress', label: 'In Progress' },
                { key: 'resolved', label: 'Resolved' },
              ] as { key: MaintenanceFilter; label: string }[]).map(({ key, label }) => (
                <button key={key} type="button" onClick={() => setMaintenanceFilter(key)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium"
                  style={{ background: maintenanceFilter === key ? '#e8edf5' : 'rgba(255,255,255,0.06)', color: maintenanceFilter === key ? '#0d1b2e' : '#8899aa', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => { setMaintenanceLoaded(false); loadMaintenance() }}
              style={{ padding: '7px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            </button>
          </div>
          <div className="px-4 py-4 flex flex-col gap-3">
            {maintenanceLoading ? (
              [...Array(5)].map((_, i) => <div key={i} style={{ ...CARD, height: 80, opacity: 0.4 }} className="animate-pulse" />)
            ) : filteredMaintenance.length === 0 ? (
              <EmptyState icon={<IconWrench />} title="No requests" subtitle="No maintenance requests match this filter" />
            ) : (
              filteredMaintenance.map((req) => <AdminMaintenanceCard key={req.id} request={req} />)
            )}
          </div>
        </div>
      )}

      {tab === 'settings' && <SettingsPage />}
    </DashShell>
  )
}

// ── Analytics sub-components ──

function DarkKPI({ title, value, accent = '#e8edf5' }: { title: string; value: string; accent?: string }) {
  return (
    <div style={CARD}>
      <div style={{ padding: '12px 14px' }}>
        <p style={{ fontSize: 20, fontWeight: 300, color: accent, lineHeight: 1, fontFamily: 'Georgia, serif' }}>{value}</p>
        <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginTop: 6 }}>{title}</p>
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 10, color: '#8899aa' }}>{label}</span>
    </div>
  )
}

function BarChart({ snapshots }: { snapshots: MonthlySnapshot[] }) {
  const maxVal = Math.max(...snapshots.flatMap((s) => [s.rentExpected, s.rentCollected]), 1)
  const W = 600; const H = 180; const PAD_L = 4; const PAD_R = 4; const PAD_T = 4; const PAD_B = 22
  const chartW = W - PAD_L - PAD_R; const chartH = H - PAD_T - PAD_B
  const groupW = chartW / snapshots.length; const barW = Math.min(groupW * 0.38, 30)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden>
      {snapshots.map((s, i) => {
        const cx = PAD_L + i * groupW + groupW / 2; const baseY = PAD_T + chartH
        const expH = Math.max((s.rentExpected / maxVal) * chartH, 2)
        const colH = Math.max((s.rentCollected / maxVal) * chartH, 2)
        return (
          <g key={i}>
            <rect x={cx - barW - 1} y={baseY - expH} width={barW} height={expH} fill="rgba(255,255,255,0.1)" rx={2} />
            <rect x={cx + 1} y={baseY - colH} width={barW} height={colH} fill="#60a5fa" rx={2} />
            <text x={cx} y={H - 4} textAnchor="middle" fontSize={9} fill="#8899aa">{s.month}</text>
          </g>
        )
      })}
    </svg>
  )
}

function LineChart({ snapshots }: { snapshots: MonthlySnapshot[] }) {
  const W = 600; const H = 150; const PAD_L = 4; const PAD_R = 52; const PAD_T = 8; const PAD_B = 20
  const chartW = W - PAD_L - PAD_R; const chartH = H - PAD_T - PAD_B
  const MIN_R = 85; const MAX_R = 102; const range = MAX_R - MIN_R
  const pts = snapshots.map((s, i) => {
    const rate = s.rentExpected > 0 ? (s.rentCollected / s.rentExpected) * 100 : 0
    const clamped = Math.min(Math.max(rate, MIN_R), MAX_R)
    const x = PAD_L + (snapshots.length === 1 ? chartW / 2 : (i / (snapshots.length - 1)) * chartW)
    const y = PAD_T + ((MAX_R - clamped) / range) * chartH
    return { x, y, month: s.month }
  })
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaPath = [`M ${pts[0].x.toFixed(1)} ${(PAD_T + chartH).toFixed(1)}`, ...pts.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`), `L ${pts[pts.length - 1].x.toFixed(1)} ${(PAD_T + chartH).toFixed(1)}`, 'Z'].join(' ')
  const targetY = PAD_T + ((MAX_R - 97) / range) * chartH
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden>
      <defs>
        <linearGradient id="lineAreaGradDark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#lineAreaGradDark)" />
      <line x1={PAD_L} y1={targetY.toFixed(1)} x2={(W - PAD_R + 4).toFixed(1)} y2={targetY.toFixed(1)} stroke="#fbbf24" strokeWidth={0.75} strokeDasharray="5 3" />
      <text x={W - PAD_R + 7} y={(targetY + 4).toFixed(1)} fontSize={9} fill="#fbbf24">97%</text>
      <path d={linePath} fill="none" stroke="#60a5fa" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => <text key={i} x={p.x.toFixed(1)} y={H - 3} textAnchor="middle" fontSize={9} fill="#8899aa">{p.month}</text>)}
    </svg>
  )
}

function PropertyLeagueRow({ rank, property }: { rank: number; property: PropertyPerf }) {
  const trendColor = property.trend === 'up' ? '#4ade80' : property.trend === 'flat' ? '#8899aa' : '#f87171'
  const trendPath = property.trend === 'up' ? 'M7 14l5-5 5 5z' : property.trend === 'down' ? 'M7 10l5 5 5-5z' : 'M5 12h14'
  return (
    <div style={{ ...CARD, padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: rank === 1 ? '#e8edf5' : 'rgba(255,255,255,0.06)', fontSize: 12, fontFamily: 'Georgia, serif', color: rank === 1 ? '#0d1b2e' : '#8899aa' }}>
        {rank}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, color: '#e8edf5', fontFamily: 'Georgia, serif' }} className="truncate">{property.address}</p>
        <div style={{ display: 'flex', gap: 10, marginTop: 3 }}>
          <span style={{ fontSize: 11, color: '#8899aa' }}>{gbp(property.monthlyRent)}/mo</span>
          <span style={{ fontSize: 11, color: '#8899aa' }}>Yield: {property.netYield.toFixed(1)}%</span>
        </div>
      </div>
      <svg width="12" height="12" viewBox="0 0 24 24" fill={trendColor}><path d={trendPath} /></svg>
    </div>
  )
}

const SIGNAL_META: Record<SignalCategory, { label: string; color: string; path: string }> = {
  rent:        { label: 'Rent Review',    color: '#4ade80', path: 'M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01z' },
  voids:       { label: 'Void Reduction', color: '#60a5fa', path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z' },
  maintenance: { label: 'Cost Control',   color: '#fbbf24', path: 'M15.5 2.1a6.5 6.5 0 0 0-6.22 8.5L3 17.1a2.1 2.1 0 1 0 3 3l6.3-6.3a6.5 6.5 0 1 0 3.2-11.7zm0 11a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z' },
  compliance:  { label: 'Compliance',     color: '#f87171', path: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z' },
}

function SignalCard({ signal }: { signal: ImprovementSignal }) {
  const meta = SIGNAL_META[signal.category]
  return (
    <div style={{ ...CARD, padding: 12, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${meta.color}15` }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill={meta.color}><path d={meta.path} /></svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: meta.color }}>{meta.label}</span>
          {signal.potentialUplift != null && <span style={{ fontSize: 12, color: '#4ade80', fontFamily: 'Georgia, serif' }}>+{gbp(signal.potentialUplift)}/mo</span>}
        </div>
        <p style={{ fontSize: 13, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>{signal.title}</p>
        <p style={{ fontSize: 11, color: '#8899aa', marginTop: 3 }}>{signal.detail}</p>
      </div>
    </div>
  )
}

function AdminMaintenanceCard({ request }: { request: MaintenanceRow }) {
  const sb = badge(request.status)
  const pb = badge(request.priority, 'priority')
  return (
    <div style={{ ...CARD, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: '#e8edf5', flex: 1 }}>{request.title ?? 'Untitled'}</p>
        <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4, flexShrink: 0, letterSpacing: '0.08em', textTransform: 'uppercase', ...sb }}>
          {(request.status ?? 'open').replace('_', ' ')}
        </span>
      </div>
      {request.description && <p style={{ fontSize: 11, color: '#8899aa', marginTop: 6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>{request.description}</p>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        {request.priority && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, ...pb, textTransform: 'capitalize' }}>
            {request.priority} priority
          </span>
        )}
        {request.created_at && <span style={{ fontSize: 10, color: '#8899aa', marginLeft: 'auto' }}>{request.created_at.slice(0, 10)}</span>}
      </div>
    </div>
  )
}

function AdminPropertyCard({ property }: { property: AdminPropRow }) {
  const landlordName = property.profiles?.full_name ?? property.profiles?.email ?? 'Unknown landlord'
  const ab = badge(property.is_active ? 'active' : 'inactive')
  return (
    <div style={{ ...CARD, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }} className="truncate">{property.address}</p>
          {property.postcode && <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>{property.postcode}</p>}
        </div>
        <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4, flexShrink: 0, letterSpacing: '0.08em', textTransform: 'uppercase', ...ab }}>
          {property.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '10px 0' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 11, color: '#8899aa' }}>
        {property.property_type && <span>{property.property_type.charAt(0).toUpperCase() + property.property_type.slice(1)}</span>}
        {property.bedrooms != null && <span>{property.bedrooms} bed</span>}
        {property.monthly_rent != null && <span style={{ marginLeft: 'auto', fontSize: 13, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>{gbp(property.monthly_rent)}/mo</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="#8899aa"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
        </div>
        <span style={{ fontSize: 11, color: '#8899aa' }} className="truncate">{landlordName}</span>
      </div>
    </div>
  )
}

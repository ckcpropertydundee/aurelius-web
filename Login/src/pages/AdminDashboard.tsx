import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { initials, gbp, fmtDate, fmtDateTime, docUrl, timeAgo } from '../lib/utils'
import DashShell from '../components/DashShell'
import EmptyState from '../components/EmptyState'
import SettingsPage from './SettingsPage'
import { IconChart, IconPeople, IconHouse, IconGear, IconStaff, IconWrench, IconSterling, IconActivity } from '../components/icons'

function buildTabs(pendingViewings: number) {
  return [
    { id: 'analytics',   label: 'Dashboard',   icon: <IconChart />,    badge: pendingViewings > 0 ? pendingViewings : undefined },
    { id: 'rent',        label: 'Rent',         icon: <IconSterling /> },
    { id: 'users',       label: 'Users',        icon: <IconPeople /> },
    { id: 'staff',       label: 'Staff',        icon: <IconStaff /> },
    { id: 'properties',  label: 'Properties',   icon: <IconHouse /> },
    { id: 'maintenance', label: 'Maintenance',  icon: <IconWrench /> },
    { id: 'auditlog',    label: 'Audit Log',    icon: <IconActivity /> },
    { id: 'settings',    label: 'Settings',     icon: <IconGear /> },
  ]
}

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
type MaintenanceFilter = 'all' | 'open' | 'in_progress' | 'resolved' | 'compliance' | 'viewings'
interface ViewingRequest { id: string; property_id: string | null; name: string; email: string; phone: string | null; preferred_date: string; preferred_time: string; message: string | null; status: string; created_at: string; properties: { address: string } | null }
interface ComplianceAlert { id: string; property_id: string; type: string; issue_date: string | null; expiry_date: string | null; document_url: string | null; notes: string | null; properties: { address: string } | null }
type PropStatus = 'tenanted' | 'notice' | 'viewings' | 'for_let'
interface AdminPropRow { id: string; address: string; postcode: string | null; property_type: string | null; bedrooms: number | null; monthly_rent: number | null; is_active: boolean; status: PropStatus | null; created_at: string; landlord_id: string; description: string | null; photo_urls: string[] | null; has_gas: boolean; is_listed: boolean; available_from: string | null; listing_headline: string | null; landlord_registration_number: string | null; epc_rating: string | null; pre_tenancy_check_completed: boolean; pre_tenancy_check_date: string | null; deposit_scheme: string | null; deposit_registered_date: string | null; deposit_amount: number | null; meter_certificate_url: string | null; profiles: { full_name: string | null; email: string } | null }
interface ComplianceItem { id: string; property_id: string; type: string; issue_date: string | null; expiry_date: string | null; status: string | null; document_url: string | null; notes: string | null }
interface PropertyTenancyInfo { id: string; tenant_id: string; tenant_name: string | null; tenant_email: string; start_date: string; end_date: string | null; monthly_rent: number | null; deposit_scheme: string | null; deposit_registered_date: string | null; last_rent_increase_date: string | null }
interface AuditEvent { id: string; ts: string; cat: 'maintenance' | 'payment' | 'tenancy' | 'compliance' | 'viewing'; title: string; detail?: string; ok?: boolean; documentUrl?: string }
interface PropertyKey { id: string; property_id: string; key_type: 'master' | 'tenant' | 'contractor'; holder_name: string | null; holder_role: string | null; checked_out_at: string | null; notes: string | null }
interface KeyEvent { id: string; property_id: string; key_type: string; action: 'checked_out' | 'returned'; person_name: string | null; notes: string | null; created_at: string }
type MeterType = 'gas' | 'electricity'
interface MeterReading { id: string; property_id: string; meter_type: MeterType; reading: number; reading_date: string; notes: string | null; created_at: string }
interface LandlordRegistration { id: string; landlord_id: string; registration_number: string; council_area: string | null; expiry_date: string | null }
interface AuditLogRow { id: string; action: string; entity_type: string | null; entity_id: string | null; metadata: Record<string, unknown> | null; created_at: string; user_id: string | null; user_role: string | null }
type JobStatus = 'pending' | 'in_progress' | 'done' | 'cancelled'
type JobPriority = 'critical' | 'high' | 'medium' | 'low'
type JobType = 'notice_received' | 'pre_checkout_inspection' | 'checkout_inspection' | 'deposit_assessment' | 'cleaning' | 'repairs' | 'photography' | 'relisting' | 'viewings_ongoing' | 'referencing' | 'tenant_onboarding' | 'maintenance' | 'custom'
interface PropertyJob { id: string; property_id: string; title: string; description: string | null; job_type: JobType; status: JobStatus; priority: JobPriority; due_date: string | null; assigned_to: string | null; notes: string | null; created_by: string | null; created_at: string; completed_at: string | null }

// ── Theme ──

const CARD: React.CSSProperties = { background: '#112240', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }

const JOB_PHASE: Record<JobType, number> = {
  notice_received: 1,
  pre_checkout_inspection: 2,
  checkout_inspection: 3,
  deposit_assessment: 3,
  cleaning: 4,
  repairs: 4,
  photography: 4,
  relisting: 5,
  viewings_ongoing: 6,
  referencing: 6,
  tenant_onboarding: 7,
  maintenance: 8,
  custom: 9,
}

const JOB_PHASE_LABEL: Record<number, string> = {
  1: 'Notice Period',
  2: 'Assessment',
  3: 'Checkout',
  4: 'Make Ready',
  5: 'To Market',
  6: 'Viewings & Referencing',
  7: 'New Tenancy',
  8: 'Maintenance',
  9: 'Other',
}

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
  const [tenantedCount, setTenantedCount] = useState<number | null>(null)
  const [monthlyRentRoll, setMonthlyRentRoll] = useState<number>(0)
  const [ytdGross, setYtdGross] = useState<number>(0)
  const [ytdNet, setYtdNet] = useState<number>(0)
  const [rentCollection, setRentCollection] = useState<{ tenancyId: string; propertyId: string; address: string; expected: number; collected: number; isPaid: boolean; isVacant: boolean; paymentId: string | null; dueDate: string | null; paymentMethod: string | null; paymentNotes: string | null }[]>([])
  const [markPaidItem, setMarkPaidItem] = useState<{ tenancyId: string; address: string; expected: number; paymentId: string | null; dueDate: string | null } | null>(null)
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
  const [selectedMaintenance, setSelectedMaintenance] = useState<MaintenanceRow | null>(null)
  const [viewingRequests, setViewingRequests] = useState<ViewingRequest[]>([])
  const [viewingRequestsLoading, setViewingRequestsLoading] = useState(false)
  const [complianceAlerts, setComplianceAlerts] = useState<ComplianceAlert[]>([])
  const [complianceAlertsLoading, setComplianceAlertsLoading] = useState(false)
  const [complianceAlertsLoaded, setComplianceAlertsLoaded] = useState(false)
  const [selectedComplianceAlert, setSelectedComplianceAlert] = useState<ComplianceAlert | null>(null)
  const [usersLoaded, setUsersLoaded] = useState(false)

  const [quickError, setQuickError] = useState<string | null>(null)

  const [adminProps, setAdminProps] = useState<AdminPropRow[]>([])
  const [adminPropsLoading, setAdminPropsLoading] = useState(false)
  const [adminPropsLoaded, setAdminPropsLoaded] = useState(false)
  const [propSearch, setPropSearch] = useState('')
  const [propSort, setPropSort] = useState<'newest' | 'oldest' | 'az' | 'za' | 'rent_high' | 'rent_low'>('newest')
  const [propStatusFilter, setPropStatusFilter] = useState<PropStatus | 'all' | 'listed'>('all')

  const [selectedProperty, setSelectedProperty] = useState<AdminPropRow | null>(null)
  const [complianceItems, setComplianceItems] = useState<ComplianceItem[]>([])
  const [complianceLoading, setComplianceLoading] = useState(false)
  const [showAddComplianceModal, setShowAddComplianceModal] = useState(false)
  const [editComplianceItem, setEditComplianceItem] = useState<ComplianceItem | null>(null)
  const [confirmDeleteComplianceId, setConfirmDeleteComplianceId] = useState<string | null>(null)
  const [prtDoc, setPrtDoc] = useState<{ id: string; label: string; url: string | null; uploaded_at: string } | null>(null)
  const [prtLoading, setPrtLoading] = useState(false)
  const [prtUploading, setPrtUploading] = useState(false)
  const [showAddPRTModal, setShowAddPRTModal] = useState(false)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [propertyTenancy, setPropertyTenancy] = useState<PropertyTenancyInfo | null>(null)
  const [propertyTenancies, setPropertyTenancies] = useState<PropertyTenancyInfo[]>([])
  const [propertyTenancyLoading, setPropertyTenancyLoading] = useState(false)
  const [showAddPropertyModal, setShowAddPropertyModal] = useState(false)
  const [linkTenantPropertyId, setLinkTenantPropertyId] = useState<string | null>(null)
  const [landlordUsers, setLandlordUsers] = useState<{ id: string; email: string; full_name: string | null }[]>([])
  const [tenantUsers, setTenantUsers] = useState<{ id: string; email: string; full_name: string | null }[]>([])

  const [showAddStaffModal, setShowAddStaffModal] = useState(false)
  const [nonStaffUsers, setNonStaffUsers] = useState<{ id: string; email: string; full_name: string | null; role: string }[]>([])
  const [editProperty, setEditProperty] = useState<AdminPropRow | null>(null)
  const [showTenantInfoPack, setShowTenantInfoPack] = useState(false)
  const [listingHeadline, setListingHeadline] = useState('')
  const [listingAvailableFrom, setListingAvailableFrom] = useState('')
  const [listingRegNumber, setListingRegNumber] = useState('')
  const [listingSaving, setListingSaving] = useState(false)
  const [listingError, setListingError] = useState<string | null>(null)
  const [landlordRegs, setLandlordRegs] = useState<LandlordRegistration[]>([])
  const [landlordRegsLoading, setLandlordRegsLoading] = useState(false)
  const [listingNewRegNumber, setListingNewRegNumber] = useState('')
  const [listingNewCouncilArea, setListingNewCouncilArea] = useState('')
  const [listingNewExpiry, setListingNewExpiry] = useState('')
  const [listingRegSaving, setListingRegSaving] = useState(false)
  const [showListingAddReg, setShowListingAddReg] = useState(false)


  const [preCheckSaving, setPreCheckSaving] = useState(false)
  const [smokeSaving, setSmokeSaving] = useState(false)
  const [deletePropertyId, setDeletePropertyId] = useState<string | null>(null)
  const [deletePropertyAddress, setDeletePropertyAddress] = useState('')
  const [deletingProperty, setDeletingProperty] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null)

  const [propertyKeys, setPropertyKeys] = useState<PropertyKey[]>([])
  const [keyEvents, setKeyEvents] = useState<KeyEvent[]>([])
  const [keysLoading, setKeysLoading] = useState(false)
  const [checkOutKeyType, setCheckOutKeyType] = useState<string | null>(null)
  const [checkOutName, setCheckOutName] = useState('')
  const [checkOutRole, setCheckOutRole] = useState('')
  const [checkOutNotes, setCheckOutNotes] = useState('')
  const [checkOutSaving, _setCheckOutSaving] = useState(false)
  const [returnConfirmKey, setReturnConfirmKey] = useState<string | null>(null)

  const [meterReadings, setMeterReadings] = useState<MeterReading[]>([])
  const [meterReadingsLoading, setMeterReadingsLoading] = useState(false)
  const [showAddMeterModal, setShowAddMeterModal] = useState(false)
  const [newMeterType, setNewMeterType] = useState<MeterType>('electricity')
  const [newMeterReading, setNewMeterReading] = useState('')
  const [newMeterDate, setNewMeterDate] = useState('')
  const [newMeterNotes, setNewMeterNotes] = useState('')
  const [meterSaving, setMeterSaving] = useState(false)
  const [meterCertUploading, setMeterCertUploading] = useState(false)

  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([])
  const [auditLogsLoading, setAuditLogsLoading] = useState(false)
  const [auditLogsLoaded, setAuditLogsLoaded] = useState(false)
  const [auditLogsPage, setAuditLogsPage] = useState(0)
  const [auditLogsHasMore, setAuditLogsHasMore] = useState(false)
  const [auditLogsActionFilter, setAuditLogsActionFilter] = useState('all')
  const [auditLogsRoleFilter, setAuditLogsRoleFilter] = useState('all')
  const [auditLogsExpandedId, setAuditLogsExpandedId] = useState<string | null>(null)

  const [propertyJobs, setPropertyJobs] = useState<PropertyJob[]>([])
  const [propertyJobsLoading, setPropertyJobsLoading] = useState(false)
  const [jobsStatusFilter, setJobsStatusFilter] = useState<'active' | 'done'>('active')
  const [showAddJobForm, setShowAddJobForm] = useState(false)
  const [newJobTemplate, setNewJobTemplate] = useState<JobType>('custom')
  const [newJobTitle, setNewJobTitle] = useState('')
  const [newJobDueDate, setNewJobDueDate] = useState('')
  const [newJobNotes, setNewJobNotes] = useState('')
  const [newJobSaving, setNewJobSaving] = useState(false)
  const [workflowMoveOutDate, setWorkflowMoveOutDate] = useState('')
  const [workflowStarting, setWorkflowStarting] = useState(false)

  useEffect(() => {
    // Load viewings immediately so the badge and notification card are ready on first render
    loadViewingRequests()

    const channel = supabase
      .channel('viewing_requests_inserts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'viewing_requests' }, (payload) => {
        setViewingRequests(prev => [...prev, payload.new as ViewingRequest])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    if ((tab === 'analytics' || tab === 'rent') && !analyticsLoaded) loadAnalytics()
    if (tab === 'users' && !usersLoaded) loadUsers()
    if (tab === 'staff' && !staffLoaded) loadStaff()
    if (tab === 'properties' && !adminPropsLoaded) loadAdminProps()
    if (tab === 'maintenance' && !maintenanceLoaded) loadMaintenance()
    if (tab === 'maintenance' && !complianceAlertsLoaded) loadComplianceAlerts()
    if (tab === 'auditlog' && !auditLogsLoaded) loadAuditLogs(0, true)
  }, [tab])

  useEffect(() => {
    if (tab === 'auditlog') loadAuditLogs(0, true)
  }, [auditLogsActionFilter, auditLogsRoleFilter])

  useEffect(() => {
    setListingHeadline(selectedProperty?.listing_headline ?? '')
    setListingAvailableFrom(selectedProperty?.available_from ?? '')
    setListingRegNumber(selectedProperty?.landlord_registration_number ?? '')
    setListingError(null)

  }, [selectedProperty?.id])

  useEffect(() => {
    if (!selectedProperty?.landlord_id) { setLandlordRegs([]); return }
    setLandlordRegsLoading(true)
    supabase
      .from('landlord_registrations')
      .select('id, landlord_id, registration_number, council_area, expiry_date')
      .eq('landlord_id', selectedProperty.landlord_id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setLandlordRegs((data ?? []) as LandlordRegistration[])
        setLandlordRegsLoading(false)
      })
  }, [selectedProperty?.id])

  useEffect(() => {
    if (!selectedProperty) { setComplianceItems([]); return }
    setComplianceLoading(true)
    supabase
      .from('compliance_items')
      .select('id, property_id, type, issue_date, expiry_date, status, document_url, notes')
      .eq('property_id', selectedProperty.id)
      .order('expiry_date', { ascending: true })
      .then(({ data }) => {
        setComplianceItems(data ?? [])
        setComplianceLoading(false)
      })
  }, [selectedProperty?.id])

  useEffect(() => {
    if (!selectedProperty) { setPrtDoc(null); return }
    setPrtLoading(true)
    supabase.from('documents')
      .select('id, label, url, uploaded_at')
      .eq('property_id', selectedProperty.id)
      .eq('type', 'tenancy_agreement')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { setPrtDoc(data ?? null); setPrtLoading(false) })
  }, [selectedProperty?.id])

  useEffect(() => {
    if (!selectedProperty) { setPropertyTenancy(null); return }
    loadPropertyTenancy(selectedProperty.id)
  }, [selectedProperty?.id])


  useEffect(() => {
    if (!selectedProperty) { setPropertyKeys([]); setKeyEvents([]); return }
    loadPropertyKeys(selectedProperty.id)
  }, [selectedProperty?.id])

  useEffect(() => {
    if (!selectedProperty) { setMeterReadings([]); return }
    loadMeterReadings(selectedProperty.id)
  }, [selectedProperty?.id])

  useEffect(() => {
    if (!selectedProperty) { setPropertyJobs([]); return }
    loadPropertyJobs(selectedProperty.id)
  }, [selectedProperty?.id])

  async function loadPropertyTenancy(propertyId: string) {
    setPropertyTenancyLoading(true)
    const { data } = await supabase
      .from('tenancies')
      .select('id, tenant_id, start_date, end_date, monthly_rent, deposit_scheme, deposit_registered_date, last_rent_increase_date, profiles(full_name, email)')
      .eq('property_id', propertyId)
      .eq('is_current', true)
      .order('start_date')
    const rows = (data ?? []) as unknown as Array<{ id: string; tenant_id: string; start_date: string; end_date: string | null; monthly_rent: number | null; deposit_scheme: string | null; deposit_registered_date: string | null; last_rent_increase_date: string | null; profiles: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null }>
    const mapped = rows.map(raw => {
      const prof = Array.isArray(raw.profiles) ? raw.profiles[0] ?? null : raw.profiles
      return { id: raw.id, tenant_id: raw.tenant_id, tenant_name: prof?.full_name ?? null, tenant_email: prof?.email ?? '', start_date: raw.start_date, end_date: raw.end_date, monthly_rent: raw.monthly_rent, deposit_scheme: raw.deposit_scheme, deposit_registered_date: raw.deposit_registered_date, last_rent_increase_date: raw.last_rent_increase_date }
    })
    setPropertyTenancies(mapped)
    setPropertyTenancy(mapped[0] ?? null)
    setPropertyTenancyLoading(false)
  }

  async function handleEndTenancy(tenancyId: string) {
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('tenancies').update({ is_current: false, end_date: today }).eq('id', tenancyId)
    if (selectedProperty) {
      await supabase.from('compliance_items')
        .update({ expiry_date: today })
        .eq('property_id', selectedProperty.id)
        .eq('type', 'Inventory')
        .is('expiry_date', null)
      setComplianceItems(prev => prev.map(c =>
        c.type === 'Inventory' && !c.expiry_date ? { ...c, expiry_date: today } : c
      ))
    }
    setPropertyTenancy(null)
  }

  async function handlePRTFileUpload(file: File) {
    if (!prtDoc) return
    setPrtUploading(true)
    const ext = file.name.split('.').pop() ?? 'pdf'
    const path = `prt/${prtDoc.id}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('compliance-docs').upload(path, file, { upsert: true })
    if (upErr) { setPrtUploading(false); return }
    const storagePath = `compliance-docs/${path}`
    await supabase.from('documents').update({ url: storagePath }).eq('id', prtDoc.id)
    setPrtDoc(prev => prev ? { ...prev, url: storagePath } : prev)
    setPrtUploading(false)
  }

  async function loadPropertyKeys(propertyId: string) {
    setKeysLoading(true)
    const [{ data: existing }, { data: events }] = await Promise.all([
      supabase.from('property_keys').select('*').eq('property_id', propertyId),
      supabase.from('key_events').select('*').eq('property_id', propertyId).order('created_at', { ascending: false }).limit(30),
    ])
    const existingKeys = (existing ?? []) as PropertyKey[]
    const keyTypes = ['master', 'tenant', 'contractor'] as const
    const missing = keyTypes.filter(t => !existingKeys.find(k => k.key_type === t))
    if (missing.length > 0) {
      const { data: inserted } = await supabase.from('property_keys')
        .insert(missing.map(key_type => ({ property_id: propertyId, key_type })))
        .select()
      existingKeys.push(...((inserted ?? []) as PropertyKey[]))
    }
    setPropertyKeys(keyTypes.map(t => existingKeys.find(k => k.key_type === t)!).filter(Boolean))
    setKeyEvents((events ?? []) as KeyEvent[])
    setKeysLoading(false)
  }

  function handleCheckOut() {
    if (!selectedProperty || !checkOutKeyType || !checkOutName.trim()) return
    const now = new Date().toISOString()
    const name = checkOutName.trim()
    const role = checkOutRole.trim() || null
    const notesVal = checkOutNotes.trim() || null
    const keyType = checkOutKeyType
    setPropertyKeys(prev => prev.map(k =>
      k.key_type === keyType ? { ...k, holder_name: name, holder_role: role, checked_out_at: now, notes: notesVal } : k
    ))
    setKeyEvents(prev => [{ id: crypto.randomUUID(), property_id: selectedProperty.id, key_type: keyType, action: 'checked_out', person_name: name, notes: notesVal, created_at: now }, ...prev])
    setCheckOutKeyType(null)
    setCheckOutName('')
    setCheckOutRole('')
    setCheckOutNotes('')
    supabase.from('property_keys')
      .update({ holder_name: name, holder_role: role, checked_out_at: now, notes: notesVal })
      .eq('property_id', selectedProperty.id).eq('key_type', keyType)
      .then(({ error }) => {
        if (!error) supabase.from('key_events').insert({ property_id: selectedProperty.id, key_type: keyType, action: 'checked_out', person_name: name, notes: notesVal })
        else console.error('Key checkout save failed:', error.message)
      })
  }

  function handleReturnKey(keyType: string) {
    if (!selectedProperty) return
    const key = propertyKeys.find(k => k.key_type === keyType)
    const now = new Date().toISOString()
    setPropertyKeys(prev => prev.map(k =>
      k.key_type === keyType ? { ...k, holder_name: null, holder_role: null, checked_out_at: null, notes: null } : k
    ))
    setKeyEvents(prev => [{ id: crypto.randomUUID(), property_id: selectedProperty.id, key_type: keyType, action: 'returned', person_name: key?.holder_name ?? null, notes: null, created_at: now }, ...prev])
    setReturnConfirmKey(null)
    supabase.from('property_keys')
      .update({ holder_name: null, holder_role: null, checked_out_at: null, notes: null })
      .eq('property_id', selectedProperty.id).eq('key_type', keyType)
      .then(({ error }) => {
        if (!error) supabase.from('key_events').insert({ property_id: selectedProperty.id, key_type: keyType, action: 'returned', person_name: key?.holder_name ?? null, notes: null })
        else console.error('Key return save failed:', error.message)
      })
  }

  async function loadMeterReadings(propertyId: string) {
    setMeterReadingsLoading(true)
    const { data } = await supabase
      .from('meter_readings')
      .select('*')
      .eq('property_id', propertyId)
      .order('reading_date', { ascending: false })
      .order('created_at', { ascending: false })
    setMeterReadings((data ?? []) as MeterReading[])
    setMeterReadingsLoading(false)
  }

  async function handleMeterCertUpload(file: File) {
    if (!selectedProperty) return
    setMeterCertUploading(true)
    const ext = file.name.split('.').pop() ?? 'pdf'
    const path = `${selectedProperty.id}/meter-cert-${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage.from('compliance-docs').upload(path, file, { upsert: true })
    if (!uploadErr) {
      const { data: { publicUrl } } = supabase.storage.from('compliance-docs').getPublicUrl(path)
      const { error: dbErr } = await supabase.from('properties').update({ meter_certificate_url: publicUrl }).eq('id', selectedProperty.id)
      if (!dbErr) {
        const updated = { ...selectedProperty, meter_certificate_url: publicUrl }
        setSelectedProperty(updated)
        setAdminProps(prev => prev.map(p => p.id === selectedProperty.id ? updated : p))
      }
    }
    setMeterCertUploading(false)
  }

  async function handleAddMeterReading() {
    if (!selectedProperty || !newMeterReading.trim()) return
    const val = parseFloat(newMeterReading)
    if (isNaN(val)) return
    setMeterSaving(true)
    const { error } = await supabase.from('meter_readings').insert({
      property_id: selectedProperty.id,
      meter_type: newMeterType,
      reading: val,
      reading_date: newMeterDate || new Date().toISOString().slice(0, 10),
      notes: newMeterNotes.trim() || null,
    })
    if (!error) {
      await loadMeterReadings(selectedProperty.id)
      setShowAddMeterModal(false)
      setNewMeterReading('')
      setNewMeterDate('')
      setNewMeterNotes('')
    }
    setMeterSaving(false)
  }

  useEffect(() => {
    if (!selectedProperty) { setAuditEvents([]); return }
    setAuditLoading(true)
    const propId = selectedProperty.id

    async function loadAudit() {
      type MaintRow = { id: string; title: string | null; created_at: string }
      type TenancyRow = { id: string; start_date: string; end_date: string | null; is_current: boolean; monthly_rent: number | null }
      type CompRow = { id: string; type: string; created_at: string; document_url: string | null }
      type HistRow = { id: string; maintenance_request_id: string; old_status: string | null; new_status: string | null; notes: string | null; created_at: string }
      type PayRow = { id: string; tenancy_id: string; amount: number; status: string | null; paid_at: string | null; created_at: string; failure_reason: string | null }
      type ViewRow = { id: string; name: string; preferred_date: string; preferred_time: string; status: string; created_at: string }

      const [maintRes, tenancyRes, compRes, viewRes] = await Promise.all([
        supabase.from('maintenance_requests').select('id, title, created_at').eq('property_id', propId).order('created_at', { ascending: false }),
        supabase.from('tenancies').select('id, start_date, end_date, is_current, monthly_rent').eq('property_id', propId).order('created_at', { ascending: false }),
        supabase.from('compliance_items').select('id, type, created_at, document_url').eq('property_id', propId).order('created_at', { ascending: false }),
        supabase.from('viewing_requests').select('id, name, preferred_date, preferred_time, status, created_at').eq('property_id', propId).order('created_at', { ascending: false }),
      ])

      const maints = (maintRes.data ?? []) as MaintRow[]
      const tenancies = (tenancyRes.data ?? []) as TenancyRow[]
      const compls = (compRes.data ?? []) as CompRow[]
      const viewings = (viewRes.data ?? []) as ViewRow[]
      const maintIds = maints.map(m => m.id)
      const tenancyIds = tenancies.map(t => t.id)

      const [histRes, payRes] = await Promise.all([
        maintIds.length > 0
          ? supabase.from('maintenance_status_history').select('id, maintenance_request_id, old_status, new_status, notes, created_at').in('maintenance_request_id', maintIds)
          : Promise.resolve({ data: [] as HistRow[] }),
        tenancyIds.length > 0
          ? supabase.from('rent_payments').select('id, tenancy_id, amount, status, paid_at, created_at, failure_reason').in('tenancy_id', tenancyIds).order('created_at', { ascending: false })
          : Promise.resolve({ data: [] as PayRow[] }),
      ])

      const history = (histRes.data ?? []) as HistRow[]
      const payments = (payRes.data ?? []) as PayRow[]
      const events: AuditEvent[] = []

      for (const m of maints) {
        events.push({ id: `m-${m.id}`, ts: m.created_at, cat: 'maintenance', title: 'Maintenance raised', detail: m.title ?? 'Untitled' })
        for (const h of history.filter(h => h.maintenance_request_id === m.id)) {
          const from = (h.old_status ?? '?').replace(/_/g, ' ')
          const to = (h.new_status ?? '?').replace(/_/g, ' ')
          events.push({ id: `h-${h.id}`, ts: h.created_at, cat: 'maintenance', title: `${m.title ?? 'Maintenance'}: ${from} → ${to}`, detail: h.notes ?? undefined })
        }
      }

      for (const t of tenancies) {
        events.push({ id: `ts-${t.id}`, ts: t.start_date, cat: 'tenancy', title: 'Tenancy started', detail: t.monthly_rent != null ? `£${Number(t.monthly_rent).toLocaleString()}/mo` : undefined })
        if (t.end_date && !t.is_current) {
          events.push({ id: `te-${t.id}`, ts: t.end_date, cat: 'tenancy', title: 'Tenancy ended' })
        }
        for (const p of payments.filter(p => p.tenancy_id === t.id)) {
          const succeeded = p.status === 'succeeded' || p.status === 'paid'
          events.push({
            id: `p-${p.id}`, ts: p.paid_at ?? p.created_at, cat: 'payment',
            title: succeeded ? 'Rent payment received' : `Rent payment ${p.status ?? 'pending'}`,
            detail: `£${Number(p.amount).toLocaleString()}${p.failure_reason ? ` — ${p.failure_reason}` : ''}`,
            ok: succeeded,
          })
        }
      }

      for (const c of compls) {
        events.push({ id: `c-${c.id}`, ts: c.created_at, cat: 'compliance', title: `${c.type} added`, documentUrl: c.document_url ?? undefined })
      }

      for (const v of viewings) {
        const dateStr = v.preferred_date ? fmtDate(v.preferred_date) : '—'
        const statusNote = v.status !== 'pending' ? ` (${v.status})` : ''
        events.push({ id: `v-${v.id}`, ts: v.created_at, cat: 'viewing', title: `Viewing requested${statusNote}`, detail: `${v.name} — ${dateStr}${v.preferred_time ? ` at ${v.preferred_time}` : ''}` })
      }

      events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      setAuditEvents(events)
      setAuditLoading(false)
    }

    loadAudit()
  }, [selectedProperty?.id])

  async function loadAnalytics() {
    setAnalyticsLoading(true)
    try {
      const cutoff = new Date()
      cutoff.setMonth(cutoff.getMonth() - 12)
      const cutoffStr = cutoff.toISOString().slice(0, 10)

      const now2 = new Date()
      const monthStart = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, '0')}-01`
      const monthEnd = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, '0')}-${String(new Date(now2.getFullYear(), now2.getMonth() + 1, 0).getDate()).padStart(2, '0')}`
      const ytdStart = `${now2.getFullYear()}-01-01`

      const [propsRes, tenanciesForCollRes, paymentsRes, allPaymentsRes, thisMonthPaysRes, maintRes] = await Promise.all([
        supabase.from('properties').select('id, address, monthly_rent, is_active, status, purchase_price'),
        supabase.from('tenancies').select('id, property_id, monthly_rent').eq('is_current', true),
        supabase.from('payments').select('amount, paid_date').not('paid_date', 'is', null).gte('paid_date', cutoffStr),
        supabase.from('payments').select('amount, due_date').gte('due_date', cutoffStr),
        supabase.from('payments').select('id, tenancy_id, amount, due_date, paid_date, status, payment_method, notes').gte('due_date', monthStart).lte('due_date', monthEnd),
        supabase.from('maintenance_requests').select('cost, created_at').not('cost', 'is', null).gte('created_at', cutoffStr),
      ])

      const allProps = (propsRes.data ?? []) as { id: string; address: string; monthly_rent: number | null; is_active: boolean; status: string | null; purchase_price: number | null }[]
      setPropertyCount(allProps.length)

      // Rent roll and tenanted count driven by property status (source of truth from the app)
      const activeProps = allProps.filter(p => p.status === 'tenanted')
      const rentRoll = activeProps.reduce((s, p) => s + Number(p.monthly_rent ?? 0), 0)
      setMonthlyRentRoll(rentRoll)
      setTenantedCount(activeProps.length)

      // YTD gross & net
      const ytdGrossVal = (paymentsRes.data ?? []).filter(p => String(p.paid_date) >= ytdStart).reduce((s, p) => s + Number(p.amount ?? 0), 0)
      const ytdMaint = (maintRes.data ?? []).filter(m => String(m.created_at) >= ytdStart).reduce((s, m) => s + Number(m.cost ?? 0), 0)
      setYtdGross(ytdGrossVal)
      setYtdNet(ytdGrossVal - ytdMaint)

      // Rent collection for current month — all properties
      const tenanciesForColl = (tenanciesForCollRes.data ?? []) as { id: string; property_id: string; monthly_rent: number | null }[]
      const thisMonthPays = (thisMonthPaysRes.data ?? []) as { id: string; tenancy_id: string; amount: number; due_date: string; paid_date: string | null; status: string | null; payment_method: string | null; notes: string | null }[]
      const tenancyByPropId: Record<string, { id: string; monthly_rent: number | null }> = {}
      for (const t of tenanciesForColl) tenancyByPropId[t.property_id] = t
      const collectionItems = [...allProps]
        .sort((a, b) => a.address.localeCompare(b.address))
        .map(prop => {
          const tenancy = tenancyByPropId[prop.id]
          const isTenanted = !!tenancy && prop.status === 'tenanted'
          if (!isTenanted) {
            return { tenancyId: tenancy?.id ?? '', propertyId: prop.id, address: prop.address, expected: Number(prop.monthly_rent ?? 0), collected: 0, isPaid: false, isVacant: true, paymentId: null, dueDate: null, paymentMethod: null, paymentNotes: null }
          }
          const payment = thisMonthPays.find(p => p.tenancy_id === tenancy.id)
          return {
            tenancyId: tenancy.id,
            propertyId: prop.id,
            address: prop.address,
            expected: Number(tenancy.monthly_rent ?? prop.monthly_rent ?? 0),
            collected: payment?.paid_date ? Number(payment.amount ?? 0) : 0,
            isPaid: !!(payment?.paid_date),
            isVacant: false,
            paymentId: payment?.id ?? null,
            dueDate: payment?.due_date ?? null,
            paymentMethod: payment?.payment_method ?? null,
            paymentNotes: payment?.notes ?? null,
          }
        })
      setRentCollection(collectionItems)

      // Actual payments received, grouped by month (by paid_date)
      const payByMonth: Record<string, number> = {}
      for (const pay of paymentsRes.data ?? []) {
        const key = String(pay.paid_date).slice(0, 7)
        payByMonth[key] = (payByMonth[key] ?? 0) + Number(pay.amount ?? 0)
      }

      // All payments due in period, grouped by due_date month (expected)
      const expectedByMonth: Record<string, number> = {}
      for (const pay of allPaymentsRes.data ?? []) {
        const key = String(pay.due_date).slice(0, 7)
        expectedByMonth[key] = (expectedByMonth[key] ?? 0) + Number(pay.amount ?? 0)
      }

      // Maintenance cost by month
      const maintByMonth: Record<string, number> = {}
      for (const m of maintRes.data ?? []) {
        const key = String(m.created_at).slice(0, 7)
        maintByMonth[key] = (maintByMonth[key] ?? 0) + Number(m.cost ?? 0)
      }

      // Build 12-month snapshots — expected = actual payment records due that month
      const snaps: MonthlySnapshot[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date()
        d.setDate(1)
        d.setMonth(d.getMonth() - i)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        snaps.push({
          month: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
          date: key,
          rentCollected: payByMonth[key] ?? 0,
          rentExpected: expectedByMonth[key] ?? 0,
          maintenanceCost: maintByMonth[key] ?? 0,
        })
      }
      setSnapshots(snaps)

      // League table ranked by asking rent, yield from purchase_price if available
      const league: PropertyPerf[] = allProps
        .filter(p => (p.monthly_rent ?? 0) > 0)
        .map(p => {
          const annual = Number(p.monthly_rent ?? 0) * 12
          const yld = p.purchase_price && Number(p.purchase_price) > 0 ? (annual / Number(p.purchase_price)) * 100 : 0
          return { address: p.address, monthlyRent: Number(p.monthly_rent ?? 0), netYield: yld, trend: (yld >= 6 ? 'up' : yld >= 4 && yld > 0 ? 'flat' : 'down') as 'up' | 'flat' | 'down' }
        })
        .sort((a, b) => b.monthlyRent - a.monthlyRent)
      setProperties(league)
      setSignals(buildSignals(snaps, league))
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
    setUsersLoaded(true)
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
    const { data } = await supabase.from('properties').select('id, address, postcode, property_type, bedrooms, monthly_rent, is_active, status, created_at, landlord_id, description, photo_urls, has_gas, is_listed, available_from, listing_headline, landlord_registration_number, epc_rating, pre_tenancy_check_completed, pre_tenancy_check_date, deposit_scheme, deposit_registered_date, deposit_amount, meter_certificate_url, profiles(full_name, email)').order('created_at', { ascending: false })
    setAdminProps((data ?? []) as unknown as AdminPropRow[]); setAdminPropsLoaded(true); setAdminPropsLoading(false)
  }

  async function loadMaintenance() {
    setMaintenanceLoading(true)
    const { data } = await supabase.from('maintenance_requests').select('id, title, description, priority, status, created_at, property_id').order('created_at', { ascending: false })
    setMaintenanceItems((data ?? []) as MaintenanceRow[]); setMaintenanceLoaded(true); setMaintenanceLoading(false)
  }

  async function loadViewingRequests() {
    setViewingRequestsLoading(true)
    const { data } = await supabase
      .from('viewing_requests')
      .select('id, property_id, name, email, phone, preferred_date, preferred_time, message, status, created_at, properties(address)')
      .order('preferred_date', { ascending: true })
    setViewingRequests((data ?? []) as unknown as ViewingRequest[])
    setViewingRequestsLoading(false)
  }

  async function updateViewingStatus(id: string, status: string) {
    const { error } = await supabase.from('viewing_requests').update({ status }).eq('id', id)
    if (!error) setViewingRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r))
  }

  async function deleteViewingRequest(id: string) {
    const { error } = await supabase.from('viewing_requests').delete().eq('id', id)
    if (!error) setViewingRequests(prev => prev.filter(r => r.id !== id))
  }

  async function loadPropertyJobs(propertyId: string) {
    setPropertyJobsLoading(true)
    const { data } = await supabase
      .from('property_jobs')
      .select('*')
      .eq('property_id', propertyId)
      .order('due_date', { ascending: true, nullsFirst: false })
    setPropertyJobs((data ?? []) as PropertyJob[])
    setPropertyJobsLoading(false)
  }

  async function addPropertyJob() {
    if (!selectedProperty || !newJobTitle.trim()) return
    setNewJobSaving(true)
    const { data, error } = await supabase
      .from('property_jobs')
      .insert({
        property_id: selectedProperty.id,
        title: newJobTitle.trim(),
        job_type: newJobTemplate,
        due_date: newJobDueDate || null,
        notes: newJobNotes.trim() || null,
        created_by: user?.id ?? null,
      })
      .select()
      .single()
    setNewJobSaving(false)
    if (!error && data) {
      setPropertyJobs(prev => {
        const next = [...prev, data as PropertyJob]
        return next.sort((a, b) => {
          if (!a.due_date && !b.due_date) return 0
          if (!a.due_date) return 1
          if (!b.due_date) return -1
          return a.due_date.localeCompare(b.due_date)
        })
      })
      setNewJobTitle(''); setNewJobDueDate(''); setNewJobNotes(''); setNewJobTemplate('custom')
      setShowAddJobForm(false)
    }
  }

  async function updateJobStatus(jobId: string, status: JobStatus) {
    const { error } = await supabase
      .from('property_jobs')
      .update({ status, completed_at: status === 'done' ? new Date().toISOString() : null })
      .eq('id', jobId)
    if (!error) setPropertyJobs(prev => prev.map(j => j.id === jobId ? { ...j, status, completed_at: status === 'done' ? new Date().toISOString() : null } : j))
  }

  async function deletePropertyJob(jobId: string) {
    await supabase.from('property_jobs').delete().eq('id', jobId)
    setPropertyJobs(prev => prev.filter(j => j.id !== jobId))
  }

  function jobUrgency(job: PropertyJob): { label: string; color: string; sortKey: number } {
    if (!job.due_date) return { label: 'No deadline', color: '#8899aa', sortKey: 999 }
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const due = new Date(job.due_date)
    const days = Math.round((due.getTime() - today.getTime()) / 86400000)
    if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: '#f87171', sortKey: days }
    if (days === 0) return { label: 'Due today', color: '#f87171', sortKey: 0 }
    if (days <= 7) return { label: `${days}d left`, color: '#fb923c', sortKey: days }
    if (days <= 14) return { label: `${days}d left`, color: '#fbbf24', sortKey: days }
    return { label: `${days}d left`, color: '#60a5fa', sortKey: days }
  }

  const JOB_TEMPLATES: { type: JobType; label: string; offsetDays?: number }[] = [
    { type: 'notice_received', label: 'Notice received' },
    { type: 'pre_checkout_inspection', label: 'Pre-checkout inspection' },
    { type: 'checkout_inspection', label: 'Checkout inspection' },
    { type: 'deposit_assessment', label: 'Deposit assessment' },
    { type: 'cleaning', label: 'Cleaning' },
    { type: 'repairs', label: 'Repairs' },
    { type: 'photography', label: 'Photography' },
    { type: 'relisting', label: 'Relist property' },
    { type: 'viewings_ongoing', label: 'Viewings ongoing' },
    { type: 'referencing', label: 'Referencing' },
    { type: 'tenant_onboarding', label: 'Tenant onboarding' },
    { type: 'maintenance', label: 'Maintenance task' },
    { type: 'custom', label: 'Custom task' },
  ]

  async function startWorkflow(condition: 'good_condition' | 'needs_work') {
    if (!selectedProperty) return
    setWorkflowStarting(true)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const moveOut = workflowMoveOutDate ? new Date(workflowMoveOutDate) : new Date(today)
    if (!workflowMoveOutDate) moveOut.setDate(moveOut.getDate() + 28)
    const d = (offset: number) => { const dt = new Date(moveOut); dt.setDate(dt.getDate() + offset); return dt.toISOString().slice(0, 10) }
    const moveOutStr = moveOut.toISOString().slice(0, 10)
    const todayStr = today.toISOString().slice(0, 10)
    const mk = (title: string, job_type: JobType, due_date: string, notes?: string) => ({
      property_id: selectedProperty.id, created_by: user?.id ?? null, title, job_type, due_date, notes: notes ?? null,
    })
    const jobs = condition === 'good_condition'
      ? [
          mk('Notice received', 'notice_received', todayStr, `Move-out date: ${moveOutStr}`),
          mk('Pre-checkout inspection', 'pre_checkout_inspection', d(-21), 'Assess condition and identify anything needing attention before tenant leaves'),
          mk('Photography', 'photography', d(-14), 'Property in good condition — photograph while tenant is still in residence'),
          mk('Relist property', 'relisting', d(-5), 'On market 5 days before tenant leaves — start booking viewings immediately'),
          mk('Viewings ongoing', 'viewings_ongoing', d(-5), 'Continue taking viewings even once a tenant is being referenced — only stop when landlord has chosen'),
          mk('Checkout inspection', 'checkout_inspection', moveOutStr, 'Walk through with tenant, document condition, agree any deductions'),
          mk('Deposit assessment', 'deposit_assessment', d(2), 'Confirm deductions or full return within statutory timeframe'),
          mk('Referencing', 'referencing', d(7), 'Background and credit check on preferred applicant — viewings continue in parallel'),
          mk('Tenant onboarding', 'tenant_onboarding', d(14), 'Sign PRT, collect deposit, issue keys'),
        ]
      : [
          mk('Notice received', 'notice_received', todayStr, `Move-out date: ${moveOutStr}`),
          mk('Pre-checkout inspection', 'pre_checkout_inspection', d(-21), 'Assess condition and scope cleaning and repair work needed'),
          mk('Checkout inspection', 'checkout_inspection', moveOutStr, 'Walk through with tenant, document condition, agree any deductions'),
          mk('Deposit assessment', 'deposit_assessment', d(2), 'Confirm deductions within statutory timeframe'),
          mk('Cleaning', 'cleaning', moveOutStr, 'Begin same day tenant moves out'),
          mk('Repairs', 'repairs', moveOutStr, 'Begin same day tenant moves out — run alongside cleaning'),
          mk('Photography', 'photography', d(3), 'Once cleaning and repairs are complete'),
          mk('Relist property', 'relisting', d(3), 'List as soon as property is ready — start getting viewings booked immediately'),
          mk('Viewings ongoing', 'viewings_ongoing', d(3), 'Continue taking viewings even once a tenant is being referenced — only stop when landlord has chosen'),
          mk('Referencing', 'referencing', d(10), 'Background and credit check on preferred applicant — viewings continue in parallel'),
          mk('Tenant onboarding', 'tenant_onboarding', d(17), 'Sign PRT, collect deposit, issue keys'),
        ]
    const { data } = await supabase.from('property_jobs').insert(jobs).select()
    if (data) setPropertyJobs(prev => [...prev, ...(data as PropertyJob[])])
    setWorkflowStarting(false)
  }

  async function loadAuditLogs(page: number, replace: boolean) {
    const PAGE_SIZE = 50
    setAuditLogsLoading(true)
    let q = supabase
      .from('audit_logs')
      .select('id, action, entity_type, entity_id, metadata, created_at, user_id, user_role')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (auditLogsActionFilter !== 'all') q = q.eq('action', auditLogsActionFilter)
    if (auditLogsRoleFilter !== 'all') q = q.eq('user_role', auditLogsRoleFilter)
    const { data } = await q
    const rows = (data ?? []) as AuditLogRow[]
    if (replace) setAuditLogs(rows)
    else setAuditLogs(prev => [...prev, ...rows])
    setAuditLogsHasMore(rows.length === PAGE_SIZE)
    setAuditLogsLoaded(true)
    setAuditLogsPage(page)
    setAuditLogsLoading(false)
  }

  async function loadComplianceAlerts() {
    setComplianceAlertsLoading(true)
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() + 3)
    const { data } = await supabase
      .from('compliance_items')
      .select('id, property_id, type, issue_date, expiry_date, document_url, notes, properties(address)')
      .lte('expiry_date', cutoff.toISOString().slice(0, 10))
      .order('expiry_date', { ascending: true })
    setComplianceAlerts((data ?? []) as unknown as ComplianceAlert[])
    setComplianceAlertsLoaded(true)
    setComplianceAlertsLoading(false)
  }

  async function loadLandlordUsers() {
    const { data } = await supabase.from('users').select('id, email, full_name').eq('role', 'landlord').order('full_name')
    setLandlordUsers((data ?? []) as { id: string; email: string; full_name: string | null }[])
  }

  async function loadTenantUsers() {
    const { data } = await supabase.from('users').select('id, email, full_name').eq('role', 'tenant').order('full_name')
    setTenantUsers((data ?? []) as { id: string; email: string; full_name: string | null }[])
  }

  function openAddPropertyModal() {
    setShowAddPropertyModal(true)
    if (landlordUsers.length === 0) loadLandlordUsers()
  }

  function openLinkTenantModal(propertyId: string) {
    setLinkTenantPropertyId(propertyId)
    if (tenantUsers.length === 0) loadTenantUsers()
  }

  function openEditPropertyModal(property: AdminPropRow) {
    setEditProperty(property)
    if (landlordUsers.length === 0) loadLandlordUsers()
  }

  async function loadNonStaffUsers() {
    const { data } = await supabase.from('users').select('id, email, full_name, role').not('role', 'in', '("admin","master admin")').order('full_name')
    setNonStaffUsers((data ?? []) as { id: string; email: string; full_name: string | null; role: string }[])
  }

  function openAddStaffModal() {
    setShowAddStaffModal(true)
    if (nonStaffUsers.length === 0) loadNonStaffUsers()
  }

  function confirmDeleteProperty(p: AdminPropRow) {
    setDeletePropertyId(p.id)
    setDeletePropertyAddress(p.address)
    setDeleteError(null)
    setEditProperty(null)
  }

  async function handleDeleteProperty() {
    if (!deletePropertyId) return
    setDeletingProperty(true)
    setDeleteError(null)
    const { error } = await supabase.from('properties').delete().eq('id', deletePropertyId)
    setDeletingProperty(false)
    if (error) { setDeleteError(error.message); return }
    setDeletePropertyId(null)
    setAdminPropsLoaded(false)
    loadAdminProps()
  }


  async function handleDeleteComplianceItem(id: string) {
    const { error } = await supabase.from('compliance_items').delete().eq('id', id)
    if (!error) {
      setComplianceItems(prev => prev.filter(c => c.id !== id))
      setConfirmDeleteComplianceId(null)
    }
  }

  async function handleListingToggle(newIsListed: boolean) {
    if (!selectedProperty) return
    if (newIsListed && !listingRegNumber.trim()) {
      setListingError('A landlord registration number is required before publishing this listing.')
      return
    }
    if (newIsListed) {
      const hasValidEpc = complianceItems.some(c =>
        c.type.toLowerCase().includes('epc') &&
        c.expiry_date != null && new Date(c.expiry_date) > new Date()
      )
      if (!hasValidEpc) {
        setListingError('A valid EPC (Energy Performance Certificate) must be on file before publishing. Add it in the Compliance section above.')
        return
      }
    }
    setListingSaving(true)
    setListingError(null)
    try {
      const updates: Partial<AdminPropRow> & { is_listed: boolean } = {
        is_listed: newIsListed,
        landlord_registration_number: listingRegNumber.trim() || null,
        listing_headline: listingHeadline.trim() || null,
        available_from: listingAvailableFrom || null,
      }
      const { error } = await supabase.from('properties').update(updates).eq('id', selectedProperty.id)
      if (error) throw error
      const updated = { ...selectedProperty, ...updates }
      setSelectedProperty(updated)
      setAdminProps(prev => prev.map(p => p.id === selectedProperty.id ? updated : p))
    } catch {
      setListingError('Failed to update listing. Please try again.')
    } finally {
      setListingSaving(false)
    }
  }

  async function quickToggleListing(p: AdminPropRow) {
    const newIsListed = !p.is_listed
    if (newIsListed && !p.landlord_registration_number?.trim()) {
      setSelectedProperty(p)
      return
    }
    const { error } = await supabase
      .from('properties')
      .update({ is_listed: newIsListed })
      .eq('id', p.id)
    if (error) {
      setQuickError('Could not update listing — ' + error.message)
      return
    }
    setAdminProps(prev => prev.map(prop => prop.id === p.id ? { ...prop, is_listed: newIsListed } : prop))
    if (selectedProperty?.id === p.id) setSelectedProperty(prev => prev ? { ...prev, is_listed: newIsListed } : prev)
  }

  async function handleListingSave() {
    if (!selectedProperty) return
    setListingSaving(true)
    setListingError(null)
    try {
      const updates = {
        listing_headline: listingHeadline.trim() || null,
        available_from: listingAvailableFrom || null,
        landlord_registration_number: listingRegNumber.trim() || null,
      }
      const { error } = await supabase.from('properties').update(updates).eq('id', selectedProperty.id)
      if (error) throw error
      const updated = { ...selectedProperty, ...updates }
      setSelectedProperty(updated)
      setAdminProps(prev => prev.map(p => p.id === selectedProperty.id ? updated : p))
    } catch {
      setListingError('Failed to save listing details. Please try again.')
    } finally {
      setListingSaving(false)
    }
  }


  async function handlePreTenancyCheck(completed: boolean) {
    if (!selectedProperty) return
    setPreCheckSaving(true)
    const updates = {
      pre_tenancy_check_completed: completed,
      pre_tenancy_check_date: completed ? new Date().toISOString().slice(0, 10) : null,
    }
    const { error } = await supabase.from('properties').update(updates).eq('id', selectedProperty.id)
    if (!error) {
      const updated = { ...selectedProperty, ...updates }
      setSelectedProperty(updated)
      setAdminProps(prev => prev.map(p => p.id === selectedProperty.id ? updated : p))
    }
    setPreCheckSaving(false)
  }

  async function handleListingAddReg() {
    if (!listingNewRegNumber.trim() || !selectedProperty) return
    setListingRegSaving(true)
    const { data, error } = await supabase
      .from('landlord_registrations')
      .insert({
        landlord_id: selectedProperty.landlord_id,
        registration_number: listingNewRegNumber.trim(),
        council_area: listingNewCouncilArea.trim() || null,
        expiry_date: listingNewExpiry || null,
      })
      .select('id, landlord_id, registration_number, council_area, expiry_date')
      .single()
    if (!error && data) {
      const newReg = data as LandlordRegistration
      setLandlordRegs(prev => [...prev, newReg])
      setListingRegNumber(newReg.registration_number)
      setListingNewRegNumber('')
      setListingNewCouncilArea('')
      setListingNewExpiry('')
      setShowListingAddReg(false)
    }
    setListingRegSaving(false)
  }

  async function handleSmokeMark(completed: boolean) {
    if (!selectedProperty) return
    setSmokeSaving(true)
    if (completed) {
      const { data } = await supabase
        .from('compliance_items')
        .insert({ property_id: selectedProperty.id, type: 'Smoke / Heat / CO Alarms', issue_date: new Date().toISOString().slice(0, 10), status: 'active' })
        .select('id, property_id, type, issue_date, expiry_date, status, document_url, notes')
        .single()
      if (data) setComplianceItems(prev => [...prev, data as ComplianceItem])
    } else {
      const match = complianceItems.find(c => c.type.toLowerCase().includes('smoke') || c.type.toLowerCase().replace(/[^a-z]/g, '').includes('smoke'))
      if (match) {
        await supabase.from('compliance_items').delete().eq('id', match.id)
        setComplianceItems(prev => prev.filter(c => c.id !== match.id))
      }
    }
    setSmokeSaving(false)
  }

  async function navigateToComplianceProperty(propertyId: string) {
    const cached = adminProps.find(p => p.id === propertyId)
    if (cached) { setSelectedProperty(cached); setTab('properties'); return }
    const { data } = await supabase
      .from('properties')
      .select('id, address, postcode, property_type, bedrooms, monthly_rent, is_active, status, created_at, landlord_id, description, photo_urls, has_gas, is_listed, available_from, listing_headline, landlord_registration_number, epc_rating, pre_tenancy_check_completed, pre_tenancy_check_date, profiles(full_name, email)')
      .eq('id', propertyId)
      .maybeSingle()
    if (data) { setSelectedProperty(data as unknown as AdminPropRow); setTab('properties') }
  }

  async function navigateToRentProperty(propertyId: string) {
    const cached = adminProps.find(p => p.id === propertyId)
    if (cached) { setSelectedProperty(cached); return }
    const { data } = await supabase
      .from('properties')
      .select('id, address, postcode, property_type, bedrooms, monthly_rent, is_active, status, created_at, landlord_id, description, photo_urls, has_gas, is_listed, available_from, listing_headline, landlord_registration_number, epc_rating, pre_tenancy_check_completed, pre_tenancy_check_date, profiles(full_name, email)')
      .eq('id', propertyId)
      .maybeSingle()
    if (data) setSelectedProperty(data as unknown as AdminPropRow)
  }

  const filteredSnaps = (() => { const n = analyticsPeriod === '3M' ? 3 : analyticsPeriod === '6M' ? 6 : 12; return snapshots.slice(-n) })()
  const totalCollected = filteredSnaps.reduce((s, r) => s + r.rentCollected, 0)
  const totalExpected = filteredSnaps.reduce((s, r) => s + r.rentExpected, 0)
  const totalMaintenance = filteredSnaps.reduce((s, r) => s + r.maintenanceCost, 0)
  const collectionRate = totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0

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
    if (propStatusFilter === 'listed') { if (!p.is_listed) return false }
    else if (propStatusFilter !== 'all' && (p.status ?? 'for_let') !== propStatusFilter) return false
    if (!propSearch) return true
    const q = propSearch.toLowerCase()
    return p.address.toLowerCase().includes(q) || (p.postcode ?? '').toLowerCase().includes(q) || (p.profiles?.full_name ?? '').toLowerCase().includes(q) || (p.profiles?.email ?? '').toLowerCase().includes(q)
  }).sort((a, b) => {
    if (propSort === 'oldest') return a.created_at.localeCompare(b.created_at)
    if (propSort === 'az') return a.address.localeCompare(b.address)
    if (propSort === 'za') return b.address.localeCompare(a.address)
    if (propSort === 'rent_high') return (b.monthly_rent ?? 0) - (a.monthly_rent ?? 0)
    if (propSort === 'rent_low') return (a.monthly_rent ?? 0) - (b.monthly_rent ?? 0)
    return b.created_at.localeCompare(a.created_at) // newest default
  })

  const occupancyRate = propertyCount != null && propertyCount > 0 && tenantedCount != null ? (tenantedCount / propertyCount) * 100 : null

  const metrics = [
    { label: 'Properties', value: propertyCount != null ? String(propertyCount) : '—' },
    { label: 'Tenanted', value: tenantedCount != null ? String(tenantedCount) : '—' },
    { label: 'Occupancy', value: occupancyRate != null ? `${occupancyRate.toFixed(0)}%` : '—' },
    { label: 'Rent Roll / mo', value: monthlyRentRoll > 0 ? gbp(monthlyRentRoll) : '—' },
    { label: `YTD ${new Date().getFullYear()}`, value: ytdGross > 0 ? gbp(ytdGross) : '—' },
    { label: 'Collection', value: totalExpected > 0 ? `${collectionRate.toFixed(1)}%` : '—' },
  ]

  function exportAuditPDF() {
    if (!selectedProperty || auditEvents.length === 0) return
    const now = new Date()
    const generated = fmtDateTime(now.toISOString())
    const CAT_LABEL: Record<string, string> = { maintenance: 'Maintenance', payment: 'Payment', tenancy: 'Tenancy', compliance: 'Compliance' }
    const CAT_COLOR: Record<string, string> = { maintenance: '#b45309', payment: '#15803d', tenancy: '#1d4ed8', compliance: '#7c3aed' }
    const sorted = [...auditEvents].reverse()
    const rows = sorted.map(evt => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;white-space:nowrap;color:#374151;font-size:13px">${fmtDateTime(evt.ts)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">
          <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${CAT_COLOR[evt.cat]}1a;color:${CAT_COLOR[evt.cat]}">${CAT_LABEL[evt.cat] ?? evt.cat}</span>
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827">${evt.title}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280">${evt.detail ?? '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12px">${evt.documentUrl ? `<a href="${docUrl(evt.documentUrl) ?? evt.documentUrl}" style="color:#2563eb">View PDF</a>` : '—'}</td>
      </tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Activity Report — ${selectedProperty.address}</title>
    <style>
      body { font-family: -apple-system, Arial, sans-serif; margin: 0; padding: 32px 40px; color: #111827; }
      h1 { font-size: 22px; margin: 0 0 4px; }
      .sub { font-size: 13px; color: #6b7280; margin: 0 0 24px; }
      table { width: 100%; border-collapse: collapse; }
      thead th { padding: 8px 10px; background: #f9fafb; border-bottom: 2px solid #e5e7eb; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; }
      @media print { a { color: #2563eb !important; } }
    </style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
      <div>
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#9ca3af;margin-bottom:6px">Aurelius Property Management</div>
        <h1>Activity Audit Report</h1>
        <p class="sub">${selectedProperty.address}</p>
      </div>
      <div style="text-align:right;font-size:12px;color:#6b7280">
        <div>Generated</div>
        <div style="font-weight:600;color:#111827">${generated}</div>
      </div>
    </div>
    <table>
      <thead><tr>
        <th>Date &amp; Time</th><th>Category</th><th>Event</th><th>Detail</th><th>Document</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af">
      ${sorted.length} event${sorted.length === 1 ? '' : 's'} · Report generated ${generated} · Aurelius Property Management
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
    <DashShell tabs={buildTabs(viewingRequests.filter(r => r.status === 'pending').length)} active={tab} onChange={setTab} metrics={metrics} userInitials={userInitials}>

      {quickError && (
        <div style={{ margin: '12px 16px 0', padding: '10px 14px', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#f87171' }}>{quickError}</span>
          <button type="button" onClick={() => setQuickError(null)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}

      {/* ── ANALYTICS ── */}
      {tab === 'analytics' && (
        <div className="px-4 py-5 flex flex-col gap-5">

          {/* ── Viewing requests notification card ── */}
          {viewingRequests.filter(r => r.status === 'pending').length > 0 && (
            <div style={{ background: '#0f2744', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(96,165,250,0.15)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#60a5fa', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#60a5fa', fontWeight: 600 }}>
                    Viewing Requests
                  </span>
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, background: 'rgba(96,165,250,0.15)', color: '#60a5fa', fontWeight: 700 }}>
                    {viewingRequests.filter(r => r.status === 'pending').length} pending
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setTab('maintenance')}
                  style={{ fontSize: 11, color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  View all →
                </button>
              </div>
              {viewingRequests.filter(r => r.status === 'pending').map((req, idx, arr) => (
                <div key={req.id}>
                  <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#e8edf5', margin: 0 }}>{req.name}</p>
                      <p style={{ fontSize: 11, color: '#8899aa', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {req.properties?.address ?? 'Unknown property'}
                      </p>
                      <p style={{ fontSize: 11, color: '#60a5fa', margin: '4px 0 0' }}>
                        {fmtDate(req.preferred_date)} · {req.preferred_time}
                      </p>
                      {req.message && (
                        <p style={{ fontSize: 11, color: '#8899aa', margin: '4px 0 0', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          "{req.message}"
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => updateViewingStatus(req.id, 'confirmed')}
                        style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(74,222,128,0.15)', color: '#4ade80', fontWeight: 600 }}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => updateViewingStatus(req.id, 'cancelled')}
                        style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(248,113,113,0.12)', color: '#f87171', fontWeight: 600 }}
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteViewingRequest(req.id)}
                        title="Delete"
                        style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: '#8899aa' }}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                  {idx < arr.length - 1 && <div style={{ height: 1, background: 'rgba(96,165,250,0.1)', margin: '0 16px' }} />}
                </div>
              ))}
            </div>
          )}

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
                    <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 6 }}>Rent Collected ({analyticsPeriod})</p>
                    <p style={{ fontSize: 32, fontWeight: 300, color: '#e8edf5', lineHeight: 1, fontFamily: 'Georgia, serif' }}>{gbp(totalCollected)}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: '#8899aa' }}>Rent roll: </span>
                      <span style={{ fontSize: 11, color: '#4ade80' }}>{gbp(monthlyRentRoll)}/mo</span>
                      <span style={{ fontSize: 11, color: '#8899aa' }}>· {tenantedCount ?? 0} tenanted</span>
                    </div>
                  </div>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="rgba(255,255,255,0.06)"><path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/></svg>
                </div>
              </div>

              {/* KPI grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <DarkKPI title="Monthly Rent Roll" value={monthlyRentRoll > 0 ? gbp(monthlyRentRoll) : '—'} accent="#4ade80" />
                <DarkKPI title="Occupancy" value={occupancyRate != null ? `${occupancyRate.toFixed(0)}%` : '—'} accent={occupancyRate != null && occupancyRate >= 80 ? '#4ade80' : '#fbbf24'} />
                <DarkKPI title={`YTD Gross ${new Date().getFullYear()}`} value={ytdGross > 0 ? gbp(ytdGross) : '—'} accent="#60a5fa" />
                <DarkKPI title={`YTD Net ${new Date().getFullYear()}`} value={ytdGross > 0 ? gbp(ytdNet) : '—'} accent={ytdNet >= 0 ? '#4ade80' : '#f87171'} />
                <DarkKPI title="Collection Rate" value={totalExpected > 0 ? `${collectionRate.toFixed(1)}%` : '—'} accent={collectionRate >= 90 ? '#4ade80' : '#fbbf24'} />
                <DarkKPI title={`Collected (${analyticsPeriod})`} value={gbp(totalCollected)} />
                <DarkKPI title={`Maintenance (${analyticsPeriod})`} value={gbp(totalMaintenance)} accent="#fbbf24" />
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

      {/* ── RENT COLLECTION ── */}
      {tab === 'rent' && !selectedProperty && (() => {
        const activeRows = rentCollection.filter(r => !r.isVacant)
        const totalExp = activeRows.reduce((s, r) => s + r.expected, 0)
        const totalColl = activeRows.reduce((s, r) => s + r.collected, 0)
        const outstanding = totalExp - totalColl
        const paidCount = activeRows.filter(r => r.isPaid).length
        const fraction = totalExp > 0 ? totalColl / totalExp : 0
        const monthName = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        const ringColor = fraction >= 1 ? '#4ade80' : fraction >= 0.75 ? '#fbbf24' : '#f87171'
        return (
          <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header */}
            <div>
              <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 4 }}>Rent Collection</p>
              <p style={{ fontSize: 22, fontFamily: 'Georgia, serif', color: '#e8edf5', fontWeight: 300 }}>{monthName}</p>
            </div>

            {/* Summary card */}
            <div style={{ ...CARD, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
                {/* Donut ring */}
                <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
                  <svg width="72" height="72" viewBox="0 0 72 72">
                    <circle cx="36" cy="36" r="28" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8"/>
                    <circle cx="36" cy="36" r="28" fill="none" stroke={ringColor} strokeWidth="8"
                      strokeDasharray={`${2 * Math.PI * 28 * fraction} ${2 * Math.PI * 28 * (1 - fraction)}`}
                      strokeDashoffset={2 * Math.PI * 28 * 0.25}
                      strokeLinecap="round"/>
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: ringColor, fontFamily: 'Georgia, serif' }}>{Math.round(fraction * 100)}%</span>
                    <span style={{ fontSize: 8, color: '#8899aa', letterSpacing: '0.05em' }}>paid</span>
                  </div>
                </div>
                {/* Totals */}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 28, fontWeight: 300, color: '#4ade80', fontFamily: 'Georgia, serif', lineHeight: 1 }}>{gbp(totalColl)}</p>
                  <p style={{ fontSize: 11, color: '#8899aa', marginTop: 4 }}>of {gbp(totalExp)} expected · {paidCount}/{activeRows.length} paid</p>
                  {outstanding > 0 && (
                    <p style={{ fontSize: 11, color: '#fbbf24', marginTop: 6 }}>{gbp(outstanding)} outstanding</p>
                  )}
                  {outstanding === 0 && rentCollection.length > 0 && (
                    <p style={{ fontSize: 11, color: '#4ade80', marginTop: 6 }}>All rents collected</p>
                  )}
                </div>
              </div>
              {/* Progress bar */}
              <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${fraction * 100}%`, background: ringColor, borderRadius: 3, transition: 'width 0.6s ease' }} />
              </div>
            </div>

            {/* Per-property breakdown */}
            <div>
              <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 10 }}>Per Property</p>
              {rentCollection.length === 0 ? (
                <div style={{ ...CARD, padding: 20, textAlign: 'center', color: '#8899aa', fontSize: 13 }}>No properties found</div>
              ) : (
                <div style={CARD}>
                  {rentCollection.map((row, i) => (
                    <div key={i}>
                      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: row.isVacant ? '#8899aa' : row.isPaid ? '#4ade80' : '#fbbf24', flexShrink: 0, marginTop: 2 }} />
                        <button type="button"
                          onClick={() => navigateToRentProperty(row.propertyId)}
                          style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                          <p style={{ fontSize: 13, color: '#e8edf5', fontFamily: 'Georgia, serif', textDecoration: 'none' }} className="truncate"
                            onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                            onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
                            {row.address}
                          </p>
                          <p style={{ fontSize: 10, color: '#8899aa', marginTop: 2 }}>
                            {row.isVacant
                              ? 'Vacant'
                              : row.isPaid
                                ? `Paid${row.paymentMethod ? ` · ${row.paymentMethod}` : ''}${row.paymentNotes ? ` · ${row.paymentNotes}` : ''}`
                                : 'Outstanding'}
                          </p>
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                          {row.isVacant ? (
                            <span style={{ fontSize: 10, color: '#8899aa', padding: '3px 8px', borderRadius: 4, background: 'rgba(136,153,170,0.1)', border: '1px solid rgba(136,153,170,0.2)' }}>Vacant</span>
                          ) : (
                            <>
                              <div style={{ textAlign: 'right' }}>
                                <p style={{ fontSize: 14, fontFamily: 'Georgia, serif', color: row.isPaid ? '#4ade80' : '#fbbf24' }}>
                                  {row.isPaid ? gbp(row.collected) : gbp(row.expected)}
                                </p>
                                {!row.isPaid && <p style={{ fontSize: 10, color: '#8899aa', marginTop: 2 }}>due</p>}
                              </div>
                              {!row.isPaid && (
                                <button type="button"
                                  onClick={() => setMarkPaidItem({ tenancyId: row.tenancyId, address: row.address, expected: row.expected, paymentId: row.paymentId, dueDate: row.dueDate })}
                                  style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ade80', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  Mark Paid
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      {i < rentCollection.length - 1 && <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '0 16px' }} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── MARK PAID MODAL ── */}
      {markPaidItem && (
        <MarkPaidModal
          tenancyId={markPaidItem.tenancyId}
          address={markPaidItem.address}
          expected={markPaidItem.expected}
          paymentId={markPaidItem.paymentId}
          dueDate={markPaidItem.dueDate}
          adminId={user?.id ?? ''}
          adminRole={user?.role ?? 'admin'}
          onClose={() => setMarkPaidItem(null)}
          onSaved={(tenancyId, paymentId, paymentMethod, notes) => {
            setRentCollection(prev => prev.map(r =>
              r.tenancyId === tenancyId
                ? { ...r, isPaid: true, collected: r.expected, paymentId, paymentMethod, paymentNotes: notes }
                : r
            ))
            setMarkPaidItem(null)
          }}
        />
      )}

      {/* ── USERS ── */}
      {tab === 'users' && selectedUser && (
        <UserDetailPanel
          user={selectedUser}
          onBack={() => setSelectedUser(null)}
          onViewProperty={(p) => { setSelectedProperty(p); setTab('properties') }}
          onStatusChange={(userId, status) => setUsers(prev => prev.map(u => u.id === userId ? { ...u, status } : u))}
          onDelete={(userId) => { setUsers(prev => prev.filter(u => u.id !== userId)); setSelectedUser(null) }}
        />
      )}
      {tab === 'users' && !selectedUser && (
        <div className="flex flex-col">
          <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="search" placeholder="Search by name or email…" value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
              style={{ flex: 1, background: '#0f1e35', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#e8edf5', outline: 'none' }} />
            <button type="button" onClick={() => { setUsersLoaded(false); loadUsers() }}
              style={{ flexShrink: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#8899aa', cursor: 'pointer' }}>
              Refresh
            </button>
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
            ) : (() => {
              const activeUsers = userFilter === 'all' ? filteredUsers.filter(u => u.status !== 'suspended') : filteredUsers
              const suspendedUsers = userFilter === 'all' ? filteredUsers.filter(u => u.status === 'suspended') : []

              const URow = ({ u, i, total }: { u: UserRow; i: number; total: number }) => {
                const rb = badge(u.role, 'role')
                const isSuspended = u.status === 'suspended'
                return (
                  <div key={u.id}>
                    <button type="button" onClick={() => setSelectedUser(u)}
                      style={{ width: '100%', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 'none', cursor: 'pointer', opacity: isSuspended ? 0.5 : 1, textAlign: 'left' }}>
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
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#8899aa" style={{ flexShrink: 0 }}><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
                    </button>
                    {i < total - 1 && <div style={DIVIDER} />}
                  </div>
                )
              }

              return (
                <>
                  {activeUsers.length > 0 && (
                    <div style={CARD}>
                      {activeUsers.map((u, i) => <URow key={u.id} u={u} i={i} total={activeUsers.length} />)}
                    </div>
                  )}
                  {suspendedUsers.length > 0 && (
                    <>
                      <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginTop: 8, marginBottom: 4, paddingLeft: 2 }}>
                        Suspended ({suspendedUsers.length})
                      </p>
                      <div style={CARD}>
                        {suspendedUsers.map((u, i) => <URow key={u.id} u={u} i={i} total={suspendedUsers.length} />)}
                      </div>
                    </>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── STAFF ── */}
      {tab === 'staff' && (
        <div className="flex flex-col">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <input type="search" placeholder="Search by name, email or role…" value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)}
              style={{ flex: 1, background: '#0f1e35', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#e8edf5', outline: 'none' }} />
            <button type="button" onClick={openAddStaffModal}
              style={{ padding: '7px 14px', borderRadius: 6, background: '#e8edf5', color: '#0d1b2e', border: 'none', fontSize: 12, fontWeight: 600, flexShrink: 0, letterSpacing: '0.04em' }}>
              + Add
            </button>
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
      {(tab === 'properties' || tab === 'rent') && selectedProperty && (
        <div className="flex flex-col">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <button type="button" onClick={() => { setSelectedProperty(null); setShowTenantInfoPack(false) }}
              style={{ padding: '5px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12, cursor: 'pointer' }}>
              ← Back
            </button>
            <span style={{ fontFamily: 'Georgia, serif', fontSize: 15, color: '#e8edf5' }}>{selectedProperty.address}</span>
            <button type="button" onClick={() => { if (landlordUsers.length === 0) loadLandlordUsers(); setEditProperty(selectedProperty); setSelectedProperty(null) }}
              style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12, cursor: 'pointer' }}>
              Edit
            </button>
          </div>
          {/* Photos */}
          {(selectedProperty.photo_urls?.length ?? 0) > 0 && (
            <div style={{ padding: '16px 16px 0' }}>
              <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 10 }}>Photos</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                {selectedProperty.photo_urls!.map((url, i) => (
                  <img key={i} src={url} alt={`Photo ${i + 1}`} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }} />
                ))}
              </div>
            </div>
          )}
          {/* Details */}
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['Status', (() => { const st = (selectedProperty.status ?? 'for_let') as PropStatus; const lbl = PROP_STATUS_LABEL[st] ?? st; return st === 'notice' && propertyTenancy?.end_date ? `${lbl} — vacating ${new Date(propertyTenancy.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : lbl })()],
              ['Type', selectedProperty.property_type ? selectedProperty.property_type.charAt(0).toUpperCase() + selectedProperty.property_type.slice(1) : '—'],
              ['Bedrooms', selectedProperty.bedrooms != null ? String(selectedProperty.bedrooms) : '—'],
              ['Rent PCM', selectedProperty.monthly_rent != null ? `£${selectedProperty.monthly_rent.toLocaleString()}` : '—'],
              ['Postcode', selectedProperty.postcode ?? '—'],
              ['Landlord', selectedProperty.profiles?.full_name ?? selectedProperty.profiles?.email ?? '—'],
            ].map(([label, val]) => (
              <div key={label} style={{ ...CARD, padding: '12px 14px' }}>
                <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 4 }}>{label}</p>
                <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>{val}</p>
              </div>
            ))}
          </div>
          {selectedProperty.description && (
            <div style={{ margin: '0 16px 8px', ...CARD, padding: '12px 14px' }}>
              <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 6 }}>Description</p>
              <p style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.6 }}>{selectedProperty.description}</p>
            </div>
          )}
          {/* Tenants */}
          <div style={{ margin: '8px 16px 0', ...CARD, padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa' }}>Tenants</p>
              {!propertyTenancyLoading && (
                <button type="button" onClick={() => openLinkTenantModal(selectedProperty.id)}
                  style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', cursor: 'pointer' }}>
                  + Add Tenant
                </button>
              )}
            </div>
            {propertyTenancyLoading ? (
              <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center', padding: '8px 0' }}>Loading…</p>
            ) : propertyTenancies.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {propertyTenancies.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>{t.tenant_name ?? t.tenant_email}</p>
                      <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>{t.tenant_email}</p>
                      <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>
                        From {fmtDate(t.start_date)}
                        {t.monthly_rent != null ? ` · £${t.monthly_rent.toLocaleString()}/mo` : ''}
                      </p>
                    </div>
                    <button type="button" onClick={() => handleEndTenancy(t.id)}
                      style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: 'rgba(248,113,113,0.08)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)', cursor: 'pointer', flexShrink: 0 }}>
                      End
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: '#8899aa' }}>No tenants assigned. Use "+ Add Tenant" to link a tenant to this property.</p>
            )}
          </div>

          {/* PRT Agreement — only shown when an active tenancy exists */}
          {(propertyTenancies.length > 0 || prtDoc) && (
          <div style={{ margin: '8px 16px 0', ...CARD, padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa' }}>PRT Agreement</p>
              <button type="button" onClick={() => setShowAddPRTModal(true)}
                style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', cursor: 'pointer' }}>
                + {prtDoc ? 'Replace' : 'Add'}
              </button>
            </div>
            {prtLoading ? (
              <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center', padding: '8px 0' }}>Loading…</p>
            ) : prtDoc ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(74,222,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#4ade80"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zm-3 6h4v1.5H9V15zm0-3h6v1.5H9V12zm0-3h2v1.5H9V9z"/></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>{prtDoc.label}</p>
                  <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>Registered {fmtDate(prtDoc.uploaded_at)}</p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {prtDoc.url && (
                    <a href={docUrl(prtDoc.url) ?? '#'} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: '#60a5fa', textDecoration: 'none', padding: '3px 10px', borderRadius: 5, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', whiteSpace: 'nowrap' }}>
                      View PDF
                    </a>
                  )}
                  <label style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', color: prtUploading ? '#8899aa' : '#e8edf5', border: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap', cursor: prtUploading ? 'default' : 'pointer' }}>
                    {prtUploading ? 'Uploading…' : prtDoc.url ? 'Replace PDF' : 'Upload PDF'}
                    <input type="file" accept="application/pdf" style={{ display: 'none' }} disabled={prtUploading}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handlePRTFileUpload(f) }} />
                  </label>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: '#f87171' }}>No PRT agreement registered. Use "+ Add" to record one.</p>
            )}
          </div>
          )}

          {/* Pre-tenancy Repairing Standard check */}
          <div style={{ margin: '8px 16px 0', ...CARD, padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 4 }}>Pre-Tenancy Repairing Standard Check</p>
                <p style={{ fontSize: 11, color: selectedProperty.pre_tenancy_check_completed ? '#4ade80' : '#f87171', lineHeight: 1.4 }}>
                  {selectedProperty.pre_tenancy_check_completed
                    ? `Completed${selectedProperty.pre_tenancy_check_date ? ` — ${fmtDate(selectedProperty.pre_tenancy_check_date)}` : ''}`
                    : 'Required by law before advertising or letting — landlord must confirm property meets the Repairing Standard.'}
                </p>
              </div>
              <button type="button" onClick={() => handlePreTenancyCheck(!selectedProperty.pre_tenancy_check_completed)} disabled={preCheckSaving}
                style={{ flexShrink: 0, marginLeft: 12, padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  background: selectedProperty.pre_tenancy_check_completed ? 'rgba(248,113,113,0.08)' : 'rgba(74,222,128,0.1)',
                  border: `1px solid ${selectedProperty.pre_tenancy_check_completed ? 'rgba(248,113,113,0.2)' : 'rgba(74,222,128,0.25)'}`,
                  color: selectedProperty.pre_tenancy_check_completed ? '#f87171' : '#4ade80' }}>
                {preCheckSaving ? '…' : selectedProperty.pre_tenancy_check_completed ? 'Mark Incomplete' : 'Mark Complete'}
              </button>
            </div>
          </div>

          {/* Required Certifications Checklist */}
          {!complianceLoading && (() => {
            const requiredCerts = [
              ...(selectedProperty.has_gas ? [{ key: 'gas', label: 'Gas Safety Certificate', hint: 'Annual — Gas Safe registered contractor', canMark: false }] : []),
              { key: 'eicr', label: 'EICR (Electrical)', hint: 'Every 5 years', canMark: false },
              { key: 'epc', label: 'EPC', hint: '10-year validity — required on all adverts', canMark: false },
              { key: 'legionella', label: 'Legionella Risk Assessment', hint: 'Legally required — duty of care', canMark: false },
              { key: 'smoke', label: 'Smoke / Heat / CO Alarms', hint: 'Confirmed via EICR or inspection', canMark: true },
            ]
            const now = new Date()
            const statuses = requiredCerts.map(cert => {
              const match = complianceItems.find(c => c.type.toLowerCase().includes(cert.key) || c.type.toLowerCase().replace(/[^a-z]/g, '').includes(cert.key.replace(/[^a-z]/g, '')))
              if (!match) return { ...cert, status: 'missing' as const, match: null }
              if (!match.expiry_date) return { ...cert, status: 'valid' as const, match }
              const expiry = new Date(match.expiry_date)
              const days = Math.ceil((expiry.getTime() - now.getTime()) / 86400000)
              if (days < 0) return { ...cert, status: 'expired' as const, days, match }
              if (days < 60) return { ...cert, status: 'expiring' as const, days, match }
              return { ...cert, status: 'valid' as const, match }
            })
            const issueStatuses = statuses.filter(s => s.status !== 'valid')
            const smokeStatus = statuses.find(s => s.key === 'smoke')!
            const hasIssues = issueStatuses.length > 0
            const onlySmokeMissing = issueStatuses.length === 1 && issueStatuses[0].key === 'smoke'
            if (!hasIssues && smokeStatus.status === 'valid') return null
            return (
              <div style={{ margin: '8px 16px 0', background: hasIssues && !onlySmokeMissing ? 'rgba(248,113,113,0.05)' : 'rgba(255,255,255,0.02)', border: `1px solid ${hasIssues && !onlySmokeMissing ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, padding: '14px' }}>
                <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: hasIssues && !onlySmokeMissing ? '#f87171' : '#8899aa', marginBottom: 10 }}>
                  Required Certifications{hasIssues && !onlySmokeMissing ? ' — Action Needed' : ' — Smoke / Heat Alarms'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {statuses.filter(s => s.status !== 'valid').map(cert => {
                    const color = cert.status === 'expired' ? '#f87171' : cert.status === 'expiring' ? '#fbbf24' : '#f87171'
                    const icon = cert.status === 'expired' ? '✗' : cert.status === 'expiring' ? '⚠' : '✗'
                    const label = cert.status === 'expired' ? 'Expired' : cert.status === 'expiring' ? `${(cert as { days?: number }).days}d` : 'Missing'
                    return (
                      <div key={cert.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, color, flexShrink: 0 }}>{icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 12, color: '#e8edf5' }}>{cert.label}</span>
                          <span style={{ fontSize: 10, color: '#8899aa', marginLeft: 6 }}>{cert.hint}</span>
                        </div>
                        {cert.canMark ? (
                          <button
                            type="button"
                            disabled={smokeSaving}
                            onClick={() => handleSmokeMark(true)}
                            style={{ fontSize: 10, fontWeight: 600, color: '#4ade80', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.25)', padding: '3px 10px', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}
                          >
                            {smokeSaving ? '…' : 'Mark Complete'}
                          </button>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 600, color, background: `${color}18`, padding: '2px 8px', borderRadius: 4, flexShrink: 0 }}>{label}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
                {(hasIssues && !onlySmokeMissing) && (
                  <p style={{ fontSize: 10, color: '#8899aa', marginTop: 10, lineHeight: 1.4 }}>Use "+ Add" in the Compliance Certificates section below to upload these documents.</p>
                )}
              </div>
            )
          })()}

          {/* Compliance */}
          <div style={{ margin: '8px 16px 0', ...CARD, padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa' }}>Compliance Certificates</p>
              <button type="button" onClick={() => setShowAddComplianceModal(true)}
                style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', cursor: 'pointer' }}>
                + Add
              </button>
            </div>
            {complianceLoading ? (
              <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center', padding: '16px 0' }}>Loading…</p>
            ) : complianceItems.length === 0 ? (
              <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center', padding: '16px 0' }}>No compliance records added yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Certificate', 'Document', 'Issued', 'Expires', 'Status', ''].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '0 8px 10px', fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', fontWeight: 400, borderBottom: '1px solid rgba(255,255,255,0.07)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {complianceItems.map((item, i) => {
                      const derivedExpiryIso = deriveExpiry(item.type, item.issue_date, item.expiry_date)
                      const expiry = derivedExpiryIso ? new Date(derivedExpiryIso) : null
                      const now = new Date()
                      const daysUntil = expiry ? Math.ceil((expiry.getTime() - now.getTime()) / 86400000) : null
                      const isTenancyActive = TENANCY_CERT_TYPES.has(item.type) && !derivedExpiryIso
                      const statusColor = isTenancyActive ? '#4ade80' : daysUntil == null ? '#8899aa' : daysUntil < 0 ? '#f87171' : daysUntil < 60 ? '#fbbf24' : '#4ade80'
                      const statusBg = isTenancyActive ? 'rgba(74,222,128,0.1)' : daysUntil == null ? 'rgba(136,153,170,0.1)' : daysUntil < 0 ? 'rgba(248,113,113,0.1)' : daysUntil < 60 ? 'rgba(251,191,36,0.1)' : 'rgba(74,222,128,0.1)'
                      const statusLabel = item.status ?? (isTenancyActive ? 'Active' : daysUntil == null ? '—' : daysUntil < 0 ? 'Expired' : daysUntil < 60 ? 'Due soon' : 'Valid')
                      return (
                        <tr key={item.id} style={{ borderBottom: i < complianceItems.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                          <td style={{ padding: '11px 8px', color: '#e8edf5' }}>{item.type}</td>
                          <td style={{ padding: '11px 8px' }}>
                            {item.document_url ? (
                              <a href={docUrl(item.document_url) ?? '#'} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 11, color: '#60a5fa', textDecoration: 'none', padding: '2px 8px', borderRadius: 4, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', whiteSpace: 'nowrap' }}>
                                View PDF
                              </a>
                            ) : (
                              <span style={{ fontSize: 11, color: '#8899aa' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '11px 8px', color: '#8899aa', whiteSpace: 'nowrap' }}>
                            {fmtDate(item.issue_date)}
                          </td>
                          <td style={{ padding: '11px 8px', color: '#8899aa', whiteSpace: 'nowrap' }}>
                            {isTenancyActive ? 'Per tenancy' : fmtDate(derivedExpiryIso)}
                          </td>
                          <td style={{ padding: '11px 8px' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: statusBg, color: statusColor, whiteSpace: 'nowrap' }}>
                              {statusLabel}
                            </span>
                          </td>
                          <td style={{ padding: '11px 8px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                              <button type="button" onClick={() => setEditComplianceItem(item)}
                                style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(96,165,250,0.08)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', cursor: 'pointer' }}>
                                Edit
                              </button>
                              {!item.document_url && (
                                confirmDeleteComplianceId === item.id ? (
                                  <>
                                    <button type="button" onClick={() => handleDeleteComplianceItem(item.id)}
                                      style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', cursor: 'pointer' }}>
                                      Delete
                                    </button>
                                    <button type="button" onClick={() => setConfirmDeleteComplianceId(null)}
                                      style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <button type="button" onClick={() => setConfirmDeleteComplianceId(item.id)}
                                    style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'transparent', color: '#8899aa', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>
                                    Remove
                                  </button>
                                )
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {/* ── Property Jobs ── */}
          <div style={{ margin: '8px 16px 0', ...CARD, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', margin: 0 }}>Jobs</p>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['active', 'done'] as const).map(f => (
                  <button key={f} type="button" onClick={() => setJobsStatusFilter(f)}
                    style={{ fontSize: 10, padding: '3px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: jobsStatusFilter === f ? '#e8edf5' : 'rgba(255,255,255,0.05)', color: jobsStatusFilter === f ? '#0d1b2e' : '#8899aa', cursor: 'pointer', textTransform: 'capitalize' }}>
                    {f === 'active' ? 'Active' : 'Done'}
                  </button>
                ))}
                <button type="button" onClick={() => { setShowAddJobForm(v => !v); setNewJobTitle(''); setNewJobDueDate(''); setNewJobNotes(''); setNewJobTemplate('custom') }}
                  style={{ fontSize: 10, padding: '3px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: showAddJobForm ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.05)', color: showAddJobForm ? '#f87171' : '#8899aa', cursor: 'pointer' }}>
                  {showAddJobForm ? 'Cancel' : '+ Add'}
                </button>
              </div>
            </div>

            {/* Add job form */}
            {showAddJobForm && (
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 14px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 6 }}>Template</p>
                  <select value={newJobTemplate}
                    onChange={e => {
                      const t = e.target.value as JobType
                      setNewJobTemplate(t)
                      const tpl = JOB_TEMPLATES.find(x => x.type === t)
                      if (tpl) {
                        setNewJobTitle(tpl.label)
                        if (tpl.offsetDays != null) {
                          const d = new Date(); d.setDate(d.getDate() + tpl.offsetDays)
                          setNewJobDueDate(d.toISOString().slice(0, 10))
                        } else {
                          setNewJobDueDate('')
                        }
                      }
                    }}
                    style={{ width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#e8edf5', outline: 'none' }}>
                    {JOB_TEMPLATES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 6 }}>Title</p>
                  <input value={newJobTitle} onChange={e => setNewJobTitle(e.target.value)} placeholder="Job title…"
                    style={{ width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#e8edf5', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 6 }}>Due date</p>
                  <input type="date" value={newJobDueDate} onChange={e => setNewJobDueDate(e.target.value)}
                    style={{ width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#e8edf5', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 6 }}>Notes</p>
                  <textarea value={newJobNotes} onChange={e => setNewJobNotes(e.target.value)} placeholder="Optional notes…" rows={2}
                    style={{ width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#e8edf5', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                </div>
                <button type="button" onClick={addPropertyJob} disabled={newJobSaving || !newJobTitle.trim()}
                  style={{ alignSelf: 'flex-end', padding: '8px 18px', borderRadius: 8, background: newJobTitle.trim() ? '#e8edf5' : 'rgba(255,255,255,0.06)', color: newJobTitle.trim() ? '#0d1b2e' : '#8899aa', border: 'none', fontSize: 12, fontWeight: 600, cursor: newJobTitle.trim() ? 'pointer' : 'default' }}>
                  {newJobSaving ? 'Adding…' : 'Add Job'}
                </button>
              </div>
            )}

            {/* Job list */}
            {propertyJobsLoading ? (
              <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center', padding: '12px 0' }}>Loading…</p>
            ) : (() => {
              const filtered = propertyJobs.filter(j =>
                jobsStatusFilter === 'done'
                  ? j.status === 'done' || j.status === 'cancelled'
                  : j.status === 'pending' || j.status === 'in_progress'
              )

              if (filtered.length === 0) {
                if (jobsStatusFilter === 'done') return (
                  <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center', padding: '8px 0' }}>No completed jobs</p>
                )
                // Quick-start workflow buttons
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <p style={{ fontSize: 11, color: '#8899aa', marginBottom: 8 }}>Set the tenant move-out date, then choose a turnaround track:</p>
                      <input type="date" value={workflowMoveOutDate} onChange={e => setWorkflowMoveOutDate(e.target.value)}
                        placeholder="Move-out date (defaults to today + 28)"
                        style={{ width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#e8edf5', outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
                    </div>
                    <button type="button" disabled={workflowStarting} onClick={() => startWorkflow('good_condition')}
                      style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10, padding: '14px 16px', textAlign: 'left', cursor: 'pointer' }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: '#4ade80', margin: '0 0 4px' }}>Property in good condition</p>
                      <p style={{ fontSize: 11, color: '#8899aa', margin: 0 }}>Photograph now · List 5 days before move-out · Viewings while referencing</p>
                    </button>
                    <button type="button" disabled={workflowStarting} onClick={() => startWorkflow('needs_work')}
                      style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)', borderRadius: 10, padding: '14px 16px', textAlign: 'left', cursor: 'pointer' }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: '#fbbf24', margin: '0 0 4px' }}>Needs cleaning & repairs</p>
                      <p style={{ fontSize: 11, color: '#8899aa', margin: 0 }}>Clean & repair same day tenant leaves · Photograph & list immediately after · Viewings while referencing</p>
                    </button>
                    {workflowStarting && <p style={{ fontSize: 11, color: '#8899aa', textAlign: 'center' }}>Creating jobs…</p>}
                  </div>
                )
              }

              // Group active jobs by phase, sort done jobs by completion date
              if (jobsStatusFilter === 'done') {
                const sorted = [...filtered].sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {sorted.map(job => (
                      <div key={job.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 10, color: '#4ade80' }}>✓</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 13, color: '#8899aa', textDecoration: 'line-through' }}>{job.title}</span>
                          {job.completed_at && <p style={{ fontSize: 10, color: '#8899aa', margin: '2px 0 0' }}>Completed {fmtDate(job.completed_at)}</p>}
                        </div>
                        <button type="button" onClick={() => updateJobStatus(job.id, 'pending')}
                          style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#8899aa', cursor: 'pointer' }}>
                          Reopen
                        </button>
                      </div>
                    ))}
                  </div>
                )
              }

              // Group by phase
              const phaseMap = new Map<number, PropertyJob[]>()
              for (const job of filtered) {
                const ph = JOB_PHASE[job.job_type as JobType] ?? 9
                if (!phaseMap.has(ph)) phaseMap.set(ph, [])
                phaseMap.get(ph)!.push(job)
              }
              const sortedPhases = [...phaseMap.entries()].sort(([a], [b]) => a - b)

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {sortedPhases.map(([phase, phaseJobs]) => {
                    const phaseSorted = [...phaseJobs].sort((a, b) => jobUrgency(a).sortKey - jobUrgency(b).sortKey)
                    const mostUrgent = phaseSorted[0]
                    const phaseUrg = jobUrgency(mostUrgent)
                    const allDone = phaseJobs.every(j => j.status === 'done' || j.status === 'cancelled')
                    const phaseColor = allDone ? '#4ade80' : phaseUrg.color
                    return (
                      <div key={phase}>
                        {/* Phase header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <div style={{ width: 3, height: 12, borderRadius: 2, background: phaseColor, flexShrink: 0 }} />
                          <span style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: phaseColor, fontWeight: 600 }}>
                            {JOB_PHASE_LABEL[phase] ?? 'Other'}
                          </span>
                          {!allDone && phaseUrg.label !== 'No deadline' && (
                            <span style={{ fontSize: 9, color: phaseColor, marginLeft: 'auto' }}>{phaseUrg.label}</span>
                          )}
                          {allDone && <span style={{ fontSize: 9, color: '#4ade80', marginLeft: 'auto' }}>Complete</span>}
                        </div>
                        {/* Jobs in phase */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 11 }}>
                          {phaseSorted.map(job => {
                            const urg = jobUrgency(job)
                            const isDone = job.status === 'done' || job.status === 'cancelled'
                            return (
                              <div key={job.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                <button type="button"
                                  onClick={() => updateJobStatus(job.id, isDone ? 'pending' : 'done')}
                                  style={{ marginTop: 2, width: 16, height: 16, borderRadius: 4, border: `2px solid ${isDone ? '#4ade80' : 'rgba(255,255,255,0.2)'}`, background: isDone ? 'rgba(74,222,128,0.2)' : 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {isDone && <span style={{ fontSize: 9, color: '#4ade80', lineHeight: 1 }}>✓</span>}
                                </button>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ fontSize: 13, color: isDone ? '#8899aa' : '#e8edf5', fontWeight: 500, textDecoration: isDone ? 'line-through' : 'none' }}>{job.title}</span>
                                  {job.notes && <p style={{ fontSize: 11, color: '#8899aa', marginTop: 3, lineHeight: 1.4 }}>{job.notes}</p>}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                                    {!isDone && job.due_date && <span style={{ fontSize: 10, fontWeight: 600, color: urg.color }}>{urg.label}</span>}
                                    {job.due_date && <span style={{ fontSize: 10, color: '#8899aa' }}>{fmtDate(job.due_date)}</span>}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, alignItems: 'flex-end' }}>
                                  {!isDone && (
                                    <button type="button"
                                      onClick={() => updateJobStatus(job.id, job.status === 'in_progress' ? 'pending' : 'in_progress')}
                                      style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.08)', background: job.status === 'in_progress' ? 'rgba(96,165,250,0.12)' : 'transparent', color: job.status === 'in_progress' ? '#60a5fa' : '#8899aa', cursor: 'pointer', letterSpacing: '0.05em' }}>
                                      {job.status === 'in_progress' ? 'In progress' : 'Pending'}
                                    </button>
                                  )}
                                  <button type="button" onClick={() => deletePropertyJob(job.id)}
                                    style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, border: '1px solid rgba(248,113,113,0.15)', background: 'transparent', color: 'rgba(248,113,113,0.5)', cursor: 'pointer' }}>
                                    Remove
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* Key Register */}
          <div style={{ margin: '8px 16px 0', ...CARD, padding: '16px' }}>
            <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 14 }}>Key Register</p>
            {keysLoading ? (
              <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center', padding: '12px 0' }}>Loading…</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {propertyKeys.map((k) => {
                  const isOut = !!k.holder_name
                  const label = k.key_type === 'master' ? 'Master Key' : k.key_type === 'tenant' ? 'Tenant Key' : 'Contractor Key'
                  const isReturning = returnConfirmKey === k.key_type
                  return (
                    <div key={k.key_type} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 8, background: isOut ? 'rgba(251,191,36,0.12)' : 'rgba(74,222,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill={isOut ? '#fbbf24' : '#4ade80'}><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>{label}</p>
                          {isOut ? (
                            <p style={{ fontSize: 11, color: '#8899aa', marginTop: 1 }}>
                              {k.holder_name}{k.holder_role ? ` · ${k.holder_role}` : ''}{k.checked_out_at ? ` · ${timeAgo(k.checked_out_at)}` : ''}
                            </p>
                          ) : (
                            <p style={{ fontSize: 11, color: '#4ade80', marginTop: 1 }}>In office</p>
                          )}
                        </div>
                        {isOut ? (
                          isReturning ? (
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                              <button type="button" onClick={() => handleReturnKey(k.key_type)}
                                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', cursor: 'pointer', fontWeight: 500 }}>
                                Confirm
                              </button>
                              <button type="button" onClick={() => setReturnConfirmKey(null)}
                                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => setReturnConfirmKey(k.key_type)}
                              style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', flexShrink: 0 }}>
                              Return
                            </button>
                          )
                        ) : (
                          <button type="button" onClick={() => { setCheckOutKeyType(k.key_type); setCheckOutName(''); setCheckOutRole(''); setCheckOutNotes('') }}
                            style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: '#e8edf5', color: '#0d1b2e', border: 'none', cursor: 'pointer', flexShrink: 0, fontWeight: 500 }}>
                            Check Out
                          </button>
                        )}
                      </div>
                      {isOut && k.notes && (
                        <p style={{ fontSize: 11, color: '#8899aa', marginTop: 8, paddingLeft: 44 }}>{k.notes}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {keyEvents.length > 0 && (
              <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 10 }}>Movement Log</p>
                {keyEvents.slice(0, 10).map((evt) => {
                  const keyLabel = evt.key_type === 'master' ? 'Master' : evt.key_type === 'tenant' ? 'Tenant' : 'Contractor'
                  const isOut = evt.action === 'checked_out'
                  return (
                    <div key={evt.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, paddingBottom: 10 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: isOut ? '#fbbf24' : '#4ade80', marginTop: 5, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, color: '#e8edf5', lineHeight: 1.4 }}>
                          {keyLabel} key {isOut ? `checked out${evt.person_name ? ` to ${evt.person_name}` : ''}` : `returned${evt.person_name ? ` by ${evt.person_name}` : ''}`}
                        </p>
                        {evt.notes && <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>{evt.notes}</p>}
                      </div>
                      <span style={{ fontSize: 10, color: '#8899aa', flexShrink: 0, whiteSpace: 'nowrap' }}>{fmtDateTime(evt.created_at)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Metre Readings */}
          <div style={{ margin: '8px 16px 0', ...CARD, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa' }}>Metre Readings</p>
              <div style={{ display: 'flex', gap: 6 }}>
                {selectedProperty.meter_certificate_url && (
                  <a href={docUrl(selectedProperty.meter_certificate_url) ?? selectedProperty.meter_certificate_url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)', cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    View Certificate
                  </a>
                )}
                <label style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: 'rgba(96,165,250,0.1)', color: meterCertUploading ? '#8899aa' : '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', cursor: meterCertUploading ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
                  {meterCertUploading ? 'Uploading…' : selectedProperty.meter_certificate_url ? 'Replace Certificate' : '+ Certificate'}
                  <input type="file" accept="application/pdf,image/*" style={{ display: 'none' }} disabled={meterCertUploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleMeterCertUpload(f); e.target.value = '' }} />
                </label>
                <button type="button" onClick={() => { setNewMeterType('electricity'); setNewMeterReading(''); setNewMeterDate(''); setNewMeterNotes(''); setShowAddMeterModal(true) }}
                  style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', cursor: 'pointer' }}>
                  + Reading
                </button>
              </div>
            </div>
            {meterReadingsLoading ? (
              <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center', padding: '12px 0' }}>Loading…</p>
            ) : (() => {
              const ALL_METERS: { type: MeterType; label: string; unit: string; icon: React.ReactNode }[] = [
                { type: 'electricity', label: 'Electricity', unit: 'kWh', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="#fbbf24"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg> },
                { type: 'gas',         label: 'Gas',         unit: 'm³',  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="#60a5fa"><path d="M13.5 0.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg> },
              ]
              const METERS = selectedProperty.has_gas ? ALL_METERS : ALL_METERS.filter(m => m.type !== 'gas')
              return (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: meterReadings.length > 0 ? 16 : 0 }}>
                    {METERS.map(({ type, label, unit, icon }) => {
                      const latest = meterReadings.find(r => r.meter_type === type)
                      return (
                        <div key={type} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 10px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>{icon}</div>
                          <p style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 4 }}>{label}</p>
                          {latest ? (
                            <>
                              <p style={{ fontSize: 16, color: '#e8edf5', fontFamily: 'Georgia, serif', fontWeight: 300, lineHeight: 1 }}>
                                {Number(latest.reading).toLocaleString('en-GB')}
                              </p>
                              <p style={{ fontSize: 9, color: '#8899aa', marginTop: 2 }}>{unit}</p>
                              <p style={{ fontSize: 10, color: '#8899aa', marginTop: 4 }}>{fmtDate(latest.reading_date)}</p>
                            </>
                          ) : (
                            <p style={{ fontSize: 11, color: '#8899aa', marginTop: 4 }}>—</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {meterReadings.length > 0 && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                      <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 10 }}>Reading History</p>
                      {meterReadings.slice(0, 12).map((r) => {
                        const meta = r.meter_type === 'electricity' ? { label: 'Electricity', unit: 'kWh', color: '#fbbf24' }
                          : r.meter_type === 'gas' ? { label: 'Gas', unit: 'm³', color: '#60a5fa' }
                          : { label: 'Water', unit: 'm³', color: '#4ade80' }
                        return (
                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 12, color: '#e8edf5' }}>
                                {meta.label} — {Number(r.reading).toLocaleString('en-GB')} {meta.unit}
                              </p>
                              {r.notes && <p style={{ fontSize: 11, color: '#8899aa', marginTop: 1 }}>{r.notes}</p>}
                            </div>
                            <span style={{ fontSize: 10, color: '#8899aa', flexShrink: 0, whiteSpace: 'nowrap' }}>{fmtDate(r.reading_date)}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {meterReadings.length === 0 && (
                    <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center', padding: '8px 0' }}>No readings recorded yet.</p>
                  )}
                </>
              )
            })()}
          </div>

          {/* Tenancy Docs */}
          <div style={{ margin: '8px 16px 0', ...CARD, padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa' }}>Tenancy Documents</p>
              <button type="button" onClick={() => setShowAddComplianceModal(true)}
                style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', cursor: 'pointer' }}>
                + Add
              </button>
            </div>
            {[
              {
                label: 'Private Residential Tenancy Agreement',
                action: prtDoc?.url
                  ? () => window.open(docUrl(prtDoc.url!) ?? prtDoc.url!, '_blank')
                  : null,
                note: !prtDoc ? 'Not uploaded' : !prtDoc.url ? 'No PDF attached' : null,
              },
              {
                label: 'Tenant Information Pack',
                action: () => setShowTenantInfoPack(true),
                note: null,
              },
              { label: 'Deposit Protection Certificate', action: null, note: 'Managed externally' },
              { label: 'How to Rent Guide', action: null, note: 'Managed externally' },
            ].map(({ label, action, note }, i, arr) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div>
                  <span style={{ fontSize: 13, color: '#e8edf5' }}>{label}</span>
                  {note && <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>{note}</p>}
                </div>
                {action ? (
                  <button type="button" onClick={action}
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', cursor: 'pointer', flexShrink: 0 }}>
                    View
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: '#8899aa' }}>—</span>
                )}
              </div>
            ))}
          </div>

          {/* Tenant Information Pack overlay */}
          {showTenantInfoPack && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: '#0a192f', display: 'flex', flexDirection: 'column' }}>
              {/* Header */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <button type="button" onClick={() => setShowTenantInfoPack(false)}
                  style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8899aa', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 600, color: '#e8edf5', fontFamily: 'Georgia, serif', margin: 0 }}>Tenant Information Pack</h2>
                  <p style={{ fontSize: 12, color: '#8899aa', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedProperty.address}</p>
                </div>
              </div>

              {/* Scrollable body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Property summary */}
                <div style={{ ...CARD, padding: 14 }}>
                  <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 10 }}>Property</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      ['Address', selectedProperty.address],
                      ['Postcode', selectedProperty.postcode ?? '—'],
                      ['Type', selectedProperty.property_type ? selectedProperty.property_type.charAt(0).toUpperCase() + selectedProperty.property_type.slice(1) : '—'],
                      ['Bedrooms', selectedProperty.bedrooms != null ? String(selectedProperty.bedrooms) : '—'],
                      ['Monthly Rent', selectedProperty.monthly_rent != null ? `£${Number(selectedProperty.monthly_rent).toLocaleString()}` : '—'],
                      ['Status', PROP_STATUS_LABEL[(selectedProperty.status ?? 'for_let') as PropStatus] ?? (selectedProperty.status ?? 'for_let')],
                    ].map(([l, v]) => (
                      <div key={l}>
                        <p style={{ fontSize: 10, color: '#8899aa', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>{l}</p>
                        <p style={{ fontSize: 13, color: '#e8edf5' }}>{v}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tenancy details */}
                <div style={{ ...CARD, padding: 14 }}>
                  <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 10 }}>Tenancy</p>
                  {propertyTenancies.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {propertyTenancies.map((t, i) => (
                        <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, ...(i > 0 ? { paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' } : {}) }}>
                          {[
                            ['Tenant', t.tenant_name ?? t.tenant_email],
                            ['Email', t.tenant_email],
                            ['Start Date', fmtDate(t.start_date)],
                            ['End Date', t.end_date ? fmtDate(t.end_date) : 'Open-ended'],
                            ['Monthly Rent', t.monthly_rent != null ? `£${Number(t.monthly_rent).toLocaleString()}` : '—'],
                          ].map(([l, v]) => (
                            <div key={l}>
                              <p style={{ fontSize: 10, color: '#8899aa', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>{l}</p>
                              <p style={{ fontSize: 13, color: '#e8edf5' }}>{v}</p>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: 13, color: '#8899aa' }}>No active tenancy on this property.</p>
                  )}
                </div>

                {/* PRT Agreement */}
                <div style={{ ...CARD, padding: 14 }}>
                  <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 10 }}>Private Residential Tenancy Agreement</p>
                  {prtDoc ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(74,222,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="#4ade80"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zm-3 6h4v1.5H9V15zm0-3h6v1.5H9V12zm0-3h2v1.5H9V9z"/></svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>{prtDoc.label}</p>
                        <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>Registered {fmtDate(prtDoc.uploaded_at)}</p>
                      </div>
                      {prtDoc.url && (
                        <a href={docUrl(prtDoc.url) ?? '#'} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: '#60a5fa', textDecoration: 'none', padding: '5px 12px', borderRadius: 6, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', flexShrink: 0 }}>
                          View PDF
                        </a>
                      )}
                    </div>
                  ) : (
                    <p style={{ fontSize: 13, color: '#f87171' }}>No PRT agreement registered for this property.</p>
                  )}
                </div>

                {/* Compliance Documents */}
                <div style={{ ...CARD, padding: 14 }}>
                  <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 10 }}>Compliance Certificates</p>
                  {complianceItems.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#8899aa' }}>No compliance certificates recorded for this property.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {complianceItems.map((item) => {
                        const expiry = item.expiry_date ? new Date(item.expiry_date) : null
                        const daysUntil = expiry ? Math.ceil((expiry.getTime() - Date.now()) / 86400000) : null
                        const isExpired = daysUntil != null && daysUntil < 0
                        const isUrgent = daysUntil != null && daysUntil >= 0 && daysUntil < 30
                        const statusColor = isExpired ? '#f87171' : isUrgent ? '#fbbf24' : '#4ade80'
                        const statusBg = isExpired ? 'rgba(248,113,113,0.12)' : isUrgent ? 'rgba(251,191,36,0.12)' : 'rgba(74,222,128,0.12)'
                        const statusLabel = isExpired ? 'Expired' : isUrgent ? 'Expiring soon' : 'Valid'
                        return (
                          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                <p style={{ fontSize: 13, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>{item.type}</p>
                                <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 4, background: statusBg, color: statusColor, flexShrink: 0 }}>{statusLabel}</span>
                              </div>
                              <p style={{ fontSize: 11, color: '#8899aa' }}>
                                {item.issue_date ? `Issued ${fmtDate(item.issue_date)}` : ''}
                                {item.issue_date && item.expiry_date ? ' · ' : ''}
                                {item.expiry_date ? `Expires ${fmtDate(item.expiry_date)}` : ''}
                              </p>
                              {item.notes && <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>{item.notes}</p>}
                            </div>
                            {item.document_url && (
                              <a href={docUrl(item.document_url) ?? '#'} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 12, color: '#60a5fa', textDecoration: 'none', padding: '5px 12px', borderRadius: 6, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', flexShrink: 0 }}>
                                View
                              </a>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Landlord info */}
                <div style={{ ...CARD, padding: 14 }}>
                  <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 10 }}>Landlord</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      ['Name', selectedProperty.profiles?.full_name ?? '—'],
                      ['Email', selectedProperty.profiles?.email ?? '—'],
                      ...(selectedProperty.landlord_registration_number ? [['Registration No.', selectedProperty.landlord_registration_number]] : []),
                    ].map(([l, v]) => (
                      <div key={l}>
                        <p style={{ fontSize: 10, color: '#8899aa', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>{l}</p>
                        <p style={{ fontSize: 13, color: '#e8edf5' }}>{v}</p>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          )}
          {/* Listing */}
          <div style={{ margin: '8px 16px 0', ...CARD, padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa' }}>Listing for Let</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {selectedProperty.is_listed && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'rgba(74,222,128,0.15)', color: '#4ade80', letterSpacing: '0.06em' }}>LIVE</span>
                )}
                <button
                  type="button"
                  disabled={listingSaving}
                  onClick={() => handleListingToggle(!selectedProperty.is_listed)}
                  style={{
                    width: 44, height: 26, borderRadius: 13, border: 'none', cursor: listingSaving ? 'not-allowed' : 'pointer',
                    background: selectedProperty.is_listed ? '#4ade80' : 'rgba(255,255,255,0.12)',
                    position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 3, left: selectedProperty.is_listed ? 21 : 3,
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s',
                  }} />
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Landlord registration number — legally required on all adverts */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <p style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: listingRegNumber.trim() ? '#8899aa' : '#f87171' }}>Landlord Registration Number</p>
                  <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: 'rgba(248,113,113,0.15)', color: '#f87171', letterSpacing: '0.06em' }}>REQUIRED BY LAW</span>
                </div>
                {landlordRegsLoading ? (
                  <div style={{ height: 38, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)' }} />
                ) : (
                  <>
                    {landlordRegs.length > 0 && !showListingAddReg && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select
                          value={listingRegNumber}
                          onChange={e => setListingRegNumber(e.target.value)}
                          style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: `1px solid ${listingRegNumber.trim() ? 'rgba(255,255,255,0.1)' : 'rgba(248,113,113,0.4)'}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: listingRegNumber ? '#e8edf5' : '#8899aa', outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }}
                        >
                          <option value="">Select registration number…</option>
                          {landlordRegs.map(r => {
                            const landlordName = selectedProperty.profiles?.full_name ?? selectedProperty.profiles?.email ?? 'Landlord'
                            const expired = r.expiry_date ? new Date(r.expiry_date) < new Date() : false
                            return (
                              <option key={r.id} value={r.registration_number}>
                                {landlordName} — {r.registration_number}{r.council_area ? ` (${r.council_area})` : ''}{expired ? ' ⚠ EXPIRED' : ''}
                              </option>
                            )
                          })}
                        </select>
                        <button
                          type="button"
                          onClick={() => setShowListingAddReg(true)}
                          style={{ fontSize: 11, padding: '9px 12px', borderRadius: 8, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', color: '#60a5fa', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                        >
                          + Add new
                        </button>
                      </div>
                    )}
                    {(landlordRegs.length === 0 || showListingAddReg) && (
                      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <p style={{ fontSize: 11, color: '#8899aa' }}>
                          {landlordRegs.length === 0 ? 'No registration numbers saved for this landlord. Add one below — it will be saved to their account.' : 'Add a new registration number for this landlord.'}
                        </p>
                        <input
                          type="text"
                          placeholder="Registration number e.g. 123456/250/12345"
                          value={listingNewRegNumber}
                          onChange={e => setListingNewRegNumber(e.target.value)}
                          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 10px', fontSize: 13, color: '#e8edf5', outline: 'none', boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <input
                            type="text"
                            placeholder="Council area (optional)"
                            value={listingNewCouncilArea}
                            onChange={e => setListingNewCouncilArea(e.target.value)}
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#e8edf5', outline: 'none' }}
                          />
                          <input
                            type="date"
                            placeholder="Expiry date (optional)"
                            value={listingNewExpiry}
                            onChange={e => setListingNewExpiry(e.target.value)}
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#e8edf5', outline: 'none', colorScheme: 'dark' }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            disabled={!listingNewRegNumber.trim() || listingRegSaving}
                            onClick={handleListingAddReg}
                            style={{ flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 12, fontWeight: 500, background: listingNewRegNumber.trim() ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${listingNewRegNumber.trim() ? 'rgba(96,165,250,0.3)' : 'rgba(255,255,255,0.07)'}`, color: listingNewRegNumber.trim() ? '#60a5fa' : '#8899aa', cursor: listingNewRegNumber.trim() && !listingRegSaving ? 'pointer' : 'not-allowed' }}
                          >
                            {listingRegSaving ? 'Saving…' : 'Save & Use'}
                          </button>
                          {showListingAddReg && (
                            <button
                              type="button"
                              onClick={() => setShowListingAddReg(false)}
                              style={{ padding: '8px 14px', borderRadius: 6, fontSize: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#8899aa', cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
                <p style={{ fontSize: 11, color: '#8899aa', marginTop: 4, lineHeight: 1.4 }}>
                  Scottish law requires the landlord registration number to appear on all rental advertisements. The listing cannot go live without this.
                </p>
              </div>
              <div>
                <p style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 5 }}>Headline</p>
                <input
                  type="text"
                  placeholder="e.g. Bright 2-bed flat in Dundee city centre"
                  value={listingHeadline}
                  onChange={e => setListingHeadline(e.target.value)}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#e8edf5', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <p style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 5 }}>Available From</p>
                <input
                  type="date"
                  value={listingAvailableFrom}
                  onChange={e => setListingAvailableFrom(e.target.value)}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: listingAvailableFrom ? '#e8edf5' : '#8899aa', outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }}
                />
              </div>
              <button
                type="button"
                disabled={listingSaving}
                onClick={handleListingSave}
                style={{
                  padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 500,
                  background: listingSaving ? 'rgba(96,165,250,0.1)' : 'rgba(96,165,250,0.15)',
                  border: '1px solid rgba(96,165,250,0.3)', color: '#60a5fa',
                  cursor: listingSaving ? 'not-allowed' : 'pointer',
                }}
              >
                {listingSaving ? 'Saving…' : 'Save Listing Details'}
              </button>
              {listingError && <p style={{ fontSize: 12, color: '#f87171' }}>{listingError}</p>}
              {selectedProperty.is_listed && (
                <p style={{ fontSize: 11, color: '#4ade80' }}>
                  This property is live on the Properties for Let page. Toggle off to remove it.
                </p>
              )}
              {!selectedProperty.is_listed && !listingRegNumber.trim() && (
                <p style={{ fontSize: 11, color: '#f87171', lineHeight: 1.4 }}>
                  Enter a landlord registration number above before publishing.
                </p>
              )}
            </div>
          </div>

          {/* Activity */}
          <div style={{ margin: '8px 16px 24px', ...CARD, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', margin: 0 }}>Activity</p>
              {auditEvents.length > 0 && (
                <button type="button" onClick={exportAuditPDF}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e8edf5', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                  Export PDF
                </button>
              )}
            </div>
            {auditLoading ? (
              <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center', padding: '12px 0' }}>Loading…</p>
            ) : auditEvents.length === 0 ? (
              <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center', padding: '12px 0' }}>No activity recorded yet.</p>
            ) : (
              <div>
                {auditEvents.map((evt, i) => {
                  const dotColor = ({ maintenance: '#fbbf24', payment: '#4ade80', tenancy: '#60a5fa', compliance: '#a78bfa', viewing: '#f97316' } as Record<string, string>)[evt.cat] ?? '#8899aa'
                  const isLast = i === auditEvents.length - 1
                  return (
                    <div key={evt.id} style={{ display: 'flex', gap: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14, flexShrink: 0 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, marginTop: 5, flexShrink: 0 }} />
                        {!isLast && <div style={{ width: 1, flex: 1, minHeight: 16, background: 'rgba(255,255,255,0.07)', marginTop: 3 }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 14 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                          <p style={{ fontSize: 13, color: '#e8edf5', lineHeight: 1.4 }}>{evt.title}</p>
                          <span style={{ fontSize: 10, color: '#8899aa', flexShrink: 0, paddingTop: 2, whiteSpace: 'nowrap' }}>{fmtDateTime(evt.ts)}</span>
                        </div>
                        {evt.detail && <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2, lineHeight: 1.4 }}>{evt.detail}</p>}
                        {evt.documentUrl && (
                          <a href={docUrl(evt.documentUrl) ?? '#'} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5, fontSize: 11, color: '#60a5fa', textDecoration: 'none' }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z"/></svg>
                            View PDF
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'properties' && !selectedProperty && (
        <div className="flex flex-col">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', gap: 10 }}>
            <input type="search" placeholder="Search address, postcode or landlord…" value={propSearch} onChange={(e) => setPropSearch(e.target.value)}
              style={{ flex: 1, background: '#0f1e35', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#e8edf5', outline: 'none' }} />
            <button type="button" onClick={openAddPropertyModal}
              style={{ padding: '7px 14px', borderRadius: 6, background: '#e8edf5', color: '#0d1b2e', border: 'none', fontSize: 12, fontWeight: 600, flexShrink: 0, letterSpacing: '0.04em' }}>
              + Add
            </button>
            <button type="button" onClick={() => { setAdminPropsLoaded(false); loadAdminProps() }}
              style={{ padding: '7px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            </button>
          </div>
          <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 6, overflowX: 'auto', alignItems: 'center' }}>
            {([
              { key: 'all',      label: 'All',      style: { background: 'rgba(255,255,255,0.06)', color: '#8899aa' } },
              { key: 'tenanted',  label: 'Tenanted',          style: PROP_STATUS_STYLE.tenanted },
              { key: 'notice',    label: 'Handed in Notice',  style: PROP_STATUS_STYLE.notice },
              { key: 'viewings',  label: 'Viewings',          style: PROP_STATUS_STYLE.viewings },
              { key: 'for_let',   label: 'Listed for Let',    style: PROP_STATUS_STYLE.for_let },
              { key: 'listed',    label: 'Has Listing',       style: { background: 'rgba(74,222,128,0.12)', color: '#4ade80' } },
            ] as { key: PropStatus | 'all' | 'listed'; label: string; style: React.CSSProperties }[]).map(({ key, label, style }) => {
              const isActive = propStatusFilter === key
              const count = key === 'all' ? null : key === 'listed' ? adminProps.filter(p => p.is_listed).length : adminProps.filter(p => (p.status ?? 'for_let') === key).length
              return (
                <button key={key} type="button" onClick={() => setPropStatusFilter(key)}
                  className="flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-medium"
                  style={{ border: '1px solid', borderColor: isActive ? (style.color as string) : 'rgba(255,255,255,0.08)', background: isActive ? style.background : 'rgba(255,255,255,0.04)', color: isActive ? style.color : '#8899aa' }}>
                  {label}
                  {count != null && (
                    <span style={{ marginLeft: 4, opacity: 0.7 }}>{count}</span>
                  )}
                </button>
              )
            })}
          </div>
          <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 6, overflowX: 'auto', alignItems: 'center' }}>
            <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa', flexShrink: 0, marginRight: 2 }}>Sort</span>
            {([
              { key: 'newest', label: 'Newest' },
              { key: 'oldest', label: 'Oldest' },
              { key: 'az',     label: 'A → Z' },
              { key: 'za',     label: 'Z → A' },
              { key: 'rent_high', label: 'Rent ↓' },
              { key: 'rent_low',  label: 'Rent ↑' },
            ] as { key: typeof propSort; label: string }[]).map(({ key, label }) => (
              <button key={key} type="button" onClick={() => setPropSort(key)}
                className="flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-medium"
                style={{ background: propSort === key ? '#e8edf5' : 'rgba(255,255,255,0.06)', color: propSort === key ? '#0d1b2e' : '#8899aa', border: '1px solid rgba(255,255,255,0.08)' }}>
                {label}
              </button>
            ))}
          </div>
          <div className="px-4 py-4 flex flex-col gap-3">
            {adminPropsLoading ? (
              [...Array(4)].map((_, i) => <div key={i} style={{ ...CARD, height: 96, opacity: 0.4 }} className="animate-pulse" />)
            ) : filteredAdminProps.length === 0 ? (
              <EmptyState icon={<IconHouse />} title={propSearch ? 'No results' : 'No properties'} subtitle={propSearch ? 'Try a different search term' : 'Properties will appear here once added'} />
            ) : (
              filteredAdminProps.map((p) => <AdminPropertyCard key={p.id} property={p} onLinkTenant={openLinkTenantModal} onEdit={openEditPropertyModal} onView={setSelectedProperty} onToggleListing={quickToggleListing} />)
            )}
          </div>
        </div>
      )}

      {/* ── MAINTENANCE ── */}
      {tab === 'maintenance' && !selectedMaintenance && (
        <div className="flex flex-col">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', flex: 1 }}>
              {([
                { key: 'all', label: 'All' },
                { key: 'open', label: 'Open' },
                { key: 'in_progress', label: 'In Progress' },
                { key: 'resolved', label: 'Resolved' },
                { key: 'compliance', label: 'Compliance' },
                { key: 'viewings', label: 'Viewings' },
              ] as { key: MaintenanceFilter; label: string }[]).map(({ key, label }) => (
                <button key={key} type="button" onClick={() => setMaintenanceFilter(key)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium"
                  style={{ background: maintenanceFilter === key ? (key === 'compliance' ? '#a78bfa' : key === 'viewings' ? '#60a5fa' : '#e8edf5') : 'rgba(255,255,255,0.06)', color: maintenanceFilter === key ? '#fff' : '#8899aa', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {label}
                  {key === 'compliance' && complianceAlerts.length > 0 && (
                    <span style={{ marginLeft: 5, fontSize: 10, padding: '1px 5px', borderRadius: 4, background: maintenanceFilter === 'compliance' ? 'rgba(255,255,255,0.25)' : 'rgba(248,113,113,0.25)', color: maintenanceFilter === 'compliance' ? '#fff' : '#f87171' }}>
                      {complianceAlerts.length}
                    </span>
                  )}
                  {key === 'viewings' && viewingRequests.filter(r => r.status === 'pending').length > 0 && (
                    <span style={{ marginLeft: 5, fontSize: 10, padding: '1px 5px', borderRadius: 4, background: maintenanceFilter === 'viewings' ? 'rgba(255,255,255,0.25)' : 'rgba(96,165,250,0.25)', color: maintenanceFilter === 'viewings' ? '#fff' : '#60a5fa' }}>
                      {viewingRequests.filter(r => r.status === 'pending').length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => {
              setMaintenanceLoaded(false); loadMaintenance()
              setComplianceAlertsLoaded(false); loadComplianceAlerts()
              loadViewingRequests()
            }}
              style={{ padding: '7px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            </button>
          </div>

          {maintenanceFilter === 'viewings' ? (
            <div className="px-4 py-4 flex flex-col gap-3">
              {viewingRequestsLoading ? (
                [...Array(3)].map((_, i) => <div key={i} style={{ ...CARD, height: 100, opacity: 0.4 }} className="animate-pulse" />)
              ) : viewingRequests.length === 0 ? (
                <EmptyState icon={<IconWrench />} title="No viewing requests" subtitle="Booking requests from the public listings page will appear here" />
              ) : (
                viewingRequests.map((req) => {
                  const addr = req.properties?.address ?? 'Unknown property'
                  const date = new Date(req.preferred_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                  const timeFmt = req.preferred_time ? (() => { const [h, m] = req.preferred_time.split(':'); const hr = parseInt(h); return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}` })() : ''
                  const statusColor = req.status === 'confirmed' ? '#4ade80' : req.status === 'cancelled' ? '#f87171' : '#fbbf24'
                  const statusBg = req.status === 'confirmed' ? 'rgba(74,222,128,0.1)' : req.status === 'cancelled' ? 'rgba(248,113,113,0.1)' : 'rgba(251,191,36,0.1)'
                  return (
                    <div key={req.id} style={{ ...CARD, padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif', marginBottom: 2 }} className="truncate">{addr}</p>
                          <p style={{ fontSize: 12, color: '#c8d4e0', fontWeight: 500 }}>{req.name}</p>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 4, background: statusBg, color: statusColor, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          {req.status}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, color: '#8899aa' }}>📅 {date} at {timeFmt}</span>
                        <span style={{ fontSize: 11, color: '#8899aa' }}>✉ {req.email}</span>
                        <span style={{ fontSize: 11, color: '#8899aa' }}>📞 {req.phone ?? '—'}</span>
                      </div>
                      {req.message && <p style={{ fontSize: 12, color: '#8899aa', fontStyle: 'italic', marginBottom: 10, borderLeft: '2px solid rgba(255,255,255,0.1)', paddingLeft: 10 }}>{req.message}</p>}
                      <div style={{ display: 'flex', gap: 8 }}>
                        {req.status === 'pending' && (
                          <>
                            <button type="button" onClick={() => updateViewingStatus(req.id, 'confirmed')}
                              style={{ flex: 1, padding: '7px 0', fontSize: 11, borderRadius: 6, background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', cursor: 'pointer', fontWeight: 600 }}>
                              Confirm
                            </button>
                            <button type="button" onClick={() => updateViewingStatus(req.id, 'cancelled')}
                              style={{ flex: 1, padding: '7px 0', fontSize: 11, borderRadius: 6, background: 'rgba(248,113,113,0.08)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)', cursor: 'pointer', fontWeight: 600 }}>
                              Cancel
                            </button>
                          </>
                        )}
                        <button type="button" onClick={() => deleteViewingRequest(req.id)}
                          title="Delete — viewing completed or tenant found"
                          style={{ padding: '7px 12px', fontSize: 11, borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          ) : maintenanceFilter === 'compliance' ? (
            <div className="px-4 py-4 flex flex-col gap-3">
              {complianceAlertsLoading ? (
                [...Array(4)].map((_, i) => <div key={i} style={{ ...CARD, height: 72, opacity: 0.4 }} className="animate-pulse" />)
              ) : complianceAlerts.length === 0 ? (
                <EmptyState icon={<IconWrench />} title="All clear" subtitle="No compliance certificates expiring in the next 3 months" />
              ) : (
                complianceAlerts.map((item) => {
                  const expiry = item.expiry_date ? new Date(item.expiry_date) : null
                  const daysUntil = expiry ? Math.ceil((expiry.getTime() - Date.now()) / 86400000) : null
                  const isExpired = daysUntil != null && daysUntil < 0
                  const isUrgent = daysUntil != null && daysUntil >= 0 && daysUntil < 30
                  const color = isExpired ? '#f87171' : isUrgent ? '#fbbf24' : '#4ade80'
                  const bg = isExpired ? 'rgba(248,113,113,0.1)' : isUrgent ? 'rgba(251,191,36,0.1)' : 'rgba(74,222,128,0.1)'
                  const label = isExpired ? 'Expired' : daysUntil === 0 ? 'Today' : daysUntil != null ? `${daysUntil}d` : '—'
                  const addr = (item.properties as unknown as { address: string } | null)?.address ?? 'Unknown property'
                  return (
                    <div key={item.id} style={{ ...CARD, padding: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }} className="truncate">{item.type}</p>
                          <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }} className="truncate">{addr}</p>
                          <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>Expires {fmtDate(item.expiry_date)}</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 4, background: bg, color }}>{label}</span>
                          <button type="button" onClick={() => setSelectedComplianceAlert(item)}
                            style={{ fontSize: 11, color: '#60a5fa', padding: '2px 10px', borderRadius: 4, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', cursor: 'pointer' }}>
                            View
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          ) : (
            <div className="px-4 py-4 flex flex-col gap-3">
              {maintenanceLoading ? (
                [...Array(5)].map((_, i) => <div key={i} style={{ ...CARD, height: 80, opacity: 0.4 }} className="animate-pulse" />)
              ) : filteredMaintenance.length === 0 ? (
                <EmptyState icon={<IconWrench />} title="No requests" subtitle="No maintenance requests match this filter" />
              ) : (
                filteredMaintenance.map((req) => <AdminMaintenanceCard key={req.id} request={req} onClick={() => setSelectedMaintenance(req)} />)
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'maintenance' && selectedMaintenance && (
        <MaintenanceDetailPanel
          request={selectedMaintenance}
          onBack={() => setSelectedMaintenance(null)}
          onUpdate={(id, updates) => setMaintenanceItems(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r))}
        />
      )}

      {tab === 'auditlog' && (
        <div className="flex flex-col">
          {/* Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexWrap: 'wrap' }}>
            <select
              value={auditLogsActionFilter}
              onChange={e => setAuditLogsActionFilter(e.target.value)}
              style={{ background: '#0f1e35', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '7px 10px', fontSize: 12, color: '#e8edf5', outline: 'none' }}
            >
              <option value="all">All actions</option>
              <option value="maintenance_request_created">Maintenance created</option>
              <option value="maintenance_request_updated">Maintenance updated</option>
              <option value="contractor_reassigned">Contractor reassigned</option>
              <option value="contractor_access_granted">Contractor access granted</option>
              <option value="contractor_access_revoked">Contractor access revoked</option>
              <option value="attachment_uploaded">Attachment uploaded</option>
              <option value="compliance_expiring_soon">Compliance expiring soon</option>
              <option value="compliance_expired">Compliance expired</option>
              <option value="stale_flag_triggered">Stale flag triggered</option>
              <option value="rent_payment_processed">Rent payment processed</option>
              <option value="payment_failed">Payment failed</option>
              <option value="payment_retry_failed">Payment retry failed</option>
            </select>
            <select
              value={auditLogsRoleFilter}
              onChange={e => setAuditLogsRoleFilter(e.target.value)}
              style={{ background: '#0f1e35', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '7px 10px', fontSize: 12, color: '#e8edf5', outline: 'none' }}
            >
              <option value="all">All roles</option>
              <option value="admin">Admin</option>
              <option value="contractor">Contractor</option>
              <option value="tenant">Tenant</option>
              <option value="system">System</option>
            </select>
            <button
              type="button"
              onClick={() => loadAuditLogs(0, true)}
              style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.07)', color: '#e8edf5', border: 'none', fontSize: 12, cursor: 'pointer' }}
            >
              Refresh
            </button>
          </div>

          {/* Log list */}
          <div style={{ padding: '12px 16px' }}>
            {auditLogsLoading && auditLogs.length === 0 ? (
              <div className="flex flex-col gap-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} style={{ ...CARD, height: 56, opacity: 0.4 }} className="animate-pulse" />
                ))}
              </div>
            ) : auditLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#8899aa', fontSize: 13 }}>No audit events found</div>
            ) : (
              <div style={CARD}>
                {auditLogs.map((log, i) => {
                  const isExpanded = auditLogsExpandedId === log.id
                  const roleBadge = (() => {
                    if (log.user_role === 'admin' || log.user_role === 'master admin') return { background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }
                    if (log.user_role === 'contractor') return { background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }
                    if (log.user_role === 'tenant') return { background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }
                    if (log.user_role === 'system') return { background: 'rgba(74,222,128,0.12)', color: '#4ade80' }
                    return { background: 'rgba(136,153,170,0.12)', color: '#8899aa' }
                  })()
                  const actionLabel = (log.action ?? '').replace(/_/g, ' ')
                  const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0
                  return (
                    <div key={log.id}>
                      <div
                        style={{ padding: '11px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, cursor: hasMetadata ? 'pointer' : 'default' }}
                        onClick={() => hasMetadata && setAuditLogsExpandedId(isExpanded ? null : log.id)}
                      >
                        {/* Entity type dot */}
                        <div style={{ marginTop: 5, width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: log.entity_type?.includes('payment') ? '#4ade80' : log.entity_type?.includes('compliance') ? '#fbbf24' : '#60a5fa' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, color: '#e8edf5', fontWeight: 500, textTransform: 'capitalize' }}>{actionLabel}</span>
                            {log.entity_type && (
                              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#8899aa', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
                                {log.entity_type.replace(/_/g, ' ')}
                              </span>
                            )}
                            {log.user_role && (
                              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, letterSpacing: '0.06em', textTransform: 'capitalize', flexShrink: 0, ...roleBadge }}>
                                {log.user_role}
                              </span>
                            )}
                          </div>
                          {isExpanded && hasMetadata && (
                            <pre style={{ marginTop: 8, fontSize: 10, color: '#8899aa', background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '8px 10px', overflow: 'auto', maxHeight: 180, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          )}
                        </div>
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          <span style={{ fontSize: 10, color: '#8899aa' }}>{fmtDate(log.created_at)}</span>
                          {hasMetadata && (
                            <div style={{ fontSize: 9, color: 'rgba(136,153,170,0.6)', marginTop: 2 }}>{isExpanded ? '▲ collapse' : '▼ details'}</div>
                          )}
                        </div>
                      </div>
                      {i < auditLogs.length - 1 && <div style={DIVIDER} />}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Load more */}
            {auditLogsHasMore && (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => loadAuditLogs(auditLogsPage + 1, false)}
                  disabled={auditLogsLoading}
                  style={{ padding: '8px 20px', borderRadius: 8, background: 'rgba(255,255,255,0.07)', color: '#e8edf5', border: 'none', fontSize: 12, cursor: auditLogsLoading ? 'default' : 'pointer', opacity: auditLogsLoading ? 0.5 : 1 }}
                >
                  {auditLogsLoading ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'settings' && <SettingsPage />}

      {showAddPropertyModal && (
        <AddPropertyModal
          landlords={landlordUsers}
          onClose={() => setShowAddPropertyModal(false)}
          onSaved={() => { setAdminPropsLoaded(false); loadAdminProps() }}
        />
      )}

      {showAddStaffModal && (
        <AddStaffModal
          users={nonStaffUsers}
          onClose={() => setShowAddStaffModal(false)}
          onSaved={() => { setStaffLoaded(false); loadStaff() }}
        />
      )}

      {editProperty && (
        <EditPropertyModal
          property={editProperty}
          landlords={landlordUsers}
          onClose={() => setEditProperty(null)}
          onSaved={(patch) => {
            setAdminProps(prev => prev.map(p => p.id === editProperty.id ? { ...p, ...patch } : p))
            setEditProperty(null)
          }}
          onDelete={confirmDeleteProperty}
        />
      )}

      {showAddPRTModal && selectedProperty && (
        <AddPRTModal
          property={selectedProperty}
          onClose={() => setShowAddPRTModal(false)}
          onSaved={(doc) => { setPrtDoc(doc); setShowAddPRTModal(false) }}
        />
      )}

      {showAddComplianceModal && selectedProperty && (
        <AddComplianceModal
          property={selectedProperty}
          onClose={() => setShowAddComplianceModal(false)}
          onSaved={(newItem) => {
            setShowAddComplianceModal(false)
            setComplianceItems(prev => [...prev, newItem])
          }}
          onFileUploaded={(id, documentUrl) => {
            setComplianceItems(prev => prev.map(c => c.id === id ? { ...c, document_url: documentUrl } : c))
          }}
        />
      )}

      {editComplianceItem && (
        <EditComplianceModal
          item={editComplianceItem}
          onClose={() => setEditComplianceItem(null)}
          onSaved={(updated) => {
            setComplianceItems(prev => prev.map(c => c.id === updated.id ? updated : c))
            setEditComplianceItem(null)
          }}
        />
      )}

      {selectedComplianceAlert && (
        <ComplianceDetailModal
          item={selectedComplianceAlert}
          onClose={() => setSelectedComplianceAlert(null)}
          onViewProperty={() => { setSelectedComplianceAlert(null); navigateToComplianceProperty(selectedComplianceAlert.property_id) }}
          onJobCreated={() => { setMaintenanceLoaded(false); loadMaintenance() }}
        />
      )}

      {deletePropertyId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '0 16px' }}>
          <div style={{ background: '#112240', borderRadius: 16, width: '100%', maxWidth: 400, padding: 24 }}>
            <p style={{ fontSize: 16, color: '#e8edf5', fontFamily: 'Georgia, serif', marginBottom: 8 }}>Delete Property?</p>
            <p style={{ fontSize: 13, color: '#8899aa', marginBottom: 20 }}>
              This will permanently delete <strong style={{ color: '#e8edf5' }}>{deletePropertyAddress}</strong> and all associated data. This cannot be undone.
            </p>
            {deleteError && <p style={{ fontSize: 12, color: '#f87171', marginBottom: 12 }}>{deleteError}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setDeletePropertyId(null)}
                style={{ flex: 1, padding: '11px 0', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, fontWeight: 500 }}>
                Cancel
              </button>
              <button type="button" onClick={handleDeleteProperty} disabled={deletingProperty}
                style={{ flex: 1, padding: '11px 0', borderRadius: 8, background: deletingProperty ? 'rgba(248,113,113,0.3)' : '#f87171', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600 }}>
                {deletingProperty ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}


      {linkTenantPropertyId && (() => {
        const prop = adminProps.find(p => p.id === linkTenantPropertyId)
        return prop ? (
          <LinkTenantModal
            property={prop}
            tenants={tenantUsers}
            currentTenants={selectedProperty?.id === linkTenantPropertyId ? propertyTenancies : []}
            onClose={() => setLinkTenantPropertyId(null)}
            onSaved={() => {
              setAdminPropsLoaded(false)
              loadAdminProps()
              if (selectedProperty?.id === linkTenantPropertyId) loadPropertyTenancy(linkTenantPropertyId)
            }}
          />
        ) : null
      })()}

      {/* ── Add Metre Reading Modal ── */}
      {showAddMeterModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ background: '#112240', borderRadius: '20px 20px 0 0', padding: '24px 20px 36px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ fontSize: 16, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>Add Metre Reading</p>
              <button type="button" onClick={() => setShowAddMeterModal(false)}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 32, height: 32, color: '#8899aa', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', display: 'block', marginBottom: 6 }}>Metre Type</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(selectedProperty?.has_gas ? ['electricity', 'gas'] as MeterType[] : ['electricity'] as MeterType[]).map((t) => (
                    <button key={t} type="button" onClick={() => setNewMeterType(t)}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 12, fontWeight: 500, textTransform: 'capitalize', cursor: 'pointer', border: '1px solid', background: newMeterType === t ? '#e8edf5' : 'rgba(255,255,255,0.05)', color: newMeterType === t ? '#0d1b2e' : '#8899aa', borderColor: newMeterType === t ? '#e8edf5' : 'rgba(255,255,255,0.1)' }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', display: 'block', marginBottom: 6 }}>
                  Reading ({newMeterType === 'electricity' ? 'kWh' : 'm³'}) *
                </label>
                <input type="number" value={newMeterReading} onChange={(e) => setNewMeterReading(e.target.value)} placeholder="e.g. 12345"
                  style={{ width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#e8edf5', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', display: 'block', marginBottom: 6 }}>Date Taken</label>
                <input type="date" value={newMeterDate} onChange={(e) => setNewMeterDate(e.target.value)}
                  style={{ width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#e8edf5', outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }} />
              </div>
              <div>
                <label style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', display: 'block', marginBottom: 6 }}>Notes</label>
                <input value={newMeterNotes} onChange={(e) => setNewMeterNotes(e.target.value)} placeholder="Optional…"
                  style={{ width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#e8edf5', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <button type="button" onClick={handleAddMeterReading} disabled={!newMeterReading.trim() || meterSaving}
                style={{ width: '100%', padding: '13px 0', borderRadius: 10, background: !newMeterReading.trim() || meterSaving ? 'rgba(232,237,245,0.3)' : '#e8edf5', color: '#0d1b2e', border: 'none', fontSize: 14, fontWeight: 600, cursor: !newMeterReading.trim() || meterSaving ? 'default' : 'pointer' }}>
                {meterSaving ? 'Saving…' : 'Save Reading'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Check Out Key Modal ── */}
      {checkOutKeyType && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ background: '#112240', borderRadius: '20px 20px 0 0', padding: '24px 20px 36px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ fontSize: 16, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>
                Check Out {checkOutKeyType === 'master' ? 'Master' : checkOutKeyType === 'tenant' ? 'Tenant' : 'Contractor'} Key
              </p>
              <button type="button" onClick={() => setCheckOutKeyType(null)}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 32, height: 32, color: '#8899aa', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', display: 'block', marginBottom: 6 }}>Person's Name *</label>
                <input value={checkOutName} onChange={(e) => setCheckOutName(e.target.value)} placeholder="Full name"
                  style={{ width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#e8edf5', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', display: 'block', marginBottom: 6 }}>Role / Description</label>
                <input value={checkOutRole} onChange={(e) => setCheckOutRole(e.target.value)} placeholder="e.g. Tenant, Plumber, Landlord…"
                  style={{ width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#e8edf5', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', display: 'block', marginBottom: 6 }}>Notes</label>
                <textarea value={checkOutNotes} onChange={(e) => setCheckOutNotes(e.target.value)} placeholder="Optional…" rows={2}
                  style={{ width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#e8edf5', outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>
              <button type="button" onClick={handleCheckOut} disabled={!checkOutName.trim() || checkOutSaving}
                style={{ width: '100%', padding: '13px 0', borderRadius: 10, background: !checkOutName.trim() || checkOutSaving ? 'rgba(232,237,245,0.3)' : '#e8edf5', color: '#0d1b2e', border: 'none', fontSize: 14, fontWeight: 600, cursor: !checkOutName.trim() || checkOutSaving ? 'default' : 'pointer' }}>
                {checkOutSaving ? 'Saving…' : 'Check Out Key'}
              </button>
            </div>
          </div>
        </div>
      )}
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

// ── Shared modal helpers ──

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#e8edf5', outline: 'none',
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 6 }}>{label}</p>
      {children}
    </div>
  )
}

function AddPropertyModal({ landlords, onClose, onSaved }: {
  landlords: { id: string; email: string; full_name: string | null }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [address, setAddress] = useState('')
  const [postcode, setPostcode] = useState('')
  const [propType, setPropType] = useState('')
  const [bedrooms, setBedrooms] = useState('')
  const [rent, setRent] = useState('')
  const [landlordId, setLandlordId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!address.trim()) { setError('Address is required'); return }
    if (!landlordId) { setError('Please select a landlord'); return }
    setSaving(true); setError(null)
    const { error: dbError } = await supabase.from('properties').insert({
      address: address.trim(),
      postcode: postcode.trim() || null,
      property_type: propType || null,
      bedrooms: bedrooms ? parseInt(bedrooms) : null,
      monthly_rent: rent ? parseFloat(rent) : null,
      landlord_id: landlordId,
      is_active: true,
    })
    setSaving(false)
    if (dbError) { setError(dbError.message); return }
    onSaved(); onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '0 16px' }}>
      <div style={{ background: '#112240', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90dvh', overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontSize: 16, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>Add Property</p>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#8899aa', padding: 4, cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormField label="Address *">
            <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 High Street" style={INPUT_STYLE} />
          </FormField>
          <FormField label="Postcode">
            <input type="text" value={postcode} onChange={e => setPostcode(e.target.value)} placeholder="DD1 1AA" style={INPUT_STYLE} />
          </FormField>
          <FormField label="Property Type">
            <select value={propType} onChange={e => setPropType(e.target.value)} style={INPUT_STYLE}>
              <option value="">Select type</option>
              <option value="flat">Flat</option>
              <option value="house">House</option>
              <option value="bungalow">Bungalow</option>
              <option value="commercial">Commercial</option>
              <option value="other">Other</option>
            </select>
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="Bedrooms">
              <input type="number" value={bedrooms} onChange={e => setBedrooms(e.target.value)} placeholder="3" min="0" style={INPUT_STYLE} />
            </FormField>
            <FormField label="Monthly Rent (£)">
              <input type="number" value={rent} onChange={e => setRent(e.target.value)} placeholder="1200" min="0" style={INPUT_STYLE} />
            </FormField>
          </div>
          <FormField label="Landlord *">
            <select value={landlordId} onChange={e => setLandlordId(e.target.value)} style={INPUT_STYLE}>
              <option value="">Select landlord</option>
              {landlords.map(l => <option key={l.id} value={l.id}>{l.full_name ?? l.email}</option>)}
            </select>
          </FormField>
          {error && <p style={{ fontSize: 12, color: '#f87171' }}>{error}</p>}
          <button type="submit" disabled={saving}
            style={{ padding: '12px 0', borderRadius: 8, background: saving ? 'rgba(232,237,245,0.4)' : '#e8edf5', color: '#0d1b2e', border: 'none', fontSize: 13, fontWeight: 600, marginTop: 4 }}>
            {saving ? 'Adding…' : 'Add Property'}
          </button>
        </form>
      </div>
    </div>
  )
}

const PAYMENT_METHODS = ['Bank Transfer', 'Standing Order', 'Cash', 'Cheque', 'Other']

function MarkPaidModal({ tenancyId, address, expected, paymentId, dueDate, adminId, adminRole, onClose, onSaved }: {
  tenancyId: string
  address: string
  expected: number
  paymentId: string | null
  dueDate: string | null
  adminId: string
  adminRole: string
  onClose: () => void
  onSaved: (tenancyId: string, paymentId: string, paymentMethod: string, notes: string) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const defaultDueDate = dueDate ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
  const [method, setMethod] = useState('Bank Transfer')
  const [notes, setNotes] = useState('')
  const [paidDate, setPaidDate] = useState(today)
  const [amount, setAmount] = useState(String(expected))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!paidDate) { setError('Paid date is required'); return }
    if (!amount || isNaN(parseFloat(amount))) { setError('Amount is required'); return }
    setSaving(true); setError(null)

    let finalPaymentId = paymentId
    if (finalPaymentId) {
      const { error: upErr } = await supabase.from('payments').update({
        paid_date: paidDate,
        status: 'paid',
        payment_method: method,
        notes: notes || null,
        recorded_by: adminId || null,
        amount: parseFloat(amount),
      }).eq('id', finalPaymentId)
      if (upErr) { setError(upErr.message); setSaving(false); return }
    } else {
      const { data, error: insErr } = await supabase.from('payments').insert({
        tenancy_id: tenancyId,
        amount: parseFloat(amount),
        due_date: defaultDueDate,
        paid_date: paidDate,
        status: 'paid',
        payment_method: method,
        notes: notes || null,
        recorded_by: adminId || null,
      }).select('id').single()
      if (insErr || !data) { setError(insErr?.message ?? 'Failed to save'); setSaving(false); return }
      finalPaymentId = (data as { id: string }).id
    }

    await supabase.from('audit_logs').insert({
      action: 'payment_marked_paid',
      entity_type: 'payment',
      entity_id: finalPaymentId,
      user_id: adminId || null,
      user_role: adminRole,
      metadata: {
        amount: parseFloat(amount),
        payment_method: method,
        notes: notes || null,
        address,
        paid_date: paidDate,
        due_date: defaultDueDate,
      },
    })

    setSaving(false)
    onSaved(tenancyId, finalPaymentId!, method, notes)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '0 16px' }}>
      <div style={{ background: '#112240', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90dvh', overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <p style={{ fontSize: 16, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>Mark Rent Paid</p>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#8899aa', padding: 4, cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
        <p style={{ fontSize: 12, color: '#8899aa', marginBottom: 18 }} className="truncate">{address}</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormField label="Payment Method *">
            <select value={method} onChange={e => setMethod(e.target.value)} style={INPUT_STYLE}>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="Amount (£) *">
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min="0" step="0.01" style={INPUT_STYLE} />
            </FormField>
            <FormField label="Date Paid *">
              <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} style={INPUT_STYLE} />
            </FormField>
          </div>
          <FormField label="Notes">
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. paid in advance, partial payment…" style={INPUT_STYLE} />
          </FormField>
          {error && <p style={{ fontSize: 12, color: '#f87171' }}>{error}</p>}
          <button type="submit" disabled={saving}
            style={{ padding: '12px 0', borderRadius: 8, background: saving ? 'rgba(74,222,128,0.3)' : 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontSize: 13, fontWeight: 600, marginTop: 4, cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Confirm Payment'}
          </button>
        </form>
      </div>
    </div>
  )
}

function LinkTenantModal({ property, tenants, currentTenants, onClose, onSaved }: {
  property: AdminPropRow
  tenants: { id: string; email: string; full_name: string | null }[]
  currentTenants: PropertyTenancyInfo[]
  onClose: () => void
  onSaved: () => void
}) {
  const linkedIds = new Set(currentTenants.map(t => t.tenant_id))
  const availableTenants = tenants.filter(t => !linkedIds.has(t.id))
  const [tenantId, setTenantId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [rent, setRent] = useState(String(property.monthly_rent ?? ''))
  const [deposit, setDeposit] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tenantId) { setError('Please select a tenant'); return }
    if (!startDate) { setError('Start date is required'); return }
    if (!rent) { setError('Monthly rent is required'); return }
    if (linkedIds.has(tenantId)) { setError('This tenant is already linked to this property'); return }
    setSaving(true); setError(null)
    const { error: dbError } = await supabase.from('tenancies').insert({
      property_id: property.id,
      tenant_id: tenantId,
      start_date: startDate,
      monthly_rent: parseFloat(rent),
      deposit: deposit ? parseFloat(deposit) : 0,
      status: 'active',
      is_current: true,
    })
    setSaving(false)
    if (dbError) { setError(dbError.message); return }
    onSaved(); onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '0 16px' }}>
      <div style={{ background: '#112240', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90dvh', overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ fontSize: 16, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>Add Tenant</p>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#8899aa', padding: 4, cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
        <p style={{ fontSize: 12, color: '#8899aa', marginBottom: 18 }} className="truncate">{property.address}</p>
        {currentTenants.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 8 }}>Currently Linked</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {currentTenants.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize: 13, color: '#e8edf5' }}>{t.tenant_name ?? t.tenant_email}</span>
                  <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4ade80', padding: '2px 8px', borderRadius: 4, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)' }}>Active</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormField label="Tenant *">
            <select value={tenantId} onChange={e => setTenantId(e.target.value)} style={INPUT_STYLE}>
              <option value="">Select tenant</option>
              {availableTenants.map(t => <option key={t.id} value={t.id}>{t.full_name ?? t.email}</option>)}
            </select>
          </FormField>
          <FormField label="Start Date *">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={INPUT_STYLE} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="Monthly Rent (£) *">
              <input type="number" value={rent} onChange={e => setRent(e.target.value)} placeholder="1200" min="0" style={INPUT_STYLE} />
            </FormField>
            <FormField label="Deposit (£)">
              <input type="number" value={deposit} onChange={e => setDeposit(e.target.value)} placeholder="2400" min="0" style={INPUT_STYLE} />
            </FormField>
          </div>
          {error && <p style={{ fontSize: 12, color: '#f87171' }}>{error}</p>}
          {availableTenants.length === 0 ? (
            <p style={{ fontSize: 13, color: '#8899aa', textAlign: 'center', padding: '8px 0' }}>All registered tenants are already linked to this property.</p>
          ) : (
            <button type="submit" disabled={saving}
              style={{ padding: '12px 0', borderRadius: 8, background: saving ? 'rgba(232,237,245,0.4)' : '#e8edf5', color: '#0d1b2e', border: 'none', fontSize: 13, fontWeight: 600, marginTop: 4 }}>
              {saving ? 'Linking…' : 'Link Tenant'}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

function AddStaffModal({ users, onClose, onSaved }: {
  users: { id: string; email: string; full_name: string | null; role: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [userId, setUserId] = useState('')
  const [staffRole, setStaffRole] = useState<'admin' | 'master admin'>('admin')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) { setError('Please select a user'); return }
    setSaving(true); setError(null)
    const { error: dbError } = await supabase.from('users').update({ role: staffRole }).eq('id', userId)
    setSaving(false)
    if (dbError) { setError(dbError.message); return }
    onSaved(); onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '0 16px' }}>
      <div style={{ background: '#112240', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90dvh', overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontSize: 16, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>Add Staff Member</p>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#8899aa', padding: 4, cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormField label="User *">
            <select value={userId} onChange={e => setUserId(e.target.value)} style={INPUT_STYLE}>
              <option value="">Select user</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.full_name ?? u.email} — {u.role}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Staff Role *">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {(['admin', 'master admin'] as const).map(r => (
                <button key={r} type="button" onClick={() => setStaffRole(r)}
                  style={{ padding: '10px 0', borderRadius: 8, fontSize: 12, fontWeight: 500, textTransform: 'capitalize', border: '1px solid', borderColor: staffRole === r ? '#a78bfa' : 'rgba(255,255,255,0.1)', background: staffRole === r ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.04)', color: staffRole === r ? '#a78bfa' : '#8899aa' }}>
                  {r === 'master admin' ? 'Master Admin' : 'Admin'}
                </button>
              ))}
            </div>
          </FormField>
          {error && <p style={{ fontSize: 12, color: '#f87171' }}>{error}</p>}
          <button type="submit" disabled={saving}
            style={{ padding: '12px 0', borderRadius: 8, background: saving ? 'rgba(232,237,245,0.4)' : '#e8edf5', color: '#0d1b2e', border: 'none', fontSize: 13, fontWeight: 600, marginTop: 4 }}>
            {saving ? 'Saving…' : 'Add to Staff'}
          </button>
        </form>
      </div>
    </div>
  )
}

function AdminMaintenanceCard({ request, onClick }: { request: MaintenanceRow; onClick?: () => void }) {
  const sb = badge(request.status)
  const pb = badge(request.priority, 'priority')
  return (
    <div style={{ ...CARD, padding: 14, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
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
        {onClick && <svg width="12" height="12" viewBox="0 0 24 24" fill="#8899aa" style={{ marginLeft: 8, flexShrink: 0 }}><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>}
      </div>
    </div>
  )
}

function ComplianceDetailModal({ item, onClose, onViewProperty, onJobCreated }: {
  item: ComplianceAlert
  onClose: () => void
  onViewProperty: () => void
  onJobCreated?: () => void
}) {
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)
  const [templateUrl, setTemplateUrl] = useState('')

  async function handleCreateJob() {
    setCreating(true)
    setCreateError(null)
    try {
      const isExpiredLocal = expiry && Math.ceil((expiry.getTime() - Date.now()) / 86400000) < 0
      const isUrgentLocal = expiry && !isExpiredLocal && Math.ceil((expiry.getTime() - Date.now()) / 86400000) < 30
      const priority = isExpiredLocal ? 'high' : isUrgentLocal ? 'medium' : 'low'
      const { error } = await supabase.from('maintenance_requests').insert({
        property_id: item.property_id,
        title: `${item.type} renewal`,
        description: `Certificate expired: ${item.expiry_date ?? 'unknown'}. Upload updated certificate.`,
        priority,
        status: 'open',
        request_type: 'compliance',
        ...(templateUrl.trim() ? { compliance_template_url: templateUrl.trim() } : {}),
      })
      if (error) throw error
      // Best-effort notification — don't await, don't block the UI
      supabase.functions.invoke('send-notification-email', {
        body: {
          event: 'maintenance_request',
          data: { property_id: item.property_id, title: `${item.type} renewal`, description: `Certificate expired: ${item.expiry_date ?? 'unknown'}.`, priority },
        },
      }).catch(() => {})
      setCreated(true)
      onJobCreated?.()
    } catch (err) {
      console.error('handleCreateJob:', err)
      setCreateError('Failed to create job. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  const expiry = item.expiry_date ? new Date(item.expiry_date) : null
  const daysUntil = expiry ? Math.ceil((expiry.getTime() - Date.now()) / 86400000) : null
  const isExpired = daysUntil != null && daysUntil < 0
  const isUrgent = daysUntil != null && daysUntil >= 0 && daysUntil < 30
  const statusLabel = isExpired ? 'Expired' : isUrgent ? 'Expiring Soon' : 'Valid'
  const statusColor = isExpired ? '#f87171' : isUrgent ? '#fbbf24' : '#4ade80'
  const statusBg = isExpired ? 'rgba(248,113,113,0.12)' : isUrgent ? 'rgba(251,191,36,0.12)' : 'rgba(74,222,128,0.12)'
  const addr = (item.properties as unknown as { address: string } | null)?.address ?? 'Unknown property'

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative rounded-t-3xl flex flex-col gap-5" style={{ background: '#112240', padding: 20, paddingBottom: 32 }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto -8px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 20, color: '#e8edf5', fontFamily: 'Georgia, serif', marginBottom: 4 }}>{item.type}</p>
            <p style={{ fontSize: 13, color: '#8899aa' }} className="truncate">{addr}</p>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 6, background: statusBg, color: statusColor, flexShrink: 0 }}>
            {statusLabel}
          </span>
        </div>

        {/* Detail rows */}
        <div style={{ background: '#0f1e35', borderRadius: 12, overflow: 'hidden' }}>
          {[
            { label: 'Certificate Type', value: item.type },
            { label: 'Issue Date', value: fmtDate(item.issue_date) },
            { label: 'Expiry Date', value: fmtDate(item.expiry_date) },
            ...(daysUntil != null ? [{ label: isExpired ? 'Overdue By' : 'Days Until Expiry', value: isExpired ? `${Math.abs(daysUntil)} days` : `${daysUntil} days` }] : []),
          ].map(({ label, value }, i, arr) => (
            <div key={label}>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 12, color: '#8899aa' }}>{label}</span>
                <span style={{ fontSize: 13, color: '#e8edf5', fontWeight: 500, textAlign: 'right' }}>{value}</span>
              </div>
              {i < arr.length - 1 && <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '0 16px' }} />}
            </div>
          ))}
          {item.notes && (
            <>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '0 16px' }} />
              <div style={{ padding: '12px 16px' }}>
                <p style={{ fontSize: 12, color: '#8899aa', marginBottom: 4 }}>Notes</p>
                <p style={{ fontSize: 13, color: '#e8edf5', lineHeight: 1.5 }}>{item.notes}</p>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {item.document_url && (
            <a href={docUrl(item.document_url) ?? '#'} target="_blank" rel="noopener noreferrer"
              style={{ width: '100%', padding: '13px 0', borderRadius: 10, background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.25)', color: '#60a5fa', fontSize: 14, fontWeight: 500, textAlign: 'center', textDecoration: 'none', display: 'block' }}>
              Open Document
            </a>
          )}
          {created ? (
            <div style={{ padding: '13px 0', borderRadius: 10, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: '#4ade80', fontWeight: 500 }}>Job created — assign a contractor from Maintenance</p>
            </div>
          ) : (
            <>
              {/* Template PDF URL */}
              <div>
                <p style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 6 }}>
                  Template PDF Link <span style={{ opacity: 0.6 }}>(optional)</span>
                </p>
                <input
                  type="url"
                  value={templateUrl}
                  onChange={e => setTemplateUrl(e.target.value)}
                  placeholder="Paste link to certificate template for contractor…"
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#e8edf5', fontSize: 13, outline: 'none',
                  }}
                />
              </div>
              <button type="button" onClick={handleCreateJob} disabled={creating}
                style={{ width: '100%', padding: '13px 0', borderRadius: 10, background: creating ? 'rgba(251,191,36,0.1)' : 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', fontSize: 14, fontWeight: 500, opacity: creating ? 0.6 : 1 }}>
                {creating ? 'Creating…' : 'Create Job for Contractor'}
              </button>
              {createError && <p style={{ fontSize: 12, color: '#f87171', textAlign: 'center' }}>{createError}</p>}
            </>
          )}
          <button type="button" onClick={onViewProperty}
            style={{ width: '100%', padding: '13px 0', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e8edf5', fontSize: 14, fontWeight: 500 }}>
            View Property
          </button>
          <button type="button" onClick={onClose}
            style={{ width: '100%', padding: '13px 0', borderRadius: 10, background: 'transparent', border: 'none', color: '#8899aa', fontSize: 14 }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function UserDetailPanel({ user, onBack, onViewProperty, onStatusChange, onDelete }: {
  user: UserRow
  onBack: () => void
  onViewProperty: (p: AdminPropRow) => void
  onStatusChange: (userId: string, status: 'active' | 'suspended') => void
  onDelete: (userId: string) => void
}) {
  const [landlordProps, setLandlordProps] = useState<AdminPropRow[]>([])
  const [tenancy, setTenancy] = useState<{ id: string; address: string; monthly_rent: number | null; start_date: string; end_date: string | null } | null>(null)
  const [contractorJobs, setContractorJobs] = useState<MaintenanceRow[]>([])
  const [selectedContractorJob, setSelectedContractorJob] = useState<MaintenanceRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [localStatus, setLocalStatus] = useState(user.status)
  const [confirmSuspend, setConfirmSuspend] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showSetPassword, setShowSetPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [settingPassword, setSettingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [regs, setRegs] = useState<LandlordRegistration[]>([])
  const [regsLoading, setRegsLoading] = useState(false)
  const [showAddReg, setShowAddReg] = useState(false)
  const [newRegNumber, setNewRegNumber] = useState('')
  const [newCouncilArea, setNewCouncilArea] = useState('')
  const [newExpiryDate, setNewExpiryDate] = useState('')
  const [regSaving, setRegSaving] = useState(false)
  const [deletingRegId, setDeletingRegId] = useState<string | null>(null)

  async function loadRegs() {
    setRegsLoading(true)
    const { data } = await supabase
      .from('landlord_registrations')
      .select('id, landlord_id, registration_number, council_area, expiry_date')
      .eq('landlord_id', user.id)
      .order('created_at', { ascending: true })
    setRegs((data ?? []) as LandlordRegistration[])
    setRegsLoading(false)
  }

  async function handleAddReg() {
    if (!newRegNumber.trim()) return
    setRegSaving(true)
    const { error } = await supabase.from('landlord_registrations').insert({
      landlord_id: user.id,
      registration_number: newRegNumber.trim(),
      council_area: newCouncilArea.trim() || null,
      expiry_date: newExpiryDate || null,
    })
    if (!error) {
      await loadRegs()
      setNewRegNumber('')
      setNewCouncilArea('')
      setNewExpiryDate('')
      setShowAddReg(false)
    }
    setRegSaving(false)
  }

  async function handleDeleteReg(id: string) {
    setDeletingRegId(id)
    await supabase.from('landlord_registrations').delete().eq('id', id)
    setRegs(prev => prev.filter(r => r.id !== id))
    setDeletingRegId(null)
  }

  useEffect(() => {
    async function load() {
      if (user.role === 'landlord') {
        const { data } = await supabase
          .from('properties')
          .select('id, address, postcode, property_type, bedrooms, monthly_rent, is_active, status, created_at, landlord_id, description, photo_urls, has_gas, is_listed, available_from, listing_headline, landlord_registration_number, epc_rating, pre_tenancy_check_completed, pre_tenancy_check_date, profiles(full_name, email)')
          .eq('landlord_id', user.id)
          .order('created_at', { ascending: false })
        setLandlordProps((data ?? []) as unknown as AdminPropRow[])
        await loadRegs()
      } else if (user.role === 'tenant') {
        const { data } = await supabase
          .from('tenancies')
          .select('id, monthly_rent, start_date, end_date, properties(address)')
          .eq('tenant_id', user.id)
          .eq('is_current', true)
          .maybeSingle()
        if (data) {
          const raw = data as unknown as { id: string; monthly_rent: number | null; start_date: string; end_date: string | null; properties: { address: string } | null }
          setTenancy({ id: raw.id, address: raw.properties?.address ?? '', monthly_rent: raw.monthly_rent, start_date: raw.start_date, end_date: raw.end_date })
        }
      } else if (user.role === 'contractor') {
        const { data: contractorRow } = await supabase
          .from('contractors')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()
        if (contractorRow?.id) {
          const { data } = await supabase
            .from('maintenance_requests')
            .select('id, title, description, priority, status, created_at, property_id')
            .eq('assigned_contractor_id', contractorRow.id)
            .order('created_at', { ascending: false })
          setContractorJobs((data ?? []) as MaintenanceRow[])
        }
      }
      setLoading(false)
    }
    load()
  }, [user.id])

  const rb = badge(user.role, 'role')
  const isSuspended = localStatus === 'suspended'

  async function handleReinstate() {
    setStatusUpdating(true)
    const { error } = await supabase.from('users').update({ status: 'active' }).eq('id', user.id)
    setStatusUpdating(false)
    if (!error) { setLocalStatus('active'); onStatusChange(user.id, 'active') }
  }

  async function handleSuspendConfirmed() {
    setStatusUpdating(true)
    const { error } = await supabase.from('users').update({ status: 'suspended' }).eq('id', user.id)
    setStatusUpdating(false)
    if (!error) { setLocalStatus('suspended'); setConfirmSuspend(false); onStatusChange(user.id, 'suspended') }
  }

  async function handleDeleteConfirmed() {
    setDeleting(true)
    const { error } = await supabase.functions.invoke('delete-user', {
      body: { userId: user.id },
    })
    setDeleting(false)
    if (!error) { onDelete(user.id); onBack() }
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 8) { setPasswordError('Minimum 8 characters'); return }
    setSettingPassword(true); setPasswordError(null); setPasswordSuccess(false)
    const { error } = await supabase.functions.invoke('set-user-password', {
      body: { userId: user.id, password: newPassword },
    })
    setSettingPassword(false)
    if (error) { setPasswordError('Failed to set password'); return }
    setPasswordSuccess(true)
    setNewPassword('')
    setTimeout(() => { setShowSetPassword(false); setPasswordSuccess(false) }, 1500)
  }

  if (selectedContractorJob) {
    return (
      <MaintenanceDetailPanel
        request={selectedContractorJob}
        onBack={() => setSelectedContractorJob(null)}
        onUpdate={(id, updates) => setContractorJobs(prev => prev.map(j => j.id === id ? { ...j, ...updates } : j))}
      />
    )
  }

  return (
    <div className="flex flex-col" style={{ background: '#0d1b2e', minHeight: '100%' }}>
      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 py-3"
        style={{ background: '#091422', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button type="button" onClick={onBack} className="w-8 h-8 flex items-center justify-center -ml-1 active:opacity-60">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#8899aa"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <p style={{ fontSize: 15, color: '#e8edf5', flex: 1, fontFamily: 'Georgia, serif' }} className="truncate">{user.full_name ?? user.email}</p>
      </header>

      <div className="px-4 py-5 flex flex-col gap-5">
        {/* Profile card */}
        <div style={{ ...CARD, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: 10, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontFamily: 'Georgia, serif', color: '#e8edf5', flexShrink: 0, opacity: isSuspended ? 0.5 : 1 }}>
              {initials(user.full_name, user.email)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 16, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>{user.full_name ?? '—'}</p>
              <p style={{ fontSize: 12, color: '#8899aa', marginTop: 2 }} className="truncate">{user.email}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4, letterSpacing: '0.08em', textTransform: 'capitalize', ...rb }}>{user.role}</span>
            {isSuspended && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 4, background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>Suspended</span>
            )}
          </div>
          {/* Suspend / Reinstate */}
          {user.role !== 'master admin' && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              {isSuspended ? (
                <button type="button" onClick={handleReinstate} disabled={statusUpdating}
                  style={{ width: '100%', padding: '10px 0', borderRadius: 8, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.18)', color: '#4ade80', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  {statusUpdating ? 'Reinstating…' : 'Reinstate Account'}
                </button>
              ) : confirmSuspend ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center' }}>Block this user from logging in?</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setConfirmSuspend(false)}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#8899aa', fontSize: 13 }}>
                      Cancel
                    </button>
                    <button type="button" onClick={handleSuspendConfirmed} disabled={statusUpdating}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 8, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                      {statusUpdating ? 'Suspending…' : 'Confirm Suspend'}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmSuspend(true)}
                  style={{ width: '100%', padding: '10px 0', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#8899aa', fontSize: 13, cursor: 'pointer' }}>
                  Suspend Account
                </button>
              )}
            </div>
          )}
          {/* Set Password */}
          {user.role !== 'master admin' && (
            <div style={{ marginTop: 10 }}>
              {showSetPassword ? (
                <form onSubmit={handleSetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    placeholder="New password (min 8 chars)" autoFocus
                    style={{ ...INPUT_STYLE, fontSize: 13 }} />
                  {passwordError && <p style={{ fontSize: 11, color: '#f87171' }}>{passwordError}</p>}
                  {passwordSuccess && <p style={{ fontSize: 11, color: '#4ade80' }}>Password updated</p>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => { setShowSetPassword(false); setNewPassword(''); setPasswordError(null) }}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#8899aa', fontSize: 13 }}>
                      Cancel
                    </button>
                    <button type="submit" disabled={settingPassword}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 8, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', color: '#60a5fa', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                      {settingPassword ? 'Saving…' : 'Set Password'}
                    </button>
                  </div>
                </form>
              ) : (
                <button type="button" onClick={() => setShowSetPassword(true)}
                  style={{ width: '100%', padding: '10px 0', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#8899aa', fontSize: 13, cursor: 'pointer' }}>
                  Set Password
                </button>
              )}
            </div>
          )}

          {/* Delete */}
          {user.role !== 'master admin' && (
            <div style={{ marginTop: 10 }}>
              {confirmDelete ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: 12, color: '#f87171', textAlign: 'center' }}>Permanently delete this account?</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setConfirmDelete(false)}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#8899aa', fontSize: 13 }}>
                      Cancel
                    </button>
                    <button type="button" onClick={handleDeleteConfirmed} disabled={deleting}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 8, background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      {deleting ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)}
                  style={{ width: '100%', padding: '10px 0', borderRadius: 8, background: 'transparent', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', fontSize: 13, cursor: 'pointer' }}>
                  Delete Account
                </button>
              )}
            </div>
          )}
        </div>

        {/* Role-specific detail */}
        {loading ? (
          <div style={{ ...CARD, height: 120, opacity: 0.4 }} className="animate-pulse" />
        ) : user.role === 'landlord' ? (
          <>
          <div>
            <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 10 }}>
              Properties ({landlordProps.length})
            </p>
            {landlordProps.length === 0 ? (
              <EmptyState icon={<IconHouse />} title="No properties" subtitle="No properties linked to this landlord" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {landlordProps.map(p => {
                  const statusKey = (p.status ?? 'for_let') as PropStatus
                  const statusStyle = PROP_STATUS_STYLE[statusKey]
                  const firstPhoto = p.photo_urls?.[0]
                  return (
                    <button key={p.id} type="button" onClick={() => onViewProperty(p)}
                      style={{ ...CARD, padding: 0, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', width: '100%', border: '1px solid rgba(255,255,255,0.07)' }}>
                      {firstPhoto && (
                        <div style={{ height: 120, overflow: 'hidden' }}>
                          <img src={firstPhoto} alt={p.address} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      )}
                      <div style={{ padding: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                          <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif', flex: 1, minWidth: 0 }} className="truncate">{p.address}</p>
                          <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4, flexShrink: 0, letterSpacing: '0.08em', ...statusStyle }}>{PROP_STATUS_LABEL[statusKey] ?? statusKey}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, fontSize: 11, color: '#8899aa' }}>
                          {p.property_type && <span>{p.property_type.charAt(0).toUpperCase() + p.property_type.slice(1)}</span>}
                          {p.bedrooms != null && <span>{p.bedrooms} bed</span>}
                          {p.monthly_rent != null && <span style={{ marginLeft: 'auto', fontSize: 13, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>{gbp(p.monthly_rent)}/mo</span>}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Landlord registration numbers */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa' }}>
                Registration Numbers
              </p>
              <button
                type="button"
                onClick={() => setShowAddReg(v => !v)}
                style={{ fontSize: 11, color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
              >
                {showAddReg ? 'Cancel' : '+ Add'}
              </button>
            </div>

            {regsLoading ? (
              <div style={{ ...CARD, height: 60, opacity: 0.4 }} />
            ) : regs.length === 0 && !showAddReg ? (
              <div style={{ ...CARD, padding: '14px 16px' }}>
                <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center' }}>No registration numbers on file.</p>
                <p style={{ fontSize: 11, color: '#8899aa', textAlign: 'center', marginTop: 4, lineHeight: 1.4 }}>Add the landlord's Scottish registration number(s) here so they can be selected when creating property listings.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {regs.map(r => {
                  const regExpiry = r.expiry_date ? new Date(r.expiry_date) : null
                  const today = new Date()
                  const in90 = new Date(); in90.setDate(today.getDate() + 90)
                  const regExpired = regExpiry ? regExpiry < today : false
                  const regExpiring = regExpiry ? regExpiry >= today && regExpiry <= in90 : false
                  const expiryColor = regExpired ? '#f87171' : regExpiring ? '#fbbf24' : '#4ade80'
                  return (
                    <div key={r.id} style={{ ...CARD, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, borderColor: regExpired ? 'rgba(248,113,113,0.3)' : regExpiring ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.07)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>{r.registration_number}</p>
                        {r.council_area && <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>{r.council_area}</p>}
                        {regExpiry && (
                          <p style={{ fontSize: 10, color: expiryColor, marginTop: 3 }}>
                            {regExpired ? 'Expired' : 'Expires'} {fmtDate(r.expiry_date)}
                            {regExpired && ' — renew immediately'}
                            {regExpiring && !regExpired && ' — renewing soon'}
                          </p>
                        )}
                        {!regExpiry && (
                          <p style={{ fontSize: 10, color: '#8899aa', marginTop: 3 }}>No expiry recorded — add renewal date</p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={deletingRegId === r.id}
                        onClick={() => handleDeleteReg(r.id)}
                        style={{ padding: '5px 10px', borderRadius: 6, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                      >
                        {deletingRegId === r.id ? '…' : 'Remove'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {showAddReg && (
              <div style={{ ...CARD, padding: '14px 16px', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 5 }}>Registration Number</p>
                  <input
                    type="text"
                    placeholder="e.g. 123456/250/12345"
                    value={newRegNumber}
                    onChange={e => setNewRegNumber(e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#e8edf5', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 5 }}>Council Area <span style={{ color: '#8899aa', fontWeight: 400 }}>(optional)</span></p>
                  <input
                    type="text"
                    placeholder="e.g. Dundee City"
                    value={newCouncilArea}
                    onChange={e => setNewCouncilArea(e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#e8edf5', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 5 }}>Expiry Date <span style={{ color: '#8899aa', fontWeight: 400 }}>(renewal required every 3 years)</span></p>
                  <input
                    type="date"
                    value={newExpiryDate}
                    onChange={e => setNewExpiryDate(e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#e8edf5', outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }}
                  />
                </div>
                <button
                  type="button"
                  disabled={regSaving || !newRegNumber.trim()}
                  onClick={handleAddReg}
                  style={{
                    padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 500,
                    background: newRegNumber.trim() ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${newRegNumber.trim() ? 'rgba(96,165,250,0.3)' : 'rgba(255,255,255,0.07)'}`,
                    color: newRegNumber.trim() ? '#60a5fa' : '#8899aa',
                    cursor: newRegNumber.trim() && !regSaving ? 'pointer' : 'not-allowed',
                  }}
                >
                  {regSaving ? 'Saving…' : 'Save Registration Number'}
                </button>
              </div>
            )}
          </div>
          </>
        ) : user.role === 'tenant' ? (
          <div>
            <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 10 }}>Current Tenancy</p>
            {!tenancy ? (
              <EmptyState icon={<IconHouse />} title="No active tenancy" subtitle="This tenant has not been linked to a property" />
            ) : (
              <div style={{ ...CARD, padding: 16 }}>
                <p style={{ fontSize: 15, color: '#e8edf5', fontFamily: 'Georgia, serif', marginBottom: 8 }}>{tenancy.address}</p>
                {tenancy.monthly_rent != null && (
                  <p style={{ fontSize: 22, color: '#e8edf5', fontFamily: 'Georgia, serif', fontWeight: 300, marginBottom: 8 }}>{gbp(tenancy.monthly_rent)}<span style={{ fontSize: 12, color: '#8899aa' }}>/mo</span></p>
                )}
                <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#8899aa' }}>
                  <span>From {fmtDate(tenancy.start_date)}</span>
                  {tenancy.end_date ? <span>To {fmtDate(tenancy.end_date)}</span> : <span>Ongoing</span>}
                </div>
              </div>
            )}
          </div>
        ) : user.role === 'contractor' ? (
          <div>
            <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 10 }}>
              Assigned Jobs ({contractorJobs.length})
            </p>
            {contractorJobs.length === 0 ? (
              <EmptyState icon={<IconWrench />} title="No assigned jobs" subtitle="No maintenance requests assigned to this contractor" />
            ) : (
              <div style={CARD}>
                {contractorJobs.map((r, i) => {
                  const sb = badge(r.status)
                  const pb = badge(r.priority, 'priority')
                  return (
                    <div key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedContractorJob(r)}
                        style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '13px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}
                        className="active:opacity-60"
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }} className="truncate">{r.title ?? 'Untitled'}</p>
                          {r.description && <p style={{ fontSize: 12, color: '#8899aa', marginTop: 2 }} className="truncate">{r.description}</p>}
                          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                            {r.priority && <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, ...pb, textTransform: 'capitalize' }}>{r.priority}</span>}
                            {r.created_at && <span style={{ fontSize: 10, color: '#8899aa' }}>{fmtDate(r.created_at)}</span>}
                          </div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0, ...sb }}>
                          {r.status ?? 'open'}
                        </span>
                      </button>
                      {i < contractorJobs.length - 1 && <div style={DIVIDER} />}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div style={{ ...CARD, padding: 16 }}>
            <p style={{ fontSize: 12, color: '#8899aa' }}>Admin accounts have full access to the dashboard.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function MaintenanceDetailPanel({ request, onBack, onUpdate }: {
  request: MaintenanceRow
  onBack: () => void
  onUpdate?: (id: string, updates: Partial<MaintenanceRow>) => void
}) {
  type HistEntry = { id: string; old_status: string | null; new_status: string | null; notes: string | null; created_at: string }
  type FullRequest = { tenant_id: string | null; tenancy_id: string | null; assigned_contractor_id: string | null; updated_at: string | null; resolved_at: string | null; photo_urls: string[] | null; completion_photo_urls: string[] | null; completion_document_url: string | null; request_type: string | null; cost: number | null; compliance_template_url: string | null }
  type ContractorOption = { id: string; business_name: string | null; full_name: string | null; email: string }
  type InvoiceRow = { id: string; invoice_number: string; total: number; status: string; description: string | null; created_at: string }
  type CommentRow = { id: string; author_id: string | null; author_name: string | null; body: string; created_at: string }

  const [fullReq, setFullReq] = useState<FullRequest | null>(null)
  const [history, setHistory] = useState<HistEntry[]>([])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [comments, setComments] = useState<CommentRow[]>([])
  const [commentBody, setCommentBody] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [costInput, setCostInput] = useState('')
  const [costSaving, setCostSaving] = useState(false)
  const [tenantName, setTenantName] = useState<string | null>(null)
  const [contractorName, setContractorName] = useState<string | null>(null)
  const [propertyAddress, setPropertyAddress] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [localStatus, setLocalStatus] = useState(request.status ?? 'open')
  const [actionSaving, setActionSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showAssignSheet, setShowAssignSheet] = useState(false)
  const [contractors, setContractors] = useState<ContractorOption[]>([])
  const [contractorsLoading, setContractorsLoading] = useState(false)
  const [contractorsError, setContractorsError] = useState<string | null>(null)

  // Admin create-invoice state
  type AdminLineItem = { key: string; description: string; quantity: string; unit_price: string }
  const newAdminLine = (): AdminLineItem => ({ key: String(Date.now() + Math.random()), description: '', quantity: '1', unit_price: '' })
  const [showCreateInvoice, setShowCreateInvoice] = useState(false)
  const [adminInvLines, setAdminInvLines] = useState<AdminLineItem[]>([newAdminLine()])
  const [adminInvVat, setAdminInvVat] = useState(false)
  const [adminInvDesc, setAdminInvDesc] = useState('')
  const [adminInvNotes, setAdminInvNotes] = useState('')
  const [adminInvSaving, setAdminInvSaving] = useState(false)
  const [adminInvError, setAdminInvError] = useState<string | null>(null)

  const { user: adminUser } = useAuth()

  useEffect(() => {
    async function load() {
      const [reqRes, histRes, invRes, commRes] = await Promise.all([
        supabase.from('maintenance_requests')
          .select('tenant_id, tenancy_id, assigned_contractor_id, updated_at, resolved_at, photo_urls, completion_photo_urls, completion_document_url, request_type, cost, compliance_template_url')
          .eq('id', request.id).maybeSingle(),
        supabase.from('maintenance_status_history')
          .select('id, old_status, new_status, notes, created_at')
          .eq('maintenance_request_id', request.id)
          .order('created_at', { ascending: true }),
        supabase.from('contractor_invoices')
          .select('id, invoice_number, total, status, description, created_at')
          .eq('maintenance_request_id', request.id)
          .order('created_at', { ascending: true }),
        supabase.from('maintenance_comments')
          .select('id, author_id, author_name, body, created_at')
          .eq('maintenance_request_id', request.id)
          .order('created_at', { ascending: true }),
      ])
      const full = (reqRes.data as FullRequest | null)
      setFullReq(full)
      setHistory((histRes.data ?? []) as HistEntry[])
      setInvoices((invRes.data ?? []) as InvoiceRow[])
      setComments((commRes.data ?? []) as CommentRow[])

      const lookups: Promise<void>[] = []
      if (full?.tenant_id) {
        lookups.push((async () => {
          const { data: u } = await supabase.from('users').select('full_name, email').eq('id', full.tenant_id!).maybeSingle()
          if (u) { const user = u as { full_name: string | null; email: string }; setTenantName(user.full_name || user.email || null) }
        })())
      } else if (full?.tenancy_id) {
        lookups.push((async () => {
          const { data: ten } = await supabase.from('tenancies').select('tenant_id').eq('id', full.tenancy_id!).maybeSingle()
          const tid = (ten as { tenant_id: string | null } | null)?.tenant_id
          if (tid) {
            const { data: u } = await supabase.from('users').select('full_name, email').eq('id', tid).maybeSingle()
            if (u) { const user = u as { full_name: string | null; email: string }; setTenantName(user.full_name || user.email || null) }
          }
        })())
      }
      if (request.property_id) {
        lookups.push((async () => {
          const { data: prop } = await supabase.from('properties').select('address').eq('id', request.property_id!).maybeSingle()
          if (prop) setPropertyAddress((prop as { address: string }).address)
        })())
      }
      if (full?.assigned_contractor_id) {
        lookups.push(
          (async () => {
            const { data: c } = await supabase.from('contractors')
              .select('business_name, user_id')
              .eq('id', full.assigned_contractor_id)
              .maybeSingle()
            if (!c) return
            const contractor = c as { business_name: string | null; user_id: string | null }
            if (contractor.user_id) {
              const { data: u } = await supabase.from('users')
                .select('full_name, email')
                .eq('id', String(contractor.user_id))
                .maybeSingle()
              const user = u as { full_name: string | null; email: string } | null
              setContractorName(user?.full_name || contractor.business_name || user?.email || null)
            } else {
              setContractorName(contractor.business_name || null)
            }
          })()
        )
      }
      await Promise.all(lookups)
      setLoading(false)
    }
    load()
  }, [request.id])

  async function openAssignSheet() {
    setShowAssignSheet(true)
    if (contractors.length > 0) return
    setContractorsLoading(true)
    setContractorsError(null)
    try {
      const { data: contractorRows, error: contractorsQueryError } = await supabase.from('contractors')
        .select('id, business_name, user_id')
        .order('business_name', { nullsFirst: false })
      if (contractorsQueryError) throw contractorsQueryError
      const rows = (contractorRows ?? []) as { id: string; business_name: string | null; user_id: string | null }[]
      const userIds = rows.map(r => r.user_id).filter((id): id is string => typeof id === 'string' && id.length > 0)
      let nameMap: Record<string, { full_name: string | null; email: string }> = {}
      if (userIds.length > 0) {
        const { data: userRows } = await supabase.from('users').select('id, full_name, email').in('id', userIds)
        for (const u of (userRows ?? []) as { id: string; full_name: string | null; email: string }[]) {
          nameMap[u.id] = { full_name: u.full_name, email: u.email }
        }
      }
      const mapped: ContractorOption[] = rows.map(r => {
        const userInfo = r.user_id ? (nameMap[r.user_id] ?? null) : null
        return { id: r.id, business_name: r.business_name, full_name: userInfo?.full_name ?? null, email: userInfo?.email ?? '' }
      })
      setContractors(mapped)
    } catch (err) {
      setContractorsError('Failed to load contractors. Please try again.')
      console.error('openAssignSheet error:', err)
    } finally {
      setContractorsLoading(false)
    }
  }

  async function handlePickUp() {
    setActionSaving(true)
    setActionError(null)
    try {
      const newStatus = 'in_progress'
      const now = new Date().toISOString()
      const { data: updatedRows, error: upErr } = await supabase.from('maintenance_requests')
        .update({ status: newStatus, updated_at: now })
        .eq('id', request.id)
        .select('id')
      if (upErr) throw upErr
      if (!updatedRows || updatedRows.length === 0) {
        setActionError('Failed to pick up — request could not be updated.')
        return
      }
      await supabase.from('maintenance_status_history').insert({
        maintenance_request_id: request.id,
        old_status: localStatus,
        new_status: newStatus,
        notes: 'Picked up by admin',
      })
      const newEntry: HistEntry = { id: crypto.randomUUID(), old_status: localStatus, new_status: newStatus, notes: 'Picked up by admin', created_at: now }
      setHistory(prev => [...prev, newEntry])
      setLocalStatus(newStatus)
      setFullReq(prev => prev ? { ...prev, updated_at: now } : prev)
      onUpdate?.(request.id, { status: newStatus })
    } catch (err) {
      console.error('handlePickUp error:', err)
      setActionError('Failed to pick up request.')
    } finally {
      setActionSaving(false)
    }
  }

  async function handleAcceptWork() {
    setActionSaving(true)
    setActionError(null)
    try {
      const newStatus = 'resolved'
      const now = new Date().toISOString()
      const { data: updatedRows, error: upErr } = await supabase.from('maintenance_requests')
        .update({ status: newStatus, updated_at: now, resolved_at: now })
        .eq('id', request.id)
        .select('id')
      if (upErr) throw upErr
      if (!updatedRows || updatedRows.length === 0) {
        setActionError('Failed to accept — request could not be updated.')
        return
      }
      await supabase.from('maintenance_status_history').insert({
        maintenance_request_id: request.id,
        old_status: localStatus,
        new_status: newStatus,
        notes: 'Work accepted by admin',
      })
      const newEntry: HistEntry = { id: crypto.randomUUID(), old_status: localStatus, new_status: newStatus, notes: 'Work accepted by admin', created_at: now }
      setHistory(prev => [...prev, newEntry])
      setLocalStatus(newStatus)
      setFullReq(prev => prev ? { ...prev, updated_at: now, resolved_at: now } : prev)
      onUpdate?.(request.id, { status: newStatus })
    } catch (err) {
      console.error('handleAcceptWork error:', err)
      setActionError('Failed to accept work.')
    } finally {
      setActionSaving(false)
    }
  }

  async function handleSendBack() {
    setActionSaving(true)
    setActionError(null)
    try {
      const newStatus = 'in_progress'
      const now = new Date().toISOString()
      const { data: updatedRows, error: upErr } = await supabase.from('maintenance_requests')
        .update({ status: newStatus, updated_at: now })
        .eq('id', request.id)
        .select('id')
      if (upErr) throw upErr
      if (!updatedRows || updatedRows.length === 0) {
        setActionError('Failed to send back — request could not be updated.')
        return
      }
      await supabase.from('maintenance_status_history').insert({
        maintenance_request_id: request.id,
        old_status: localStatus,
        new_status: newStatus,
        notes: 'Work sent back by admin',
      })
      const newEntry: HistEntry = { id: crypto.randomUUID(), old_status: localStatus, new_status: newStatus, notes: 'Work sent back by admin', created_at: now }
      setHistory(prev => [...prev, newEntry])
      setLocalStatus(newStatus)
      onUpdate?.(request.id, { status: newStatus })
    } catch (err) {
      console.error('handleSendBack error:', err)
      setActionError('Failed to send back.')
    } finally {
      setActionSaving(false)
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = commentBody.trim()
    if (!trimmed) return
    setCommentSaving(true)
    setCommentError(null)
    const authorName = adminUser?.full_name || adminUser?.email || 'Admin'
    const { data, error } = await supabase.from('maintenance_comments').insert({
      maintenance_request_id: request.id,
      author_id: adminUser?.id ?? null,
      author_name: authorName,
      body: trimmed,
    }).select('id, author_id, author_name, body, created_at').single()
    setCommentSaving(false)
    if (error) {
      setCommentError('Failed to save note. Please try again.')
      return
    }
    const optimistic: CommentRow = data ?? {
      id: crypto.randomUUID(),
      author_id: adminUser?.id ?? null,
      author_name: authorName,
      body: trimmed,
      created_at: new Date().toISOString(),
    }
    setComments(prev => [...prev, optimistic])
    setCommentBody('')
  }

  function calcAdminLine(li: AdminLineItem) {
    return Math.round((parseFloat(li.quantity) || 0) * (parseFloat(li.unit_price) || 0) * 100) / 100
  }
  function adminInvTotals() {
    const subtotal = Math.round(adminInvLines.reduce((s, li) => s + calcAdminLine(li), 0) * 100) / 100
    const vatAmount = adminInvVat ? Math.round(subtotal * 0.20 * 100) / 100 : 0
    return { subtotal, vatAmount, total: Math.round((subtotal + vatAmount) * 100) / 100 }
  }

  async function handleAdminCreateInvoice() {
    const valid = adminInvLines.filter(li => li.description.trim() && parseFloat(li.unit_price) > 0)
    if (valid.length === 0) { setAdminInvError('Add at least one line item with a description and price.'); return }
    if (!fullReq?.assigned_contractor_id) { setAdminInvError('No contractor assigned to this job.'); return }
    setAdminInvSaving(true); setAdminInvError(null)
    const { subtotal, vatAmount, total } = adminInvTotals()
    const now = new Date()
    const invNum = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 9000) + 1000)}`
    const { data, error } = await supabase.from('contractor_invoices').insert({
      contractor_id: fullReq.assigned_contractor_id,
      maintenance_request_id: request.id,
      invoice_number: invNum,
      description: adminInvDesc.trim() || null,
      line_items: valid.map(li => ({ description: li.description, quantity: parseFloat(li.quantity) || 1, unit_price: parseFloat(li.unit_price) || 0, amount: calcAdminLine(li) })),
      subtotal, vat_rate: adminInvVat ? 20 : 0, vat_amount: vatAmount, total,
      status: 'submitted',
      notes: adminInvNotes.trim() || null,
    }).select('id, invoice_number, total, status, description, created_at').single()
    setAdminInvSaving(false)
    if (error) { setAdminInvError('Failed to create invoice. Please try again.'); return }
    if (data) setInvoices(prev => [...prev, data as InvoiceRow])
    setShowCreateInvoice(false)
    setAdminInvLines([newAdminLine()]); setAdminInvVat(false); setAdminInvDesc(''); setAdminInvNotes(''); setAdminInvError(null)
  }

  async function handleApproveInvoice(invoiceId: string) {
    setActionSaving(true)
    setActionError(null)
    try {
      const { error } = await supabase.from('contractor_invoices').update({ status: 'approved' }).eq('id', invoiceId)
      if (error) throw error
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, status: 'approved' } : inv))
    } catch (err) {
      console.error('handleApproveInvoice error:', err)
      setActionError('Failed to approve invoice.')
    } finally {
      setActionSaving(false)
    }
  }

  async function handleRejectInvoice(invoiceId: string) {
    setActionSaving(true)
    setActionError(null)
    try {
      const { error } = await supabase.from('contractor_invoices').update({ status: 'rejected' }).eq('id', invoiceId)
      if (error) throw error
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, status: 'rejected' } : inv))
    } catch (err) {
      console.error('handleRejectInvoice error:', err)
      setActionError('Failed to reject invoice.')
    } finally {
      setActionSaving(false)
    }
  }

  async function handleRecordCost() {
    const val = parseFloat(costInput)
    if (!val || val <= 0) return
    setCostSaving(true)
    setActionError(null)
    try {
      const { error } = await supabase.from('maintenance_requests').update({ cost: val }).eq('id', request.id)
      if (error) throw error
      setFullReq(prev => prev ? { ...prev, cost: val } : prev)
      setCostInput('')
    } catch (err) {
      console.error('handleRecordCost error:', err)
      setActionError('Failed to record cost.')
    } finally {
      setCostSaving(false)
    }
  }

  async function handleAssign(contractor: ContractorOption) {
    setActionSaving(true)
    setActionError(null)
    try {
      const newStatus = 'assigned'
      const now = new Date().toISOString()
      const displayName = contractor.business_name || contractor.full_name || contractor.email
      const { data: updatedRows, error: upErr } = await supabase.from('maintenance_requests')
        .update({ status: newStatus, assigned_contractor_id: contractor.id, updated_at: now })
        .eq('id', request.id)
        .select('id')
      if (upErr) throw upErr
      if (!updatedRows || updatedRows.length === 0) {
        setActionError('Assignment failed — request could not be updated. Check your permissions.')
        setShowAssignSheet(false)
        return
      }
      await supabase.from('maintenance_status_history').insert({
        maintenance_request_id: request.id,
        old_status: localStatus,
        new_status: newStatus,
        notes: `Assigned to ${displayName}`,
      })
      const newEntry: HistEntry = { id: crypto.randomUUID(), old_status: localStatus, new_status: newStatus, notes: `Assigned to ${displayName}`, created_at: now }
      setHistory(prev => [...prev, newEntry])
      setLocalStatus(newStatus)
      setContractorName(displayName)
      setFullReq(prev => prev ? { ...prev, assigned_contractor_id: contractor.id, updated_at: now } : prev)
      onUpdate?.(request.id, { status: newStatus })
      setShowAssignSheet(false)
    } catch (err) {
      console.error('handleAssign error:', err)
      setActionError('Failed to assign contractor.')
      setShowAssignSheet(false)
    } finally {
      setActionSaving(false)
    }
  }

  const STATUS_LABEL: Record<string, string> = { open: 'Open', assigned: 'Assigned', in_progress: 'In Progress', pending_review: 'Pending Review', resolved: 'Resolved', closed: 'Closed' }
  const sb = badge(localStatus)
  const pb = badge(request.priority, 'priority')
  const isResolved = localStatus === 'resolved' || localStatus === 'closed'
  const isOpen = localStatus === 'open'
  const isPendingReview = localStatus === 'pending_review'
  const hasApprovedFinancial = invoices.some(inv => inv.status === 'approved') || (fullReq?.cost != null && Number(fullReq.cost) > 0)

  const { subtotal: aSubtotal, vatAmount: aVat, total: aTotal } = adminInvTotals()

  return (
    <div className="flex flex-col" style={{ background: '#0d1b2e', minHeight: '100%' }}>

      {/* Admin create-invoice overlay */}
      {showCreateInvoice && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#0a192f', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <button type="button" onClick={() => { setShowCreateInvoice(false); setAdminInvError(null) }}
              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8899aa', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            </button>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e8edf5', fontFamily: 'Georgia, serif', margin: 0 }}>Create Invoice</h2>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <p style={{ fontSize: 10, color: '#8899aa', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Job</p>
              <p style={{ fontSize: 13, color: '#e8edf5' }}>{request.title ?? 'Untitled'}</p>
            </div>
            <div>
              <p style={{ fontSize: 10, color: '#8899aa', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Description (optional)</p>
              <input type="text" placeholder="e.g. Plumbing repair — bathroom" value={adminInvDesc} onChange={e => setAdminInvDesc(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e8edf5', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <p style={{ fontSize: 10, color: '#8899aa', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Line Items</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {adminInvLines.map((li, idx) => (
                  <div key={li.key} style={{ ...CARD, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <p style={{ fontSize: 11, color: '#8899aa', letterSpacing: '0.08em' }}>ITEM {idx + 1}</p>
                      {adminInvLines.length > 1 && (
                        <button type="button" onClick={() => setAdminInvLines(prev => prev.filter(l => l.key !== li.key))}
                          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px' }}>×</button>
                      )}
                    </div>
                    <input type="text" placeholder="Description" value={li.description}
                      onChange={e => setAdminInvLines(prev => prev.map(l => l.key === li.key ? { ...l, description: e.target.value } : l))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e8edf5', fontSize: 13, outline: 'none', marginBottom: 8, boxSizing: 'border-box' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {(['Qty', 'Unit Price (£)', 'Amount'] as const).map((label, fi) => (
                        <div key={label}>
                          <p style={{ fontSize: 10, color: '#8899aa', marginBottom: 4 }}>{label}</p>
                          {fi < 2 ? (
                            <input type="number" min="0" step={fi === 0 ? '0.5' : '0.01'} placeholder="0.00"
                              value={fi === 0 ? li.quantity : li.unit_price}
                              onChange={e => setAdminInvLines(prev => prev.map(l => l.key === li.key ? { ...l, [fi === 0 ? 'quantity' : 'unit_price']: e.target.value } : l))}
                              style={{ width: '100%', padding: '7px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e8edf5', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                          ) : (
                            <div style={{ padding: '7px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#4ade80', fontSize: 13 }}>
                              £{calcAdminLine(li).toFixed(2)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setAdminInvLines(prev => [...prev, newAdminLine()])}
                style={{ marginTop: 10, width: '100%', padding: '10px', background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 8, color: '#8899aa', fontSize: 13, cursor: 'pointer' }}>
                + Add Item
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 14, color: '#e8edf5' }}>Include VAT (20%)</p>
                <p style={{ fontSize: 12, color: '#8899aa', marginTop: 2 }}>UK standard rate</p>
              </div>
              <button type="button" onClick={() => setAdminInvVat(v => !v)}
                style={{ width: 48, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer', background: adminInvVat ? '#60a5fa' : 'rgba(255,255,255,0.12)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 4, left: adminInvVat ? 24 : 4, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </button>
            </div>
            <div style={{ ...CARD, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <p style={{ fontSize: 13, color: '#8899aa' }}>Subtotal</p>
                <p style={{ fontSize: 13, color: '#e8edf5' }}>£{aSubtotal.toFixed(2)}</p>
              </div>
              {adminInvVat && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <p style={{ fontSize: 13, color: '#8899aa' }}>VAT (20%)</p>
                  <p style={{ fontSize: 13, color: '#e8edf5' }}>£{aVat.toFixed(2)}</p>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#e8edf5' }}>Total</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#4ade80', fontFamily: 'Georgia, serif' }}>£{aTotal.toFixed(2)}</p>
              </div>
            </div>
            <div>
              <p style={{ fontSize: 10, color: '#8899aa', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Notes (optional)</p>
              <textarea placeholder="Payment terms, bank details…" value={adminInvNotes} onChange={e => setAdminInvNotes(e.target.value)} rows={2}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e8edf5', fontSize: 13, outline: 'none', resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ padding: '10px 16px 20px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            {adminInvError && <p style={{ fontSize: 12, color: '#f87171', textAlign: 'center', margin: 0 }}>{adminInvError}</p>}
            <button type="button" onClick={handleAdminCreateInvoice} disabled={adminInvSaving}
              style={{ width: '100%', padding: '13px 0', background: adminInvSaving ? 'rgba(96,165,250,0.3)' : 'linear-gradient(135deg, #1a4a7a, #0f3460)', border: '1px solid rgba(96,165,250,0.4)', borderRadius: 10, color: '#e8edf5', fontSize: 14, fontWeight: 500, cursor: adminInvSaving ? 'not-allowed' : 'pointer' }}>
              {adminInvSaving ? 'Saving…' : 'Submit Invoice'}
            </button>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 py-3"
        style={{ background: '#091422', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button type="button" onClick={onBack} className="w-8 h-8 flex items-center justify-center -ml-1 active:opacity-60">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#8899aa"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <p style={{ fontSize: 15, color: '#e8edf5', flex: 1, fontFamily: 'Georgia, serif' }} className="truncate">{request.title ?? 'Untitled'}</p>
      </header>

      <div className="px-4 py-5 flex flex-col gap-4">
        {/* Summary card */}
        <div style={{ ...CARD, padding: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: request.description ? 12 : 0 }}>
            <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4, letterSpacing: '0.08em', textTransform: 'uppercase', ...sb }}>
              {STATUS_LABEL[localStatus] ?? localStatus}
            </span>
            {request.priority && (
              <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 4, ...pb, textTransform: 'capitalize' }}>
                {request.priority} priority
              </span>
            )}
          </div>
          {request.description && <p style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.5 }}>{request.description}</p>}
          {propertyAddress && (
            <p style={{ fontSize: 12, color: '#8899aa', marginTop: request.description ? 8 : 0, display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
              {propertyAddress}
            </p>
          )}
        </div>

        {/* Internal comments */}
        <div>
          <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 10 }}>
            Internal Notes ({comments.length})
          </p>
          <div style={{ ...CARD }}>
            {comments.length === 0 ? (
              <p style={{ fontSize: 12, color: '#8899aa', padding: '12px 16px' }}>No notes yet.</p>
            ) : (
              <div>
                {comments.map((c, i) => (
                  <div key={c.id}>
                    <div style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#e8edf5', flexShrink: 0, fontWeight: 600 }}>
                          {(c.author_name ?? 'A')[0].toUpperCase()}
                        </div>
                        <span style={{ fontSize: 11, color: '#e8edf5', fontWeight: 500 }}>{c.author_name ?? 'Admin'}</span>
                        <span style={{ fontSize: 10, color: '#8899aa', marginLeft: 'auto' }}>{fmtDate(c.created_at)}</span>
                      </div>
                      <p style={{ fontSize: 13, color: '#c8d4e0', lineHeight: 1.55, paddingLeft: 32 }}>{c.body}</p>
                    </div>
                    {i < comments.length - 1 && <div style={DIVIDER} />}
                  </div>
                ))}
              </div>
            )}
            <div style={{ borderTop: comments.length > 0 ? '1px solid rgba(255,255,255,0.07)' : 'none', padding: '12px 16px' }}>
              <form onSubmit={handleAddComment} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  value={commentBody}
                  onChange={e => { setCommentBody(e.target.value); setCommentError(null) }}
                  placeholder="Add an internal note…"
                  rows={2}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6, padding: '8px 10px', fontSize: 13, color: '#e8edf5', resize: 'vertical',
                    outline: 'none', lineHeight: 1.5,
                  }}
                />
                {commentError && <p style={{ fontSize: 11, color: '#f87171', margin: 0 }}>{commentError}</p>}
                <button
                  type="submit"
                  disabled={!commentBody.trim() || commentSaving}
                  style={{
                    alignSelf: 'flex-end', padding: '6px 16px', borderRadius: 6, fontSize: 11,
                    letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600,
                    background: commentBody.trim() && !commentSaving ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                    color: commentBody.trim() && !commentSaving ? '#e8edf5' : '#8899aa',
                    border: 'none', cursor: commentBody.trim() && !commentSaving ? 'pointer' : 'default',
                    transition: 'background 0.15s',
                  }}
                >
                  {commentSaving ? 'Saving…' : 'Add Note'}
                </button>
              </form>
            </div>
          </div>
        </div>

        {!loading && fullReq?.request_type === 'compliance' ? (
          /* Compliance job — template link + submitted PDF */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {fullReq.compliance_template_url && (
              <div>
                <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#60a5fa', marginBottom: 8 }}>
                  Certificate Template
                </p>
                <a
                  href={fullReq.compliance_template_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 14px', borderRadius: 10,
                    background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)',
                    color: '#60a5fa', textDecoration: 'none',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15h8v2H8zm0-4h8v2H8z"/>
                  </svg>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500 }}>View Template PDF</p>
                    <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>Provided for contractor reference</p>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 'auto', flexShrink: 0, opacity: 0.5 }}>
                    <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
                  </svg>
                </a>
              </div>
            )}
            <div>
              <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: fullReq.completion_document_url ? '#4ade80' : '#fbbf24', marginBottom: 8 }}>
                Updated Certificate
              </p>
              {fullReq.completion_document_url ? (
                <a
                  href={fullReq.completion_document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 14px', borderRadius: 10,
                    background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)',
                    color: '#4ade80', textDecoration: 'none',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15h8v2H8zm0-4h8v2H8z"/>
                  </svg>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500 }}>Certificate PDF</p>
                    <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>Submitted by contractor</p>
                  </div>
                </a>
              ) : (
                <p style={{ fontSize: 12, color: '#8899aa' }}>Contractor has not yet uploaded the updated certificate.</p>
              )}
            </div>
          </div>
        ) : !loading && (
          <>
            {/* Reported photos (tenant) */}
            {(fullReq?.photo_urls?.length ?? 0) > 0 && (
              <div>
                <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 8 }}>Reported Photos</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {fullReq!.photo_urls!.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                      style={{ width: 96, height: 96, borderRadius: 8, overflow: 'hidden', flexShrink: 0, display: 'block', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <img src={url} alt={`Reported photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Completion photos (contractor) */}
            {(fullReq?.photo_urls?.length ?? 0) > 0 && (
              <div>
                <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: (fullReq?.completion_photo_urls?.length ?? 0) > 0 ? '#4ade80' : '#fbbf24', marginBottom: 8 }}>
                  Completion Photos {(fullReq?.completion_photo_urls?.length ?? 0) === 0 ? '— awaiting contractor' : ''}
                </p>
                {(fullReq?.completion_photo_urls?.length ?? 0) > 0 ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {fullReq!.completion_photo_urls!.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                        style={{ width: 96, height: 96, borderRadius: 8, overflow: 'hidden', flexShrink: 0, display: 'block', border: '1px solid rgba(74,222,128,0.2)' }}>
                        <img src={url} alt={`Completion photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: '#8899aa' }}>Contractor has not yet uploaded a completion photo.</p>
                )}
              </div>
            )}
          </>
        )}

        {/* Allocation status + actions */}
        {!loading && (
          <div style={{ ...CARD, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', margin: 0 }}>Allocation</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: tenantName ? '#60a5fa' : '#8899aa', flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 12, color: '#8899aa' }}>Reported by</p>
                <p style={{ fontSize: 13, color: '#e8edf5', fontWeight: 500 }}>{tenantName ?? 'Tenant'}</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: history.length > 0 ? '#fbbf24' : '#8899aa', flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 12, color: '#8899aa' }}>Staff picked up</p>
                  <p style={{ fontSize: 13, color: history.length > 0 ? '#e8edf5' : '#8899aa', fontWeight: 500 }}>{history.length > 0 ? 'Yes' : 'Not yet'}</p>
                </div>
              </div>
              {isOpen && (
                <button type="button" onClick={handlePickUp} disabled={actionSaving}
                  style={{ padding: '7px 14px', borderRadius: 8, background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', fontSize: 12, fontWeight: 600, opacity: actionSaving ? 0.5 : 1 }}>
                  {actionSaving ? 'Saving…' : 'Pick Up'}
                </button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: contractorName ? '#4ade80' : '#8899aa', flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 12, color: '#8899aa' }}>Maintenance allocated</p>
                  <p style={{ fontSize: 13, color: contractorName ? '#e8edf5' : '#8899aa', fontWeight: 500 }}>{contractorName ?? 'Not assigned'}</p>
                </div>
              </div>
              {!isResolved && (
                <button type="button" onClick={openAssignSheet} disabled={actionSaving}
                  style={{ padding: '7px 14px', borderRadius: 8, background: contractorName ? 'rgba(74,222,128,0.1)' : 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontSize: 12, fontWeight: 600, opacity: actionSaving ? 0.5 : 1, flexShrink: 0 }}>
                  {contractorName ? 'Reassign' : 'Assign'}
                </button>
              )}
            </div>
            {isPendingReview && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12 }}>
                <p style={{ fontSize: 12, color: '#8899aa' }}>Contractor has marked this job complete.</p>
                {!hasApprovedFinancial && (
                  <button type="button" onClick={handleSendBack} disabled={actionSaving}
                    style={{ marginTop: 10, width: '100%', padding: '9px 0', borderRadius: 8, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', fontSize: 13, fontWeight: 600, opacity: actionSaving ? 0.5 : 1 }}>
                    {actionSaving ? 'Saving…' : 'Send Back'}
                  </button>
                )}
              </div>
            )}
            {!isResolved && hasApprovedFinancial && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={handleAcceptWork} disabled={actionSaving}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 8, background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontSize: 13, fontWeight: 600, opacity: actionSaving ? 0.5 : 1 }}>
                    {actionSaving ? 'Saving…' : 'Mark Resolved'}
                  </button>
                  {isPendingReview && (
                    <button type="button" onClick={handleSendBack} disabled={actionSaving}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 8, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', fontSize: 13, fontWeight: 600, opacity: actionSaving ? 0.5 : 1 }}>
                      {actionSaving ? 'Saving…' : 'Send Back'}
                    </button>
                  )}
                </div>
              </div>
            )}
            {actionError && <p style={{ fontSize: 12, color: '#f87171', marginTop: 4 }}>{actionError}</p>}
          </div>
        )}

        {/* Invoices */}
        {!loading && (
          <div style={{ ...CARD, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: invoices.length > 0 ? 12 : 0 }}>
              <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', margin: 0 }}>Invoices ({invoices.length})</p>
              <button
                type="button"
                onClick={() => setShowCreateInvoice(true)}
                style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)', color: '#60a5fa', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, cursor: 'pointer' }}
              >
                + Create Invoice
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {invoices.map(inv => {
                const invStatusColor = inv.status === 'approved' ? '#4ade80' : inv.status === 'rejected' ? '#f87171' : inv.status === 'paid' ? '#a78bfa' : '#fbbf24'
                const invStatusBg = inv.status === 'approved' ? 'rgba(74,222,128,0.12)' : inv.status === 'rejected' ? 'rgba(248,113,113,0.12)' : inv.status === 'paid' ? 'rgba(167,139,250,0.12)' : 'rgba(251,191,36,0.12)'
                const invStatusLabel: Record<string, string> = { draft: 'Draft', submitted: 'Submitted', approved: 'Approved', paid: 'Paid', rejected: 'Rejected' }
                return (
                  <div key={inv.id} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: '#e8edf5', fontWeight: 500 }}>{inv.invoice_number}</span>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: invStatusBg, color: invStatusColor, fontWeight: 600 }}>
                        {invStatusLabel[inv.status] ?? inv.status}
                      </span>
                    </div>
                    {inv.description && <p style={{ fontSize: 11, color: '#8899aa', marginBottom: 6 }}>{inv.description}</p>}
                    <p style={{ fontSize: 14, color: '#e8edf5', fontWeight: 600, marginBottom: inv.status === 'submitted' ? 10 : 0 }}>£{Number(inv.total).toFixed(2)}</p>
                    {inv.status === 'submitted' && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" onClick={() => handleApproveInvoice(inv.id)} disabled={actionSaving}
                          style={{ flex: 1, padding: '7px 0', borderRadius: 7, background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontSize: 12, fontWeight: 600, opacity: actionSaving ? 0.5 : 1 }}>
                          {actionSaving ? '…' : 'Approve'}
                        </button>
                        <button type="button" onClick={() => handleRejectInvoice(inv.id)} disabled={actionSaving}
                          style={{ flex: 1, padding: '7px 0', borderRadius: 7, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171', fontSize: 12, fontWeight: 600, opacity: actionSaving ? 0.5 : 1 }}>
                          {actionSaving ? '…' : 'Reject'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Cost section — shown when no formal invoice exists */}
        {!loading && invoices.length === 0 && (
          <div style={{ ...CARD, padding: 16 }}>
            <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 12 }}>
              Agreed Cost
            </p>
            {fullReq?.cost != null && Number(fullReq.cost) > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 18, color: '#4ade80', fontWeight: 600 }}>£{Number(fullReq.cost).toFixed(2)}</p>
                  <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>Cost accepted — job eligible for resolution</p>
                </div>
                {!isResolved && (
                  <button type="button" onClick={() => { setFullReq(prev => prev ? { ...prev, cost: null } : prev); supabase.from('maintenance_requests').update({ cost: null }).eq('id', request.id) }}
                    style={{ fontSize: 11, color: '#8899aa', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
                    Clear
                  </button>
                )}
              </div>
            ) : !isResolved ? (
              <div>
                <p style={{ fontSize: 12, color: '#8899aa', marginBottom: 10 }}>
                  Record the agreed cost to unlock resolution. This can come from a contractor quote, verbal agreement, or invoice outside the system.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8899aa', fontSize: 13 }}>£</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={costInput}
                      onChange={e => setCostInput(e.target.value)}
                      style={{ width: '100%', padding: '9px 10px 9px 22px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e8edf5', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <button type="button" onClick={handleRecordCost} disabled={costSaving || !costInput || parseFloat(costInput) <= 0}
                    style={{ padding: '9px 16px', borderRadius: 8, background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontSize: 13, fontWeight: 600, opacity: (costSaving || !costInput || parseFloat(costInput) <= 0) ? 0.4 : 1, flexShrink: 0 }}>
                    {costSaving ? '…' : 'Confirm'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Activity timeline */}
        <div style={{ ...CARD, padding: 16 }}>
          <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 16 }}>Activity</p>
          {loading ? (
            <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center', padding: '8px 0' }}>Loading…</p>
          ) : (
            <div>
              {(() => {
                const entries: { id: string; ts: string; dot: string; label: string; sub?: string }[] = []
                if (request.created_at) entries.push({ id: 'reported', ts: request.created_at, dot: '#60a5fa', label: 'Reported by tenant', sub: tenantName ?? undefined })
                for (const h of history) {
                  const from = STATUS_LABEL[h.old_status ?? ''] ?? h.old_status ?? '—'
                  const to = STATUS_LABEL[h.new_status ?? ''] ?? h.new_status ?? '—'
                  entries.push({ id: h.id, ts: h.created_at, dot: '#fbbf24', label: `Status: ${from} → ${to}`, sub: h.notes ?? undefined })
                }
                if (fullReq?.assigned_contractor_id && contractorName && !history.some(h => h.new_status === 'assigned')) {
                  entries.push({ id: 'contractor', ts: fullReq.updated_at ?? request.created_at ?? '', dot: '#4ade80', label: 'Contractor allocated', sub: contractorName })
                }
                if (fullReq?.resolved_at) entries.push({ id: 'resolved', ts: fullReq.resolved_at, dot: '#a78bfa', label: 'Resolved' })
                return entries.map((e, i) => {
                  const isLast = i === entries.length - 1
                  return (
                    <div key={e.id} style={{ display: 'flex', gap: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14, flexShrink: 0 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: e.dot, marginTop: 5, flexShrink: 0 }} />
                        {!isLast && <div style={{ width: 1, flex: 1, minHeight: 16, background: 'rgba(255,255,255,0.07)', marginTop: 3 }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 14 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                          <p style={{ fontSize: 13, color: '#e8edf5', lineHeight: 1.4 }}>{e.label}</p>
                          <span style={{ fontSize: 10, color: '#8899aa', flexShrink: 0, paddingTop: 2, whiteSpace: 'nowrap' }}>{fmtDateTime(e.ts)}</span>
                        </div>
                        {e.sub && <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>{e.sub}</p>}
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Assign Contractor sheet */}
      {showAssignSheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowAssignSheet(false)} />
          <div className="relative rounded-t-3xl flex flex-col" style={{ background: '#112240', maxHeight: '70vh', overflow: 'hidden' }}>
            <div style={{ padding: '20px 20px 0' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 16px' }} />
              <p style={{ fontSize: 17, color: '#e8edf5', fontFamily: 'Georgia, serif', marginBottom: 4 }}>Assign Contractor</p>
              <p style={{ fontSize: 12, color: '#8899aa', marginBottom: 16 }}>Select a contractor to allocate this job to</p>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '0 20px 32px' }}>
              {contractorsLoading ? (
                <p style={{ fontSize: 13, color: '#8899aa', textAlign: 'center', padding: '24px 0' }}>Loading contractors…</p>
              ) : contractorsError ? (
                <p style={{ fontSize: 13, color: '#f87171', textAlign: 'center', padding: '24px 0' }}>{contractorsError}</p>
              ) : contractors.length === 0 ? (
                <p style={{ fontSize: 13, color: '#8899aa', textAlign: 'center', padding: '24px 0' }}>No contractors found</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {contractors.map((c) => {
                    const isCurrentlyAssigned = fullReq?.assigned_contractor_id === c.id
                    const displayName = c.business_name || c.full_name || c.email
                    const initials = displayName.split(' ').slice(0, 2).map((p: string) => p[0] ?? '').join('').toUpperCase()
                    return (
                      <button key={c.id} type="button" onClick={() => handleAssign(c)} disabled={actionSaving}
                        style={{ width: '100%', padding: '14px 16px', borderRadius: 12, background: isCurrentlyAssigned ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isCurrentlyAssigned ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.08)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, opacity: actionSaving ? 0.5 : 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(74,222,128,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#4ade80' }}>{initials}</span>
                          </div>
                          <div style={{ textAlign: 'left' }}>
                            <p style={{ fontSize: 14, color: '#e8edf5', fontWeight: 500 }}>{displayName}</p>
                            {c.email && displayName !== c.email && <p style={{ fontSize: 11, color: '#8899aa', marginTop: 1 }}>{c.email}</p>}
                          </div>
                        </div>
                        {isCurrentlyAssigned && <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 600 }}>Current</span>}
                      </button>
                    )
                  })}
                </div>
              )}
              <button type="button" onClick={() => setShowAssignSheet(false)}
                style={{ width: '100%', marginTop: 16, padding: '13px 0', borderRadius: 10, background: 'transparent', border: 'none', color: '#8899aa', fontSize: 14 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const PROP_STATUS_LABEL: Record<PropStatus, string> = {
  tenanted: 'Tenanted',
  notice:   'Handed in Notice',
  viewings: 'Viewings',
  for_let:  'Listed for Let',
}

const PROP_STATUS_STYLE: Record<PropStatus, React.CSSProperties> = {
  tenanted: { background: 'rgba(74,222,128,0.12)',  color: '#4ade80' },
  notice:   { background: 'rgba(251,191,36,0.15)',  color: '#fbbf24' },
  viewings: { background: 'rgba(96,165,250,0.15)',  color: '#60a5fa' },
  for_let:  { background: 'rgba(136,153,170,0.12)', color: '#8899aa' },
}

function AdminPropertyCard({ property, onLinkTenant, onEdit, onView, onToggleListing }: { property: AdminPropRow; onLinkTenant: (id: string) => void; onEdit: (p: AdminPropRow) => void; onView: (p: AdminPropRow) => void; onToggleListing: (p: AdminPropRow) => void }) {
  const landlordName = property.profiles?.full_name ?? property.profiles?.email ?? 'Unknown landlord'
  const statusKey = (property.status ?? 'for_let') as PropStatus
  const statusStyle = PROP_STATUS_STYLE[statusKey]
  const firstPhoto = property.photo_urls?.[0]
  return (
    <div style={{ ...CARD, overflow: 'hidden' }}>
      {firstPhoto && (
        <div style={{ height: 140, overflow: 'hidden' }}>
          <img src={firstPhoto} alt={property.address} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }} className="truncate">{property.address}</p>
            {property.postcode && <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>{property.postcode}</p>}
          </div>
          <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4, flexShrink: 0, letterSpacing: '0.08em', ...statusStyle }}>
            {PROP_STATUS_LABEL[statusKey] ?? statusKey}
          </span>
        </div>
        {property.description && (
          <p style={{ fontSize: 11, color: '#8899aa', marginTop: 6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>{property.description}</p>
        )}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '10px 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 11, color: '#8899aa' }}>
          {property.property_type && <span>{property.property_type.charAt(0).toUpperCase() + property.property_type.slice(1)}</span>}
          {property.bedrooms != null && <span>{property.bedrooms} bed</span>}
          {(property.photo_urls?.length ?? 0) > 0 && <span>{property.photo_urls!.length} photo{property.photo_urls!.length !== 1 ? 's' : ''}</span>}
          {property.monthly_rent != null && <span style={{ marginLeft: 'auto', fontSize: 13, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>{gbp(property.monthly_rent)}/mo</span>}
        </div>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '10px 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => onToggleListing(property)}
            style={{ flex: 1, minWidth: 100, padding: '7px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', cursor: 'pointer', border: '1px solid', ...(property.is_listed ? { background: 'rgba(74,222,128,0.12)', color: '#4ade80', borderColor: 'rgba(74,222,128,0.3)' } : { background: 'rgba(255,255,255,0.05)', color: '#c8d4e0', borderColor: 'rgba(255,255,255,0.12)' }) }}>
            {property.is_listed ? '● Listed for Let' : 'List for Let'}
          </button>
          <button type="button" onClick={() => onView(property)}
            style={{ padding: '7px 12px', borderRadius: 6, background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', fontSize: 11, fontWeight: 500, flexShrink: 0, cursor: 'pointer' }}>
            View
          </button>
          <button type="button" onClick={() => onEdit(property)}
            style={{ padding: '7px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11, fontWeight: 500, flexShrink: 0, cursor: 'pointer' }}>
            Edit
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, minWidth: 0 }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="#8899aa"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
          </div>
          <span style={{ fontSize: 11, color: '#8899aa' }} className="truncate">{landlordName}</span>
          <button type="button" onClick={() => onLinkTenant(property.id)}
            style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 5, background: 'rgba(96,165,250,0.08)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.15)', fontSize: 11, fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap', cursor: 'pointer' }}>
            + Tenant
          </button>
        </div>
      </div>
    </div>
  )
}

const CERT_TYPES = [
  'Gas Safety Certificate',
  'EICR',
  'EPC',
  'Legionella Risk Assessment',
  'PAT Testing',
  'Smoke & CO Alarm',
  'Fire Risk Assessment',
  'HMO Licence',
  'Inventory',
  'Deposit Prescribed Information',
  'Other',
]

// null = no fixed period (manual entry required)
const CERT_EXPIRY_YEARS: Record<string, number | null> = {
  'Gas Safety Certificate': 1,
  'EICR': 5,
  'EPC': 10,
  'Legionella Risk Assessment': null,
  'PAT Testing': null,
  'Smoke & CO Alarm': null,
  'Fire Risk Assessment': null,
  'HMO Licence': null,
  'Inventory': null,
  'Deposit Prescribed Information': null,
  'Other': null,
}

const TENANCY_CERT_TYPES = new Set(['PAT Testing', 'Inventory', 'Deposit Prescribed Information'])

function deriveExpiry(type: string, issueDate: string | null, storedExpiry: string | null): string | null {
  if (storedExpiry) return storedExpiry
  if (!issueDate) return null
  const years = CERT_EXPIRY_YEARS[type]
  if (years == null) return null
  const d = new Date(issueDate)
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().slice(0, 10)
}

function isoToDMY(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function parseDMY(str: string): string | null {
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function addYearsToISO(isoDate: string, years: number): string {
  const d = new Date(isoDate)
  d.setFullYear(d.getFullYear() + years)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function computeExpiry(type: string, issue: string): string | null {
  const years = CERT_EXPIRY_YEARS[type]
  if (years == null || !issue) return null
  const iso = parseDMY(issue)
  if (!iso) return null
  return addYearsToISO(iso, years)
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <FormField label={label}>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="dd/mm/yyyy"
        maxLength={10}
        style={INPUT_STYLE}
      />
    </FormField>
  )
}

function AddPRTModal({ property, onClose, onSaved }: {
  property: AdminPropRow
  onClose: () => void
  onSaved: (doc: { id: string; label: string; url: string | null; uploaded_at: string }) => void
}) {
  const [tenantName, setTenantName] = useState('')
  const [refNo, setRefNo] = useState('')
  const [signingDate, setSigningDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isValid = tenantName.trim().length > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return
    setSaving(true); setError(null)
    const label = `PRT Agreement – ${tenantName.trim()}${refNo.trim() ? ` (${refNo.trim()})` : ''}`
    let uploadedUrl: string | null = null
    if (file) {
      const ext = file.name.split('.').pop() ?? 'pdf'
      const tmpPath = `prt/${property.id}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('compliance-docs').upload(tmpPath, file)
      if (upErr) { setError('File upload failed: ' + upErr.message); setSaving(false); return }
      uploadedUrl = `compliance-docs/${tmpPath}`
    }
    const { data, error: dbErr } = await supabase.from('documents').insert({
      property_id: property.id,
      type: 'tenancy_agreement',
      label,
      url: uploadedUrl,
      uploaded_at: signingDate,
    }).select('id, label, url, uploaded_at').maybeSingle()
    setSaving(false)
    if (dbErr) { setError(dbErr.message); return }
    if (data) onSaved(data as { id: string; label: string; url: string | null; uploaded_at: string })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '0 16px' }}>
      <div style={{ background: '#112240', borderRadius: 16, width: '100%', maxWidth: 480, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontSize: 16, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>Register PRT Agreement</p>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#8899aa', padding: 4, cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
        <p style={{ fontSize: 12, color: '#8899aa', marginBottom: 16, marginTop: -8 }}>{property.address}</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormField label="Tenant Name *">
            <input value={tenantName} onChange={e => setTenantName(e.target.value)} placeholder="Full name" style={INPUT_STYLE} />
          </FormField>
          <FormField label="Reference Number">
            <input value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="Optional" style={INPUT_STYLE} />
          </FormField>
          <FormField label="Signing Date">
            <input type="date" value={signingDate} onChange={e => setSigningDate(e.target.value)} style={INPUT_STYLE} />
          </FormField>
          <FormField label="Upload PDF">
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0', borderRadius: 8, border: '1px dashed rgba(255,255,255,0.2)', color: '#60a5fa', fontSize: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.02)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/></svg>
              {file ? file.name : 'Choose PDF (optional)'}
              <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </FormField>
          {error && <p style={{ fontSize: 12, color: '#f87171' }}>{error}</p>}
          <button type="submit" disabled={!isValid || saving}
            style={{ marginTop: 4, padding: '12px 0', borderRadius: 10, background: isValid ? '#e8edf5' : 'rgba(255,255,255,0.08)', color: isValid ? '#0d1b2e' : '#8899aa', border: 'none', fontSize: 14, fontWeight: 600, cursor: isValid ? 'pointer' : 'default' }}>
            {saving ? 'Saving…' : 'Register PRT Agreement'}
          </button>
        </form>
      </div>
    </div>
  )
}

function EditComplianceModal({ item, onClose, onSaved }: {
  item: ComplianceItem
  onClose: () => void
  onSaved: (updated: ComplianceItem) => void
}) {
  const [issueDate, setIssueDate] = useState(() => isoToDMY(item.issue_date))
  const [expiryDate, setExpiryDate] = useState(() => isoToDMY(deriveExpiry(item.type, item.issue_date, item.expiry_date)))
  const [expiryAuto, setExpiryAuto] = useState(() => !item.expiry_date && deriveExpiry(item.type, item.issue_date, null) !== null)
  const [error, setError] = useState<string | null>(null)

  function handleIssueDateChange(val: string) {
    setIssueDate(val)
    const auto = computeExpiry(item.type, val)
    if (auto !== null) { setExpiryDate(auto); setExpiryAuto(true) }
    else setExpiryAuto(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const issueParsed = issueDate ? parseDMY(issueDate) : null
    const expiryParsed = expiryDate ? parseDMY(expiryDate) : null
    if (issueDate && !issueParsed) { setError('Issue date must be dd/mm/yyyy'); return }
    if (expiryDate && !expiryParsed) { setError('Expiry date must be dd/mm/yyyy'); return }
    const updated = { ...item, issue_date: issueParsed, expiry_date: expiryParsed }
    onSaved(updated)
    supabase.from('compliance_items')
      .update({ issue_date: issueParsed, expiry_date: expiryParsed })
      .eq('id', item.id)
      .then(({ error: dbErr }) => {
        if (dbErr) console.error('Failed to save compliance dates:', dbErr.message)
      })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '0 16px' }}>
      <div style={{ background: '#112240', borderRadius: 16, width: '100%', maxWidth: 420, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ fontSize: 16, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>Edit Dates</p>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#8899aa', padding: 4, cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
        <p style={{ fontSize: 12, color: '#8899aa', marginBottom: 20 }}>{item.type}</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <DateInput label="Issue Date" value={issueDate} onChange={handleIssueDateChange} />
            <FormField label={expiryAuto ? 'Expiry Date (auto)' : 'Expiry Date'}>
              <input type="text" value={expiryDate} onChange={e => { setExpiryDate(e.target.value); setExpiryAuto(false) }}
                placeholder="dd/mm/yyyy" maxLength={10} readOnly={expiryAuto}
                style={{ ...INPUT_STYLE, opacity: expiryAuto ? 0.6 : 1, cursor: expiryAuto ? 'default' : 'text' }} />
            </FormField>
          </div>
          {error && <p style={{ fontSize: 12, color: '#f87171' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: '11px 0', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit"
              style={{ flex: 2, padding: '11px 0', borderRadius: 8, background: '#e8edf5', color: '#0d1b2e', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AddComplianceModal({ property, onClose, onSaved, onFileUploaded }: {
  property: AdminPropRow
  onClose: () => void
  onSaved: (item: ComplianceItem) => void
  onFileUploaded: (id: string, documentUrl: string) => void
}) {
  const [certType, setCertType] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [expiryAuto, setExpiryAuto] = useState(false)
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleTypeChange(type: string) {
    setCertType(type)
    const auto = computeExpiry(type, issueDate)
    if (auto !== null) { setExpiryDate(auto); setExpiryAuto(true) }
    else { setExpiryAuto(false) }
  }

  function handleIssueDateChange(issue: string) {
    setIssueDate(issue)
    const auto = computeExpiry(certType, issue)
    if (auto !== null) { setExpiryDate(auto); setExpiryAuto(true) }
    else { setExpiryAuto(false) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!certType) { setError('Please select a certificate type'); return }
    const issueParsed = issueDate ? parseDMY(issueDate) : null
    const expiryParsed = expiryDate ? parseDMY(expiryDate) : null
    if (issueDate && !issueParsed) { setError('Issue date must be dd/mm/yyyy'); return }
    if (expiryDate && !expiryParsed) { setError('Expiry date must be dd/mm/yyyy'); return }
    setUploading(true); setError(null)
    try {
      const { data: newItem, error: dbErr } = await supabase.from('compliance_items').insert({
        property_id: property.id,
        type: certType,
        issue_date: issueParsed,
        expiry_date: expiryParsed,
        document_url: null,
        notes: notes.trim() || null,
      }).select('id, property_id, type, issue_date, expiry_date, status, document_url, notes').single()
      setUploading(false)
      if (dbErr) { setError('Save failed: ' + dbErr.message); return }
      onSaved(newItem as ComplianceItem)
      if (file) {
        const ext = file.name.split('.').pop() ?? 'pdf'
        const path = `${property.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        supabase.storage.from('compliance-docs').upload(path, file)
          .then(({ error: upErr }) => {
            if (upErr) { console.error('File upload failed:', upErr.message); return }
            const documentUrl = `compliance-docs/${path}`
            supabase.from('compliance_items').update({ document_url: documentUrl }).eq('id', newItem.id)
              .then(() => onFileUploaded(newItem.id, documentUrl))
          })
      }
    } catch (err) {
      setUploading(false)
      setError('Unexpected error: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '0 16px' }}>
      <div style={{ background: '#112240', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90dvh', overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontSize: 16, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>Add Compliance Certificate</p>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#8899aa', padding: 4, cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
        <p style={{ fontSize: 12, color: '#8899aa', marginBottom: 16, marginTop: -8 }}>{property.address}</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormField label="Certificate Type *">
            <select value={certType} onChange={e => handleTypeChange(e.target.value)} style={INPUT_STYLE}>
              <option value="">Select type…</option>
              {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>
          {certType === 'Inventory' || certType === 'Deposit Prescribed Information' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <DateInput label="Issue Date" value={issueDate} onChange={handleIssueDateChange} />
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)' }}>
                <p style={{ fontSize: 12, color: '#60a5fa', lineHeight: 1.5 }}>
                  {certType === 'Deposit Prescribed Information'
                    ? 'Deposit Prescribed Information is tied to the tenancy — no expiry date applies.'
                    : 'Inventory is tied to the tenancy — it remains active until the tenant hands in notice, at which point it is automatically expired.'}
                </p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <DateInput label="Issue Date" value={issueDate} onChange={handleIssueDateChange} />
              <FormField label={expiryAuto ? 'Expiry Date (auto)' : 'Expiry Date'}>
                <input
                  type="text"
                  value={expiryDate}
                  onChange={e => { setExpiryDate(e.target.value); setExpiryAuto(false) }}
                  placeholder="dd/mm/yyyy"
                  maxLength={10}
                  readOnly={expiryAuto}
                  style={{ ...INPUT_STYLE, opacity: expiryAuto ? 0.6 : 1, cursor: expiryAuto ? 'default' : 'text' }}
                />
              </FormField>
            </div>
          )}
          <FormField label="Upload PDF / Document">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0', borderRadius: 8, border: '1px dashed rgba(255,255,255,0.2)', color: file ? '#4ade80' : '#60a5fa', fontSize: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.02)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/></svg>
                {file ? file.name : 'Choose file…'}
                <input type="file" accept="application/pdf,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
              </label>
              {file && (
                <button
                  type="button"
                  onClick={() => { const url = URL.createObjectURL(file); window.open(url, '_blank') }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 0', borderRadius: 8, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)', color: '#60a5fa', fontSize: 12, cursor: 'pointer' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                  Preview file
                </button>
              )}
            </div>
          </FormField>
          <FormField label="Notes (optional)">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes…" rows={2}
              style={{ ...INPUT_STYLE, resize: 'vertical', lineHeight: 1.5 }} />
          </FormField>
          {error && <p style={{ fontSize: 12, color: '#f87171' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: '11px 0', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={uploading}
              style={{ flex: 2, padding: '11px 0', borderRadius: 8, background: uploading ? 'rgba(232,237,245,0.4)' : '#e8edf5', color: '#0d1b2e', border: 'none', fontSize: 13, fontWeight: 600, cursor: uploading ? 'default' : 'pointer' }}>
              {uploading ? 'Saving…' : 'Save Certificate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditPropertyModal({ property, landlords, onClose, onSaved, onDelete }: {
  property: AdminPropRow
  landlords: { id: string; email: string; full_name: string | null }[]
  onClose: () => void
  onSaved: (patch: Partial<AdminPropRow>) => void
  onDelete: (p: AdminPropRow) => void
}) {
  const [address, setAddress] = useState(property.address)
  const [postcode, setPostcode] = useState(property.postcode ?? '')
  const [propType, setPropType] = useState(property.property_type ?? '')
  const [bedrooms, setBedrooms] = useState(property.bedrooms != null ? String(property.bedrooms) : '')
  const [rent, setRent] = useState(property.monthly_rent != null ? String(property.monthly_rent) : '')
  const [description, setDescription] = useState(property.description ?? '')
  const [propStatus, setPropStatus] = useState<PropStatus>((property.status ?? 'for_let') as PropStatus)
  const [landlordId, setLandlordId] = useState(property.landlord_id)
  const [photoUrls, setPhotoUrls] = useState<string[]>(property.photo_urls ?? [])
  const [hasGas, setHasGas] = useState(property.has_gas)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setUploading(true)
    const newUrls: string[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `${property.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('property-photos').upload(path, file)
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('property-photos').getPublicUrl(path)
        newUrls.push(urlData.publicUrl)
      }
    }
    setPhotoUrls(prev => [...prev, ...newUrls])
    setUploading(false)
    e.target.value = ''
  }

  function removePhoto(url: string) {
    setPhotoUrls(prev => prev.filter(u => u !== url))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!address.trim()) { setError('Address is required'); return }
    if (!landlordId) { setError('Please select a landlord'); return }
    const patch: Partial<AdminPropRow> = {
      address: address.trim(),
      postcode: postcode.trim() || null,
      property_type: propType || null,
      bedrooms: bedrooms ? parseInt(bedrooms) : null,
      monthly_rent: rent ? parseFloat(rent) : null,
      description: description.trim() || null,
      photo_urls: photoUrls,
      has_gas: hasGas,
      landlord_id: landlordId,
      status: propStatus as PropStatus,
      is_active: propStatus === 'tenanted',
    }
    onSaved(patch)
    supabase.from('properties').update(patch).eq('id', property.id)
      .then(({ error: dbError }) => {
        if (dbError) console.error('Property save failed:', dbError.message)
      })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '0 16px' }}>
      <div style={{ background: '#112240', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90dvh', overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontSize: 16, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>Edit Property</p>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#8899aa', padding: 4, cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormField label="Address *">
            <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 High Street" style={INPUT_STYLE} autoFocus />
          </FormField>
          <FormField label="Postcode">
            <input type="text" value={postcode} onChange={e => setPostcode(e.target.value)} placeholder="DD1 1AA" style={INPUT_STYLE} />
          </FormField>
          <FormField label="Property Type">
            <select value={propType} onChange={e => setPropType(e.target.value)} style={INPUT_STYLE}>
              <option value="">Select type</option>
              <option value="flat">Flat</option>
              <option value="house">House</option>
              <option value="bungalow">Bungalow</option>
              <option value="commercial">Commercial</option>
              <option value="other">Other</option>
            </select>
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="Bedrooms">
              <input type="number" value={bedrooms} onChange={e => setBedrooms(e.target.value)} placeholder="3" min="0" style={INPUT_STYLE} />
            </FormField>
            <FormField label="Monthly Rent (£)">
              <input type="number" value={rent} onChange={e => setRent(e.target.value)} placeholder="1200" min="0" style={INPUT_STYLE} />
            </FormField>
          </div>
          <FormField label="Description">
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description of the property…" rows={3}
              style={{ ...INPUT_STYLE, resize: 'vertical', lineHeight: 1.5 }} />
          </FormField>
          <FormField label="Status">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {(['tenanted', 'notice', 'viewings', 'for_let'] as PropStatus[]).map(s => (
                <button key={s} type="button" onClick={() => setPropStatus(s)}
                  style={{ padding: '8px 4px', borderRadius: 8, fontSize: 10, fontWeight: 500, border: '1px solid', cursor: 'pointer',
                    borderColor: propStatus === s ? PROP_STATUS_STYLE[s].color as string : 'rgba(255,255,255,0.1)',
                    background: propStatus === s ? PROP_STATUS_STYLE[s].background as string : 'rgba(255,255,255,0.04)',
                    color: propStatus === s ? PROP_STATUS_STYLE[s].color as string : '#8899aa' }}>
                  {PROP_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </FormField>
          <FormField label="Gas Supply">
            <div style={{ display: 'flex', gap: 8 }}>
              {([true, false] as const).map((val) => (
                <button key={String(val)} type="button" onClick={() => setHasGas(val)}
                  style={{ flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px solid',
                    background: hasGas === val ? (val ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.06)') : 'rgba(255,255,255,0.04)',
                    color: hasGas === val ? (val ? '#60a5fa' : '#8899aa') : '#555e6e',
                    borderColor: hasGas === val ? (val ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.15)') : 'rgba(255,255,255,0.08)' }}>
                  {val ? 'Yes — has gas' : 'No — electric only'}
                </button>
              ))}
            </div>
          </FormField>
          <FormField label="Landlord *">
            <select value={landlordId} onChange={e => setLandlordId(e.target.value)} style={INPUT_STYLE}>
              <option value="">Select landlord</option>
              {landlords.map(l => <option key={l.id} value={l.id}>{l.full_name ?? l.email}</option>)}
            </select>
          </FormField>

          <FormField label="Photos">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {photoUrls.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {photoUrls.map((url) => (
                    <div key={url} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '4/3' }}>
                      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button type="button" onClick={() => removePhoto(url)}
                        style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0', borderRadius: 8, border: '1px dashed rgba(255,255,255,0.2)', color: uploading ? '#8899aa' : '#60a5fa', fontSize: 12, cursor: uploading ? 'default' : 'pointer', background: 'rgba(255,255,255,0.02)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/></svg>
                {uploading ? 'Uploading…' : 'Upload Photos'}
                <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} disabled={uploading} style={{ display: 'none' }} />
              </label>
            </div>
          </FormField>

          {error && <p style={{ fontSize: 12, color: '#f87171' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: '11px 0', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, fontWeight: 500 }}>
              Cancel
            </button>
            <button type="submit" disabled={uploading}
              style={{ flex: 2, padding: '11px 0', borderRadius: 8, background: uploading ? 'rgba(232,237,245,0.4)' : '#e8edf5', color: '#0d1b2e', border: 'none', fontSize: 13, fontWeight: 600 }}>
              Save Changes
            </button>
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 0' }} />
          <button type="button" onClick={() => onDelete(property)}
            style={{ padding: '10px 0', borderRadius: 8, background: 'rgba(248,113,113,0.08)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)', fontSize: 12, fontWeight: 500 }}>
            Delete Property
          </button>
        </form>
      </div>
    </div>
  )
}

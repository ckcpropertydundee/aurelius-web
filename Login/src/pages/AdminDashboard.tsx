// v2
import React, { useState, useEffect, useRef } from 'react'
import InventoryBuilderModal, { type InventoryDraftDetails } from '../components/InventoryBuilderModal'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { initials, gbp, fmtDate, fmtDateTime, docUrl, timeAgo } from '../lib/utils'
import DashShell from '../components/DashShell'
import EmptyState from '../components/EmptyState'
import SettingsPage from './SettingsPage'
import MessageThread from '../components/MessageThread'
import { IconGrid, IconChart, IconPeople, IconHouse, IconGear, IconStaff, IconWrench, IconSterling, IconActivity, IconCalendar, IconTodo } from '../components/icons'

function buildTabs(pendingViewings: number, todayViewings: number, todoUrgent: number) {
  return [
    { id: 'analytics',       label: 'Dashboard',   icon: <IconGrid />,     badge: pendingViewings > 0 ? pendingViewings : undefined },
    { id: 'analyticsDetail', label: 'Analytics',   icon: <IconChart /> },
    { id: 'todo',            label: 'To Do',       icon: <IconTodo />,     badge: todoUrgent > 0 ? todoUrgent : undefined },
    { id: 'rent',            label: 'Rent',        icon: <IconSterling /> },
    { id: 'diary',           label: 'Diary',       icon: <IconCalendar />, badge: todayViewings > 0 ? todayViewings : undefined },
    { id: 'users',           label: 'Users',       icon: <IconPeople /> },
    { id: 'staff',           label: 'Staff',       icon: <IconStaff /> },
    { id: 'properties',      label: 'Properties',  icon: <IconHouse /> },
    { id: 'maintenance',     label: 'Maintenance', icon: <IconWrench /> },
    { id: 'auditlog',        label: 'Audit Log',   icon: <IconActivity /> },
    { id: 'settings',        label: 'Settings',    icon: <IconGear /> },
  ]
}

// ── Types (unchanged) ──

interface MonthlySnapshot { month: string; date: string; rentCollected: number; rentExpected: number; maintenanceCost: number; managementFee: number }
interface PropertyPerf { address: string; monthlyRent: number; netYield: number; trend: 'up' | 'flat' | 'down' }
type SignalCategory = 'rent' | 'voids' | 'maintenance' | 'compliance'
interface ImprovementSignal { id: string; category: SignalCategory; title: string; detail: string; potentialUplift?: number }
type AnalyticsPeriod = '3M' | '6M' | '12M'
interface UserRow { id: string; email: string; full_name: string | null; role: string; status: string | null; management_fee_percent: number | null }
type UserRoleFilter = 'all' | 'admin' | 'landlord' | 'tenant' | 'contractor'
interface StaffMember { id: string; full_name: string; email: string; role: 'admin' | 'master admin'; status: string | null }
type StaffRoleFilter = 'all' | 'admin' | 'master admin'
interface MaintenanceRow { id: string; title: string | null; description: string | null; priority: string | null; status: string | null; created_at: string | null; property_id: string | null; scheduled_at?: string | null }
type MaintenanceFilter = 'all' | 'open' | 'in_progress' | 'resolved' | 'compliance' | 'viewings'
interface ViewingRequest { id: string; property_id: string | null; name: string; email: string; phone: string | null; preferred_date: string; preferred_time: string; message: string | null; status: string; created_at: string; properties: { address: string } | null }
interface TenancyNotice { id: string; tenancy_id: string; tenant_id: string; property_id: string; notice_date: string; vacate_date: string; status: string; created_at: string; properties: { address: string } | null; profiles: { full_name: string | null; email: string } | null }
interface ComplianceAlert { id: string; property_id: string; type: string; issue_date: string | null; expiry_date: string | null; document_url: string | null; notes: string | null; properties: { address: string } | null }
type PropStatus = 'active' | 'tenanted' | 'notice' | 'moving_in' | 'viewings' | 'for_let' | 'vacant'
interface AdminPropRow { id: string; address: string; postcode: string | null; property_type: string | null; bedrooms: number | null; monthly_rent: number | null; is_active: boolean; status: PropStatus | null; created_at: string; landlord_id: string; description: string | null; photo_urls: string[] | null; has_gas: boolean; is_listed: boolean; available_from: string | null; listing_headline: string | null; landlord_registration_number: string | null; epc_rating: string | null; pre_tenancy_check_completed: boolean; pre_tenancy_check_date: string | null; deposit_scheme: string | null; deposit_registered_date: string | null; deposit_amount: number | null; meter_certificate_url: string | null; move_in_date: string | null; move_out_date: string | null; profiles: { full_name: string | null; email: string } | null; purchase_price?: number | null; key_number: number | null }
interface ComplianceItem { id: string; property_id: string; type: string; issue_date: string | null; expiry_date: string | null; status: string | null; document_url: string | null; notes: string | null; uploaded_at?: string | null; pdf_url?: string | null; cleanliness_comment?: string | null; odour_comment?: string | null; heat_detector_present?: boolean; smoke_detector_present?: boolean; co_detector_present?: boolean }
interface PropertyTenancyInfo { id: string; tenant_id: string; tenant_name: string | null; tenant_email: string; tenant_phone: string | null; start_date: string; end_date: string | null; monthly_rent: number | null; deposit_scheme: string | null; deposit_registered_date: string | null; last_rent_increase_date: string | null }
interface AuditEvent { id: string; ts: string; cat: 'maintenance' | 'payment' | 'tenancy' | 'compliance' | 'viewing'; title: string; detail?: string; ok?: boolean; documentUrl?: string }
interface PropertyKey { id: string; property_id: string; key_type: 'master' | 'tenant' | 'contractor'; holder_name: string | null; holder_role: string | null; checked_out_at: string | null; notes: string | null }
interface KeyEvent { id: string; property_id: string; key_type: string; action: 'checked_out' | 'returned'; person_name: string | null; notes: string | null; created_at: string }
type MeterType = 'gas' | 'electricity'
interface MeterReading { id: string; property_id: string; utility_type: MeterType; reading: number; reading_raw: string | null; reading_date: string; notes: string | null; created_at: string }
interface LandlordRegistration { id: string; landlord_id: string; registration_number: string; council_area: string | null; expiry_date: string | null }
interface AuditLogRow { id: string; action: string; entity_type: string | null; entity_id: string | null; metadata: Record<string, unknown> | null; created_at: string; user_id: string | null; user_role: string | null; user_name: string | null; user_email: string | null }
type JobStatus = 'pending' | 'in_progress' | 'done' | 'cancelled'
type JobPriority = 'critical' | 'high' | 'medium' | 'low'
type JobType = 'notice_received' | 'pre_checkout_inspection' | 'checkout_inspection' | 'deposit_assessment' | 'cleaning' | 'repairs' | 'photography' | 'relisting' | 'viewings_ongoing' | 'referencing' | 'tenant_onboarding' | 'maintenance' | 'custom'
interface PropertyJob { id: string; property_id: string; title: string; description: string | null; job_type: JobType; status: JobStatus; priority: JobPriority; due_date: string | null; assigned_to: string | null; notes: string | null; created_by: string | null; created_at: string; completed_at: string | null }

// ── Theme ──

const CARD: React.CSSProperties = { background: '#112240', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }

interface ChecklistItem { label: string; priority: 'urgent' | 'soon' | 'info' }
const TODO_CHECKLISTS: Record<string, ChecklistItem[]> = {
  'Move In': [
    { label: 'Tenancy agreement signed by all parties', priority: 'urgent' },
    { label: 'Deposit collected and registered with scheme', priority: 'urgent' },
    { label: 'Keys issued to tenant', priority: 'urgent' },
    { label: 'Move-in inventory completed and signed', priority: 'urgent' },
    { label: 'Standing order / payment method set up', priority: 'soon' },
    { label: 'Utility meter readings taken', priority: 'soon' },
    { label: 'Welcome pack sent to tenant', priority: 'info' },
  ],
  'Move Out': [
    { label: 'Check-out inspection date agreed with tenant', priority: 'urgent' },
    { label: 'Keys returned from tenant', priority: 'urgent' },
    { label: 'Property condition assessed against inventory', priority: 'urgent' },
    { label: 'Deposit returned within legal timeframe', priority: 'urgent' },
    { label: 'Final utility meter readings taken', priority: 'soon' },
    { label: 'Deposit return amount agreed', priority: 'soon' },
    { label: 'Any deductions documented and evidenced', priority: 'soon' },
    { label: 'Property cleaned and ready for re-let', priority: 'info' },
    { label: 'Re-advertise / find next tenant', priority: 'info' },
  ],
  'Notice': [
    { label: 'Notice acknowledged in writing to tenant', priority: 'urgent' },
    { label: 'Vacate date confirmed', priority: 'urgent' },
    { label: 'Check-out inspection date agreed', priority: 'soon' },
    { label: 'Deposit return procedure explained to tenant', priority: 'soon' },
    { label: 'Landlord notified of notice', priority: 'soon' },
    { label: 'Property relisting and marketing planned', priority: 'info' },
  ],
  'Viewing': [
    { label: 'Viewing time confirmed with applicant', priority: 'urgent' },
    { label: 'Property access arranged', priority: 'urgent' },
    { label: 'Application form sent to applicant', priority: 'soon' },
    { label: 'References and right-to-rent checks requested', priority: 'soon' },
    { label: 'Outcome communicated to applicant', priority: 'info' },
  ],
  'Emergency': [
    { label: 'Emergency contractor contacted immediately', priority: 'urgent' },
    { label: 'Tenant confirmed safe and informed', priority: 'urgent' },
    { label: 'Site visit confirmed and attended', priority: 'urgent' },
    { label: 'Emergency works completed', priority: 'urgent' },
    { label: 'Follow-up inspection carried out', priority: 'soon' },
    { label: 'Invoice received and filed', priority: 'soon' },
    { label: 'Incident documented for records', priority: 'info' },
  ],
  'Urgent Maintenance': [
    { label: 'Contractor contacted', priority: 'urgent' },
    { label: 'Site visit scheduled', priority: 'urgent' },
    { label: 'Tenant informed of visit date and time', priority: 'soon' },
    { label: 'Quote received and approved', priority: 'soon' },
    { label: 'Works completed and signed off', priority: 'soon' },
    { label: 'Invoice received and filed', priority: 'info' },
  ],
  'Maintenance': [
    { label: 'Contractor contacted', priority: 'urgent' },
    { label: 'Site visit scheduled', priority: 'urgent' },
    { label: 'Tenant informed of visit date and time', priority: 'soon' },
    { label: 'Quote received and approved', priority: 'soon' },
    { label: 'Works completed and signed off', priority: 'soon' },
    { label: 'Invoice received and filed', priority: 'info' },
  ],
  'Certificate': [
    { label: 'Renewal provider / engineer contacted', priority: 'urgent' },
    { label: 'Inspection or assessment booked', priority: 'urgent' },
    { label: 'Inspection attended and completed', priority: 'urgent' },
    { label: 'New certificate received from provider', priority: 'soon' },
    { label: 'Certificate uploaded to property documents', priority: 'soon' },
    { label: 'Expiry date updated in records', priority: 'info' },
  ],
}

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


export default function AdminDashboard() {
  const { user } = useAuth()
  const [tab, setTab] = useState('analytics')
  const userInitials = initials(user?.full_name, user?.email ?? '')
  const [adminToast, setAdminToast] = useState<string | null>(null)

  const [snapshots, setSnapshots] = useState<MonthlySnapshot[]>([])
  const [properties, setProperties] = useState<PropertyPerf[]>([])
  const [propertyCount, setPropertyCount] = useState<number | null>(null)
  const [tenantedCount, setTenantedCount] = useState<number | null>(null)
  const [monthlyRentRoll, setMonthlyRentRoll] = useState<number>(0)
  const [monthlyMgmtFee, setMonthlyMgmtFee] = useState<number>(0)
  const [_monthlyRepairDeductions, setMonthlyRepairDeductions] = useState<number>(0)
  const [monthlyInHouseCost, setMonthlyInHouseCost] = useState<number>(0)
  const [monthlyMaintCost, setMonthlyMaintCost] = useState<number>(0)
  const [ytdGross, setYtdGross] = useState<number>(0)
  const [ytdNet, setYtdNet] = useState<number>(0)

  const [rentCollection, setRentCollection] = useState<{ tenancyId: string; propertyId: string; address: string; expected: number; collected: number; isPaid: boolean; isVacant: boolean; isProRated?: boolean; moveOutDate?: string; moveInDate?: string; paymentId: string | null; dueDate: string | null; paymentMethod: string | null; paymentNotes: string | null; landlordEmail: string; landlordName: string; paidAt: string | null }[]>([])
  const [markPaidItem, setMarkPaidItem] = useState<{ tenancyId: string; propertyId: string; address: string; expected: number; paymentId: string | null; dueDate: string | null; landlordEmail: string; landlordName: string } | null>(null)
  const [signals, setSignals] = useState<ImprovementSignal[]>([])
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>('6M')
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false)

  const [users, setUsers] = useState<UserRow[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userFilter, setUserFilter] = useState<UserRoleFilter>('all')
  const [userSearch, setUserSearch] = useState('')

  // Invite modal
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'landlord' | 'tenant' | 'contractor'>('landlord')
  const [inviteName, setInviteName] = useState('')
  const [inviteSaving, setInviteSaving] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState(false)

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
  const [tenancyNotices, setTenancyNotices] = useState<TenancyNotice[]>([])
  const [complianceAlerts, setComplianceAlerts] = useState<ComplianceAlert[]>([])
  const [complianceAlertsLoading, setComplianceAlertsLoading] = useState(false)
  const [complianceAlertsLoaded, setComplianceAlertsLoaded] = useState(false)
  const [selectedComplianceAlert, setSelectedComplianceAlert] = useState<ComplianceAlert | null>(null)

  // To Do tab
  const [expandedTodoId, setExpandedTodoId] = useState<string | null>(null)
  const [todoChecks, setTodoChecks] = useState<Record<string, boolean[]>>(() => {
    try { return JSON.parse(localStorage.getItem('aurelius-todo-checks') ?? '{}') }
    catch { return {} }
  })
  // Sticky todos: items persisted in localStorage until all checklist items are checked off.
  // Keyed by todo id so they survive property status changes (e.g. moving_in → active).
  type StickyTodo = { id: string; priority: 'urgent' | 'soon' | 'info'; category: string; title: string; detail: string }
  const [stickyTodos, setStickyTodos] = useState<Record<string, StickyTodo>>(() => {
    try { return JSON.parse(localStorage.getItem('aurelius-sticky-todos') ?? '{}') }
    catch { return {} }
  })
  const [usersLoaded, setUsersLoaded] = useState(false)

  const [quickError, setQuickError] = useState<string | null>(null)

  const [adminProps, setAdminProps] = useState<AdminPropRow[]>([])
  const [adminPropsLoading, setAdminPropsLoading] = useState(false)
  const [adminPropsLoaded, setAdminPropsLoaded] = useState(false)
  const [adminPropsError, setAdminPropsError] = useState<string | null>(null)
  const [propSearch, setPropSearch] = useState('')
  const [propSort, setPropSort] = useState<'newest' | 'oldest' | 'az' | 'za' | 'rent_high' | 'rent_low'>('newest')
  const [propStatusFilter, setPropStatusFilter] = useState<PropStatus | 'all' | 'listed'>('all')

  const [selectedProperty, setSelectedProperty] = useState<AdminPropRow | null>(null)
  const selectedPropertyRef = useRef<AdminPropRow | null>(null)
  useEffect(() => { selectedPropertyRef.current = selectedProperty }, [selectedProperty])
  const [complianceItems, setComplianceItems] = useState<ComplianceItem[]>([])
  const [complianceLoading, setComplianceLoading] = useState(false)
  const [showAddComplianceModal, setShowAddComplianceModal] = useState(false)
  const [showInventoryBuilder, setShowInventoryBuilder] = useState(false)
  const [inventoryBuilderItem, setInventoryBuilderItem] = useState<InventoryDraftDetails | null>(null)
  const [compliancePresetType, setCompliancePresetType] = useState<string | undefined>(undefined)
  const [editComplianceItem, setEditComplianceItem] = useState<ComplianceItem | null>(null)
  const [confirmDeleteComplianceId, setConfirmDeleteComplianceId] = useState<string | null>(null)
  const [prtDoc, setPrtDoc] = useState<{ id: string; label: string; url: string | null; uploaded_at: string } | null>(null)
  const [prtLoading, setPrtLoading] = useState(false)
  const [prtUploading, setPrtUploading] = useState(false)
  const [showAddPRTModal, setShowAddPRTModal] = useState(false)
  const [showPRTGenerator, setShowPRTGenerator] = useState(false)
  const [_sentPrtId, setSentPrtId] = useState<string | null>(null)
  const [sentPrtStatus, setSentPrtStatus] = useState<'pending' | 'tenant_signed' | 'executed' | null>(null)
  const [sentPrtHtml, setSentPrtHtml] = useState<string | null>(null)
  const [showAdminSignPRT, setShowAdminSignPRT] = useState(false)
  const adminSigCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const adminSigDrawing = useRef(false)
  const adminSigHasStroke = useRef(false)
  const [adminSigTypedName, setAdminSigTypedName] = useState('')
  const [adminSigSubmitting, setAdminSigSubmitting] = useState(false)
  const [adminSigError, setAdminSigError] = useState<string | null>(null)
  const [landlordNotifiedAt, setLandlordNotifiedAt] = useState<string | null>(null)
  const [landlordSharing, setLandlordSharing] = useState(false)
  const [prtSending, setPrtSending] = useState(false)
  const [prtForm, setPrtForm] = useState<{
    tenantName: string; tenantAddress: string; tenantEmail: string; tenantPhone: string
    startDate: string; monthlyRent: string; firstPayment: string; depositAmount: string
    landlordName: string; landlordReg: string
  }>({ tenantName: '', tenantAddress: '', tenantEmail: '', tenantPhone: '', startDate: '', monthlyRent: '', firstPayment: '', depositAmount: '', landlordName: '', landlordReg: '' })
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [_propertyTenancy, setPropertyTenancy] = useState<PropertyTenancyInfo | null>(null)
  const [propertyTenancies, setPropertyTenancies] = useState<PropertyTenancyInfo[]>([])
  const [propertyTenancyLoading, setPropertyTenancyLoading] = useState(false)
  const [showAddPropertyModal, setShowAddPropertyModal] = useState(false)
  const [linkTenantPropertyId, setLinkTenantPropertyId] = useState<string | null>(null)
  const [landlordUsers, setLandlordUsers] = useState<{ id: string; email: string; full_name: string | null }[]>([])
  const [tenantUsers, setTenantUsers] = useState<{ id: string; email: string; full_name: string | null }[]>([])

  const [showAddStaffModal, setShowAddStaffModal] = useState(false)
  const [nonStaffUsers, setNonStaffUsers] = useState<{ id: string; email: string; full_name: string | null; role: string }[]>([])

  // Staff invite modal
  const [showStaffInviteModal, setShowStaffInviteModal] = useState(false)
  const [staffInviteEmail, setStaffInviteEmail] = useState('')
  const [staffInviteRole, setStaffInviteRole] = useState<'admin' | 'master admin'>('admin')
  const [staffInviteName, setStaffInviteName] = useState('')
  const [staffInviteSaving, setStaffInviteSaving] = useState(false)
  const [staffInviteError, setStaffInviteError] = useState<string | null>(null)
  const [staffInviteSuccess, setStaffInviteSuccess] = useState(false)
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
  const [gasToggleSaving, setGasToggleSaving] = useState(false)
  const [diaryWeekOffset, setDiaryWeekOffset] = useState(0)
  const [selectedDiaryDay, setSelectedDiaryDay] = useState<string | null>(null)
  const [showAddViewing, setShowAddViewing] = useState(false)
  const [newViewingPropId, setNewViewingPropId] = useState('')
  const [newViewingDate, setNewViewingDate] = useState('')
  const [newViewingTime, setNewViewingTime] = useState('')
  const [newViewingName, setNewViewingName] = useState('')
  const [newViewingEmail, setNewViewingEmail] = useState('')
  const [newViewingPhone, setNewViewingPhone] = useState('')
  const [newViewingMessage, setNewViewingMessage] = useState('')
  const [newViewingSaving, setNewViewingSaving] = useState(false)
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
  const [editingKeyNumber, setEditingKeyNumber] = useState(false)
  const [keyNumberDraft, setKeyNumberDraft] = useState('')
  const [keyNumberSaving, setKeyNumberSaving] = useState(false)
  const [showAddDeductionModal, setShowAddDeductionModal] = useState(false)
  const [deductionType, setDeductionType] = useState<'Inventory' | 'Legionella' | 'General Maintenance' | 'Custom'>('Inventory')
  const [deductionCustomTitle, setDeductionCustomTitle] = useState('')
  const [deductionAmount, setDeductionAmount] = useState('')
  const [deductionNotes, setDeductionNotes] = useState('')
  const [deductionSaving, setDeductionSaving] = useState(false)
  const [deductionError, setDeductionError] = useState<string | null>(null)
  const [propertyDeductions, setPropertyDeductions] = useState<{ id: string; invoice_number: string; description: string | null; total: number; created_at: string; jobTitle: string | null }[]>([])
  const [propertyDeductionsLoading, setPropertyDeductionsLoading] = useState(false)

  const [meterReadings, setMeterReadings] = useState<MeterReading[]>([])
  const [meterReadingsLoading, setMeterReadingsLoading] = useState(false)
  const [showAddMeterModal, setShowAddMeterModal] = useState(false)
  const [newMeterType, setNewMeterType] = useState<MeterType>('electricity')
  const [newMeterReading, setNewMeterReading] = useState('')
  const [newMeterDate, setNewMeterDate] = useState('')
  const [newMeterNotes, setNewMeterNotes] = useState('')
  const [meterSaving, setMeterSaving] = useState(false)
  const [meterError, setMeterError] = useState<string | null>(null)
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
    loadViewingRequests()
    loadTenancyNotices()

    const channel = supabase
      .channel('admin_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'viewing_requests' }, (payload) => {
        setViewingRequests(prev => [...prev, payload.new as ViewingRequest])
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tenancy_notices' }, () => {
        loadTenancyNotices()
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user?.id}` },
        (payload) => {
          const n = payload.new as { type: string; title: string; body: string }
          setAdminToast(`${n.title}${n.body ? `: ${n.body}` : ''}`)
          setTimeout(() => setAdminToast(null), 6000)
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rent_payments' },
        (payload) => {
          const p = payload.new as { status: string; amount: number }
          if (p.status === 'succeeded') {
            setAdminToast(`Rent payment received: ${gbp(p.amount)}`)
            setTimeout(() => setAdminToast(null), 8000)
            setAnalyticsLoaded(false)
            loadAnalytics()
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'prt_agreements' },
        (payload) => {
          const row = payload.new as { property_id: string; status: string }
          if (row.property_id === selectedPropertyRef.current?.id) {
            if (row.status === 'tenant_signed') setSentPrtStatus('tenant_signed')
            if (row.status === 'executed') setSentPrtStatus('executed')
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  useEffect(() => {
    if (tab === 'rent') { setAnalyticsLoaded(false); loadAnalytics() }
    else if ((tab === 'analytics' || tab === 'analyticsDetail') && !analyticsLoaded) loadAnalytics()
    if (tab === 'users' && !usersLoaded) loadUsers()
    if (tab === 'staff' && !staffLoaded) loadStaff()
    if (tab === 'properties' && !adminPropsLoaded) loadAdminProps()
    if (tab === 'properties' && !maintenanceLoaded) loadMaintenance()
    if (tab === 'properties' && !complianceAlertsLoaded) loadComplianceAlerts()
    if (tab === 'maintenance' && !maintenanceLoaded) loadMaintenance()
    if (tab === 'maintenance' && !complianceAlertsLoaded) loadComplianceAlerts()
    if (tab === 'todo' && !adminPropsLoaded) loadAdminProps()
    if (tab === 'todo' && !maintenanceLoaded) loadMaintenance()
    if (tab === 'todo' && !complianceAlertsLoaded) loadComplianceAlerts()
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
      .select('id, property_id, type, issue_date, expiry_date, status, document_url, notes, uploaded_at, pdf_url, cleanliness_comment, odour_comment, heat_detector_present, smoke_detector_present, co_detector_present')
      .eq('property_id', selectedProperty.id)
      .order('expiry_date', { ascending: true })
      .then(({ data }) => {
        setComplianceItems(data ?? [])
        setComplianceLoading(false)
      })
  }, [selectedProperty?.id])

  useEffect(() => {
    if (!selectedProperty) {
      setPrtDoc(null)
      setSentPrtId(null)
      setSentPrtStatus(null)
      setSentPrtHtml(null)
      setLandlordNotifiedAt(null)
      return
    }
    setPrtLoading(true)
    Promise.all([
      supabase.from('documents')
        .select('id, label, url, uploaded_at')
        .eq('property_id', selectedProperty.id)
        .eq('type', 'tenancy_agreement')
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.rpc('get_property_prt', { p_property_id: selectedProperty.id }),
    ]).then(([{ data: doc }, { data: prtRows }]) => {
      setPrtDoc(doc ?? null)
      const prt = Array.isArray(prtRows) && prtRows.length > 0 ? prtRows[0] : null
      if (prt) {
        setSentPrtId(prt.id)
        setSentPrtStatus(prt.status as 'pending' | 'tenant_signed' | 'executed')
        setLandlordNotifiedAt(prt.landlord_notified_at ?? null)
      } else {
        setSentPrtId(null)
        setSentPrtStatus(null)
        setSentPrtHtml(null)
        setLandlordNotifiedAt(null)
      }
      setPrtLoading(false)
    })
  }, [selectedProperty?.id])

  // Poll PRT status while pending so admin sees tenant signature without a refresh
  useEffect(() => {
    if (!selectedProperty || sentPrtStatus !== 'pending') return
    const interval = setInterval(async () => {
      const { data } = await supabase.rpc('get_property_prt', { p_property_id: selectedProperty.id })
      const prt = Array.isArray(data) && data.length > 0 ? data[0] : null
      if (prt?.status === 'tenant_signed') setSentPrtStatus('tenant_signed')
      if (prt?.status === 'executed') setSentPrtStatus('executed')
    }, 8000)
    return () => clearInterval(interval)
  }, [selectedProperty?.id, sentPrtStatus])

  useEffect(() => {
    if (!selectedProperty) { setPropertyTenancy(null); return }
    loadPropertyTenancy(selectedProperty.id)
  }, [selectedProperty?.id])


  useEffect(() => {
    if (!selectedProperty) { setPropertyKeys([]); setKeyEvents([]); return }
    loadPropertyKeys(selectedProperty.id)
  }, [selectedProperty?.id])

  useEffect(() => {
    if (!selectedProperty) { setPropertyDeductions([]); return }
    loadPropertyDeductions(selectedProperty.id)
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
      .select('id, tenant_id, start_date, end_date, monthly_rent, deposit_scheme, deposit_registered_date, last_rent_increase_date, profiles(full_name, email, phone)')
      .eq('property_id', propertyId)
      .eq('is_current', true)
      .order('start_date')
    const rows = (data ?? []) as unknown as Array<{ id: string; tenant_id: string; start_date: string; end_date: string | null; monthly_rent: number | null; deposit_scheme: string | null; deposit_registered_date: string | null; last_rent_increase_date: string | null; profiles: { full_name: string | null; email: string; phone: string | null } | { full_name: string | null; email: string; phone: string | null }[] | null }>
    const mapped = rows.map(raw => {
      const prof = Array.isArray(raw.profiles) ? raw.profiles[0] ?? null : raw.profiles
      return { id: raw.id, tenant_id: raw.tenant_id, tenant_name: prof?.full_name ?? null, tenant_email: prof?.email ?? '', tenant_phone: prof?.phone ?? null, start_date: raw.start_date, end_date: raw.end_date, monthly_rent: raw.monthly_rent, deposit_scheme: raw.deposit_scheme, deposit_registered_date: raw.deposit_registered_date, last_rent_increase_date: raw.last_rent_increase_date }
    })
    setPropertyTenancies(mapped)
    setPropertyTenancy(mapped[0] ?? null)
    setPropertyTenancyLoading(false)
  }

  async function handleEndTenancy(tenancyId: string) {
    const today = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('tenancies').update({ is_current: false, end_date: today }).eq('id', tenancyId)
    if (error) { console.error('End tenancy failed:', error); return }
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
    setPropertyTenancies(prev => prev.filter(t => t.id !== tenancyId))
    setPropertyTenancy(prev => prev?.id === tenancyId ? null : prev)
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

  function openPRTGenerator() {
    if (!selectedProperty || propertyTenancies.length === 0) return
    const t = propertyTenancies[0]
    const rent = t.monthly_rent ?? selectedProperty.monthly_rent ?? 0
    let firstPayment = rent
    let firstPaymentPeriod = ''
    if (t.start_date) {
      const d = new Date(t.start_date)
      const day = d.getDate()
      const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      if (day > 1) {
        firstPayment = Math.round(((daysInMonth - day + 1) / daysInMonth) * rent * 100) / 100
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0)
        firstPaymentPeriod = `${fmtDate(t.start_date)} to ${fmtDate(lastDay.toISOString().slice(0, 10))}`
      } else {
        firstPaymentPeriod = fmtDate(t.start_date)
      }
    }
    setPrtForm({
      tenantName: t.tenant_name ?? '',
      tenantAddress: '',
      tenantEmail: t.tenant_email ?? '',
      tenantPhone: t.tenant_phone ?? '',
      startDate: t.start_date ?? '',
      monthlyRent: String(rent),
      firstPayment: String(firstPayment),
      depositAmount: String(selectedProperty.deposit_amount ?? ''),
      landlordName: selectedProperty.profiles?.full_name ?? '',
      landlordReg: selectedProperty.landlord_registration_number ?? '',
    })
    void firstPaymentPeriod
    setShowPRTGenerator(true)
  }

  function _buildPRTHtml(): string | null {
    const f = prtForm
    if (!selectedProperty) return null
    const rent = parseFloat(f.monthlyRent) || 0
    const firstPay = parseFloat(f.firstPayment) || 0
    const deposit = parseFloat(f.depositAmount) || 0

    const startDate = f.startDate ? new Date(f.startDate) : null
    const startDay = startDate ? startDate.getDate() : 1
    const lastDayOfMonth = startDate ? new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0) : null
    const nextPaymentDate = startDate ? new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1) : null

    const fmt = (d: Date | null) => d ? d.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '___________'
    const fmtShort = (s: string) => s ? new Date(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '___________'

    const isFirstOfMonth = startDay === 1
    const firstPaymentText = isFirstOfMonth
      ? `The first payment will be paid in cleared funds on or before ${fmtShort(f.startDate)} and will be for the sum of £${rent.toFixed(2)} in respect of the first month's rent (the maximum amount of rent which can be paid in advance is 6 months' rent).`
      : `The first payment will be paid in cleared funds on or before ${fmtShort(f.startDate)} and will be for the sum of £${firstPay.toFixed(2)} in respect of the period ${fmtShort(f.startDate)} to ${fmt(lastDayOfMonth)} (the maximum amount of rent which can be paid in advance is 6 months' rent).`

    const nextPayText = nextPaymentDate ? `Thereafter payments of £${rent.toFixed(2)} must be received on or before ${fmt(nextPaymentDate)} and then subsequently on or before the same date each calendar month thereafter until termination of this tenancy agreement.` : ''

    const addressParts = selectedProperty.address.split(',').map((s: string) => s.trim()).filter(Boolean)
    const propertyAddress = [...addressParts, selectedProperty.postcode].filter(Boolean).join('\n')

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Private Residential Tenancy Agreement — ${selectedProperty.address}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; background: #fff; padding: 0; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 20mm 20mm 20mm 20mm; page-break-after: always; }
  .page:last-child { page-break-after: avoid; }
  h1 { font-size: 15pt; text-align: center; margin-bottom: 16pt; }
  h2 { font-size: 12pt; margin: 14pt 0 6pt; font-weight: bold; text-decoration: underline; }
  h3 { font-size: 11pt; margin: 10pt 0 4pt; font-weight: bold; }
  p { margin-bottom: 8pt; line-height: 1.5; }
  ul { margin: 6pt 0 8pt 20pt; }
  li { margin-bottom: 4pt; line-height: 1.5; }
  .logo-block { text-align: center; padding-bottom: 16pt; margin-bottom: 16pt; border-bottom: 1px solid #0D1B3E; }
  .logo-wordmark { font-family: Georgia, 'Times New Roman', serif; font-size: 26pt; font-weight: normal; letter-spacing: 10px; color: #0D1B3E; text-transform: uppercase; }
  .logo-rule { width: 100px; height: 1px; background: #0D1B3E; margin: 6pt auto; opacity: 0.3; }
  .logo-sub { font-size: 7pt; letter-spacing: 4px; color: #4A5878; text-transform: uppercase; font-weight: normal; }
  .doc-title { font-size: 11pt; text-align: center; color: #4A5878; margin-top: 10pt; letter-spacing: 1px; text-transform: uppercase; }
  .clause { margin-bottom: 12pt; }
  .clause-num { font-weight: bold; margin-right: 4pt; }
  .filled { font-weight: bold; }
  .section-title { font-size: 12pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; margin: 18pt 0 10pt; border-top: 2px solid #0D1B3E; padding-top: 10pt; color: #0D1B3E; }
  .page-num { text-align: center; font-size: 9pt; color: #666; margin-top: 20pt; }
  .toolbar { position: fixed; top: 0; left: 0; right: 0; background: #0D1B3E; display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; z-index: 9999; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
  .toolbar-title { font-family: Georgia, serif; font-size: 13px; color: rgba(255,255,255,0.7); letter-spacing: 2px; text-transform: uppercase; }
  .toolbar-btns { display: flex; gap: 8px; }
  .btn-print { padding: 8px 18px; background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.25); border-radius: 6px; font-size: 12px; cursor: pointer; }
  .btn-save { padding: 8px 18px; background: #4ade80; color: #0D1B3E; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
  .btn-print:hover { background: rgba(255,255,255,0.18); }
  .btn-save:hover { background: #22c55e; }
  @media print {
    body { padding: 0; }
    .page { margin: 0; page-break-after: always; }
    .toolbar { display: none; }
  }
  body { padding-top: 52px; }
  @media print { body { padding-top: 0; } }
</style>
</head>
<body>
<div class="toolbar no-print">
  <span class="toolbar-title">Aurelius · PRT Agreement</span>
  <div class="toolbar-btns">
    <button class="btn-print" onclick="window.print()">Print</button>
  </div>
</div>

<div class="page">
<div class="logo-block">
  <div class="logo-wordmark">Aurelius</div>
  <div class="logo-rule"></div>
  <div class="logo-sub">Property Management</div>
</div>
<div class="doc-title">Scottish Private Residential Tenancy Agreement</div>
<br>

<h1>Scottish Private Residential Tenancy Agreement</h1>

<div class="section-title">Section 1: How to Use This Agreement</div>
<p>A Landlord is under a duty to provide the written terms of a private residential tenancy under section 10 of the Private Housing (Tenancies) (Scotland) Act 2016 ("the Act").</p>
<p>The Private Residential Tenancies (Information for Tenants) (Scotland) Regulations 2017 provide that if a Landlord chooses not to use the Model Private Residential Tenancy Agreement, the Landlord is still legally required to give a Tenant a copy of the Private Residential Tenancy Statutory Terms Supporting Notes.</p>

<div class="section-title">Section 2: Glossary of Terms and Interpretation</div>
<p>In this Agreement, the following words have these meanings except where the content indicates otherwise:</p>
<ul>
<li><strong>The Act:</strong> The Private Housing (Tenancies) (Scotland) Act 2016</li>
<li><strong>Assignation:</strong> where a Tenant transfers his or her rights to a private residential tenancy (or share in a joint tenancy) to another person, subject to obtaining the Landlord's prior written permission.</li>
<li><strong>Common Parts:</strong> in relation to the Let Property, the structure and exterior of, and any common facilities within or used in connection with, the building or part of a building which includes the Let Property but only in so far as the structure, exterior and common facilities are not solely owned by the owner of the Let Property.</li>
<li><strong>Eviction ground:</strong> one or more of the grounds named in schedule 3 of the Act on the basis of which an eviction order may be issued by the First-tier Tribunal for Scotland Housing and Property Chamber ("the Tribunal").</li>
<li><strong>Fixed carbon-fuelled appliance:</strong> an appliance that is attached to the building fabric or connected to a mains fuel supply and burns fuel to produce energy.</li>
<li><strong>Guarantor:</strong> a third party, such as a parent or close relative, who agrees to pay rent if the Tenant does not pay it and meet any other obligation that the Tenant fails to meet.</li>
<li><strong>House in Multiple Occupation (HMO):</strong> living accommodation occupied by three or more adults (aged 16 or over) from three or more families as their only or main residence with shared basic amenities.</li>
<li><strong>Jointly and severally liable:</strong> where there are two or more Joint Tenants, each Joint Tenant is fully liable to the Landlord(s) for the obligations of the Tenant under this Agreement including the obligation to pay rent.</li>
<li><strong>Landlord:</strong> includes any Joint Landlord.</li>
<li><strong>Let Property:</strong> the property rented by the Tenant from the Landlord.</li>
<li><strong>Letting Agent:</strong> works for the Landlord of a Let Property and offers a range of services from finding suitable Tenants, collecting rent, arranging repairs etc.</li>
<li><strong>Neighbour:</strong> any person living in the neighbourhood.</li>
<li><strong>Neighbourhood:</strong> the local area of the Let Property.</li>
<li><strong>Private Residential Tenancy:</strong> a tenancy where the property is let to an individual as a separate dwelling; the Tenant occupies all or part of it as the Tenant's only or principal home; and the tenancy is not one which is excluded under schedule 1 of the Act.</li>
<li><strong>Registered Landlord:</strong> a person who is entered in the register prepared and maintained by the local authority for the purposes of Part 8 of the Antisocial Behaviour etc. (Scotland) Act 2004.</li>
<li><strong>Rent:</strong> any sum payable periodically by the Tenant to the Landlord in connection with the tenancy.</li>
<li><strong>Rent-increase notice:</strong> the notice that a Landlord under a private residential tenancy must use when notifying a Tenant of a proposed rent increase.</li>
<li><strong>Rent officer:</strong> an independent officer appointed by law who can decide how much rent is payable under a private residential tenancy.</li>
<li><strong>Rent Pressure Zone (RPZ):</strong> a defined area in which Scottish Ministers have put a cap on how much rents for existing Tenants can be increased by each year.</li>
<li><strong>Statutory terms:</strong> the terms which apply to every private residential tenancy.</li>
<li><strong>Tenant:</strong> includes any joint Tenant or joint sub-Tenant.</li>
<li><strong>The Tribunal:</strong> the First-tier Tribunal for Scotland Housing and Property Chamber.</li>
</ul>
<p>Declaring for the purposes of this Agreement that words importing the masculine gender shall include the feminine gender and vice versa; words in the singular include the plural and vice versa, and where there are two or more persons included in the expression "the Tenant" the obligations and conditions to be met by "the Tenant", including payment of the rent, apply to all such persons jointly and severally.</p>
</div>

<div class="page">
<div class="section-title">Section 3: Scottish Private Residential Tenancy Agreement</div>

<div class="clause">
<h3>1. TENANT</h3>
<p>Name(s) and Address(es):</p>
<p><strong>Tenant (1) ${f.tenantName}${f.tenantAddress ? ', ' + f.tenantAddress.replace(/\n/g, ', ') : ''}</strong> ("the Tenant(s)")</p>
<p>Where this is a joint tenancy, the term "Tenant" applies to each of the individuals above and the full responsibilities and rights set out in this Agreement apply to each Tenant who will be jointly and severally liable for all of the obligations of the Tenant under this Agreement.</p>
<p>Email address(es):<br><strong>Tenant (1) email address: ${f.tenantEmail}</strong></p>
<p>Telephone number(s):<br><strong>Tenant (1) telephone number: ${f.tenantPhone}</strong></p>
</div>

<div class="clause">
<h3>2. LETTING AGENT</h3>
<p><strong>Name: Aurelius Property Management</strong><br>
or such other Agent as the Landlord may from time to time appoint. For the avoidance of doubt, the Landlord may decide to undertake the management of the Let Property personally.</p>
<p>Email address: <strong>aureliuspropertymanagement@gmail.com</strong></p>
</div>

<div class="clause">
<h3>3. LANDLORD</h3>
<p><strong>Landlord (1): ${f.landlordName}</strong><br>
Care of Aurelius Property Management</p>
${f.landlordReg ? `<p>Landlord (1) registration number: <strong>${f.landlordReg}</strong></p>` : ''}
</div>

<div class="clause">
<h3>4. COMMUNICATION</h3>
<p>The Landlord and Tenant agree that all communications which may or must be made under the Act and in relation to this Agreement, including notices to be served by one party on the other will be made in writing using hard copy by personal delivery or recorded delivery or the email addresses set out in clauses 1 and 2 above.</p>
<p>For communication by email it is essential that the Landlord(s) and Tenant(s) consider carefully whether this option is suitable for them. It should be noted that notices may be sent by email; this includes important documents such as a rent-increase notice and a notice to leave the Let Property.</p>
<p>To ensure all correspondence can be received and read in good time, the Landlord(s) and Tenant(s) agree to inform each other as soon as possible of any new correspondence address or email address which is to be used instead of those notified in this Agreement, and in any event within seven days of the change.</p>
<p>If sending a document electronically or by recorded delivery post, the document will be regarded as having been received 48 hours after it was sent, unless the receiving party can provide proof that he or she received it later than this.</p>
</div>

<div class="clause">
<h3>5. DETAILS OF THE LET PROPERTY</h3>
<p>Address:<br><strong>${propertyAddress.replace(/\n/g, '<br>')}</strong> ("the Let Property")</p>
<p>and (under explanation that any loft and attic are only to be used for the purposes of access for maintenance work instructed by the Landlord or his Letting Agent) together with the whole furnishings, plenishings and effects therein (hereinafter referred to as "the contents") all as detailed in the inventory.</p>
<p>Type of property: <strong>${selectedProperty.property_type ? selectedProperty.property_type.charAt(0).toUpperCase() + selectedProperty.property_type.slice(1) : 'Flat'}</strong></p>
<p>Any other areas/facilities included with the Let Property: Not specified</p>
<p>Any shared areas/facilities: Not specified</p>
<p>Any excluded areas/facilities: Not specified</p>
<p>The Let Property is furnished. See the inventory for further details.</p>
<p>The Let Property is not located in a rent pressure zone.</p>
<p>The Let Property is not a House in Multiple Occupation (HMO).</p>
</div>

<div class="clause">
<h3>6. START DATE OF THE TENANCY</h3>
<p>The private residential tenancy will start on: <strong>${fmtShort(f.startDate)}</strong> ("the start date of the tenancy").</p>
</div>

<div class="clause">
<h3>7. OCCUPATION AND USE OF THE PROPERTY</h3>
<p>The Tenant agrees to continue to occupy the Let Property as his or her home and must obtain the Landlord's/Letting Agent's written permission before carrying out any trade, business or profession there.</p>
</div>

<div class="clause">
<h3>8. RENT</h3>
<p>The rent is <strong>£${rent.toFixed(2)}</strong> per calendar month payable in advance on the first day of each calendar month.</p>
<p>${firstPaymentText}</p>
<p>${nextPayText}</p>
<p><strong>Pro-rated rent on move-in:</strong> Where the Tenant moves into the Let Property on a date other than the first day of a calendar month, the rent for the period from the move-in date to the last day of that calendar month shall be calculated on a daily basis. The daily rate is calculated by dividing the monthly rent by the number of days in that calendar month. This pro-rated sum is due and must be paid in cleared funds on or before the move-in date, prior to the commencement of the standard monthly rent payments. Thereafter, the full monthly rent of £${rent.toFixed(2)} shall be payable on the first day of each subsequent calendar month.</p>
<p><strong>Pro-rated rent on move-out:</strong> Where the tenancy ends on a date other than the last day of a calendar month, the rent due for that final partial month shall be calculated on a daily basis, being the daily rate multiplied by the number of days of occupation in that month. The Tenant shall remain liable for rent up to and including the date on which vacant possession of the Let Property is returned to the Landlord/Letting Agent. Any overpayment of rent beyond the termination date shall be refunded to the Tenant; any shortfall shall remain due and payable. It shall be the Tenant's responsibility to cancel Standing Order payments for rent upon termination of the tenancy. The Tenant shall not effect such cancellation until after the final rent payment due hereunder has been received.</p>
<p>The rent shall be paid by Banking Standing Order or such other method as agreed between Aurelius Property Management and Tenant.</p>
<p>Interest on late payment of rent may be charged by the Landlord at eight per cent per year from the date on which the rent is due until payment is made.</p>
<p>The Tenant shall be held liable for any further reasonable costs incurred by the Landlord through the Tenant's failure to pay rent on time.</p>
</div>
</div>

<div class="page">
<div class="clause">
<h3>9. RENT RECEIPTS</h3>
<p>Where any payment of rent is made in cash, the Landlord must provide the Tenant with a dated written receipt for the payment stating: the amount paid, and either (as the case may be) the amount which remains outstanding, or confirmation that no further amount remains outstanding.</p>
</div>

<div class="clause">
<h3>10. RENT INCREASES</h3>
<p>The rent cannot be increased more than once in any twelve-month period and the Landlord must give the Tenant at least three months' notice before any increase can take place. In order to increase the rent, the Landlord must give the Tenant a rent-increase notice, the content of which is set out in "The Private Residential Tenancies (Prescribed Notices and Forms) (Scotland) Regulations 2017".</p>
<p>Within 21 days of receiving a rent-increase notice, the Tenant can refer the increase to a rent officer for adjudication if he or she considers that the rent increase amount is unreasonable, unless the property is located in a rent pressure zone (RPZ).</p>
</div>

<div class="clause">
<h3>11. DEPOSIT</h3>
<p>The Landlord must lodge any deposit they receive with a tenancy deposit scheme within 30 working days of the start date of the tenancy.</p>
<p>A tenancy deposit scheme is an independent third-party scheme approved by the Scottish Ministers to hold and protect a deposit until it is due to be repaid.</p>
<p>At the start date of the tenancy or before, a deposit of <strong>£${deposit.toFixed(2)}</strong> will be paid by the Tenant to the Landlord (via Letting Agent) in cleared funds. The Landlord/Letting Agent will issue a receipt for the deposit to the Tenant. No interest shall be paid by the Landlord to the Tenant for the deposit. The Tenant shall not be entitled to offset any part of the deposit against any rent due by him without the Landlord's/Letting Agent's prior written consent.</p>
<p>By law, the deposit amount cannot exceed the equivalent of two months' rent and cannot include any premiums.</p>
<p>The Landlord will be entitled to apply to the relevant Deposit Scheme and request deposit deductions for:</p>
<ul>
<li>any rent arrears, and any reasonable costs incurred by the Landlord through the Tenant's failure to pay rent on time;</li>
<li>breakages, losses or damage to the Let Property, furniture, fixtures and fittings for which the Tenant is liable in terms of this Agreement;</li>
<li>all sums and any reasonable costs incurred by the Landlord in respect of any cleaning or redecoration which may be required, but which the Tenant has failed to do to ensure the Let Property and contents are left in good tenantable order;</li>
<li>all sums in respect of any garden maintenance which may be required, but which the Tenant has failed to do;</li>
<li>the cost of replacement of keys provided but not returned and/or the cost of the replacement of corresponding locks;</li>
<li>any outstanding bills/accounts for utilities, local authority taxes, or any other accounts opened by the Tenant in reference to the Let Property;</li>
<li>any legal fees, VAT and outlays incurred by the Landlord as a result of the Tenant's breach of this tenancy agreement;</li>
<li>any other costs incurred by the Landlord through the Tenant's failure to fulfil the conditions of this Agreement.</li>
</ul>
</div>

<div class="clause">
<h3>12. SUBLETTING AND ASSIGNATION</h3>
<p>Unless the Tenant has received prior written permission from the Landlord/Letting Agent, the Tenant must not sublet the Let Property (or any part of it); take in a lodger or paying guests; assign the Tenant's interest in the Let Property (or any part of it); or otherwise part with, or give up to another person, possession of the Let Property (or any part of it).</p>
</div>

<div class="clause">
<h3>13. NOTIFICATION ABOUT OTHER RESIDENTS</h3>
<p>If a person aged 16 or over (who is not a Joint Tenant) occupies the Let Property with the Tenant as that person's only or principal home, the Tenant must notify the Landlord/Letting Agent in writing of that person's name and relationship to the Tenant.</p>
</div>

<div class="clause">
<h3>14. OVERCROWDING</h3>
<p>The Tenant must not allow the Let Property to become overcrowded. If the Let Property does become overcrowded, the Landlord can take action to evict the Tenant as the Tenant has breached this term of this Agreement.</p>
</div>

<div class="clause">
<h3>15. INSURANCE</h3>
<p>The Landlord is responsible for paying premiums for any insurance of the building and contents belonging to him or her. The Landlord will have no liability to insure any items belonging to the Tenant. The Tenant is responsible for arranging any contents insurance which the Tenant requires for his or her own belongings.</p>
</div>

<div class="clause">
<h3>16. ABSENCES</h3>
<p>The Tenant agrees to notify the Landlord/Letting Agent if he or she is to be absent from the Let Property for any reason for a period of more than 14 days.</p>
</div>
</div>

<div class="page">
<div class="clause">
<h3>17. REASONABLE CARE</h3>
<p>The Tenant agrees to take reasonable care of the Let Property and any common parts, and in particular agrees to take all reasonable steps to:</p>
<ul>
<li>keep the Let Property adequately ventilated and heated to prevent condensation;</li>
<li>not bring any hazardous or combustible goods or material into the Let Property;</li>
<li>not put any damaging oil, grease, paint or other harmful or corrosive substance into the washing or sanitary appliances or drains;</li>
<li>not flush anything other than bodily waste and toilet paper down the toilet;</li>
<li>prevent water pipes freezing in cold weather;</li>
<li>avoid danger to the Let Property or neighbouring properties by way of fire or flooding;</li>
<li>ensure the Let Property and its fixtures and fittings are kept clean during the tenancy;</li>
<li>not interfere with the smoke detectors, carbon monoxide detectors, heat detectors or the fire alarm system;</li>
<li>not to hang any pictures or affix any posters to the walls without prior written consent from the Landlord/Letting Agent;</li>
<li>not to keep any dog, cat or other pet without the prior written consent of the Landlord/Letting Agent;</li>
<li>not use electrical equipment, appliances, multi-socket extenders or adaptors which might overload the existing electrical system;</li>
<li>drain the central water system in the Let Property if the Let Property is to be left unoccupied and unheated for more than forty-eight hours at any time during the winter months.</li>
</ul>
</div>

<div class="clause">
<h3>18. THE REPAIRING STANDARD AND OTHER INFORMATION</h3>
<p>The Landlord is responsible for ensuring that the Let Property meets the Repairing Standard. The Landlord must carry out a pre-tenancy check of the Let Property to identify work required to meet the Repairing Standard and notify the Tenant of any such work. The Landlord also has a duty to repair and maintain the Let Property from the start date of the tenancy and throughout the tenancy.</p>
<p>A privately rented Let Property must meet the Repairing Standard as follows:</p>
<ul>
<li>The Let Property must be wind and water tight and in all other respects reasonably fit for people to live in;</li>
<li>The structure and exterior (including drains, gutters and external pipes) must be in a reasonable state of repair and in proper working order;</li>
<li>Installations for supplying water, gas and electricity and for sanitation, space heating and heating water must be in a reasonable state of repair and in proper working order;</li>
<li>Any fixtures, fittings and appliances that the Landlord provides under the tenancy must be in a reasonable state of repair and in proper working order;</li>
<li>Any furnishings that the Landlord provides under the tenancy must be capable of being used safely for the purpose for which they are designed;</li>
<li>The Let Property must have a satisfactory way of detecting fires and for giving warning in the event of a fire or suspected fire;</li>
<li>The Let Property must have a satisfactory way of giving warning if there is a hazardous concentration of carbon monoxide gas.</li>
</ul>
<p><strong>GAS SAFETY:</strong> The Landlord must ensure that there is an annual gas safety check on all gas pipework and gas appliances carried out by a Gas Safe registered engineer. The Tenant must be given a copy of the Landlord's Gas Safety certificate.</p>
<p><strong>ELECTRICAL SAFETY:</strong> The Landlord must ensure that an electrical safety inspection is carried out at least every five years consisting of an Electrical Installation Condition Report (EICR) and Portable Appliance Testing (PAT) on appliances provided by the Landlord.</p>
<p><strong>ENERGY PERFORMANCE CERTIFICATE (EPC):</strong> A valid EPC (not more than 10 years old) must be given to the Tenant at or before the start date of the tenancy.</p>
<p><strong>REPAIR TIMETABLE:</strong> The Tenant undertakes to notify the Landlord/Letting Agent in writing as soon as is reasonably practicable of the need for any repair or emergency.</p>
</div>

<div class="clause">
<h3>19. LEGIONELLA</h3>
<p>The Tenant shall report any defect with the water supply including air conditioning units, shower, water tanks, taps and pipe that they are aware of to the Landlord. At the start of the tenancy and throughout, the Landlord must take reasonable steps to assess any risk from exposure to legionella to ensure the safety of the Tenant in the Let Property.</p>
</div>

<div class="clause">
<h3>20. ACCESS FOR REPAIRS, INSPECTIONS AND VALUATIONS</h3>
<p>The Tenant must allow reasonable access to the Let Property for an authorised purpose where the Tenant has been given at least 48 hours' notice, or access is required urgently. Authorised purposes are: carrying out work which the Landlord is required to or is allowed to carry out; inspecting the Let Property to see if any such work is needed; and carrying out a valuation of the Let Property.</p>
<p>The Landlord and/or his or her Agent shall retain sets of keys for the Let Property which can be used only in circumstances including: in the presence of the Tenant; for maintenance or repair with at least 48 hours' written notice; or in the case of an emergency only after reasonable attempts to get the Tenant's permission.</p>
</div>
</div>

<div class="page">
<div class="clause">
<h3>21. RESPECT FOR OTHERS</h3>
<p>The Tenant shall occupy the Let Property solely as a private dwellinghouse and shall neither do nor suffer to be done within the Let Property anything which in the reasonable opinion of the Landlord or the Agent constitutes a nuisance to neighbours.</p>
<p>The Tenant, those living with him/her, and his/her visitors must not engage in antisocial behaviour to another person. In particular, the Tenant must not make excessive noise; vandalise or damage the Let Property or common parts; leave rubbish in unauthorised places; harass any other Tenant, member of household, visitors, neighbours, or employees of the Landlord or Agent for whatever reason.</p>
<p>In addition, the Tenant, those living with him/her, and his/her visitors must not engage in unlawful activities including: use or carry offensive weapons; use, sell, cultivate or supply unlawful drugs or sell alcohol; store unlicensed firearms; use the Let Property for illegal or immoral purposes.</p>
</div>

<div class="clause">
<h3>22. EQUALITY REQUIREMENTS</h3>
<p>Under the Equality Act 2010, the Landlord must not unlawfully discriminate against the Tenant or prospective Tenant on the basis of their disability, sex, gender reassignment, pregnancy or maternity, race, religion or belief or sexual orientation.</p>
</div>

<div class="clause">
<h3>23. DATA PROTECTION</h3>
<p>The Landlord must comply with the requirements of the Data Protection Act 2018 and the General Data Protection Regulation (EU). The Tenant hereby acknowledges that his or her personal information will be held for the purposes of administering and managing the tenancy. The Tenant accepts that in the course of administering the tenancy, personal information may be shared with third parties to prevent fraud and ensure all outstanding sums due in respect of the Tenant's occupation of the Let Property are paid.</p>
</div>

<div class="clause">
<h3>24. ENDING THE TENANCY</h3>
<p>This tenancy may be ended by:</p>
<p><strong>(i) The Tenant giving notice to the Landlord:</strong><br>
The Tenant giving the Landlord at least 28 days' notice in writing to terminate the tenancy, or any other minimum notice period as otherwise validly agreed between the Landlord and Tenant. Where the Landlord agrees to waive the notice period, his or her agreement must be in writing.</p>
<p><strong>(ii) The Landlord giving notice to the Tenant,</strong> which is only possible using one of the 18 grounds for eviction set out in schedule 3 of the Act. The Landlord must give the Tenant at least 28 days' notice if on the day the Tenant receives the Notice to Leave the Tenant has been entitled to occupy the Let Property for six months or less. The Landlord must give at least 84 days' notice if the Tenant has been entitled to occupy the Let Property for over six months.</p>
<p>When the tenancy ends, the Tenant will leave the contents in the rooms or places in which they were at the commencement of this tenancy agreement and be responsible for the washing or cleaning of all loose covers, curtains, blankets and carpets within the Let Property and remove all rubbish from the Let Property.</p>
<p>Before moving out of the Let Property, the Tenant must:</p>
<ul>
<li>leave it in a clean and tidy condition and in good decorative order;</li>
<li>remove all property not belonging to the Landlord;</li>
<li>make sure any lodgers, sub-tenants and anyone else living in the Let Property leaves at the same time;</li>
<li>allow the Landlord and his or her Agent access to the Let Property to show round new Tenants or prospective purchasers;</li>
<li>submit all the keys in the Tenant's possession to the Landlord;</li>
<li>replace any of the fixtures, fittings or furnishings in the Let Property which have been damaged or lost;</li>
<li>give the Landlord/Letting Agent a forwarding address.</li>
</ul>
</div>

<div class="clause">
<h3>25. CONTENTS AND CONDITION</h3>
<p>The Tenant shall accept the Let Property as they stand as satisfactory in all respects, and shall keep the whole Let Property and contents in good, clean tenantable order and repair and properly heated and aired at all times.</p>
<p>The Tenant will receive a copy of the inventory no later than the start date of the tenancy. The Tenant has a period of 7 days from the start date of the tenancy to ensure that the inventory is correct and either notify the Landlord/Letting Agent of any discrepancies in writing, or to take no action, after which the Tenant shall be deemed to be fully satisfied with the terms of the inventory.</p>
</div>
</div>

<div class="page">
<div class="clause">
<h3>26. DECORATION</h3>
<p>The Tenant must not make any structural alterations or carry out any redecoration of the Let Property without the prior written consent of the Landlord/Letting Agent. Where such consent has been obtained, the Tenant must decorate to the Landlord's/Letting Agent's satisfaction and in a proper and workmanlike manner. The Tenant agrees to keep the Let Property in good decorative repair throughout the tenancy.</p>
</div>

<div class="clause">
<h3>27. ALTERATIONS AND IMPROVEMENTS</h3>
<p>The Tenant must not carry out any improvements or alterations to the Let Property or make any addition thereto or allow any person so to do without obtaining the prior written permission of the Landlord/Letting Agent. The Tenant must not install or set up any equipment or appliance in the Let Property which might overload or interfere with any equipment, apparatus or services in or connected to the Let Property without the prior written permission of the Landlord/Letting Agent.</p>
</div>

<div class="clause">
<h3>28. REFUSE AND RECYCLING</h3>
<p>The Tenant shall be responsible for the proper disposal of all refuse from the Let Property and shall comply with all requirements of the local authority in connection with the disposal of refuse and recycling.</p>
</div>

<div class="clause">
<h3>29. UTILITIES AND COUNCIL TAX</h3>
<p>The Tenant will be responsible for and will pay all accounts for gas, electricity, telephone, broadband, council tax and all other utilities and services consumed at the Let Property during the period of the tenancy unless otherwise agreed in writing with the Landlord. The Tenant shall be responsible for notifying all utility providers and the local authority of the start and end of the tenancy.</p>
</div>

<div class="clause">
<h3>30. TELEVISION LICENSING</h3>
<p>The Tenant shall be responsible for obtaining any television licence required in connection with the use of television receiving equipment at the Let Property during the period of the tenancy.</p>
</div>

<div class="clause">
<h3>31. GARDENS</h3>
<p>Where the Let Property has a garden or outside space, the Tenant shall be responsible for keeping any garden or outside space belonging to or forming part of the Let Property in good, clean and tidy order, and free from weeds and in a reasonable condition throughout the tenancy.</p>
</div>

<div class="clause">
<h3>32. VEHICLES AND PARKING</h3>
<p>The Tenant shall not park any vehicle on the Let Property other than in any designated parking area forming part of the Let Property. The Tenant shall not carry out vehicle repairs on any part of the Let Property without the prior written consent of the Landlord/Letting Agent.</p>
</div>

<div class="clause">
<h3>33. NOTICES</h3>
<p>Any notices required to be served by either party on the other shall be served by recorded delivery letter or by email (as agreed in clause 4 above) to the addresses specified in this Agreement or such other address as may be notified in writing by either party to the other. Any notice so served shall be deemed to have been received 48 hours after it was sent, unless the receiving party can provide proof that he or she received it later than this.</p>
</div>

<div class="clause">
<h3>34. LANDLORD'S OBLIGATIONS</h3>
<p>The Landlord shall allow the Tenant to occupy the Let Property without interruption or disturbance from the Landlord, his Agent or anyone claiming under the Landlord (provided the Tenant keeps to the terms of this Agreement). The Landlord shall fulfil any obligation placed upon the Landlord by any Act of Parliament or statutory instrument applicable to private residential tenancies in Scotland, and shall fulfil his or her obligations under this Agreement.</p>
</div>
</div>

<div class="page">
<div class="clause">
<h3>35. COMMON PARTS</h3>
<p>Where the Let Property forms part of a larger property, the Tenant is entitled to the use of any common parts of the building which are used in connection with the Let Property. The Tenant is responsible for keeping any common parts clean and tidy and must comply with any rules regarding the use of common parts.</p>
</div>

<div class="clause">
<h3>36. HMO</h3>
<p>The Tenant will ensure that the Let Property does not become an unlicensed House in Multiple Occupation (HMO) without the prior written consent of the Landlord/Letting Agent. The Tenant will be liable for reasonable costs and expenses payable by the Landlord (via Letting Agent) as a result of the accommodation being, as a consequence of the Tenant's breach, deemed an unlicensed or unregistered HMO.</p>
</div>

<div class="clause">
<h3>37. INFORMATION ABOUT THE LET PROPERTY</h3>
<p>In addition to this Agreement, the Landlord must give to the Tenant: a Gas Safety Certificate; electrical safety inspection reports (EICR and PAT); an Energy Performance Certificate; and a copy of the "Easy Read" notes which explain the statutory terms of the Private Residential Tenancy.</p>
</div>

<div class="clause">
<h3>38. REGISTRATION</h3>
<p>The Landlord confirms that he or she is, or will be by the start date of the tenancy, registered as a landlord with the relevant local authority under Part 8 of the Antisocial Behaviour etc. (Scotland) Act 2004. If the Landlord's registration has been refused or revoked by the local authority, the Landlord must inform the Tenant immediately.</p>
</div>

<div class="clause">
<h3>39. LANDLORD'S RIGHT TO SELL OR MORTGAGE</h3>
<p>Nothing in this Agreement shall prevent the Landlord from selling or mortgaging the Let Property, provided that any such sale or mortgage does not affect the Tenant's right to continue to occupy the Let Property in accordance with this Agreement.</p>
</div>

<div class="clause">
<h3>40. PRE-TENANCY CHECK</h3>
<p>The Landlord has carried out a pre-tenancy check of the Let Property to identify work required to meet the Repairing Standard and has notified the Tenant of any such work required.</p>
</div>

<div class="clause">
<h3>41. VOID PROVISIONS</h3>
<p>Any term or condition of this Agreement which requires the Tenant to pay a sum in connection with the tenancy (other than rent and the deposit) is void and of no effect.</p>
</div>

<div class="clause">
<h3>42. PREVIOUS AGREEMENTS</h3>
<p>This Agreement supersedes all previous agreements between the Landlord and Tenant in respect of the Let Property.</p>
</div>

<div class="clause">
<h3>43. RIGHTS OF THIRD PARTIES</h3>
<p>This Agreement does not give rise to any rights under the Contract (Third Party Rights) (Scotland) Act 2017 which are enforceable by any person who is not a party to this Agreement.</p>
</div>

<div class="clause">
<h3>44. APPLICABLE LAW</h3>
<p>This Agreement shall be governed by and construed in accordance with the law of Scotland and both parties submit to the exclusive jurisdiction of the Scottish courts.</p>
</div>
</div>

<div class="page">
<div class="clause">
<h3>45. ABANDONMENT</h3>
<p>Where the Landlord believes that the Tenant has abandoned the Let Property, the Landlord must serve a written notice on the Tenant at the Let Property and at any other address for the Tenant which is known to the Landlord. After the expiry of the relevant notice period the Landlord may apply to the Tribunal for an order ending the tenancy. The Landlord must take reasonable steps to preserve any goods left in the Let Property by the Tenant during the notice period.</p>
</div>

<div class="clause">
<h3>46. ELECTRONIC EXECUTION</h3>
<p>The parties agree that this Agreement may be executed electronically. An electronic signature affixed to this Agreement by either party shall have the same legal effect as a handwritten signature. This Agreement, once electronically signed, shall constitute a binding contract between the parties and shall be enforceable in all respects as if it had been executed in writing.</p>
<p style="margin-top:8pt;">For the avoidance of doubt, the parties confirm that the use of electronic signatures is governed by the <strong>Electronic Communications Act 2000</strong> (as amended), which gives legal recognition to electronic signatures and the means of their production, communication or verification. The parties further acknowledge that an electronically executed agreement of this nature constitutes a valid and enforceable legal document under Scots law and the provisions of the <strong>Private Housing (Tenancies) (Scotland) Act 2016</strong>.</p>
<p style="margin-top:8pt;">The record of electronic execution, including the date, time, IP address, typed full name, and drawn signature image, shall be retained by Aurelius Property Management as part of the tenancy audit trail and may be produced as evidence of execution if required.</p>
</div>

<div style="margin-top: 40pt; border-top: 2px solid #000; padding-top: 20pt;">
<h2 style="text-align:center; margin-bottom: 20pt;">SIGNATURES</h2>

<p style="margin-bottom: 30pt;">We, the undersigned, agree to be bound by the terms of this Agreement:</p>

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40pt; margin-bottom: 30pt;">
  <div>
    <p style="font-weight:bold; margin-bottom: 20pt;">TENANT(S)</p>
    <p>Tenant (1): <strong>${f.tenantName}</strong></p>
    <p id="tenant-sig-line" style="margin-top: 30pt; border-bottom: 1px solid #000; width: 80%;">&nbsp;</p>
    <p style="font-size: 9pt; color: #666;">Signature</p>
    <p id="tenant-date-line" style="margin-top: 20pt; border-bottom: 1px solid #000; width: 80%;">&nbsp;</p>
    <p style="font-size: 9pt; color: #666;">Date</p>
  </div>
  <div>
    <p style="font-weight:bold; margin-bottom: 20pt;">${user?.full_name ?? 'Aurelius Property Management'}</p>
    <p id="admin-sig-line" style="margin-top: 30pt; border-bottom: 1px solid #000; width: 80%;">&nbsp;</p>
    <p style="font-size: 9pt; color: #666;">Signature</p>
    <p id="admin-date-line" style="margin-top: 20pt; border-bottom: 1px solid #000; width: 80%;">&nbsp;</p>
    <p style="font-size: 9pt; color: #666;">Date</p>
  </div>
</div>

<p style="font-size: 9pt; color: #666; margin-top: 20pt;">This agreement was prepared on ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} by Aurelius Property Management on behalf of the Landlord.</p>
</div>

<div id="prt-audit-receipt"></div>

</div>
</div>

</body>
</html>`

    return html
  }

  function generatePRTDocument() {
    const html = _buildPRTHtml()
    if (!html) return
    const w = window.open('', '_blank')
    if (!w) { alert('Please allow pop-ups to generate the PRT document.'); return }
    w.document.write(html)
    w.document.close()
  }

  async function sendPRTToTenant() {
    if (!selectedProperty || propertyTenancies.length === 0) return
    const t = propertyTenancies[0]
    if (!t.tenant_id) return
    setPrtSending(true)
    try {
      const html = _buildPRTHtml()
      if (!html) throw new Error('Failed to build PRT document')

      const { data, error } = await supabase.from('prt_agreements').insert({
        property_id: selectedProperty.id,
        tenancy_id: t.id,
        tenant_id: t.tenant_id,
        document_html: html,
        status: 'pending',
      }).select('id').single()

      if (error) throw error
      setSentPrtId(data.id)
      setSentPrtStatus('pending')
      setShowPRTGenerator(false)
      setAdminToast('PRT sent to tenant for signing.')
      setTimeout(() => setAdminToast(null), 5000)
      // Notify tenant (in-app + iOS push)
      const prtSentNotif = {
        title: 'Tenancy agreement ready to sign',
        body: 'Your Private Residential Tenancy Agreement has been sent. Please review and sign it.',
      }
      await supabase.from('notifications').insert({
        user_id: t.tenant_id,
        type: 'prt_sent',
        ...prtSentNotif,
        data: { prt_agreement_id: data.id },
      })
      supabase.functions.invoke('send-push', {
        body: { userId: t.tenant_id, ...prtSentNotif, data: { type: 'prt_sent', prt_agreement_id: data.id } },
      }).catch(err => console.warn('[push:prt_sent]', err))
    } catch (err) {
      console.error('[sendPRTToTenant]', err)
      setAdminToast('Failed to send PRT. Please try again.')
      setTimeout(() => setAdminToast(null), 5000)
    } finally {
      setPrtSending(false)
    }
  }

  async function viewSignedPRT() {
    // Open window immediately (must be synchronous with user gesture to avoid popup blocker)
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write('<p style="font-family:sans-serif;padding:24px;color:#555">Loading agreement…</p>')

    let html = sentPrtHtml
    if (!html) {
      const { data } = await supabase.rpc('get_property_prt_html', { p_property_id: selectedProperty!.id })
      html = data ?? null
      if (html) setSentPrtHtml(html)
    }
    if (!html) { w.close(); return }
    w.document.open()
    w.document.write(html)
    w.document.close()
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
    const canonical = keyTypes.flatMap(t => existingKeys.filter(k => k.key_type === t))
    const extras = existingKeys.filter(k => !(keyTypes as readonly string[]).includes(k.key_type))
    setPropertyKeys([...canonical, ...extras])
    setKeyEvents((events ?? []) as KeyEvent[])
    setKeysLoading(false)
  }

  function handleCheckOut() {
    if (!selectedProperty || !checkOutKeyType || !checkOutName.trim()) return
    const now = new Date().toISOString()
    const name = checkOutName.trim()
    const role = checkOutRole.trim() || null
    const notesVal = checkOutNotes.trim() || null
    const keyId = checkOutKeyType
    const keyType = propertyKeys.find(k => k.id === keyId)?.key_type ?? ''
    setPropertyKeys(prev => prev.map(k =>
      k.id === keyId ? { ...k, holder_name: name, holder_role: role, checked_out_at: now, notes: notesVal } : k
    ))
    setKeyEvents(prev => [{ id: crypto.randomUUID(), property_id: selectedProperty.id, key_type: keyType, action: 'checked_out', person_name: name, notes: notesVal, created_at: now }, ...prev])
    setCheckOutKeyType(null)
    setCheckOutName('')
    setCheckOutRole('')
    setCheckOutNotes('')
    supabase.from('property_keys')
      .update({ holder_name: name, holder_role: role, checked_out_at: now, notes: notesVal })
      .eq('id', keyId)
      .then(({ error }) => {
        if (!error) supabase.from('key_events').insert({ property_id: selectedProperty.id, key_type: keyType, action: 'checked_out', person_name: name, notes: notesVal })
        else console.error('Key checkout save failed:', error.message)
      })
  }

  function handleReturnKey(keyId: string) {
    if (!selectedProperty) return
    const key = propertyKeys.find(k => k.id === keyId)
    const keyType = key?.key_type ?? ''
    const now = new Date().toISOString()
    setPropertyKeys(prev => prev.map(k =>
      k.id === keyId ? { ...k, holder_name: null, holder_role: null, checked_out_at: null, notes: null } : k
    ))
    setKeyEvents(prev => [{ id: crypto.randomUUID(), property_id: selectedProperty.id, key_type: keyType, action: 'returned', person_name: key?.holder_name ?? null, notes: null, created_at: now }, ...prev])
    setReturnConfirmKey(null)
    supabase.from('property_keys')
      .update({ holder_name: null, holder_role: null, checked_out_at: null, notes: null })
      .eq('id', keyId)
      .then(({ error }) => {
        if (!error) supabase.from('key_events').insert({ property_id: selectedProperty.id, key_type: keyType, action: 'returned', person_name: key?.holder_name ?? null, notes: null })
        else console.error('Key return save failed:', error.message)
      })
  }

  async function loadPropertyDeductions(propertyId: string) {
    setPropertyDeductionsLoading(true)
    const { data: mrData } = await supabase.from('maintenance_requests').select('id, title').eq('property_id', propertyId)
    const mrIds = (mrData ?? []).map((r: { id: string }) => r.id)
    if (mrIds.length === 0) { setPropertyDeductions([]); setPropertyDeductionsLoading(false); return }
    const titleMap = Object.fromEntries((mrData ?? []).map((r: { id: string; title: string }) => [r.id, r.title]))
    const { data: invData } = await supabase
      .from('contractor_invoices')
      .select('id, invoice_number, description, total, created_at, maintenance_request_id')
      .in('maintenance_request_id', mrIds)
      .eq('status', 'approved')
      .eq('deduction_queued', true)
      .is('deducted_at', null)
      .order('created_at', { ascending: false })
    setPropertyDeductions(((invData ?? []) as { id: string; invoice_number: string; description: string | null; total: number; created_at: string; maintenance_request_id: string | null }[]).map(inv => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      description: inv.description,
      total: inv.total,
      created_at: inv.created_at,
      jobTitle: inv.maintenance_request_id ? titleMap[inv.maintenance_request_id] ?? null : null,
    })))
    setPropertyDeductionsLoading(false)
  }

  async function handleSaveKeyNumber() {
    if (!selectedProperty) return
    const parsed = keyNumberDraft.trim() === '' ? null : parseInt(keyNumberDraft.trim(), 10)
    if (keyNumberDraft.trim() !== '' && isNaN(parsed as number)) return
    setKeyNumberSaving(true)
    const { error } = await supabase.from('properties').update({ key_number: parsed }).eq('id', selectedProperty.id)
    setKeyNumberSaving(false)
    if (!error) {
      setSelectedProperty(prev => prev ? { ...prev, key_number: parsed } : prev)
      setEditingKeyNumber(false)
    }
  }

  async function handleSaveManualDeduction() {
    if (!selectedProperty) return
    const title = deductionType === 'Custom' ? deductionCustomTitle.trim() : deductionType
    const amount = parseFloat(deductionAmount.trim())
    if (!title || isNaN(amount) || amount <= 0) return
    setDeductionSaving(true)
    setDeductionError(null)
    const now = new Date().toISOString()
    const categoryMap: Record<string, string> = { Inventory: 'general', Legionella: 'plumbing', 'General Maintenance': 'general', Custom: 'general' }
    const { data: reqData, error: reqErr } = await supabase
      .from('maintenance_requests')
      .insert({ property_id: selectedProperty.id, title, description: deductionNotes.trim() || title, category: categoryMap[deductionType], priority: 'medium', status: 'resolved', created_at: now, updated_at: now })
      .select('id').single()
    if (reqErr || !reqData) { setDeductionError(reqErr?.message ?? 'Failed to create job'); setDeductionSaving(false); return }
    const dateTag = new Date().toISOString().slice(0, 7).replace('-', '')
    const invoiceNumber = `DED-${dateTag}-${Math.floor(1000 + Math.random() * 9000)}`
    const { error: invErr } = await supabase.from('contractor_invoices').insert({
      maintenance_request_id: reqData.id,
      invoice_number: invoiceNumber,
      description: title,
      line_items: [],
      subtotal: amount,
      vat_rate: 0,
      vat_amount: 0,
      total: amount,
      status: 'approved',
      invoice_pdf_url: '',
      deduction_queued: true,
      notes: deductionNotes.trim() || null,
      created_at: now,
      updated_at: now,
    })
    setDeductionSaving(false)
    if (invErr) { setDeductionError(invErr.message); return }
    setShowAddDeductionModal(false)
    setDeductionType('Inventory')
    setDeductionCustomTitle('')
    setDeductionAmount('')
    setDeductionNotes('')
    await loadPropertyDeductions(selectedProperty.id)
  }

  async function loadMeterReadings(propertyId: string) {
    setMeterReadingsLoading(true)
    const { data } = await supabase
      .from('meter_readings')
      .select('*')
      .eq('property_id', propertyId)
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
    const val = parseFloat(newMeterReading.replace('/', '.'))
    if (isNaN(val)) return
    setMeterSaving(true)
    const { error } = await supabase.from('meter_readings').insert({
      property_id: selectedProperty.id,
      utility_type: newMeterType,
      reading: val,
      reading_raw: newMeterReading.trim(),
      reading_date: newMeterDate || new Date().toISOString().slice(0, 10),
      notes: newMeterNotes.trim() || null,
    })
    setMeterSaving(false)
    if (error) { setMeterError(error.message); return }
    await loadMeterReadings(selectedProperty.id)
    setShowAddMeterModal(false)
    setNewMeterReading('')
    setNewMeterDate('')
    setNewMeterNotes('')
    setMeterError(null)
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

      const [propsRes, tenanciesForCollRes, paymentsRes, thisMonthPaysRes, stripeThisMonthRes, stripeHistoryRes, maintRes, vacatedNoticesRes, inHouseRes] = await Promise.all([
        supabase.from('properties').select('id, address, monthly_rent, is_active, status, purchase_price, move_out_date, move_in_date, profiles(full_name, email)'),
        supabase.from('tenancies').select('id, property_id, monthly_rent, start_date').eq('is_current', true),
        supabase.from('payments').select('amount, paid_date').not('paid_date', 'is', null).gte('paid_date', cutoffStr).neq('payment_method', 'stripe'),
        supabase.from('payments').select('id, tenancy_id, amount, due_date, paid_date, status, payment_method, notes').gte('due_date', monthStart).lte('due_date', monthEnd).neq('payment_method', 'stripe'),
        supabase.from('rent_payments').select('id, tenancy_id, amount, management_fee, repair_deductions, paid_at').in('status', ['succeeded', 'paid']).gte('paid_at', monthStart).lte('paid_at', monthEnd + 'T23:59:59'),
        supabase.from('rent_payments').select('amount, management_fee, repair_deductions, paid_at').in('status', ['succeeded', 'paid']).not('paid_at', 'is', null).gte('paid_at', cutoffStr),
        supabase.from('maintenance_requests').select('cost, created_at').not('cost', 'is', null).gte('created_at', cutoffStr),
        supabase.from('tenancy_notices').select('property_id, tenancy_id, vacate_date').gte('vacate_date', monthStart).lte('vacate_date', monthEnd),
        supabase.from('contractor_invoices').select('total').is('contractor_id', null).eq('deduction_queued', true).gte('created_at', monthStart).lte('created_at', monthEnd + 'T23:59:59'),
      ])

      const allProps = (propsRes.data ?? []) as unknown as { id: string; address: string; monthly_rent: number | null; is_active: boolean; status: string | null; purchase_price: number | null; move_out_date: string | null; move_in_date: string | null; profiles: { full_name: string | null; email: string }[] | null }[]
      setPropertyCount(allProps.length)

      // Rent roll and tenanted count — notice properties are still occupied
      const activeProps = allProps.filter(p => p.status === 'active' || p.status === 'tenanted' || p.status === 'notice')
      const rentRoll = activeProps.reduce((s, p) => s + Number(p.monthly_rent ?? 0), 0)
      setMonthlyRentRoll(rentRoll)
      setTenantedCount(activeProps.length)

      // YTD gross & net — manual + Stripe
      const ytdManual = (paymentsRes.data ?? []).filter(p => String(p.paid_date) >= ytdStart).reduce((s, p) => s + Number(p.amount ?? 0), 0)
      const ytdStripe = (stripeHistoryRes.data ?? []).filter(p => String(p.paid_at) >= ytdStart).reduce((s, p) => s + Number(p.amount ?? 0), 0)
      const ytdGrossVal = ytdManual + ytdStripe
      const ytdMaint = (maintRes.data ?? []).filter(m => String(m.created_at) >= ytdStart).reduce((s, m) => s + Number(m.cost ?? 0), 0)
      setYtdGross(ytdGrossVal)
      setYtdNet(ytdGrossVal - ytdMaint)

      // Rent collection for current month — all properties
      const tenanciesForColl = (tenanciesForCollRes.data ?? []) as { id: string; property_id: string; monthly_rent: number | null; start_date: string | null }[]
      const thisMonthPays = (thisMonthPaysRes.data ?? []) as { id: string; tenancy_id: string; amount: number; due_date: string; paid_date: string | null; status: string | null; payment_method: string | null; notes: string | null }[]
      const stripeThisMonth = (stripeThisMonthRes.data ?? []) as { id: string; tenancy_id: string; amount: number; management_fee: number; repair_deductions: number; paid_at: string }[]
      setMonthlyMgmtFee(stripeThisMonth.reduce((s, p) => s + Number(p.management_fee ?? 0), 0))
      setMonthlyRepairDeductions(stripeThisMonth.reduce((s, p) => s + Number(p.repair_deductions ?? 0), 0))
      setMonthlyInHouseCost(((inHouseRes.data ?? []) as { total: number }[]).reduce((s, r) => s + Number(r.total ?? 0), 0))
      const thisMonthStr = monthStart.slice(0, 7)
      setMonthlyMaintCost(((maintRes.data ?? []) as { cost: number; created_at: string }[]).filter(m => String(m.created_at).slice(0, 7) === thisMonthStr).reduce((s, m) => s + Number(m.cost ?? 0), 0))
      const vacatedNotices = (vacatedNoticesRes.data ?? []) as { property_id: string; tenancy_id: string; vacate_date: string }[]
      const noticeByPropId: Record<string, { tenancyId: string; vacateDate: string }> = {}
      for (const n of vacatedNotices) {
        noticeByPropId[n.property_id] = { tenancyId: n.tenancy_id, vacateDate: n.vacate_date }
      }
      const tenanciesByPropId: Record<string, { id: string; monthly_rent: number | null; start_date: string | null }[]> = {}
      for (const t of tenanciesForColl) {
        if (!tenanciesByPropId[t.property_id]) tenanciesByPropId[t.property_id] = []
        tenanciesByPropId[t.property_id].push(t)
      }
      const collectionItems = [...allProps]
        .sort((a, b) => a.address.localeCompare(b.address))
        .map(prop => {
          const tenancies = tenanciesByPropId[prop.id] ?? []
          const landlordEmail = prop.profiles?.[0]?.email ?? ''
          const landlordName = prop.profiles?.[0]?.full_name ?? ''

          // Determine if vacating this month — check tenancy_notices first, then properties.move_out_date
          const noticeEntry = noticeByPropId[prop.id]
          const propMoveOut = prop.move_out_date
          const vacateDateThisMonth = noticeEntry?.vacateDate ?? (propMoveOut && propMoveOut >= monthStart && propMoveOut <= monthEnd ? propMoveOut : null)

          // Pro-rated: property is vacating (or vacated) this month
          if (vacateDateThisMonth) {
            const vacateDay = new Date(vacateDateThisMonth + 'T12:00:00').getDate()
            const daysInMonth = new Date(now2.getFullYear(), now2.getMonth() + 1, 0).getDate()
            const monthlyRent = Number(prop.monthly_rent ?? 0)
            const proRated = Math.round(monthlyRent / daysInMonth * vacateDay * 100) / 100
            const vacatingTenancyIds = noticeEntry ? [noticeEntry.tenancyId] : tenancies.map(t => t.id)
            const vacatingTenancyId = noticeEntry?.tenancyId ?? (tenancies[0]?.id ?? '')
            const manualPays = thisMonthPays.filter(p => vacatingTenancyIds.includes(p.tenancy_id) && p.paid_date)
            const stripePays = stripeThisMonth.filter(p => vacatingTenancyIds.includes(p.tenancy_id))
            const collected = manualPays.reduce((s, p) => s + Number(p.amount), 0) + stripePays.reduce((s, p) => s + Number(p.amount), 0)
            const manualPay = thisMonthPays.find(p => vacatingTenancyIds.includes(p.tenancy_id))
            return {
              tenancyId: vacatingTenancyId,
              propertyId: prop.id,
              address: prop.address,
              expected: proRated,
              collected,
              isPaid: proRated > 0 && collected >= proRated,
              isVacant: false,
              isProRated: true,
              moveOutDate: vacateDateThisMonth,
              paymentId: manualPay?.id ?? null,
              dueDate: manualPay?.due_date ?? null,
              paymentMethod: stripePays.length > 0 ? 'Stripe (online)' : (manualPays[0]?.payment_method ?? null),
              paymentNotes: manualPays[0]?.notes ?? null,
              landlordEmail,
              landlordName,
              paidAt: stripePays[0]?.paid_at ?? manualPays[0]?.paid_date ?? null,
            }
          }

          // Pro-rated: property is moving in — show rent due from move-in date to end of month
          // Falls back to tenancy start_date so pro-rating survives after applyMoveIns clears move_in_date
          const tenancyStartThisMonth = tenancies.find(t => t.start_date && t.start_date >= monthStart && t.start_date <= monthEnd && new Date(t.start_date + 'T12:00:00').getDate() > 1)
          const effectiveMoveInDate = prop.move_in_date ?? tenancyStartThisMonth?.start_date ?? null
          const moveInThisMonth = effectiveMoveInDate && effectiveMoveInDate >= monthStart && effectiveMoveInDate <= monthEnd
          if ((prop.status === 'moving_in' || moveInThisMonth) && effectiveMoveInDate) {
            const moveInDate = new Date(effectiveMoveInDate + 'T12:00:00')
            const moveInDay = moveInDate.getDate()
            const daysInMonth = new Date(moveInDate.getFullYear(), moveInDate.getMonth() + 1, 0).getDate()
            const monthlyRent = tenancies.reduce((s, t) => s + Number(t.monthly_rent ?? 0), 0) || Number(prop.monthly_rent ?? 0)
            const proRated = moveInDay > 1 ? Math.round(((daysInMonth - moveInDay + 1) / daysInMonth) * monthlyRent * 100) / 100 : monthlyRent
            const tenancyIds = tenancies.map(t => t.id)
            const tenancyId = tenancies[0]?.id ?? ''
            const manualPays = thisMonthPays.filter(p => tenancyIds.includes(p.tenancy_id) && p.paid_date)
            const stripePays = stripeThisMonth.filter(p => tenancyIds.includes(p.tenancy_id))
            const collected = manualPays.reduce((s, p) => s + Number(p.amount), 0) + stripePays.reduce((s, p) => s + Number(p.amount), 0)
            const manualPay = thisMonthPays.find(p => tenancyIds.includes(p.tenancy_id))
            return {
              tenancyId,
              propertyId: prop.id,
              address: prop.address,
              expected: proRated,
              collected,
              isPaid: proRated > 0 && collected >= proRated,
              isVacant: false,
              isProRated: true,
              moveInDate: effectiveMoveInDate,
              moveOutDate: undefined,
              paymentId: manualPay?.id ?? null,
              dueDate: manualPay?.due_date ?? null,
              paymentMethod: stripePays.length > 0 ? 'Stripe (online)' : (manualPays[0]?.payment_method ?? null),
              paymentNotes: manualPays[0]?.notes ?? null,
              landlordEmail,
              landlordName,
              paidAt: stripePays[0]?.paid_at ?? manualPays[0]?.paid_date ?? null,
            }
          }

          // Only show Vacant when property has no active tenancy and status confirms it
          const isTenanted = tenancies.length > 0 || prop.status === 'active' || prop.status === 'tenanted' || prop.status === 'notice'
          if (!isTenanted) {
            return { tenancyId: tenancies[0]?.id ?? '', propertyId: prop.id, address: prop.address, expected: 0, collected: 0, isPaid: false, isVacant: true, isProRated: false, moveOutDate: undefined, paymentId: null, dueDate: null, paymentMethod: null, paymentNotes: null, landlordEmail, landlordName, paidAt: null }
          }

          // Normal tenanted (including notice properties not vacating this month)
          const tenancyIds = tenancies.map(t => t.id)
          const manualPays = thisMonthPays.filter(p => tenancyIds.includes(p.tenancy_id) && p.paid_date)
          const stripePays = stripeThisMonth.filter(p => tenancyIds.includes(p.tenancy_id))
          const expectedFromTenancies = tenancies.reduce((s, t) => s + Number(t.monthly_rent ?? 0), 0)
          const expected = expectedFromTenancies > 0 ? expectedFromTenancies : Number(prop.monthly_rent ?? 0)
          const collected = manualPays.reduce((s, p) => s + Number(p.amount), 0) + stripePays.reduce((s, p) => s + Number(p.amount), 0)
          const isPaid = expected > 0 && collected >= expected
          const unpaidTenancy = tenancies.find(t =>
            !thisMonthPays.find(p => p.tenancy_id === t.id && p.paid_date) &&
            !stripeThisMonth.find(p => p.tenancy_id === t.id)
          ) ?? tenancies[0]
          const manualPay = unpaidTenancy ? thisMonthPays.find(p => p.tenancy_id === unpaidTenancy.id) : undefined
          return {
            tenancyId: unpaidTenancy?.id ?? '',
            propertyId: prop.id,
            address: prop.address,
            expected,
            collected,
            isPaid,
            isVacant: false,
            isProRated: false,
            moveOutDate: undefined,
            paymentId: manualPay?.id ?? null,
            dueDate: manualPay?.due_date ?? null,
            paymentMethod: stripePays.length > 0 ? 'Stripe (online)' : (manualPays[0]?.payment_method ?? null),
            paymentNotes: manualPays[0]?.notes ?? null,
            landlordEmail,
            landlordName,
            paidAt: stripePays[0]?.paid_at ?? manualPays[0]?.paid_date ?? null,
          }
        })
      collectionItems.sort((a, b) => {
        if (a.isPaid && !b.isPaid) return -1
        if (!a.isPaid && b.isPaid) return 1
        if (a.paidAt && b.paidAt) return b.paidAt.localeCompare(a.paidAt)
        return a.address.localeCompare(b.address)
      })
      setRentCollection(collectionItems)

      // Actual payments received, grouped by month — manual (paid_date) + Stripe (paid_at)
      const payByMonth: Record<string, number> = {}
      for (const pay of paymentsRes.data ?? []) {
        const key = String(pay.paid_date).slice(0, 7)
        payByMonth[key] = (payByMonth[key] ?? 0) + Number(pay.amount ?? 0)
      }
      const mgmtFeeByMonth: Record<string, number> = {}
      const repairDeductionsByMonth: Record<string, number> = {}
      for (const pay of stripeHistoryRes.data ?? []) {
        const key = String(pay.paid_at).slice(0, 7)
        payByMonth[key] = (payByMonth[key] ?? 0) + Number((pay as { amount: number; management_fee: number; repair_deductions: number; paid_at: string }).amount ?? 0)
        mgmtFeeByMonth[key] = (mgmtFeeByMonth[key] ?? 0) + Number((pay as { amount: number; management_fee: number; repair_deductions: number; paid_at: string }).management_fee ?? 0)
        repairDeductionsByMonth[key] = (repairDeductionsByMonth[key] ?? 0) + Number((pay as { amount: number; management_fee: number; repair_deductions: number; paid_at: string }).repair_deductions ?? 0)
      }

      // Maintenance cost by month — from maintenance_requests.cost + stripe repair_deductions
      const maintByMonth: Record<string, number> = {}
      for (const m of maintRes.data ?? []) {
        const key = String(m.created_at).slice(0, 7)
        maintByMonth[key] = (maintByMonth[key] ?? 0) + Number(m.cost ?? 0)
      }
      for (const [key, val] of Object.entries(repairDeductionsByMonth)) {
        maintByMonth[key] = (maintByMonth[key] ?? 0) + val
      }


      // Build 12-month snapshots.
      // rentExpected for each month = sum of monthly_rent for tenancies whose start_date
      // falls on or before that month. This ensures a property only enters the collection
      // rate denominator from the month it became tenanted — not retroactively.
      const snaps: MonthlySnapshot[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date()
        d.setDate(1)
        d.setMonth(d.getMonth() - i)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const expectedForMonth = tenanciesForColl.reduce((sum, t) => {
          const tenancyStart = (t.start_date ?? '').slice(0, 7)
          if (!tenancyStart || tenancyStart <= key) return sum + Number(t.monthly_rent ?? 0)
          return sum
        }, 0)
        snaps.push({
          month: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
          date: key,
          rentCollected: payByMonth[key] ?? 0,
          rentExpected: expectedForMonth,
          maintenanceCost: maintByMonth[key] ?? 0,
          managementFee: mgmtFeeByMonth[key] ?? 0,
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
    const { data } = await supabase.from('users').select('id, email, full_name, role, status, management_fee_percent').order('created_at', { ascending: false })
    setUsers((data ?? []) as UserRow[])
    setUsersLoaded(true)
    setUsersLoading(false)
  }

  function openInviteModal() {
    setInviteEmail('')
    setInviteRole('landlord')
    setInviteName('')
    setInviteError(null)
    setInviteSuccess(false)
    setShowInviteModal(true)
  }

  async function handleSendInvite() {
    if (!inviteEmail.trim()) { setInviteError('Email address is required.'); return }
    setInviteSaving(true)
    setInviteError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''
      const res = await supabase.functions.invoke('send-invite', {
        body: { email: inviteEmail.trim(), role: inviteRole, name: inviteName.trim() || undefined },
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.error || res.data?.ok === false) {
        setInviteError(res.data?.error ?? res.error?.message ?? 'Failed to send invite.')
      } else {
        setInviteSuccess(true)
        // Refresh users list after a brief delay so the new row appears
        setTimeout(() => { setUsersLoaded(false); loadUsers() }, 1200)
      }
    } catch (err) {
      setInviteError(String(err))
    } finally {
      setInviteSaving(false)
    }
  }

  async function loadStaff() {
    setStaffLoading(true)
    const { data: userRows } = await supabase.from('users').select('id, email, full_name, role, status').in('role', ['admin', 'master admin']).order('full_name')
    const members: StaffMember[] = ((userRows ?? []) as UserRow[]).filter((u) => u.role === 'admin' || u.role === 'master admin').map((u) => ({ id: u.id, full_name: u.full_name ?? u.email, email: u.email, role: u.role as 'admin' | 'master admin', status: u.status }))
    setStaff(members); setStaffLoaded(true); setStaffLoading(false)
  }

  async function loadAdminProps() {
    setAdminPropsLoading(true)
    setAdminPropsError(null)
    const { data, error } = await supabase.from('properties').select('id, address, postcode, property_type, bedrooms, monthly_rent, is_active, status, created_at, landlord_id, description, photo_urls, has_gas, is_listed, available_from, listing_headline, landlord_registration_number, epc_rating, pre_tenancy_check_completed, pre_tenancy_check_date, deposit_scheme, deposit_registered_date, deposit_amount, meter_certificate_url, move_in_date, move_out_date, key_number, profiles(full_name, email)').order('created_at', { ascending: false })
    if (error) {
      console.error('[AdminDashboard] loadAdminProps error:', error)
      setAdminPropsError(error.message)
      setAdminPropsLoading(false)
      return
    }
    const props = (data ?? []) as unknown as AdminPropRow[]
    setAdminProps(props)
    setAdminPropsLoaded(true)
    setAdminPropsLoading(false)
    applyMoveIns(props)
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

  async function loadTenancyNotices() {
    const { data } = await supabase
      .from('tenancy_notices')
      .select('id, tenancy_id, tenant_id, property_id, notice_date, vacate_date, status, created_at, properties(address), profiles(full_name, email)')
      .in('status', ['pending', 'acknowledged'])
      .order('created_at', { ascending: false })
    const notices = (data ?? []) as unknown as TenancyNotice[]
    setTenancyNotices(notices)
    applyMoveOuts(notices)
  }

  async function applyMoveIns(props: AdminPropRow[]) {
    const today = new Date().toISOString().slice(0, 10)
    const toActivate = props.filter(p => p.move_in_date && p.move_in_date < today)
    const toVacate = props.filter(p => p.move_out_date && p.move_out_date < today)
    await Promise.all([
      ...toActivate.map(p =>
        supabase.from('properties').update({ status: 'active', is_active: true, move_in_date: null }).eq('id', p.id)
      ),
      ...toVacate.map(p =>
        supabase.from('properties').update({ status: 'vacant', is_active: false, move_out_date: null }).eq('id', p.id)
      ),
    ])
    if (toActivate.length > 0) {
      await supabase.from('audit_logs').insert(toActivate.map(p => ({
        action: 'tenant_move_in',
        entity_type: 'property',
        entity_id: p.id,
        user_id: user?.id ?? null,
        user_role: user?.role ?? 'admin',
        metadata: { address: p.address, move_in_date: p.move_in_date },
      })))
    }
    if (toVacate.length > 0) {
      await supabase.from('audit_logs').insert(toVacate.map(p => ({
        action: 'tenant_move_out',
        entity_type: 'property',
        entity_id: p.id,
        user_id: user?.id ?? null,
        user_role: user?.role ?? 'admin',
        metadata: { address: p.address, move_out_date: p.move_out_date },
      })))
    }
    if (toActivate.length > 0 || toVacate.length > 0) {
      setAdminProps(prev => prev.map(p => {
        if (toActivate.some(t => t.id === p.id)) return { ...p, status: 'active' as PropStatus, is_active: true, move_in_date: null }
        if (toVacate.some(t => t.id === p.id)) return { ...p, status: 'vacant' as PropStatus, is_active: false, move_out_date: null }
        return p
      }))
    }
  }

  async function applyMoveOuts(notices: TenancyNotice[]) {
    const today = new Date().toISOString().slice(0, 10)
    const toVacate = notices.filter(n => n.vacate_date && n.vacate_date < today)
    if (toVacate.length === 0) return
    await Promise.all([
      ...toVacate.map(n =>
        supabase.from('properties').update({ status: 'vacant', is_active: false }).eq('id', n.property_id)
      ),
      ...toVacate.filter(n => n.tenancy_id).map(n =>
        supabase.from('tenancies').update({ status: 'ended', is_current: false }).eq('id', n.tenancy_id)
      ),
      ...toVacate.map(n =>
        supabase.from('tenancy_notices').update({ status: 'completed' }).eq('id', n.id)
      ),
    ])
    await supabase.from('audit_logs').insert(toVacate.map(n => ({
      action: 'tenant_move_out',
      entity_type: 'property',
      entity_id: n.property_id,
      user_id: user?.id ?? null,
      user_role: user?.role ?? 'admin',
      metadata: { address: n.properties?.address ?? null, vacate_date: n.vacate_date, tenancy_id: n.tenancy_id },
    })))
    setTenancyNotices(prev => prev.filter(n => !toVacate.some(t => t.id === n.id)))
    setAdminProps(prev => prev.map(p => {
      const notice = toVacate.find(n => n.property_id === p.id)
      return notice ? { ...p, status: 'vacant' as PropStatus, is_active: false } : p
    }))
  }

  async function toggleTodoCheck(itemId: string, idx: number, checklistLength: number) {
    const current = todoChecks[itemId] ?? []
    const next = [...current]
    next[idx] = !next[idx]
    const updatedChecks = { ...todoChecks, [itemId]: next }
    setTodoChecks(updatedChecks)
    try { localStorage.setItem('aurelius-todo-checks', JSON.stringify(updatedChecks)) } catch { /* ignore */ }

    // When all checklist items are checked, remove from sticky todos
    const allDoneNow = next.filter(Boolean).length === checklistLength
    if (allDoneNow) {
      const { [itemId]: _removed, ...rest } = stickyTodos
      setStickyTodos(rest)
      try { localStorage.setItem('aurelius-sticky-todos', JSON.stringify(rest)) } catch { /* ignore */ }
    }

    // Key handover items trigger property status changes the moment they are ticked
    if (next[idx]) {
      if (itemId.startsWith('movein-') && TODO_CHECKLISTS['Move In']?.[idx]?.label === 'Keys issued to tenant') {
        const propertyId = itemId.slice('movein-'.length)
        await supabase.from('properties').update({ status: 'active', is_active: true, move_in_date: null }).eq('id', propertyId)
        setAdminProps(prev => prev.map(p => p.id === propertyId ? { ...p, status: 'active' as PropStatus, is_active: true, move_in_date: null } : p))
        await supabase.from('audit_logs').insert({
          action: 'tenant_move_in',
          entity_type: 'property',
          entity_id: propertyId,
          user_id: user?.id ?? null,
          user_role: user?.role ?? 'admin',
          metadata: { address: adminProps.find(p => p.id === propertyId)?.address ?? null, trigger: 'keys_issued' },
        })
      } else if (itemId.startsWith('moveout-') && TODO_CHECKLISTS['Move Out']?.[idx]?.label === 'Keys returned from tenant') {
        const propertyId = itemId.slice('moveout-'.length)
        await supabase.from('properties').update({ status: 'vacant', is_active: false, move_out_date: null }).eq('id', propertyId)
        setAdminProps(prev => prev.map(p => p.id === propertyId ? { ...p, status: 'vacant' as PropStatus, is_active: false, move_out_date: null } : p))
        await supabase.from('audit_logs').insert({
          action: 'tenant_move_out',
          entity_type: 'property',
          entity_id: propertyId,
          user_id: user?.id ?? null,
          user_role: user?.role ?? 'admin',
          metadata: { address: adminProps.find(p => p.id === propertyId)?.address ?? null, trigger: 'keys_returned' },
        })
      }
    }
  }

  async function acknowledgeNotice(noticeId: string, propertyId: string) {
    await supabase.from('tenancy_notices').update({ status: 'acknowledged' }).eq('id', noticeId)
    setTenancyNotices(prev => prev.filter(n => n.id !== noticeId))
    // Navigate to the property so admin can start the notice workflow
    const prop = adminProps.find(p => p.id === propertyId)
    if (prop) { setSelectedProperty(prop); setTab('properties') }
  }

  async function sendViewingEmail(type: 'confirmed' | 'received' | 'cancelled' | 'tenant_found', req: ViewingRequest, moveInDate?: string) {
    if (!req.email) return
    await supabase.functions.invoke('send-viewing-email', {
      body: {
        type,
        viewing: {
          name: req.name,
          email: req.email,
          address: req.properties?.address ?? '',
          date: req.preferred_date,
          time: req.preferred_time,
        },
        ...(moveInDate ? { moveInDate } : {}),
      },
    })
  }

  async function cancelFutureViewings(propertyId: string, moveInDate?: string) {
    const today = new Date().toISOString().slice(0, 10)
    const toCancel = viewingRequests.filter(
      r => r.property_id === propertyId &&
      r.preferred_date >= today &&
      (r.status === 'pending' || r.status === 'confirmed')
    )
    // Always delist the property when called from a tenancy trigger
    if (moveInDate !== undefined) {
      await supabase.from('properties').update({ is_listed: false }).eq('id', propertyId)
      setAdminProps(prev => prev.map(p => p.id === propertyId ? { ...p, is_listed: false } : p))
      if (selectedProperty?.id === propertyId) setSelectedProperty(prev => prev ? { ...prev, is_listed: false } : prev)
    }
    if (toCancel.length === 0) return
    const ids = toCancel.map(r => r.id)
    await supabase.from('viewing_requests').update({ status: 'cancelled' }).in('id', ids)
    setViewingRequests(prev => prev.map(r => ids.includes(r.id) ? { ...r, status: 'cancelled' } : r))
    for (const req of toCancel) {
      sendViewingEmail(moveInDate !== undefined ? 'tenant_found' : 'cancelled', req, moveInDate)
    }
  }

  async function updateViewingStatus(id: string, status: string) {
    const req = viewingRequests.find(r => r.id === id)
    const { error } = await supabase.from('viewing_requests').update({ status }).eq('id', id)
    if (!error) {
      setViewingRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r))
      if (req && (status === 'confirmed' || status === 'cancelled')) {
        sendViewingEmail(status as 'confirmed' | 'cancelled', { ...req, status })
      }
    }
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
    const rawRows = (data ?? []) as Omit<AuditLogRow, 'user_name' | 'user_email'>[]
    const userIds = [...new Set(rawRows.map(r => r.user_id).filter(Boolean))] as string[]
    const profileMap: Record<string, { full_name: string | null; email: string }> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', userIds)
      for (const p of profiles ?? []) profileMap[p.id] = p
    }
    const rows: AuditLogRow[] = rawRows.map(r => ({
      ...r,
      user_name: r.user_id ? (profileMap[r.user_id]?.full_name ?? null) : null,
      user_email: r.user_id ? (profileMap[r.user_id]?.email ?? null) : null,
    }))
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
    const { data } = await supabase.from('profiles').select('id, email, full_name').eq('role', 'tenant').order('full_name')
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

  function openStaffInviteModal() {
    setStaffInviteEmail('')
    setStaffInviteRole('admin')
    setStaffInviteName('')
    setStaffInviteError(null)
    setStaffInviteSuccess(false)
    setShowStaffInviteModal(true)
  }

  async function handleSendStaffInvite() {
    if (!staffInviteEmail.trim()) { setStaffInviteError('Email address is required.'); return }
    setStaffInviteSaving(true)
    setStaffInviteError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''
      const res = await supabase.functions.invoke('send-invite', {
        body: { email: staffInviteEmail.trim(), role: staffInviteRole, name: staffInviteName.trim() || undefined },
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.error || res.data?.ok === false) {
        setStaffInviteError(res.data?.error ?? res.error?.message ?? 'Failed to send invite.')
      } else {
        setStaffInviteSuccess(true)
        setTimeout(() => { setStaffLoaded(false); loadStaff() }, 1200)
      }
    } catch (err) {
      setStaffInviteError(String(err))
    } finally {
      setStaffInviteSaving(false)
    }
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
      if (!newIsListed) cancelFutureViewings(selectedProperty.id)
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
    if (!newIsListed) cancelFutureViewings(p.id)
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


  async function handleGasToggle(hasGas: boolean) {
    if (!selectedProperty) return
    setGasToggleSaving(true)
    const { error } = await supabase.from('properties').update({ has_gas: hasGas }).eq('id', selectedProperty.id)
    if (!error) {
      const updated = { ...selectedProperty, has_gas: hasGas }
      setSelectedProperty(updated)
      setAdminProps(prev => prev.map(p => p.id === selectedProperty.id ? updated : p))
    }
    setGasToggleSaving(false)
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

  async function submitManualViewing() {
    if (!newViewingPropId || !newViewingDate || !newViewingTime || !newViewingName.trim()) return
    setNewViewingSaving(true)
    const { data, error } = await supabase.from('viewing_requests').insert({
      property_id: newViewingPropId,
      name: newViewingName.trim(),
      email: newViewingEmail.trim().toLowerCase() || '',
      phone: newViewingPhone.trim() || null,
      preferred_date: newViewingDate,
      preferred_time: newViewingTime,
      message: newViewingMessage.trim() || null,
      status: 'confirmed',
    }).select('id, property_id, name, email, phone, preferred_date, preferred_time, message, status, created_at, properties(address)').single()
    if (!error && data) {
      const inserted = data as unknown as ViewingRequest
      setViewingRequests(prev => [...prev, inserted].sort((a, b) => a.preferred_date.localeCompare(b.preferred_date)))
      if (inserted.email) sendViewingEmail('confirmed', inserted)
      setShowAddViewing(false)
      setNewViewingPropId(''); setNewViewingDate(''); setNewViewingTime('')
      setNewViewingName(''); setNewViewingEmail(''); setNewViewingPhone(''); setNewViewingMessage('')
    }
    setNewViewingSaving(false)
  }

  async function navigateToRentProperty(propertyId: string) {
    // Stay on the rent tab — the property detail panel renders on both 'properties' and 'rent'
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
  const totalMaintenance = filteredSnaps.reduce((s, r) => s + r.maintenanceCost, 0)
  const totalMgmtFee = filteredSnaps.reduce((s, r) => s + r.managementFee, 0)
  // Collection rate: use live current-month rent data (same source as the Dashboard KPI)
  const _collRows = rentCollection.filter(r => !r.isVacant)
  const _collExp = _collRows.reduce((s, r) => s + r.expected, 0)
  const _collColl = _collRows.reduce((s, r) => s + Math.min(r.collected, r.expected), 0)
  const tenantedCollectionRate = _collExp > 0 ? Math.min((_collColl / _collExp) * 100, 100) : null

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
    else if (propStatusFilter !== 'all') {
      const isTenantedFilter = propStatusFilter === 'tenanted'
      if (isTenantedFilter) { if (p.status !== 'tenanted' && p.status !== 'active') return false }
      else if (p.status !== propStatusFilter) return false
    }
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
    { label: 'Collection (tenanted)', value: tenantedCollectionRate != null ? `${tenantedCollectionRate.toFixed(1)}%` : '—' },
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

  const daysUntilDate = (d: string) => {
    const todayMs = new Date().setHours(0, 0, 0, 0)
    const targetMs = new Date(d + 'T00:00:00').setHours(0, 0, 0, 0)
    return Math.round((targetMs - todayMs) / 86400000)
  }
  const daysLabel = (days: number) => days === 0 ? 'today' : days === 1 ? 'tomorrow' : days < 0 ? `${Math.abs(days)} days ago` : `in ${days} days`

  interface TodoItem { id: string; priority: 'urgent' | 'soon' | 'info'; category: string; title: string; detail: string; property_id?: string; action?: () => void; actionLabel?: string }
  const liveTodoItems: TodoItem[] = [
    ...adminProps.filter(p => p.move_in_date).map(p => {
      const days = daysUntilDate(p.move_in_date!)
      return { id: `movein-${p.id}`, priority: (days <= 3 ? 'urgent' : days <= 14 ? 'soon' : 'info') as TodoItem['priority'], category: 'Move In', title: p.address, detail: `Tenant moving in ${daysLabel(days)} — ${fmtDate(p.move_in_date!)}`, property_id: p.id, action: () => { setSelectedProperty(p); setTab('properties') }, actionLabel: 'View' }
    }),
    ...adminProps.filter(p => p.move_out_date).map(p => {
      const days = daysUntilDate(p.move_out_date!)
      return { id: `moveout-${p.id}`, priority: (days <= 3 ? 'urgent' : days <= 14 ? 'soon' : 'info') as TodoItem['priority'], category: 'Move Out', title: p.address, detail: `Tenant moving out ${daysLabel(days)} — ${fmtDate(p.move_out_date!)}`, property_id: p.id, action: () => { setSelectedProperty(p); setTab('properties') }, actionLabel: 'View' }
    }),
    ...tenancyNotices.map(n => {
      const days = daysUntilDate(n.vacate_date)
      return { id: `notice-${n.id}`, priority: (days <= 7 ? 'urgent' : days <= 14 ? 'soon' : 'info') as TodoItem['priority'], category: 'Notice', title: n.properties?.address ?? 'Unknown property', detail: `${n.profiles?.full_name ?? 'Tenant'} vacating ${daysLabel(days)} — ${fmtDate(n.vacate_date)}`, property_id: n.property_id, action: () => { const p = adminProps.find(pr => pr.id === n.property_id); if (p) { setSelectedProperty(p); setTab('properties') } }, actionLabel: 'View' }
    }),
    ...viewingRequests.filter(v => v.status === 'pending').map(v => ({
      id: `viewing-${v.id}`, priority: 'soon' as const, category: 'Viewing', title: v.properties?.address ?? 'Unknown property', detail: `${v.name} — ${fmtDate(v.preferred_date)} at ${v.preferred_time}`, property_id: v.property_id ?? undefined, action: () => setTab('diary'), actionLabel: 'Confirm',
    })),
    ...maintenanceItems.filter(m => (m.status === 'open' || m.status === 'in_progress') && (m.priority === 'emergency' || m.priority === 'urgent')).map(m => ({
      id: `maint-${m.id}`, priority: (m.priority === 'emergency' ? 'urgent' : 'soon') as TodoItem['priority'], category: m.priority === 'emergency' ? 'Emergency' : 'Urgent Maintenance', title: m.title ?? 'Maintenance request', detail: m.status === 'in_progress' ? 'In progress' : 'Open — not yet assigned', property_id: m.property_id ?? undefined, action: () => setTab('maintenance'), actionLabel: 'View',
    })),
    ...complianceAlerts.map(c => {
      const days = c.expiry_date ? daysUntilDate(c.expiry_date) : -999
      return { id: `cert-${c.id}`, priority: (days < 0 ? 'urgent' : days <= 30 ? 'soon' : 'info') as TodoItem['priority'], category: 'Certificate', title: c.properties?.address ?? 'Unknown property', detail: `${c.type} ${days < 0 ? `expired ${Math.abs(days)} days ago` : `expiring ${daysLabel(days)}`}`, property_id: c.property_id, action: () => { setTab('maintenance'); setMaintenanceFilter('compliance') }, actionLabel: 'View' }
    }),
  ]

  // Upsert live items that have a checklist into stickyTodos so they survive status changes.
  // Do this as a side effect outside render (safe: only runs when live list changes).
  const nextSticky = { ...stickyTodos }
  let stickyChanged = false
  for (const item of liveTodoItems) {
    if (TODO_CHECKLISTS[item.category] && !nextSticky[item.id]) {
      nextSticky[item.id] = { id: item.id, priority: item.priority, category: item.category, title: item.title, detail: item.detail }
      stickyChanged = true
    }
  }
  if (stickyChanged) {
    setStickyTodos(nextSticky)
    try { localStorage.setItem('aurelius-sticky-todos', JSON.stringify(nextSticky)) } catch { /* ignore */ }
  }

  // Merge: live items take precedence; append sticky items not in live list (not yet fully checked)
  const liveItemIds = new Set(liveTodoItems.map(i => i.id))
  const stickyOnlyItems: TodoItem[] = Object.values(nextSticky)
    .filter(s => !liveItemIds.has(s.id))
    .filter(s => {
      const checklist = TODO_CHECKLISTS[s.category] ?? []
      const checks = todoChecks[s.id] ?? []
      return checklist.length === 0 || checks.filter(Boolean).length < checklist.length
    })
    .map(s => ({ ...s }))

  const todoItems: TodoItem[] = [
    ...liveTodoItems,
    ...stickyOnlyItems,
  ].sort((a, b) => ({ urgent: 0, soon: 1, info: 2 }[a.priority]) - ({ urgent: 0, soon: 1, info: 2 }[b.priority]))

  const todoUrgentCount = todoItems.filter(i => i.priority === 'urgent').length

  return (
    <DashShell tabs={buildTabs(viewingRequests.filter(r => r.status === 'pending').length, viewingRequests.filter(r => r.status !== 'cancelled' && r.preferred_date === new Date().toISOString().slice(0, 10)).length, todoUrgentCount)} active={tab} onChange={setTab} metrics={metrics} userInitials={userInitials}>

      {adminToast && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: '#1d4ed8', color: '#fff', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 500, boxShadow: '0 4px 20px rgba(0,0,0,0.4)', maxWidth: '90vw', textAlign: 'center', pointerEvents: 'none' }}>
          {adminToast}
        </div>
      )}

      {quickError && (
        <div style={{ margin: '12px 16px 0', padding: '10px 14px', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#f87171' }}>{quickError}</span>
          <button type="button" onClick={() => setQuickError(null)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}

      {/* ── TO DO ── */}
      {tab === 'todo' && (
        <div className="px-4 py-5 flex flex-col gap-3">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <p style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa' }}>Action Items</p>
            {todoItems.length > 0 && (
              <span style={{ fontSize: 11, color: '#8899aa' }}>{todoItems.length} item{todoItems.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          {(adminPropsLoading || maintenanceLoading) ? (
            [...Array(4)].map((_, i) => <div key={i} style={{ height: 68, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }} className="animate-pulse" />)
          ) : todoItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="#8899aa" style={{ opacity: 0.3, marginBottom: 12 }}><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
              <p style={{ fontSize: 14, color: '#8899aa', margin: 0 }}>All clear — nothing outstanding</p>
            </div>
          ) : (
            todoItems.map(item => {
              const colors = {
                urgent: { dot: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)', badge: 'rgba(248,113,113,0.15)', badgeText: '#f87171' },
                soon:   { dot: '#fbbf24', bg: 'rgba(251,191,36,0.06)',  border: 'rgba(251,191,36,0.18)',  badge: 'rgba(251,191,36,0.15)',  badgeText: '#fbbf24' },
                info:   { dot: '#60a5fa', bg: 'rgba(96,165,250,0.05)',  border: 'rgba(96,165,250,0.15)',  badge: 'rgba(96,165,250,0.12)',  badgeText: '#60a5fa' },
              }[item.priority]
              const isExpanded = expandedTodoId === item.id
              const checklist = TODO_CHECKLISTS[item.category] ?? []
              const checks = todoChecks[item.id] ?? []
              const doneCount = checks.filter(Boolean).length
              const allDone = checklist.length > 0 && doneCount === checklist.length
              return (
                <div key={item.id} style={{ borderRadius: 12, border: `1px solid ${isExpanded ? colors.border : colors.border}`, overflow: 'hidden' }}>
                  {/* Item header row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: colors.bg }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: allDone ? '#4ade80' : colors.dot, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 4, background: allDone ? 'rgba(74,222,128,0.15)' : colors.badge, color: allDone ? '#4ade80' : colors.badgeText }}>{allDone ? 'Complete' : item.category}</span>
                        {checklist.length > 0 && !allDone && (
                          <span style={{ fontSize: 9, color: '#8899aa' }}>{doneCount}/{checklist.length}</span>
                        )}
                      </div>
                      <p style={{ fontSize: 13, color: '#e8edf5', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
                      <p style={{ fontSize: 11, color: '#8899aa', margin: '2px 0 0' }}>{item.detail}</p>
                    </div>
                    {checklist.length > 0 && (
                      <button type="button" onClick={() => setExpandedTodoId(isExpanded ? null : item.id)}
                        style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 7, background: isExpanded ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)', color: '#c8d4e0', border: '1px solid rgba(255,255,255,0.12)', fontSize: 11, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {item.actionLabel ?? 'View'}
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="M7 10l5 5 5-5z"/></svg>
                      </button>
                    )}
                  </div>
                  {/* Checklist dropdown */}
                  {isExpanded && checklist.length > 0 && (
                    <div style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.07)', padding: '10px 14px 14px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {checklist.map((task, idx) => {
                          const checked = checks[idx] ?? false
                          const taskPriority = task.priority
                          const taskBadge = taskPriority === 'urgent'
                            ? { color: '#f87171', bg: 'rgba(248,113,113,0.12)' }
                            : taskPriority === 'soon'
                            ? { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)' }
                            : { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' }
                          return (
                            <button key={idx} type="button" onClick={() => toggleTodoCheck(item.id, idx, checklist.length)}
                              style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '9px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: idx < checklist.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                              <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1, border: `1.5px solid ${checked ? '#4ade80' : 'rgba(255,255,255,0.2)'}`, background: checked ? 'rgba(74,222,128,0.15)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {checked && <svg width="10" height="10" viewBox="0 0 24 24" fill="#4ade80"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: 12, color: checked ? '#4ade80' : '#c8d4e0', lineHeight: 1.5, textDecoration: checked ? 'line-through' : 'none', opacity: checked ? 0.7 : 1 }}>{task.label}</span>
                                {!checked && (
                                  <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '1px 5px', borderRadius: 3, background: taskBadge.bg, color: taskBadge.color }}>{taskPriority}</span>
                                )}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                      {allDone && (
                        <p style={{ fontSize: 11, color: '#4ade80', marginTop: 10, textAlign: 'center' }}>All tasks complete</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── ANALYTICS ── */}
      {tab === 'analytics' && (
        <div className="px-4 py-5 flex flex-col gap-5">

          {/* ── Tenancy notices notification card ── */}
          {tenancyNotices.length > 0 && (
            <div style={{ background: '#1a1200', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(251,191,36,0.15)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#fbbf24', fontWeight: 600 }}>Notice Received</span>
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', fontWeight: 700 }}>
                    {tenancyNotices.length}
                  </span>
                </div>
              </div>
              {tenancyNotices.map((notice, idx, arr) => (
                <div key={notice.id}>
                  <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#e8edf5', margin: 0 }}>
                        {notice.profiles?.full_name ?? notice.profiles?.email ?? 'Tenant'} has handed in notice
                      </p>
                      <p style={{ fontSize: 11, color: '#8899aa', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {notice.properties?.address ?? 'Unknown property'}
                      </p>
                      <p style={{ fontSize: 11, color: '#fbbf24', margin: '4px 0 0' }}>
                        Notice given: {fmtDate(notice.notice_date)} · Vacating: {fmtDate(notice.vacate_date)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => acknowledgeNotice(notice.id, notice.property_id)}
                      style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(251,191,36,0.15)', color: '#fbbf24', fontWeight: 600, flexShrink: 0 }}
                    >
                      Acknowledge →
                    </button>
                  </div>
                  {idx < arr.length - 1 && <div style={{ height: 1, background: 'rgba(251,191,36,0.1)', margin: '0 16px' }} />}
                </div>
              ))}
            </div>
          )}

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

          {analyticsLoading && rentCollection.length === 0 ? (
            <div className="flex flex-col gap-3">{[...Array(6)].map((_, i) => <div key={i} style={{ ...CARD, height: 72, opacity: 0.4 }} className="animate-pulse" />)}</div>
          ) : (() => {
            const rows = rentCollection.filter(r => !r.isVacant)
            const exp = rows.reduce((s, r) => s + r.expected, 0)
            const coll = rows.reduce((s, r) => s + Math.min(r.collected, r.expected), 0)
            const outstanding = Math.max(exp - coll, 0)
            const rate = exp > 0 ? Math.min((coll / exp) * 100, 100) : null
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <DarkKPI title="Rent Roll" value={monthlyRentRoll > 0 ? gbp(monthlyRentRoll) : '—'} accent="#4ade80" subtitle="This month" />
                <DarkKPI title="Occupancy" value={occupancyRate != null ? `${occupancyRate.toFixed(0)}%` : '—'} accent={occupancyRate != null && occupancyRate >= 80 ? '#4ade80' : '#fbbf24'} subtitle={`${tenantedCount ?? 0} of ${propertyCount ?? 0} properties`} />
                <DarkKPI title="Collection Rate" value={rate != null ? `${rate.toFixed(1)}%` : '—'} accent={rate != null && rate >= 90 ? '#4ade80' : '#fbbf24'} subtitle="This month" />
                <DarkKPI title="Collected" value={coll > 0 ? gbp(coll) : '—'} accent="#4ade80" subtitle="This month" />
                <DarkKPI title="Rent Due" value={outstanding > 0 ? gbp(outstanding, 2) : '—'} accent="#fbbf24" subtitle="Outstanding this month" />
                <DarkKPI title="Management Fee" value={gbp(monthlyMgmtFee)} accent="#4ade80" subtitle="Collected this month" />
                <DarkKPI title="In-House" value={gbp(monthlyInHouseCost)} accent="#fbbf24" subtitle="Deductions this month" />
                <DarkKPI title="Maintenance Cost" value={gbp(monthlyMaintCost)} accent="#fbbf24" subtitle="Repairs this month" />
              </div>
            )
          })()}
        </div>
      )}

      {/* ── ANALYTICS DETAIL ── */}
      {tab === 'analyticsDetail' && (
        <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa' }}>Analytics</p>
            <button type="button" onClick={() => { setAnalyticsLoaded(false); loadAnalytics() }}
              style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.08)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            </button>
          </div>

          {analyticsLoading && snapshots.length === 0 ? (
            <div className="flex flex-col gap-3">{[...Array(4)].map((_, i) => <div key={i} style={{ ...CARD, height: 80, opacity: 0.4 }} className="animate-pulse" />)}</div>
          ) : (
            <>
              {/* Period picker */}
              <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                {(['3M', '6M', '12M'] as AnalyticsPeriod[]).map((p) => (
                  <button key={p} type="button" onClick={() => setAnalyticsPeriod(p)}
                    style={{ flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 500, background: analyticsPeriod === p ? '#e8edf5' : 'transparent', color: analyticsPeriod === p ? '#0d1b2e' : '#8899aa', transition: 'all 0.15s' }}>
                    {p}
                  </button>
                ))}
              </div>

              {/* Period KPI grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <DarkKPI title={`Collected (${analyticsPeriod})`} value={totalCollected > 0 ? gbp(totalCollected) : '—'} accent="#4ade80" />
                <DarkKPI title={`Net (${analyticsPeriod})`} value={totalCollected > 0 ? gbp(totalCollected - totalMaintenance) : '—'} accent={(totalCollected - totalMaintenance) >= 0 ? '#4ade80' : '#f87171'} />
                <DarkKPI title={`Management Fee (${analyticsPeriod})`} value={totalMgmtFee > 0 ? gbp(totalMgmtFee) : '—'} accent="#4ade80" />
                <DarkKPI title={`Maintenance (${analyticsPeriod})`} value={gbp(totalMaintenance)} accent="#fbbf24" />
                <DarkKPI title={`YTD Gross ${new Date().getFullYear()}`} value={ytdGross > 0 ? gbp(ytdGross) : '—'} accent="#4ade80" />
                <DarkKPI title={`YTD Net ${new Date().getFullYear()}`} value={ytdGross > 0 ? gbp(ytdNet) : '—'} accent={ytdNet >= 0 ? '#4ade80' : '#f87171'} />
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
        const totalColl = activeRows.reduce((s, r) => s + Math.min(r.collected, r.expected), 0)
        const outstanding = Math.max(totalExp - totalColl, 0)
        const paidCount = activeRows.filter(r => r.isPaid).length
        const fraction = totalExp > 0 ? (outstanding <= 0 ? 1 : Math.min(totalColl / totalExp, 1)) : 0
        const displayFraction = fraction
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
                      strokeDasharray={`${2 * Math.PI * 28 * displayFraction} ${2 * Math.PI * 28 * (1 - displayFraction)}`}
                      strokeDashoffset={2 * Math.PI * 28 * 0.25}
                      strokeLinecap="round"/>
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: ringColor, fontFamily: 'Georgia, serif' }}>{Math.min(Math.round(fraction * 100), 100)}%</span>
                    <span style={{ fontSize: 8, color: '#8899aa', letterSpacing: '0.05em' }}>paid</span>
                  </div>
                </div>
                {/* Totals */}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 28, fontWeight: 300, color: '#4ade80', fontFamily: 'Georgia, serif', lineHeight: 1 }}>{gbp(totalColl)}</p>
                  <p style={{ fontSize: 11, color: '#8899aa', marginTop: 4 }}>of {gbp(totalExp)} expected · {paidCount}/{activeRows.length} paid</p>
                  {outstanding > 0 && (
                    <p style={{ fontSize: 11, color: '#fbbf24', marginTop: 6 }}>{gbp(outstanding, 2)} outstanding</p>
                  )}
                  {outstanding === 0 && rentCollection.length > 0 && (
                    <p style={{ fontSize: 11, color: '#4ade80', marginTop: 6 }}>All rents collected</p>
                  )}
                </div>
              </div>
              {/* Progress bar */}
              <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${displayFraction * 100}%`, background: ringColor, borderRadius: 3, transition: 'width 0.6s ease' }} />
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
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: row.isVacant ? '#8899aa' : row.isProRated && !row.isPaid ? '#fb923c' : row.isPaid ? '#4ade80' : '#fbbf24', flexShrink: 0, marginTop: 2 }} />
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
                              : row.isProRated
                                ? row.isPaid
                                  ? row.moveInDate
                                    ? `Pro-rated · Move in ${fmtDate(row.moveInDate)}${row.paymentMethod ? ` · ${row.paymentMethod}` : ''}`
                                    : `Pro-rated · Moved out ${row.moveOutDate ? fmtDate(row.moveOutDate) : ''}${row.paymentMethod ? ` · ${row.paymentMethod}` : ''}`
                                  : row.moveInDate
                                    ? `Pro-rated · Move in ${fmtDate(row.moveInDate)}`
                                    : `Pro-rated · Moved out ${row.moveOutDate ? fmtDate(row.moveOutDate) : ''}`
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
                                  {row.isProRated
                                    ? row.moveInDate
                                      ? gbp(row.expected, row.expected % 1 === 0 ? 0 : 2)
                                      : row.isPaid ? gbp(row.collected, row.collected % 1 === 0 ? 0 : 2) : gbp(row.expected, row.expected % 1 === 0 ? 0 : 2)
                                    : row.isPaid ? gbp(row.collected) : gbp(row.expected)}
                                </p>
                                {!row.isPaid && <p style={{ fontSize: 10, color: '#8899aa', marginTop: 2 }}>due</p>}
                              </div>
                              {!row.isPaid && (
                                row.tenancyId
                                  ? <button type="button"
                                      onClick={() => setMarkPaidItem({ tenancyId: row.tenancyId, propertyId: row.propertyId, address: row.address, expected: row.expected, paymentId: row.paymentId, dueDate: row.dueDate, landlordEmail: row.landlordEmail, landlordName: row.landlordName })}
                                      style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ade80', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                      Mark Paid
                                    </button>
                                  : <button type="button"
                                      onClick={() => navigateToRentProperty(row.propertyId)}
                                      style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, background: 'rgba(136,153,170,0.08)', border: '1px solid rgba(136,153,170,0.25)', color: '#8899aa', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                      Link tenant →
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
          propertyId={markPaidItem.propertyId}
          address={markPaidItem.address}
          expected={markPaidItem.expected}
          paymentId={markPaidItem.paymentId}
          dueDate={markPaidItem.dueDate}
          landlordEmail={markPaidItem.landlordEmail}
          landlordName={markPaidItem.landlordName}
          adminId={user?.id ?? ''}
          adminRole={user?.role ?? 'admin'}
          onClose={() => setMarkPaidItem(null)}
          onSaved={() => {
            setMarkPaidItem(null)
            setAnalyticsLoaded(false)
            loadAnalytics()
          }}
        />
      )}

      {/* ── DIARY ── */}
      {tab === 'diary' && (() => {
        const DIARY_SLOTS = [
          '9:00 am','9:30 am','10:00 am','10:30 am','11:00 am','11:30 am',
          '12:00 pm','12:30 pm','1:00 pm','1:30 pm','2:00 pm','2:30 pm',
          '3:00 pm','3:30 pm','4:00 pm','4:30 pm','5:00 pm',
        ]
        const todayStr = new Date().toISOString().slice(0, 10)
        const weekStart = new Date()
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1 + diaryWeekOffset * 7)
        weekStart.setHours(0, 0, 0, 0)
        const days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(weekStart)
          d.setDate(weekStart.getDate() + i)
          return d
        })
        const weekLabel = (() => {
          const s = days[0]; const e = days[6]
          const sMonth = s.toLocaleDateString('en-GB', { month: 'long' })
          const eMonth = e.toLocaleDateString('en-GB', { month: 'long' })
          const year = e.getFullYear()
          return sMonth === eMonth ? `${sMonth} ${year}` : `${sMonth} – ${eMonth} ${year}`
        })()
        const viewingsByDate: Record<string, ViewingRequest[]> = {}
        for (const req of viewingRequests) {
          const d = req.preferred_date?.slice(0, 10)
          if (d) { viewingsByDate[d] = [...(viewingsByDate[d] ?? []), req] }
        }
        const takenSlots = newViewingDate
          ? new Set(viewingRequests.filter(r => r.preferred_date?.slice(0,10) === newViewingDate && r.status !== 'cancelled').map(r => r.preferred_time))
          : new Set<string>()
        return (
          <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 4 }}>Diary</p>
                <p style={{ fontSize: 22, fontFamily: 'Georgia, serif', color: '#e8edf5', fontWeight: 300 }}>{weekLabel}</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setDiaryWeekOffset(o => o - 1)}
                  style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#8899aa', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ‹
                </button>
                <button type="button" onClick={() => setDiaryWeekOffset(o => o + 1)}
                  style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#8899aa', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ›
                </button>
                {diaryWeekOffset !== 0 && (
                  <button type="button" onClick={() => setDiaryWeekOffset(0)}
                    style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', cursor: 'pointer' }}>
                    Today
                  </button>
                )}
                <button type="button"
                  onClick={() => { if (!adminPropsLoaded && !adminPropsLoading) loadAdminProps(); setShowAddViewing(o => !o) }}
                  style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, background: showAddViewing ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.06)', color: showAddViewing ? '#4ade80' : '#8899aa', border: `1px solid ${showAddViewing ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.08)'}`, cursor: 'pointer' }}>
                  {showAddViewing ? '✕ Cancel' : '+ Add Viewing'}
                </button>
              </div>
            </div>

            {/* Add Viewing Form */}
            {showAddViewing && (
              <div style={{ ...CARD, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa' }}>New Viewing</p>

                {/* Property */}
                <div>
                  <p style={{ fontSize: 9, color: '#8899aa', marginBottom: 5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Property *</p>
                  {adminPropsLoading ? (
                    <p style={{ fontSize: 12, color: '#8899aa' }}>Loading properties…</p>
                  ) : (
                    <select value={newViewingPropId} onChange={e => setNewViewingPropId(e.target.value)}
                      style={{ width: '100%', padding: '9px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: newViewingPropId ? '#e8edf5' : '#8899aa', fontSize: 13, outline: 'none' }}>
                      <option value="">Select property…</option>
                      {[...adminProps].sort((a,b) => a.address.localeCompare(b.address)).map(p => (
                        <option key={p.id} value={p.id}>{p.address}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Name + Phone */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <p style={{ fontSize: 9, color: '#8899aa', marginBottom: 5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Name *</p>
                    <input value={newViewingName} onChange={e => setNewViewingName(e.target.value)} placeholder="Full name"
                      style={{ width: '100%', padding: '9px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e8edf5', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 9, color: '#8899aa', marginBottom: 5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Phone</p>
                    <input value={newViewingPhone} onChange={e => setNewViewingPhone(e.target.value)} placeholder="Optional"
                      style={{ width: '100%', padding: '9px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e8edf5', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <p style={{ fontSize: 9, color: '#8899aa', marginBottom: 5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Email</p>
                  <input type="email" value={newViewingEmail} onChange={e => setNewViewingEmail(e.target.value)} placeholder="Optional"
                    style={{ width: '100%', padding: '9px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e8edf5', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>

                {/* Date */}
                <div>
                  <p style={{ fontSize: 9, color: '#8899aa', marginBottom: 5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Date *</p>
                  <DateInput value={newViewingDate} onChange={iso => { setNewViewingDate(iso); setNewViewingTime('') }}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e8edf5', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>

                {/* Time slots */}
                <div>
                  <p style={{ fontSize: 9, color: '#8899aa', marginBottom: 8, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Time *{newViewingDate && takenSlots.size > 0 && <span style={{ color: '#fbbf24', marginLeft: 6 }}>— {takenSlots.size} slot{takenSlots.size !== 1 ? 's' : ''} taken</span>}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    {DIARY_SLOTS.map(slot => {
                      const isTaken = takenSlots.has(slot)
                      const isSelected = newViewingTime === slot
                      return (
                        <button key={slot} type="button" disabled={isTaken}
                          onClick={() => setNewViewingTime(slot)}
                          style={{
                            padding: '8px 4px', borderRadius: 6, fontSize: 11, cursor: isTaken ? 'default' : 'pointer',
                            background: isSelected ? 'rgba(74,222,128,0.15)' : isTaken ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${isSelected ? 'rgba(74,222,128,0.4)' : isTaken ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'}`,
                            color: isSelected ? '#4ade80' : isTaken ? '#2d3748' : '#8899aa',
                            position: 'relative',
                          }}>
                          {slot}
                          {isTaken && <span style={{ display: 'block', fontSize: 8, color: '#f87171', letterSpacing: '0.05em', marginTop: 2 }}>Taken</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <p style={{ fontSize: 9, color: '#8899aa', marginBottom: 5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Notes</p>
                  <textarea value={newViewingMessage} onChange={e => setNewViewingMessage(e.target.value)} placeholder="Optional notes" rows={2}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e8edf5', fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
                </div>

                <button type="button"
                  disabled={newViewingSaving || !newViewingPropId || !newViewingDate || !newViewingTime || !newViewingName.trim()}
                  onClick={submitManualViewing}
                  style={{ padding: '10px 0', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: (!newViewingPropId || !newViewingDate || !newViewingTime || !newViewingName.trim() || newViewingSaving) ? 'default' : 'pointer', background: (!newViewingPropId || !newViewingDate || !newViewingTime || !newViewingName.trim()) ? 'rgba(255,255,255,0.04)' : 'rgba(74,222,128,0.12)', color: (!newViewingPropId || !newViewingDate || !newViewingTime || !newViewingName.trim()) ? '#4a5568' : '#4ade80', border: `1px solid ${(!newViewingPropId || !newViewingDate || !newViewingTime || !newViewingName.trim()) ? 'rgba(255,255,255,0.06)' : 'rgba(74,222,128,0.3)'}` }}>
                  {newViewingSaving ? 'Saving…' : 'Add to Diary'}
                </button>
              </div>
            )}

            {/* Days */}
            {viewingRequestsLoading ? (
              [...Array(3)].map((_, i) => <div key={i} style={{ height: 80, borderRadius: 10, background: 'rgba(255,255,255,0.04)', opacity: 0.5 }} className="animate-pulse" />)
            ) : (
              days.map(day => {
                const iso = day.toISOString().slice(0, 10)
                const isToday = iso === todayStr
                const isPast = iso < todayStr
                const dayViewings = (viewingsByDate[iso] ?? []).sort((a, b) => (a.preferred_time ?? '').localeCompare(b.preferred_time ?? ''))
                const dayLabel = day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
                const isDaySelected = selectedDiaryDay === iso
                const dayTakenSlots = new Set(dayViewings.filter(r => r.status !== 'cancelled').map(r => r.preferred_time))
                return (
                  <div key={iso}>
                    <button type="button"
                      onClick={() => {
                        setSelectedDiaryDay(isDaySelected ? null : iso)
                        if (showAddViewing) { setNewViewingDate(iso); setNewViewingTime('') }
                      }}
                      style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: isToday ? '#60a5fa' : isPast ? '#4a5568' : '#8899aa', letterSpacing: '0.05em', flexShrink: 0 }}>
                        {isToday ? `Today — ${day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : dayLabel}
                      </p>
                      {isToday && <div style={{ height: 1, flex: 1, background: 'rgba(96,165,250,0.3)' }} />}
                      {!isToday && <div style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.05)' }} />}
                      {dayViewings.length > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: isToday ? '#60a5fa' : '#8899aa', background: isToday ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 10, flexShrink: 0 }}>
                          {dayViewings.length}
                        </span>
                      )}
                      <span style={{ fontSize: 9, color: isDaySelected ? '#60a5fa' : '#4a5568', flexShrink: 0 }}>{isDaySelected ? '▲' : '▼'}</span>
                    </button>

                    {/* Availability grid for selected day */}
                    {isDaySelected && (
                      <div style={{ marginBottom: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 12px 8px' }}>
                        <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 8 }}>
                          Availability — {dayViewings.filter(r => r.status !== 'cancelled').length} booked · {DIARY_SLOTS.length - dayTakenSlots.size} free
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
                          {DIARY_SLOTS.map(slot => {
                            const bookedReq = dayViewings.find(r => r.preferred_time === slot && r.status !== 'cancelled')
                            const isFree = !bookedReq
                            return (
                              <div key={slot} style={{ padding: '6px 8px', borderRadius: 6, background: isFree ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.07)', border: `1px solid ${isFree ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.2)'}` }}>
                                <p style={{ fontSize: 10, color: isFree ? '#4ade80' : '#f87171', fontWeight: 600 }}>{slot}</p>
                                {bookedReq && <p style={{ fontSize: 9, color: '#8899aa', marginTop: 1 }} className="truncate">{bookedReq.name}</p>}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {dayViewings.length === 0 ? (
                      <p style={{ fontSize: 11, color: isPast ? '#2d3748' : 'rgba(136,153,170,0.4)', paddingLeft: 2, marginBottom: 4 }}>No viewings</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {dayViewings.map(req => {
                          const addr = req.properties?.address ?? 'Unknown property'
                          const timeFmt = req.preferred_time ?? ''
                          const statusColor = req.status === 'confirmed' ? '#4ade80' : req.status === 'cancelled' ? '#f87171' : '#fbbf24'
                          const statusBg   = req.status === 'confirmed' ? 'rgba(74,222,128,0.1)' : req.status === 'cancelled' ? 'rgba(248,113,113,0.08)' : 'rgba(251,191,36,0.1)'
                          return (
                            <div key={req.id} style={{ background: isPast ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)', border: `1px solid ${isToday ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 10, padding: '12px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 13, color: isPast ? '#4a5568' : '#e8edf5', fontFamily: 'Georgia, serif', marginBottom: 2 }} className="truncate">{addr}</p>
                                  <p style={{ fontSize: 12, color: isPast ? '#4a5568' : '#c8d4e0' }}>{req.name}</p>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                                  {timeFmt && <p style={{ fontSize: 13, fontWeight: 600, color: isPast ? '#4a5568' : '#e8edf5', fontFamily: 'Georgia, serif' }}>{timeFmt}</p>}
                                  <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: statusBg, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{req.status}</span>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: req.message ? 6 : 0 }}>
                                <span style={{ fontSize: 10, color: '#8899aa' }}>✉ {req.email}</span>
                                {req.phone && <span style={{ fontSize: 10, color: '#8899aa' }}>📞 {req.phone}</span>}
                              </div>
                              {req.message && <p style={{ fontSize: 11, color: '#8899aa', fontStyle: 'italic', borderLeft: '2px solid rgba(255,255,255,0.08)', paddingLeft: 8, marginTop: 6 }}>{req.message}</p>}
                              {!isPast && (
                                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                                  {req.status === 'pending' && (
                                    <>
                                      <button type="button" onClick={() => updateViewingStatus(req.id, 'confirmed')}
                                        style={{ flex: 1, padding: '6px 0', fontSize: 11, borderRadius: 6, background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', cursor: 'pointer', fontWeight: 600 }}>
                                        Confirm
                                      </button>
                                      <button type="button" onClick={() => updateViewingStatus(req.id, 'cancelled')}
                                        style={{ flex: 1, padding: '6px 0', fontSize: 11, borderRadius: 6, background: 'rgba(248,113,113,0.08)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)', cursor: 'pointer', fontWeight: 600 }}>
                                        Cancel
                                      </button>
                                    </>
                                  )}
                                  {req.status === 'confirmed' && (
                                    <button type="button" onClick={() => updateViewingStatus(req.id, 'cancelled')}
                                      style={{ padding: '6px 14px', fontSize: 11, borderRadius: 6, background: 'rgba(248,113,113,0.08)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)', cursor: 'pointer' }}>
                                      Cancel
                                    </button>
                                  )}
                                  <button type="button" onClick={() => deleteViewingRequest(req.id)}
                                    style={{ padding: '6px 12px', fontSize: 11, borderRadius: 6, background: 'rgba(255,255,255,0.04)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )
      })()}

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
            <button type="button" onClick={openInviteModal}
              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, background: '#e8edf5', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#0d1b2e', cursor: 'pointer', letterSpacing: '0.02em' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
              Invite
            </button>
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

      {/* ── INVITE MODAL ── */}
      {showInviteModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(5,15,30,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowInviteModal(false) }}>
          <div style={{ width: '100%', maxWidth: 480, background: '#0d1b2e', borderTopLeftRadius: 20, borderTopRightRadius: 20, border: '1px solid rgba(255,255,255,0.09)', padding: '24px 20px 36px', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Handle bar */}
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 4 }} />

            {inviteSuccess ? (
              /* Success state */
              <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(74,222,128,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="#4ade80"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                </div>
                <p style={{ fontSize: 17, fontFamily: 'Georgia, serif', color: '#e8edf5', marginBottom: 8 }}>Invite sent</p>
                <p style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.6 }}>
                  An invitation email has been sent to <strong style={{ color: '#e8edf5' }}>{inviteEmail}</strong>.<br />
                  They'll be added as a <strong style={{ color: '#e8edf5', textTransform: 'capitalize' }}>{inviteRole}</strong> when they accept.
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                  <button type="button" onClick={openInviteModal}
                    style={{ flex: 1, padding: '12px 0', borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#e8edf5', fontSize: 13, cursor: 'pointer' }}>
                    Invite another
                  </button>
                  <button type="button" onClick={() => setShowInviteModal(false)}
                    style={{ flex: 1, padding: '12px 0', borderRadius: 10, background: '#e8edf5', border: 'none', color: '#0d1b2e', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* Form state */
              <>
                <div>
                  <p style={{ fontSize: 17, fontFamily: 'Georgia, serif', color: '#e8edf5', marginBottom: 4 }}>Invite a user</p>
                  <p style={{ fontSize: 12, color: '#8899aa' }}>They'll receive an email with a link to access the platform.</p>
                </div>

                {/* Role selector */}
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 10 }}>Role</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['landlord', 'tenant', 'contractor'] as const).map(r => (
                      <button key={r} type="button" onClick={() => setInviteRole(r)}
                        style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: `1px solid ${inviteRole === r ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.1)'}`, background: inviteRole === r ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.04)', color: inviteRole === r ? '#60a5fa' : '#8899aa', fontSize: 12, fontWeight: inviteRole === r ? 600 : 400, cursor: 'pointer', textTransform: 'capitalize', letterSpacing: '0.03em' }}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 8, display: 'block' }}>Email address</label>
                  <input
                    type="email"
                    placeholder="name@example.com"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendInvite()}
                    autoFocus
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '12px 14px', fontSize: 14, color: '#e8edf5', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Name (optional) */}
                <div>
                  <label style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 8, display: 'block' }}>Full name <span style={{ color: '#4a5878', letterSpacing: 0, textTransform: 'none' }}>(optional)</span></label>
                  <input
                    type="text"
                    placeholder="e.g. James Taylor"
                    value={inviteName}
                    onChange={e => setInviteName(e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '12px 14px', fontSize: 14, color: '#e8edf5', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                {inviteError && (
                  <p style={{ fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '10px 12px', margin: 0 }}>
                    {inviteError}
                  </p>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => setShowInviteModal(false)}
                    style={{ flex: 1, padding: '13px 0', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#8899aa', fontSize: 13, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button type="button" onClick={handleSendInvite} disabled={inviteSaving || !inviteEmail.trim()}
                    style={{ flex: 2, padding: '13px 0', borderRadius: 10, background: !inviteEmail.trim() ? 'rgba(232,237,245,0.2)' : inviteSaving ? 'rgba(232,237,245,0.5)' : '#e8edf5', border: 'none', color: !inviteEmail.trim() ? 'rgba(13,27,46,0.4)' : '#0d1b2e', fontSize: 13, fontWeight: 600, cursor: (inviteSaving || !inviteEmail.trim()) ? 'not-allowed' : 'pointer' }}>
                    {inviteSaving ? 'Sending…' : 'Send invite'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── STAFF ── */}
      {tab === 'staff' && (
        <div className="flex flex-col">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <input type="search" placeholder="Search by name, email or role…" value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)}
              style={{ flex: 1, background: '#0f1e35', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#e8edf5', outline: 'none' }} />
            {user?.role === 'master admin' && (
              <button type="button" onClick={openStaffInviteModal}
                style={{ padding: '7px 14px', borderRadius: 6, background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)', fontSize: 12, fontWeight: 600, flexShrink: 0, letterSpacing: '0.04em', cursor: 'pointer' }}>
                + Invite
              </button>
            )}
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
              ['Status', (() => { const st = (selectedProperty.status ?? 'for_let') as PropStatus; const lbl = PROP_STATUS_LABEL[st] ?? capFirst(st); if (st === 'notice' && selectedProperty.move_out_date) return `${lbl} — vacating ${new Date(selectedProperty.move_out_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`; if (st === 'moving_in' && selectedProperty.move_in_date) return `${lbl} — ${new Date(selectedProperty.move_in_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`; return lbl })()],
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
          {/* Heating toggle */}
          <div style={{ margin: '0 16px 8px', ...CARD, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 4 }}>Heating</p>
              <p style={{ fontSize: 13, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>
                {selectedProperty.has_gas ? 'Gas & Electric' : 'Electric Only'}
              </p>
              {!selectedProperty.has_gas && (
                <p style={{ fontSize: 10, color: '#8899aa', marginTop: 2 }}>Gas Safety Certificate not required</p>
              )}
            </div>
            <button
              type="button"
              disabled={gasToggleSaving}
              onClick={() => handleGasToggle(!selectedProperty.has_gas)}
              style={{ flexShrink: 0, marginLeft: 16, width: 44, height: 24, borderRadius: 12, border: 'none', cursor: gasToggleSaving ? 'not-allowed' : 'pointer', position: 'relative', transition: 'background 0.2s',
                background: selectedProperty.has_gas ? '#4ade80' : 'rgba(255,255,255,0.12)' }}>
              <span style={{ position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                left: selectedProperty.has_gas ? 23 : 3 }} />
            </button>
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

          {/* PRT Agreement */}
          <div style={{ margin: '8px 16px 0', ...CARD, padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa' }}>PRT Agreement</p>
                {sentPrtStatus === 'pending' && (
                  <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Awaiting Tenant</span>
                )}
                {sentPrtStatus === 'tenant_signed' && (
                  <>
                    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Awaiting Admin</span>
                    <button type="button" onClick={viewSignedPRT} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(255,255,255,0.07)', color: '#c8d4e0', border: '1px solid rgba(255,255,255,0.12)', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>View PDF</button>
                  </>
                )}
                {sentPrtStatus === 'executed' && (
                  <>
                    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Executed</span>
                    <button type="button" onClick={viewSignedPRT} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>View PDF</button>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {/* Generate PRT — only when a tenant is linked */}
                {!prtLoading && propertyTenancies.length > 0 && (
                  <button type="button" onClick={openPRTGenerator}
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: 'rgba(74,222,128,0.08)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)', cursor: 'pointer' }}>
                    Generate PRT
                  </button>
                )}
                {/* Upload/Replace is always available — you can register a PRT with or without a linked tenant */}
                {!prtLoading && (
                  <button type="button" onClick={() => setShowAddPRTModal(true)}
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', cursor: 'pointer' }}>
                    + {prtDoc ? 'Replace' : 'Upload'} Agreement
                  </button>
                )}
                {/* Create Tenancy only when there is nothing at all — no PRT and no tenancy */}
                {!prtDoc && propertyTenancies.length === 0 && !prtLoading && (
                  <button type="button" onClick={() => openLinkTenantModal(selectedProperty.id)}
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: 'rgba(74,222,128,0.08)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)', cursor: 'pointer' }}>
                    + Create Tenancy
                  </button>
                )}
              </div>
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
            ) : sentPrtStatus === 'tenant_signed' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(96,165,250,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#60a5fa"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>Tenant signed — your signature required</p>
                  <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>Review and countersign to execute the agreement</p>
                </div>
                <button type="button" onClick={() => setShowAdminSignPRT(true)}
                  style={{ fontSize: 11, color: '#4ade80', padding: '3px 10px', borderRadius: 5, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  Sign Agreement
                </button>
              </div>
            ) : sentPrtStatus === 'executed' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(74,222,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#4ade80"><path d="M9 16.2l-4.2-4.2-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>Agreement fully executed</p>
                    <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>Signed by both tenant and Aurelius Property Management</p>
                  </div>
                  <button type="button" onClick={viewSignedPRT}
                    style={{ fontSize: 11, color: '#60a5fa', padding: '3px 10px', borderRadius: 5, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                    View Agreement
                  </button>
                </div>
                {landlordNotifiedAt ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="#4ade80"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    <p style={{ fontSize: 11, color: '#4ade80' }}>Shared with landlord {new Date(landlordNotifiedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                ) : (
                  <button type="button" disabled={landlordSharing} onClick={async () => {
                    setLandlordSharing(true)
                    try {
                      const notifiedAt = new Date().toISOString()
                      const prtExecutedNotif = {
                        title: 'Tenancy agreement ready',
                        body: `The signed PRT for ${selectedProperty.address} is now available in your dashboard.`,
                      }
                      await Promise.all([
                        supabase.from('prt_agreements').update({ landlord_notified_at: notifiedAt }).eq('property_id', selectedProperty.id).eq('status', 'executed'),
                        supabase.from('notifications').insert({ user_id: selectedProperty.landlord_id, type: 'prt_executed', ...prtExecutedNotif, data: { property_id: selectedProperty.id } }),
                        supabase.functions.invoke('send-notification-email', { body: { event: 'prt_executed', data: { property_id: selectedProperty.id, agent_name: user?.full_name ?? 'Aurelius Property Management' } } }),
                        supabase.functions.invoke('send-push', { body: { userId: selectedProperty.landlord_id, ...prtExecutedNotif, data: { type: 'prt_executed', property_id: selectedProperty.id } } }),
                      ])
                      setLandlordNotifiedAt(notifiedAt)
                    } catch (err) {
                      console.error('[SharePRT]', err)
                    } finally {
                      setLandlordSharing(false)
                    }
                  }}
                    style={{ fontSize: 12, color: landlordSharing ? '#8899aa' : '#e8edf5', padding: '9px 14px', borderRadius: 8, background: landlordSharing ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', cursor: landlordSharing ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>
                    {landlordSharing ? 'Sharing…' : 'Share with Landlord'}
                  </button>
                )}
              </div>
            ) : sentPrtStatus === 'pending' ? (
              <p style={{ fontSize: 12, color: '#fbbf24' }}>Agreement sent — awaiting tenant signature.</p>
            ) : propertyTenancies.length === 0 ? (
              <p style={{ fontSize: 12, color: '#8899aa' }}>No agreement or tenancy registered. Upload a PRT agreement or use "+ Create Tenancy" in the Tenants section above.</p>
            ) : (
              <p style={{ fontSize: 12, color: '#f87171' }}>No PRT agreement registered. Use "+ Upload Agreement" to record one.</p>
            )}
          </div>

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
            const hasIssues = issueStatuses.length > 0
            if (!hasIssues) return null
            return (
              <div style={{ margin: '8px 16px 0', background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 12, padding: '14px' }}>
                <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#f87171', marginBottom: 10 }}>
                  Required Certifications — Action Needed
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {issueStatuses.map(cert => {
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
                        <span style={{ fontSize: 10, fontWeight: 600, color, background: `${color}18`, padding: '2px 8px', borderRadius: 4, flexShrink: 0 }}>{label}</span>
                      </div>
                    )
                  })}
                </div>
                <p style={{ fontSize: 10, color: '#8899aa', marginTop: 10, lineHeight: 1.4 }}>Use "+ Add" in the Compliance Certificates section below to upload these documents.</p>
              </div>
            )
          })()}

          {/* Compliance */}
          <div style={{ margin: '8px 16px 0', ...CARD, padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa' }}>Compliance Certificates</p>
              <div style={{ display: 'flex', gap: 6 }}>
                {/* Draft inventory — continue building */}
                {(() => {
                  const draft = complianceItems.find(c => c.type === 'Inventory' && !c.uploaded_at)
                  if (!draft) return null
                  return (
                    <button type="button" onClick={() => {
                      setInventoryBuilderItem({ id: draft.id, cleanliness_comment: draft.cleanliness_comment, odour_comment: draft.odour_comment, heat_detector_present: draft.heat_detector_present, smoke_detector_present: draft.smoke_detector_present, co_detector_present: draft.co_detector_present })
                      setShowInventoryBuilder(true)
                    }}
                      style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)', cursor: 'pointer' }}>
                      Continue Building
                    </button>
                  )
                })()}
                {/* No inventory at all — create new */}
                {!complianceItems.some(c => c.type === 'Inventory') && selectedProperty && (
                  <button type="button" onClick={() => {
                    setInventoryBuilderItem(null)
                    setShowInventoryBuilder(true)
                  }}
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)', cursor: 'pointer' }}>
                    + Create Inventory
                  </button>
                )}
                <button type="button" onClick={() => { setCompliancePresetType(undefined); setShowAddComplianceModal(true) }}
                  style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', cursor: 'pointer' }}>
                  + Add
                </button>
              </div>
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
                              <button type="button" onClick={() => {
                                if (item.type === 'Inventory' && !item.uploaded_at) {
                                  setInventoryBuilderItem({ id: item.id, cleanliness_comment: item.cleanliness_comment, odour_comment: item.odour_comment, heat_detector_present: item.heat_detector_present, smoke_detector_present: item.smoke_detector_present, co_detector_present: item.co_detector_present })
                                  setShowInventoryBuilder(true)
                                } else {
                                  setEditComplianceItem(item)
                                }
                              }}
                                style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(96,165,250,0.08)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', cursor: 'pointer' }}>
                                {item.type === 'Inventory' && !item.uploaded_at ? 'Open Builder' : 'Edit'}
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
          {/* ── Property To Do ── */}
          <div style={{ margin: '8px 16px 0', ...CARD, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', margin: 0 }}>To Do</p>
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
                  <DateInput value={newJobDueDate} onChange={setNewJobDueDate}
                    style={{ width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#e8edf5', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 6 }}>Notes</p>
                  <textarea value={newJobNotes} onChange={e => setNewJobNotes(e.target.value)} placeholder="Optional notes…" rows={2}
                    style={{ width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#e8edf5', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                </div>
                <button type="button" onClick={addPropertyJob} disabled={newJobSaving || !newJobTitle.trim()}
                  style={{ alignSelf: 'flex-end', padding: '8px 18px', borderRadius: 8, background: newJobTitle.trim() ? '#e8edf5' : 'rgba(255,255,255,0.06)', color: newJobTitle.trim() ? '#0d1b2e' : '#8899aa', border: 'none', fontSize: 12, fontWeight: 600, cursor: newJobTitle.trim() ? 'pointer' : 'default' }}>
                  {newJobSaving ? 'Adding…' : 'Add Task'}
                </button>
              </div>
            )}

            {/* Auto-generated to-dos for this property */}
            {(() => {
              const propTodos = todoItems.filter(i => i.property_id === selectedProperty.id)
              if (propTodos.length === 0) return null
              const priorityColor = (p: TodoItem['priority']) => p === 'urgent' ? '#f87171' : p === 'soon' ? '#fbbf24' : '#60a5fa'
              const priorityBg = (p: TodoItem['priority']) => p === 'urgent' ? 'rgba(248,113,113,0.08)' : p === 'soon' ? 'rgba(251,191,36,0.08)' : 'rgba(96,165,250,0.08)'
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                  {propTodos.map(item => (
                    <div key={item.id} style={{ background: priorityBg(item.priority), border: `1px solid ${priorityColor(item.priority)}30`, borderRadius: 8, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: priorityColor(item.priority), fontWeight: 600 }}>{item.category}</span>
                        <p style={{ fontSize: 12, color: '#e8edf5', margin: '2px 0 0', lineHeight: 1.4 }}>{item.detail}</p>
                      </div>
                      {item.action && item.actionLabel && (
                        <button type="button" onClick={item.action}
                          style={{ fontSize: 10, padding: '3px 10px', borderRadius: 6, background: `${priorityColor(item.priority)}15`, color: priorityColor(item.priority), border: `1px solid ${priorityColor(item.priority)}30`, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {item.actionLabel}
                        </button>
                      )}
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', margin: '4px 0' }} />
                </div>
              )
            })()}

            {/* Manual task list */}
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
                  <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center', padding: '8px 0' }}>No completed tasks</p>
                )
                // Quick-start workflow buttons
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <p style={{ fontSize: 11, color: '#8899aa', marginBottom: 8 }}>Set the tenant move-out date, then choose a turnaround track:</p>
                      <DateInput value={workflowMoveOutDate} onChange={setWorkflowMoveOutDate}
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
                    {workflowStarting && <p style={{ fontSize: 11, color: '#8899aa', textAlign: 'center' }}>Creating tasks…</p>}
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa' }}>Key Register</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {editingKeyNumber ? (
                  <>
                    <input
                      type="number"
                      value={keyNumberDraft}
                      onChange={e => setKeyNumberDraft(e.target.value)}
                      placeholder="e.g. 42"
                      autoFocus
                      style={{ width: 70, fontSize: 12, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#e8edf5', outline: 'none' }}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveKeyNumber(); if (e.key === 'Escape') setEditingKeyNumber(false) }}
                    />
                    <button type="button" onClick={handleSaveKeyNumber} disabled={keyNumberSaving}
                      style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, background: '#e8edf5', color: '#0d1b2e', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                      {keyNumberSaving ? '…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => setEditingKeyNumber(false)}
                      style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => { setKeyNumberDraft(selectedProperty.key_number != null ? String(selectedProperty.key_number) : ''); setEditingKeyNumber(true) }}
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, background: selectedProperty.key_number != null ? 'rgba(255,255,255,0.08)' : 'transparent', color: selectedProperty.key_number != null ? '#e8edf5' : '#8899aa', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 11 }}>#</span>
                    {selectedProperty.key_number != null ? selectedProperty.key_number : 'Set Key No.'}
                  </button>
                )}
              </div>
            </div>
            {keysLoading ? (
              <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center', padding: '12px 0' }}>Loading…</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {propertyKeys.map((k) => {
                  const isOut = !!k.holder_name
                  const label = k.key_type === 'master' ? 'Master Key' : k.key_type === 'tenant' ? 'Tenant Key' : 'Contractor Key'
                  const isReturning = returnConfirmKey === k.id
                  return (
                    <div key={k.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 14px' }}>
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
                              <button type="button" onClick={() => handleReturnKey(k.id)}
                                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', cursor: 'pointer', fontWeight: 500 }}>
                                Confirm
                              </button>
                              <button type="button" onClick={() => setReturnConfirmKey(null)}
                                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => setReturnConfirmKey(k.id)}
                              style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', flexShrink: 0 }}>
                              Return
                            </button>
                          )
                        ) : (
                          <button type="button" onClick={() => { setCheckOutKeyType(k.id); setCheckOutName(''); setCheckOutRole(''); setCheckOutNotes('') }}
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

          {/* Maintenance Deductions */}
          <div style={{ margin: '8px 16px 0', ...CARD, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', margin: 0 }}>Maintenance Deductions</p>
              <button type="button" onClick={() => { setDeductionType('Inventory'); setDeductionCustomTitle(''); setDeductionAmount(''); setDeductionNotes(''); setDeductionError(null); setShowAddDeductionModal(true) }}
                style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, cursor: 'pointer' }}>
                + Add Deduction
              </button>
            </div>
            {propertyDeductionsLoading ? (
              <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center', padding: '8px 0' }}>Loading…</p>
            ) : propertyDeductions.length === 0 ? (
              <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center', padding: '8px 0' }}>No queued deductions for this property</p>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {propertyDeductions.map(d => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(251,191,36,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#fbbf24"><path d="M13.78 15.3 19.78 9.3 18.36 7.88 13.78 12.46 11.62 10.3 10.2 11.72 13.78 15.3M12 2A10 10 0 0 1 22 12A10 10 0 0 1 12 22A10 10 0 0 1 2 12A10 10 0 0 1 12 2Z"/></svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, color: '#e8edf5', fontFamily: 'Georgia, serif', marginBottom: 1 }}>{d.jobTitle ?? d.invoice_number}</p>
                        <p style={{ fontSize: 11, color: '#8899aa' }}>{d.invoice_number}{d.description ? ` · ${d.description}` : ''}</p>
                      </div>
                      <p style={{ fontSize: 14, color: '#fbbf24', fontFamily: 'Georgia, serif', flexShrink: 0 }}>−£{Number(d.total).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 10, color: '#8899aa', marginTop: 10, textAlign: 'right' }}>
                  Total: <span style={{ fontFamily: 'Georgia, serif', color: '#fbbf24' }}>−£{propertyDeductions.reduce((s, d) => s + d.total, 0).toFixed(2)}</span>
                </p>
              </>
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
                      const latest = meterReadings.find(r => r.utility_type === type)
                      return (
                        <div key={type} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 10px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>{icon}</div>
                          <p style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 4 }}>{label}</p>
                          {latest ? (
                            <>
                              <p style={{ fontSize: 16, color: '#e8edf5', fontFamily: 'Georgia, serif', fontWeight: 300, lineHeight: 1 }}>
                                {latest.reading_raw ?? Number(latest.reading).toLocaleString('en-GB')}
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
                        const meta = r.utility_type === 'electricity' ? { label: 'Electricity', unit: 'kWh', color: '#fbbf24' }
                          : r.utility_type === 'gas' ? { label: 'Gas', unit: 'm³', color: '#60a5fa' }
                          : { label: 'Water', unit: 'm³', color: '#4ade80' }
                        return (
                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 12, color: '#e8edf5' }}>
                                {meta.label} — {r.reading_raw ?? Number(r.reading).toLocaleString('en-GB')} {meta.unit}
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
                      ['Status', PROP_STATUS_LABEL[(selectedProperty.status ?? 'for_let') as PropStatus] ?? capFirst(selectedProperty.status ?? 'for_let')],
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
                          <DateInput value={listingNewExpiry} onChange={setListingNewExpiry}
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#e8edf5', outline: 'none' }}
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
                <DateInput value={listingAvailableFrom} onChange={setListingAvailableFrom}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#e8edf5', outline: 'none', boxSizing: 'border-box' }}
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
              { key: 'tenanted',  label: 'Tenanted',   style: PROP_STATUS_STYLE.tenanted },
              { key: 'moving_in', label: 'Moving In',  style: PROP_STATUS_STYLE.moving_in },
              { key: 'notice',    label: 'Notice',     style: PROP_STATUS_STYLE.notice },
              { key: 'viewings',  label: 'Viewings',   style: PROP_STATUS_STYLE.viewings },
              { key: 'vacant',    label: 'Vacant',     style: PROP_STATUS_STYLE.vacant },
              { key: 'for_let',   label: 'For Let',    style: PROP_STATUS_STYLE.for_let },
              { key: 'listed',    label: 'Has Listing',style: { background: 'rgba(74,222,128,0.12)', color: '#4ade80' } },
            ] as { key: PropStatus | 'all' | 'listed'; label: string; style: React.CSSProperties }[]).map(({ key, label, style }) => {
              const isActive = propStatusFilter === key
              const count = key === 'all' ? null : key === 'listed' ? adminProps.filter(p => p.is_listed).length : key === 'tenanted' ? adminProps.filter(p => p.status === 'tenanted' || p.status === 'active').length : adminProps.filter(p => p.status === key).length
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
            ) : adminPropsError ? (
              <div style={{ ...CARD, padding: 20, textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: '#f87171', marginBottom: 8 }}>Failed to load properties</p>
                <p style={{ fontSize: 11, color: '#8899aa', marginBottom: 12 }}>{adminPropsError}</p>
                <button type="button" onClick={() => { setAdminPropsLoaded(false); setAdminPropsError(null); loadAdminProps() }}
                  style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.08)', color: '#e8edf5', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }}>
                  Retry
                </button>
              </div>
            ) : filteredAdminProps.length === 0 ? (
              <EmptyState icon={<IconHouse />} title={propSearch || propStatusFilter !== 'all' ? 'No results' : 'No properties'} subtitle={propSearch || propStatusFilter !== 'all' ? 'Try a different search term or filter' : 'Properties will appear here once added'} />
            ) : (
              filteredAdminProps.map((p) => <AdminPropertyCard key={p.id} property={p} pendingNotice={tenancyNotices.find(n => n.property_id === p.id) ?? null} onLinkTenant={openLinkTenantModal} onEdit={openEditPropertyModal} onView={setSelectedProperty} onToggleListing={quickToggleListing} />)
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
                { key: 'resolved', label: 'Paid' },
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
                    <div key={item.id} style={{ ...CARD, padding: 14, cursor: 'pointer' }} onClick={() => setSelectedComplianceAlert(item)}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }} className="truncate">{item.type}</p>
                          <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }} className="truncate">{addr}</p>
                          <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>Expires {fmtDate(item.expiry_date)}</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 4, background: bg, color }}>{label}</span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="#8899aa"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
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
                  const hasMetadata = !!(log.user_id || log.user_role)
                  const metaAddress = typeof log.metadata?.address === 'string' ? log.metadata.address : null
                  const metaAmount = typeof log.metadata?.amount === 'number' ? log.metadata.amount : null
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
                          {(metaAddress || metaAmount !== null) && (
                            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              {metaAddress && (
                                <span style={{ fontSize: 11, color: '#8899aa' }}>{metaAddress}</span>
                              )}
                              {metaAmount !== null && (
                                <span style={{ fontSize: 11, color: '#4ade80' }}>£{metaAmount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              )}
                            </div>
                          )}
                          {isExpanded && (
                            <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {(log.user_name || log.user_email) && (
                                <p style={{ fontSize: 11, color: '#8899aa' }}>
                                  <span style={{ color: 'rgba(136,153,170,0.6)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Created by </span>
                                  <span style={{ color: '#e8edf5' }}>{log.user_name ?? log.user_email}</span>
                                  {log.user_name && log.user_email && (
                                    <span style={{ color: 'rgba(136,153,170,0.7)' }}> · {log.user_email}</span>
                                  )}
                                </p>
                              )}
                              {!log.user_name && !log.user_email && log.user_role === 'system' && (
                                <p style={{ fontSize: 11, color: '#8899aa' }}>
                                  <span style={{ color: 'rgba(136,153,170,0.6)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Created by </span>
                                  <span style={{ color: '#4ade80' }}>System</span>
                                </p>
                              )}
                              {!log.user_name && !log.user_email && !log.user_role && (
                                <p style={{ fontSize: 11, color: 'rgba(136,153,170,0.5)' }}>No user information recorded</p>
                              )}
                            </div>
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

      {showStaffInviteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowStaffInviteModal(false) }}>
          <div style={{ background: '#0d1b2e', borderRadius: '16px 16px 0 0', padding: '24px 20px 36px', width: '100%', maxWidth: 480, border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none' }}>
            {staffInviteSuccess ? (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(167,139,250,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 22 }}>✓</div>
                <p style={{ fontSize: 17, fontFamily: 'Georgia, serif', color: '#e8edf5', marginBottom: 8 }}>Invite sent</p>
                <p style={{ fontSize: 13, color: '#8899aa', lineHeight: 1.5, marginBottom: 24 }}>
                  A secure invite link has been emailed to <strong style={{ color: '#e8edf5' }}>{staffInviteEmail}</strong>.<br />
                  The link expires in 24 hours and can only be used once.
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={openStaffInviteModal}
                    style={{ flex: 1, padding: '13px 0', borderRadius: 10, background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Invite another
                  </button>
                  <button type="button" onClick={() => setShowStaffInviteModal(false)}
                    style={{ flex: 1, padding: '13px 0', borderRadius: 10, background: '#e8edf5', border: 'none', color: '#0d1b2e', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 17, fontFamily: 'Georgia, serif', color: '#e8edf5', marginBottom: 4 }}>Invite staff member</p>
                <p style={{ fontSize: 12, color: '#8899aa', marginBottom: 20 }}>A secure, single-use link will be emailed. It expires in 24 hours.</p>

                <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 8 }}>Role</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                  {(['admin', 'master admin'] as const).map((r) => (
                    <button key={r} type="button" onClick={() => setStaffInviteRole(r)}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: `1px solid ${staffInviteRole === r ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.1)'}`, background: staffInviteRole === r ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.04)', color: staffInviteRole === r ? '#a78bfa' : '#8899aa', fontSize: 12, fontWeight: staffInviteRole === r ? 600 : 400, cursor: 'pointer', textTransform: 'capitalize', letterSpacing: '0.03em' }}>
                      {r === 'master admin' ? 'Master Admin' : 'Admin'}
                    </button>
                  ))}
                </div>

                <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 8 }}>Email</p>
                <input type="email" autoComplete="off" placeholder="name@example.com"
                  value={staffInviteEmail}
                  onChange={e => setStaffInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendStaffInvite()}
                  style={{ width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#e8edf5', outline: 'none', marginBottom: 14, boxSizing: 'border-box' }} />

                <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 8 }}>Name (optional)</p>
                <input type="text" placeholder="Full name"
                  value={staffInviteName}
                  onChange={e => setStaffInviteName(e.target.value)}
                  style={{ width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#e8edf5', outline: 'none', marginBottom: 18, boxSizing: 'border-box' }} />

                {staffInviteError && (
                  <p style={{ fontSize: 12, color: '#f87171', marginBottom: 14, background: 'rgba(248,113,113,0.08)', padding: '10px 12px', borderRadius: 8 }}>{staffInviteError}</p>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => setShowStaffInviteModal(false)}
                    style={{ flex: 1, padding: '13px 0', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#8899aa', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button type="button" onClick={handleSendStaffInvite} disabled={staffInviteSaving || !staffInviteEmail.trim()}
                    style={{ flex: 2, padding: '13px 0', borderRadius: 10, background: !staffInviteEmail.trim() ? 'rgba(232,237,245,0.2)' : staffInviteSaving ? 'rgba(232,237,245,0.5)' : '#e8edf5', border: 'none', color: !staffInviteEmail.trim() ? 'rgba(13,27,46,0.4)' : '#0d1b2e', fontSize: 13, fontWeight: 600, cursor: (staffInviteSaving || !staffInviteEmail.trim()) ? 'not-allowed' : 'pointer' }}>
                    {staffInviteSaving ? 'Sending…' : 'Send invite'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {editProperty && (
        <EditPropertyModal
          property={editProperty}
          landlords={landlordUsers}
          onClose={() => setEditProperty(null)}
          onSaved={(patch) => {
            const wasNotLet = editProperty.status !== 'tenanted' && editProperty.status !== 'moving_in' && editProperty.status !== 'active'
            const isNowLet = patch.status === 'tenanted' || patch.status === 'moving_in' || patch.status === 'active'
            const moveInDateAdded = !!(patch.move_in_date && !editProperty.move_in_date)
            if ((wasNotLet && isNowLet) || moveInDateAdded) {
              cancelFutureViewings(editProperty.id, patch.move_in_date ?? undefined)
            }
            setAdminProps(prev => prev.map(p => p.id === editProperty.id ? { ...p, ...patch } : p))
            setEditProperty(null)
          }}
          onDelete={confirmDeleteProperty}
        />
      )}

      {showPRTGenerator && selectedProperty && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, overflowY: 'auto', padding: '24px 16px' }}>
          <div style={{ background: '#112240', borderRadius: 16, width: '100%', maxWidth: 520, padding: 24, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <p style={{ fontSize: 15, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>Generate PRT Agreement</p>
              <button type="button" onClick={() => setShowPRTGenerator(false)}
                style={{ background: 'none', border: 'none', color: '#8899aa', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <p style={{ fontSize: 11, color: '#8899aa', marginBottom: 18, lineHeight: 1.5 }}>
              Review and complete the details below. The generated document will open in a new tab — use your browser's Print / Save as PDF to save it.
            </p>

            {/* Tenant details */}
            <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 8 }}>Tenant Details</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: '#8899aa', display: 'block', marginBottom: 4 }}>Full name</label>
                <input value={prtForm.tenantName} onChange={e => setPrtForm(f => ({ ...f, tenantName: e.target.value }))}
                  placeholder="e.g. Mr John Smith"
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '8px 10px', color: '#e8edf5', fontSize: 13, outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#8899aa', display: 'block', marginBottom: 4 }}>Previous address (before moving in)</label>
                <textarea value={prtForm.tenantAddress} onChange={e => setPrtForm(f => ({ ...f, tenantAddress: e.target.value }))}
                  placeholder="e.g. 12 High Street, Dundee, DD1 1AA"
                  rows={2}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '8px 10px', color: '#e8edf5', fontSize: 13, outline: 'none', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#8899aa', display: 'block', marginBottom: 4 }}>Email</label>
                  <input value={prtForm.tenantEmail} onChange={e => setPrtForm(f => ({ ...f, tenantEmail: e.target.value }))}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '8px 10px', color: '#e8edf5', fontSize: 13, outline: 'none' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#8899aa', display: 'block', marginBottom: 4 }}>Phone number</label>
                  <input value={prtForm.tenantPhone} onChange={e => setPrtForm(f => ({ ...f, tenantPhone: e.target.value }))}
                    placeholder="e.g. 07700 900000"
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '8px 10px', color: '#e8edf5', fontSize: 13, outline: 'none' }} />
                </div>
              </div>
            </div>

            {/* Tenancy details */}
            <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 8 }}>Tenancy Details</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: '#8899aa', display: 'block', marginBottom: 4 }}>Start date</label>
                <input type="date" value={prtForm.startDate} onChange={e => {
                  const d = new Date(e.target.value)
                  const day = d.getDate()
                  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
                  const rent = parseFloat(prtForm.monthlyRent) || 0
                  const first = day > 1 ? Math.round(((daysInMonth - day + 1) / daysInMonth) * rent * 100) / 100 : rent
                  setPrtForm(f => ({ ...f, startDate: e.target.value, firstPayment: String(first) }))
                }}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '8px 10px', color: '#e8edf5', fontSize: 13, outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#8899aa', display: 'block', marginBottom: 4 }}>Monthly rent (£)</label>
                <input type="number" value={prtForm.monthlyRent} onChange={e => {
                  const rent = parseFloat(e.target.value) || 0
                  const d = prtForm.startDate ? new Date(prtForm.startDate) : null
                  const day = d ? d.getDate() : 1
                  const daysInMonth = d ? new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() : 30
                  const first = day > 1 ? Math.round(((daysInMonth - day + 1) / daysInMonth) * rent * 100) / 100 : rent
                  setPrtForm(f => ({ ...f, monthlyRent: e.target.value, firstPayment: String(first) }))
                }}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '8px 10px', color: '#e8edf5', fontSize: 13, outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#8899aa', display: 'block', marginBottom: 4 }}>First payment (£)
                  <span style={{ color: '#4ade80', marginLeft: 4, fontSize: 10 }}>auto-calculated</span>
                </label>
                <input type="number" value={prtForm.firstPayment} onChange={e => setPrtForm(f => ({ ...f, firstPayment: e.target.value }))}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '8px 10px', color: '#e8edf5', fontSize: 13, outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#8899aa', display: 'block', marginBottom: 4 }}>Deposit (£)</label>
                <input type="number" value={prtForm.depositAmount} onChange={e => setPrtForm(f => ({ ...f, depositAmount: e.target.value }))}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '8px 10px', color: '#e8edf5', fontSize: 13, outline: 'none' }} />
              </div>
            </div>

            {/* Landlord details */}
            <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 8 }}>Landlord Details</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
              <div>
                <label style={{ fontSize: 11, color: '#8899aa', display: 'block', marginBottom: 4 }}>Landlord name</label>
                <input value={prtForm.landlordName} onChange={e => setPrtForm(f => ({ ...f, landlordName: e.target.value }))}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '8px 10px', color: '#e8edf5', fontSize: 13, outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#8899aa', display: 'block', marginBottom: 4 }}>Landlord registration number</label>
                <input value={prtForm.landlordReg} onChange={e => setPrtForm(f => ({ ...f, landlordReg: e.target.value }))}
                  placeholder="e.g. 1234567/180/12345"
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '8px 10px', color: '#e8edf5', fontSize: 13, outline: 'none' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setShowPRTGenerator(false)}
                style={{ flex: 1, padding: '11px 0', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button" onClick={generatePRTDocument}
                disabled={!prtForm.tenantName || !prtForm.startDate}
                style={{ flex: 1, padding: '11px 0', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: (!prtForm.tenantName || !prtForm.startDate) ? '#8899aa' : '#e8edf5', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, fontWeight: 500, cursor: (!prtForm.tenantName || !prtForm.startDate) ? 'not-allowed' : 'pointer' }}>
                Preview
              </button>
              <button type="button" onClick={sendPRTToTenant}
                disabled={!prtForm.tenantName || !prtForm.startDate || prtSending}
                style={{ flex: 2, padding: '11px 0', borderRadius: 8, background: (!prtForm.tenantName || !prtForm.startDate || prtSending) ? 'rgba(74,222,128,0.2)' : '#4ade80', color: (!prtForm.tenantName || !prtForm.startDate || prtSending) ? '#4ade8088' : '#0a1628', border: 'none', fontSize: 13, fontWeight: 600, cursor: (!prtForm.tenantName || !prtForm.startDate || prtSending) ? 'not-allowed' : 'pointer' }}>
                {prtSending ? 'Sending…' : 'Send to Tenant'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddPRTModal && selectedProperty && (
        <AddPRTModal
          property={selectedProperty}
          onClose={() => setShowAddPRTModal(false)}
          onSaved={(doc) => {
            setPrtDoc(doc)
            setShowAddPRTModal(false)
            if (selectedProperty) {
              const updated = { ...selectedProperty, status: 'active' as PropStatus }
              setSelectedProperty(updated)
              setAdminProps(prev => prev.map(p => p.id === selectedProperty.id ? updated : p))
            }
            setAnalyticsLoaded(false)
          }}
        />
      )}

      {showAdminSignPRT && selectedProperty && (
        <AdminPRTSignModal
          propertyId={selectedProperty.id}
          sigCanvasRef={adminSigCanvasRef}
          sigDrawing={adminSigDrawing}
          sigHasStroke={adminSigHasStroke}
          sigTypedName={adminSigTypedName}
          setSigTypedName={setAdminSigTypedName}
          sigSubmitting={adminSigSubmitting}
          sigError={adminSigError}
          onClose={() => { setShowAdminSignPRT(false); setAdminSigError(null) }}
          onSign={async () => {
            if (!adminSigTypedName.trim()) { setAdminSigError('Please enter your full name.'); return }
            if (!adminSigHasStroke.current) { setAdminSigError('Please draw your signature.'); return }
            setAdminSigSubmitting(true)
            setAdminSigError(null)
            try {
              const adminSignedAt = new Date()
              // Fetch HTML and row metadata in parallel
              const [{ data: htmlData }, { data: prtRows }] = await Promise.all([
                supabase.rpc('get_property_prt_html', { p_property_id: selectedProperty.id }),
                supabase.rpc('get_property_prt', { p_property_id: selectedProperty.id }),
              ])
              const currentHtml = (htmlData as string | null) ?? sentPrtHtml
              if (!currentHtml) throw new Error('Could not load agreement')
              const prtRow = Array.isArray(prtRows) && prtRows.length > 0 ? prtRows[0] as { sent_at: string; signed_at: string | null; signature_name: string | null } : null
              const canvas = adminSigCanvasRef.current
              const signatureData = canvas ? canvas.toDataURL('image/png') : null
              const signedDate = adminSignedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
              const fmt = (iso: string | null) => iso
                ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) + ' (GMT)'
                : '—'
              let signedHtml = currentHtml
              signedHtml = signedHtml.replace(
                '<p id="admin-sig-line" style="margin-top: 30pt; border-bottom: 1px solid #000; width: 80%;">&nbsp;</p>',
                signatureData
                  ? `<img src="${signatureData}" alt="Admin Signature" style="max-width:260px;height:auto;display:block;margin-top:8pt;margin-bottom:4pt;" />`
                  : `<p style="margin-top:30pt;font-style:italic;">${adminSigTypedName.trim()}</p>`
              )
              signedHtml = signedHtml.replace(
                '<p id="admin-date-line" style="margin-top: 20pt; border-bottom: 1px solid #000; width: 80%;">&nbsp;</p>',
                `<p style="margin-top:8pt;font-size:11pt;font-weight:bold;">${signedDate}</p>`
              )
              const receiptHtml = `
<div id="prt-audit-receipt" style="margin-top:40pt;padding:16pt;background:#f7f8fa;border:1px solid #d0d5dd;border-radius:4pt;page-break-inside:avoid;">
  <p style="font-size:9pt;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:12pt;">Electronic Execution Audit Record</p>
  <table style="width:100%;font-size:8.5pt;border-collapse:collapse;">
    <tr style="background:#e8edf5;">
      <th style="padding:5pt 8pt;border:1px solid #c8d0dc;text-align:left;font-weight:bold;">Action</th>
      <th style="padding:5pt 8pt;border:1px solid #c8d0dc;text-align:left;font-weight:bold;">Party</th>
      <th style="padding:5pt 8pt;border:1px solid #c8d0dc;text-align:left;font-weight:bold;">Name</th>
      <th style="padding:5pt 8pt;border:1px solid #c8d0dc;text-align:left;font-weight:bold;">Timestamp</th>
    </tr>
    <tr>
      <td style="padding:5pt 8pt;border:1px solid #c8d0dc;">Agreement prepared &amp; sent</td>
      <td style="padding:5pt 8pt;border:1px solid #c8d0dc;">Letting Agent</td>
      <td style="padding:5pt 8pt;border:1px solid #c8d0dc;">${adminSigTypedName.trim()}</td>
      <td style="padding:5pt 8pt;border:1px solid #c8d0dc;">${fmt(prtRow?.sent_at ?? null)}</td>
    </tr>
    <tr style="background:#fafafa;">
      <td style="padding:5pt 8pt;border:1px solid #c8d0dc;">Tenant signature</td>
      <td style="padding:5pt 8pt;border:1px solid #c8d0dc;">Tenant</td>
      <td style="padding:5pt 8pt;border:1px solid #c8d0dc;">${prtRow?.signature_name ?? '—'}</td>
      <td style="padding:5pt 8pt;border:1px solid #c8d0dc;">${fmt(prtRow?.signed_at ?? null)}</td>
    </tr>
    <tr>
      <td style="padding:5pt 8pt;border:1px solid #c8d0dc;">Agent countersignature</td>
      <td style="padding:5pt 8pt;border:1px solid #c8d0dc;">Letting Agent</td>
      <td style="padding:5pt 8pt;border:1px solid #c8d0dc;">${adminSigTypedName.trim()}</td>
      <td style="padding:5pt 8pt;border:1px solid #c8d0dc;">${fmt(adminSignedAt.toISOString())}</td>
    </tr>
  </table>
  <p style="font-size:7.5pt;color:#666;margin-top:10pt;line-height:1.5;">This audit record is maintained by Aurelius Property Management as part of the tenancy execution trail. All timestamps are recorded in GMT and are accurate to the minute. This record may be produced as evidence of electronic execution under the Electronic Communications Act 2000.</p>
</div>`
              signedHtml = signedHtml.replace('<div id="prt-audit-receipt"></div>', receiptHtml)
              const { error } = await supabase
                .from('prt_agreements')
                .update({ status: 'executed', admin_signed_at: adminSignedAt.toISOString(), admin_signature_data: signatureData, admin_signature_name: adminSigTypedName.trim(), document_html: signedHtml })
                .eq('property_id', selectedProperty.id)
                .eq('status', 'tenant_signed')
              if (error) throw error
              setSentPrtStatus('executed')
              setSentPrtHtml(signedHtml)
              setShowAdminSignPRT(false)
              setAdminSigTypedName('')
              adminSigHasStroke.current = false
            } catch (err) {
              console.error('[AdminPRTSign]', err)
              setAdminSigError('Failed to save signature. Please try again.')
            } finally {
              setAdminSigSubmitting(false)
            }
          }}
        />
      )}

      {showInventoryBuilder && selectedProperty && (
        <InventoryBuilderModal
          propertyId={selectedProperty.id}
          propertyAddress={selectedProperty.address}
          existingItem={inventoryBuilderItem}
          onClose={() => { setShowInventoryBuilder(false); setInventoryBuilderItem(null) }}
          onDraftCreated={(itemId) => {
            const today = new Date().toISOString().slice(0, 10)
            setComplianceItems(prev => [...prev, {
              id: itemId, property_id: selectedProperty.id, type: 'Inventory',
              issue_date: today, expiry_date: null, status: null,
              document_url: null, notes: null, uploaded_at: null,
            }])
          }}
          onFinalised={(itemId, pdfUrl) => {
            const now = new Date().toISOString()
            setComplianceItems(prev => prev.map(c =>
              c.id === itemId
                ? { ...c, pdf_url: pdfUrl, document_url: pdfUrl, uploaded_at: now }
                : c
            ))
            setShowInventoryBuilder(false)
            setInventoryBuilderItem(null)
          }}
        />
      )}

      {showAddComplianceModal && selectedProperty && (
        <AddComplianceModal
          property={selectedProperty}
          presetType={compliancePresetType}
          onClose={() => { setShowAddComplianceModal(false); setCompliancePresetType(undefined) }}
          onSaved={(newItem) => {
            setShowAddComplianceModal(false)
            setCompliancePresetType(undefined)
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
              if (selectedProperty?.id === linkTenantPropertyId) {
                loadPropertyTenancy(linkTenantPropertyId)
                // Reflect 'active' status locally and reload rent analytics
                const updated = { ...selectedProperty, status: 'active' as PropStatus }
                setSelectedProperty(updated)
                setAdminProps(prev => prev.map(p => p.id === linkTenantPropertyId ? updated : p))
              }
              setAnalyticsLoaded(false)
            }}
          />
        ) : null
      })()}

      {/* ── Add Manual Deduction Modal ── */}
      {showAddDeductionModal && selectedProperty && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ background: '#112240', borderRadius: '20px 20px 0 0', padding: '24px 20px 36px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ fontSize: 16, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>Add Deduction</p>
              <button type="button" onClick={() => setShowAddDeductionModal(false)}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, width: 32, height: 32, color: '#8899aa', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            {/* Type chips */}
            <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 8 }}>Type</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {(['Inventory', 'Legionella', 'General Maintenance', 'Custom'] as const).map(t => (
                <button key={t} type="button" onClick={() => setDeductionType(t)}
                  style={{ padding: '9px 12px', borderRadius: 8, fontSize: 13, fontWeight: deductionType === t ? 600 : 400, background: deductionType === t ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)', border: deductionType === t ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.07)', color: deductionType === t ? '#e8edf5' : '#8899aa', cursor: 'pointer' }}>
                  {t}
                </button>
              ))}
            </div>
            {deductionType === 'Custom' && (
              <>
                <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 6 }}>Title</p>
                <input value={deductionCustomTitle} onChange={e => setDeductionCustomTitle(e.target.value)} placeholder="Deduction title"
                  style={{ width: '100%', fontSize: 14, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#e8edf5', outline: 'none', marginBottom: 16, boxSizing: 'border-box' }} />
              </>
            )}
            <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 6 }}>Amount (£)</p>
            <input type="number" min="0" step="0.01" value={deductionAmount} onChange={e => setDeductionAmount(e.target.value)} placeholder="0.00"
              style={{ width: '100%', fontSize: 16, fontFamily: 'Georgia, serif', padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#e8edf5', outline: 'none', marginBottom: 16, boxSizing: 'border-box' }} />
            <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 6 }}>Notes (optional)</p>
            <textarea value={deductionNotes} onChange={e => setDeductionNotes(e.target.value)} placeholder="e.g. Annual inventory check completed" rows={3}
              style={{ width: '100%', fontSize: 13, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#e8edf5', outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 16 }} />
            {deductionError && <p style={{ fontSize: 12, color: '#f87171', marginBottom: 12 }}>{deductionError}</p>}
            <button type="button" onClick={handleSaveManualDeduction} disabled={deductionSaving || !deductionAmount || (deductionType === 'Custom' && !deductionCustomTitle.trim())}
              style={{ width: '100%', padding: '13px', borderRadius: 10, background: deductionSaving ? 'rgba(255,255,255,0.1)' : '#fbbf24', color: '#0d1b2e', fontSize: 14, fontWeight: 700, border: 'none', cursor: deductionSaving ? 'default' : 'pointer' }}>
              {deductionSaving ? 'Saving…' : 'Save Deduction'}
            </button>
          </div>
        </div>
      )}

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
                <input type="text" value={newMeterReading} onChange={(e) => setNewMeterReading(e.target.value)} placeholder="e.g. 12345 or 10994/09"
                  style={{ width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#e8edf5', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', display: 'block', marginBottom: 6 }}>Date Taken</label>
                <DateInput value={newMeterDate} onChange={setNewMeterDate}
                  style={{ width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#e8edf5', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', display: 'block', marginBottom: 6 }}>Notes</label>
                <input value={newMeterNotes} onChange={(e) => setNewMeterNotes(e.target.value)} placeholder="Optional…"
                  style={{ width: '100%', background: '#0f1e35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#e8edf5', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              {meterError && <p style={{ fontSize: 12, color: '#f87171', margin: '0 0 4px' }}>{meterError}</p>}
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
                Check Out {(() => { const t = propertyKeys.find(k => k.id === checkOutKeyType)?.key_type ?? ''; return t === 'master' ? 'Master' : t === 'tenant' ? 'Tenant' : t === 'contractor' ? 'Contractor' : t.charAt(0).toUpperCase() + t.slice(1) })() } Key
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

function DarkKPI({ title, value, accent = '#e8edf5', subtitle }: { title: string; value: string; accent?: string; subtitle?: string }) {
  return (
    <div style={CARD}>
      <div style={{ padding: '12px 14px' }}>
        <p style={{ fontSize: 20, fontWeight: 300, color: accent, lineHeight: 1, fontFamily: 'Georgia, serif' }}>{value}</p>
        <p style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginTop: 6 }}>{title}</p>
        {subtitle && <p style={{ fontSize: 9, color: '#8899aa', marginTop: 3, opacity: 0.65 }}>{subtitle}</p>}
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

// Reusable date input — always shows dd/mm/yyyy, stores YYYY-MM-DD in parent state.
// isoToDMY / parseDMY are hoisted function declarations defined lower in this file.
function DateInput({ value, onChange, style }: { value: string; onChange: (iso: string) => void; style?: React.CSSProperties }) {
  const [display, setDisplay] = useState(() => isoToDMY(value))
  useEffect(() => { setDisplay(isoToDMY(value)) }, [value])
  return (
    <input type="text" value={display}
      onChange={e => { setDisplay(e.target.value); const iso = parseDMY(e.target.value); if (iso) onChange(iso) }}
      placeholder="dd/mm/yyyy" maxLength={10} style={style}
    />
  )
}

function MarkPaidModal({ tenancyId, propertyId, address, expected, paymentId, dueDate, landlordEmail, landlordName, adminId, adminRole, onClose, onSaved }: {
  tenancyId: string
  propertyId: string
  address: string
  expected: number
  paymentId: string | null
  dueDate: string | null
  landlordEmail: string
  landlordName: string
  adminId: string
  adminRole: string
  onClose: () => void
  onSaved: () => void
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

    // Fetch landlord_id and pending deductions for statement generation
    const [{ data: propData }, { data: mrData }] = await Promise.all([
      supabase.from('properties').select('landlord_id').eq('id', propertyId).single(),
      supabase.from('maintenance_requests').select('id').eq('property_id', propertyId),
    ])
    const landlordId = (propData as { landlord_id: string } | null)?.landlord_id ?? null
    const mrIds = (mrData ?? []).map((r: { id: string }) => r.id)

    let deductionsTotal = 0
    if (mrIds.length > 0) {
      const { data: dedData } = await supabase.from('contractor_invoices')
        .select('total')
        .in('maintenance_request_id', mrIds)
        .is('deducted_at', null)
        .eq('deduction_queued', true)
      deductionsTotal = ((dedData ?? []) as { total: number }[]).reduce((s, r) => s + Number(r.total ?? 0), 0)

      // Mark them as applied (deduction_rent_payment_id is Stripe-only FK — leave null for manual)
      await supabase.from('contractor_invoices')
        .update({ deducted_at: new Date().toISOString() })
        .in('maintenance_request_id', mrIds)
        .is('deducted_at', null)
        .eq('deduction_queued', true)
    }

    // Upsert monthly statement — update existing for this property+period if one exists
    const grossAmt = parseFloat(amount)
    const netAmt = grossAmt - deductionsTotal
    if (landlordId) {
      const { data: existingStmt } = await supabase
        .from('statements')
        .select('id')
        .eq('property_id', propertyId)
        .eq('period', defaultDueDate)
        .maybeSingle()
      if (existingStmt) {
        await supabase.from('statements').update({
          gross_amount: grossAmt,
          management_fee: 0,
          deductions: deductionsTotal,
          net_amount: netAmt,
          status: 'paid',
          notes: notes || null,
        }).eq('id', (existingStmt as { id: string }).id)
      } else {
        await supabase.from('statements').insert({
          landlord_id: landlordId,
          property_id: propertyId,
          period: defaultDueDate,
          gross_amount: grossAmt,
          management_fee: 0,
          deductions: deductionsTotal,
          net_amount: netAmt,
          status: 'paid',
          notes: notes || null,
        })
      }
    }

    // Fire-and-forget — email failure should never block the UI
    if (landlordEmail) {
      supabase.functions.invoke('send-rent-paid-email', {
        body: {
          landlordEmail,
          landlordName,
          propertyAddress: address,
          amount: parseFloat(amount),
          deductions: deductionsTotal,
          netAmount: netAmt,
          paidDate,
          paymentMethod: method,
        },
      }).catch(() => { /* non-critical */ })
    }

    setSaving(false)
    onSaved()
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
              <DateInput value={paidDate} onChange={setPaidDate} style={INPUT_STYLE} />
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

  const [mode, setMode] = useState<'existing' | 'invite'>('invite')

  // Shared fields
  const [startDate, setStartDate] = useState('')
  const [rent, setRent] = useState(String(property.monthly_rent ?? ''))
  const [deposit, setDeposit] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Existing tenant
  const [tenantId, setTenantId] = useState('')

  // New tenant invite
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')

  async function createTenancy(resolvedTenantId: string, monthlyRent: number) {
    const { error: dbError } = await supabase.from('tenancies').insert({
      property_id: property.id,
      tenant_id: resolvedTenantId,
      start_date: startDate,
      monthly_rent: monthlyRent,
      deposit: deposit ? parseFloat(deposit) : 0,
      status: 'active',
      is_current: true,
    })
    if (dbError) throw new Error(dbError.message)
    await supabase.from('properties').update({ status: 'active', monthly_rent: monthlyRent }).eq('id', property.id)
  }

  async function handleLinkExisting(e: React.FormEvent) {
    e.preventDefault()
    if (!tenantId) { setError('Please select a tenant'); return }
    if (!startDate) { setError('Start date is required'); return }
    if (!rent) { setError('Monthly rent is required'); return }
    setSaving(true); setError(null)
    try {
      await createTenancy(tenantId, parseFloat(rent))
      onSaved(); onClose()
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
      setSaving(false)
    }
  }

  async function handleInviteAndLink(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) { setError('Email is required'); return }
    if (!startDate) { setError('Start date is required'); return }
    if (!rent) { setError('Monthly rent is required'); return }
    setSaving(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''
      const res = await supabase.functions.invoke('send-invite', {
        body: { email: inviteEmail.trim(), role: 'tenant', name: inviteName.trim() || undefined },
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.error || res.data?.ok === false) throw new Error(res.data?.error ?? res.error?.message ?? 'Invite failed')
      const newUserId: string = res.data.userId
      await createTenancy(newUserId, parseFloat(rent))
      setSuccess(`Invite sent to ${inviteEmail.trim()}. They'll receive an email to set up their account.`)
      setSaving(false)
      setTimeout(() => { onSaved(); onClose() }, 2200)
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
      setSaving(false)
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '8px 0', fontSize: 12, fontWeight: active ? 600 : 400,
    borderRadius: 7, border: 'none', cursor: 'pointer',
    background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
    color: active ? '#e8edf5' : '#8899aa',
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '0 16px' }}>
      <div style={{ background: '#112240', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90dvh', overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ fontSize: 16, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>Add Tenant</p>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#8899aa', padding: 4, cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
        <p style={{ fontSize: 12, color: '#8899aa', marginBottom: 14 }} className="truncate">{property.address}</p>

        {currentTenants.length > 0 && (
          <div style={{ marginBottom: 16 }}>
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

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 4, marginBottom: 18 }}>
          <button type="button" style={tabStyle(mode === 'invite')} onClick={() => { setMode('invite'); setError(null) }}>Invite New Tenant</button>
          <button type="button" style={tabStyle(mode === 'existing')} onClick={() => { setMode('existing'); setError(null) }}>Link Existing Account</button>
        </div>

        {success ? (
          <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', fontSize: 13, color: '#4ade80', textAlign: 'center', lineHeight: 1.5 }}>
            {success}
          </div>
        ) : mode === 'invite' ? (
          <form onSubmit={handleInviteAndLink} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FormField label="Full Name">
              <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Jane Smith" style={INPUT_STYLE} />
            </FormField>
            <FormField label="Email Address *">
              <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="tenant@email.com" style={INPUT_STYLE} />
            </FormField>
            <FormField label="Tenancy Start Date *">
              <DateInput value={startDate} onChange={setStartDate} style={INPUT_STYLE} />
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
            <button type="submit" disabled={saving}
              style={{ padding: '12px 0', borderRadius: 8, background: saving ? 'rgba(232,237,245,0.4)' : '#e8edf5', color: '#0d1b2e', border: 'none', fontSize: 13, fontWeight: 600, marginTop: 4 }}>
              {saving ? 'Sending invite…' : 'Invite & Link Tenant'}
            </button>
            <p style={{ fontSize: 11, color: '#8899aa', textAlign: 'center', marginTop: -6 }}>The tenant will receive an email to set up their account.</p>
          </form>
        ) : (
          <form onSubmit={handleLinkExisting} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FormField label="Tenant *">
              <select value={tenantId} onChange={e => setTenantId(e.target.value)} style={INPUT_STYLE}>
                <option value="">Select tenant</option>
                {availableTenants.map(t => <option key={t.id} value={t.id}>{t.full_name ?? t.email}</option>)}
              </select>
            </FormField>
            <FormField label="Start Date *">
              <DateInput value={startDate} onChange={setStartDate} style={INPUT_STYLE} />
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
              <p style={{ fontSize: 13, color: '#8899aa', textAlign: 'center', padding: '8px 0' }}>No existing tenant accounts available. Use "Invite New Tenant" above.</p>
            ) : (
              <button type="submit" disabled={saving}
                style={{ padding: '12px 0', borderRadius: 8, background: saving ? 'rgba(232,237,245,0.4)' : '#e8edf5', color: '#0d1b2e', border: 'none', fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                {saving ? 'Linking…' : 'Link Tenant'}
              </button>
            )}
          </form>
        )}
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
        {request.created_at && <span style={{ fontSize: 10, color: '#8899aa', marginLeft: 'auto' }}>{fmtDate(request.created_at)}</span>}
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
  type ContractorOpt = { id: string; business_name: string | null; full_name: string | null; email: string }
  const CERT_TYPES = [
    'Gas Safety Certificate',
    'Electrical Installation Condition Report (EICR)',
    'Energy Performance Certificate (EPC)',
    'Legionella Risk Assessment',
    'PAT Testing',
    'Fire Safety Check',
    'Portable Appliance Testing',
    'Other',
  ]

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)
  const [contractors, setContractors] = useState<ContractorOpt[]>([])
  const [contractorsLoading, setContractorsLoading] = useState(true)
  const [contractorId, setContractorId] = useState('')
  const [certType, setCertType] = useState(item.type)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    async function loadContractors() {
      const { data: rows } = await supabase.from('contractors').select('id, business_name, user_id').order('business_name', { nullsFirst: false })
      const typed = (rows ?? []) as { id: string; business_name: string | null; user_id: string | null }[]
      const userIds = typed.map(r => r.user_id).filter((id): id is string => !!id)
      let nameMap: Record<string, { full_name: string | null; email: string }> = {}
      if (userIds.length > 0) {
        const { data: users } = await supabase.from('users').select('id, full_name, email').in('id', userIds)
        for (const u of (users ?? []) as { id: string; full_name: string | null; email: string }[]) nameMap[u.id] = u
      }
      setContractors(typed.map(r => ({ id: r.id, business_name: r.business_name, full_name: r.user_id ? (nameMap[r.user_id]?.full_name ?? null) : null, email: r.user_id ? (nameMap[r.user_id]?.email ?? '') : '' })))
      setContractorsLoading(false)
    }
    loadContractors()
  }, [])

  async function handleCreateJob() {
    if (!contractorId) { setCreateError('Please select a contractor'); return }
    setCreating(true)
    setCreateError(null)
    try {
      const isExpiredLocal = expiry && Math.ceil((expiry.getTime() - Date.now()) / 86400000) < 0
      const isUrgentLocal = expiry && !isExpiredLocal && Math.ceil((expiry.getTime() - Date.now()) / 86400000) < 30
      const priority = isExpiredLocal ? 'high' : isUrgentLocal ? 'medium' : 'low'
      const title = `${certType} renewal`
      const description = [
        `Certificate expired: ${item.expiry_date ?? 'unknown'}. Upload updated certificate.`,
        notes.trim() ? `\nAdditional details: ${notes.trim()}` : '',
      ].join('')
      const { error } = await supabase.from('maintenance_requests').insert({
        property_id: item.property_id,
        title,
        description,
        priority,
        status: 'assigned',
        request_type: 'compliance',
        assigned_contractor_id: contractorId,
      })
      if (error) throw error
      supabase.functions.invoke('send-notification-email', {
        body: { event: 'maintenance_request', data: { property_id: item.property_id, title, description, priority } },
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
              <p style={{ fontSize: 14, color: '#4ade80', fontWeight: 500 }}>Job assigned — contractor can now see it in their account</p>
            </div>
          ) : (
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa' }}>Create Job for Contractor</p>

              {/* Contractor */}
              <div>
                <p style={{ fontSize: 11, color: '#8899aa', marginBottom: 5 }}>Contractor *</p>
                {contractorsLoading ? (
                  <p style={{ fontSize: 12, color: '#8899aa' }}>Loading contractors…</p>
                ) : (
                  <select value={contractorId} onChange={e => setContractorId(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: contractorId ? '#e8edf5' : '#8899aa', fontSize: 13, outline: 'none' }}>
                    <option value="">Select contractor…</option>
                    {contractors.map(c => (
                      <option key={c.id} value={c.id}>{c.business_name ?? c.full_name ?? c.email}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Certificate type */}
              <div>
                <p style={{ fontSize: 11, color: '#8899aa', marginBottom: 5 }}>Certificate Required</p>
                <select value={certType} onChange={e => setCertType(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e8edf5', fontSize: 13, outline: 'none' }}>
                  {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  {!CERT_TYPES.includes(certType) && <option value={certType}>{certType}</option>}
                </select>
              </div>

              {/* Notes */}
              <div>
                <p style={{ fontSize: 11, color: '#8899aa', marginBottom: 5 }}>Additional Details <span style={{ opacity: 0.6 }}>(optional)</span></p>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                  placeholder="Any specific instructions or access details for the contractor…"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e8edf5', fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'inherit' }} />
              </div>

              {createError && <p style={{ fontSize: 12, color: '#f87171' }}>{createError}</p>}
              <button type="button" onClick={handleCreateJob} disabled={creating || contractorsLoading}
                style={{ width: '100%', padding: '13px 0', borderRadius: 10, background: creating ? 'rgba(251,191,36,0.1)' : 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', fontSize: 14, fontWeight: 500, opacity: (creating || contractorsLoading) ? 0.6 : 1 }}>
                {creating ? 'Assigning…' : 'Assign Job to Contractor'}
              </button>
            </div>
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
  const [tenancy, setTenancy] = useState<{ id: string; propertyId: string; address: string; monthly_rent: number | null; start_date: string; end_date: string | null } | null>(null)
  const [tenancyProp, setTenancyProp] = useState<AdminPropRow | null>(null)
  const [contractorJobs, setContractorJobs] = useState<MaintenanceRow[]>([])
  const [selectedContractorJob, setSelectedContractorJob] = useState<MaintenanceRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [localStatus, setLocalStatus] = useState(user.status)
  const [localFee, setLocalFee] = useState<number | null>(user.management_fee_percent ?? null)
  const [feeInput, setFeeInput] = useState(user.management_fee_percent != null ? String(user.management_fee_percent) : '')
  const [editingFee, setEditingFee] = useState(false)
  const [feeSaving, setFeeSaving] = useState(false)
  const [feeError, setFeeError] = useState<string | null>(null)
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
          .select('id, monthly_rent, start_date, end_date, property_id, properties(address)')
          .eq('tenant_id', user.id)
          .eq('is_current', true)
          .maybeSingle()
        if (data) {
          const raw = data as unknown as { id: string; monthly_rent: number | null; start_date: string; end_date: string | null; property_id: string; properties: { address: string } | null }
          setTenancy({ id: raw.id, propertyId: raw.property_id, address: raw.properties?.address ?? '', monthly_rent: raw.monthly_rent, start_date: raw.start_date, end_date: raw.end_date })
          if (raw.property_id) {
            const { data: propData } = await supabase
              .from('properties')
              .select('id, address, postcode, property_type, bedrooms, monthly_rent, is_active, status, created_at, landlord_id, description, photo_urls, has_gas, is_listed, available_from, listing_headline, landlord_registration_number, epc_rating, pre_tenancy_check_completed, pre_tenancy_check_date, deposit_scheme, deposit_registered_date, deposit_amount, meter_certificate_url, move_in_date, move_out_date, profiles(full_name, email)')
              .eq('id', raw.property_id)
              .maybeSingle()
            if (propData) setTenancyProp(propData as unknown as AdminPropRow)
          }
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

  async function handleViewTenancyProperty() {
    if (!tenancy) return
    if (tenancyProp) { onViewProperty(tenancyProp); return }
    const { data } = await supabase
      .from('properties')
      .select('id, address, postcode, property_type, bedrooms, monthly_rent, is_active, status, created_at, landlord_id, description, photo_urls, has_gas, is_listed, available_from, listing_headline, landlord_registration_number, epc_rating, pre_tenancy_check_completed, pre_tenancy_check_date, deposit_scheme, deposit_registered_date, deposit_amount, meter_certificate_url, move_in_date, move_out_date, profiles(full_name, email)')
      .eq('id', tenancy.propertyId)
      .maybeSingle()
    if (data) {
      const prop = data as unknown as AdminPropRow
      setTenancyProp(prop)
      onViewProperty(prop)
    }
  }

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

  async function handleSaveFee(e: React.FormEvent) {
    e.preventDefault()
    setFeeError(null)
    const parsed = feeInput.trim() === '' ? null : parseFloat(feeInput)
    if (feeInput.trim() !== '' && (isNaN(parsed!) || parsed! < 0 || parsed! > 100)) {
      setFeeError('Enter a value between 0 and 100')
      return
    }
    setFeeSaving(true)
    const { error } = await supabase.from('users').update({ management_fee_percent: parsed }).eq('id', user.id)
    setFeeSaving(false)
    if (error) { setFeeError('Failed to save'); return }
    setLocalFee(parsed)
    setEditingFee(false)
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
          {/* Management fee */}
          <div style={{ ...CARD, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa' }}>Management Fee</p>
              {!editingFee && (
                <button type="button" onClick={() => { setFeeInput(localFee != null ? String(localFee) : ''); setFeeError(null); setEditingFee(true) }}
                  style={{ fontSize: 11, color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.05em' }}>
                  Edit
                </button>
              )}
            </div>
            {editingFee ? (
              <form onSubmit={handleSaveFee} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number" min="0" max="100" step="0.1"
                    value={feeInput}
                    onChange={e => setFeeInput(e.target.value)}
                    placeholder="e.g. 8"
                    autoFocus
                    style={{ ...INPUT_STYLE, flex: 1, fontSize: 14 }}
                  />
                  <span style={{ fontSize: 14, color: '#8899aa', flexShrink: 0 }}>%</span>
                </div>
                <p style={{ fontSize: 11, color: '#8899aa' }}>This rate will be applied as the management fee deducted via Stripe.</p>
                {feeError && <p style={{ fontSize: 11, color: '#f87171' }}>{feeError}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setEditingFee(false)}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#8899aa', fontSize: 13 }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={feeSaving}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 8, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', color: '#60a5fa', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                    {feeSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <p style={{ fontSize: 28, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>
                  {localFee != null ? `${localFee}%` : '—'}
                </p>
                {localFee != null && (
                  <p style={{ fontSize: 11, color: '#8899aa' }}>deducted per payment via Stripe</p>
                )}
              </div>
            )}
            {localFee == null && !editingFee && (
              <p style={{ fontSize: 12, color: '#8899aa', marginTop: 4 }}>No fee set — tap Edit to configure</p>
            )}
          </div>

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
                          <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4, flexShrink: 0, letterSpacing: '0.08em', ...statusStyle }}>{PROP_STATUS_LABEL[statusKey] ?? capFirst(statusKey)}</span>
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
                  <DateInput value={newExpiryDate} onChange={setNewExpiryDate}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#e8edf5', outline: 'none', boxSizing: 'border-box' }}
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
              <button
                type="button"
                onClick={handleViewTenancyProperty}
                style={{ ...CARD, padding: 16, textAlign: 'left', width: '100%', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.07)' }}
                className="active:opacity-60"
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                  <p style={{ fontSize: 15, color: '#e8edf5', fontFamily: 'Georgia, serif', flex: 1, minWidth: 0 }} className="truncate">{tenancy.address}</p>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#8899aa" style={{ flexShrink: 0, marginTop: 2 }}><path d="M9.29 6.71a.996.996 0 0 0 0 1.41L13.17 12l-3.88 3.88a.996.996 0 1 0 1.41 1.41l4.59-4.59a.996.996 0 0 0 0-1.41L10.7 6.7c-.38-.38-1.02-.38-1.41.01z"/></svg>
                </div>
                {tenancy.monthly_rent != null && (
                  <p style={{ fontSize: 22, color: '#e8edf5', fontFamily: 'Georgia, serif', fontWeight: 300, marginBottom: 8 }}>{gbp(tenancy.monthly_rent)}<span style={{ fontSize: 12, color: '#8899aa' }}>/mo</span></p>
                )}
                <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#8899aa' }}>
                  <span>From {fmtDate(tenancy.start_date)}</span>
                  {tenancy.end_date ? <span>To {fmtDate(tenancy.end_date)}</span> : <span>Ongoing</span>}
                </div>
              </button>
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
  type FullRequest = { tenant_id: string | null; tenancy_id: string | null; assigned_contractor_id: string | null; updated_at: string | null; resolved_at: string | null; photo_urls: string[] | null; completion_photo_urls: string[] | null; completion_document_url: string | null; request_type: string | null; cost: number | null; compliance_template_url: string | null; scheduled_at: string | null; tenant_home_at_scheduled: boolean | null; tenant_keys_ok: boolean | null; tenant_alt_datetime: string | null }
  type ContractorOption = { id: string; business_name: string | null; full_name: string | null; email: string }
  type InvoiceRow = { id: string; invoice_number: string; total: number; status: string; description: string | null; created_at: string; deduction_queued: boolean }
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
  const [tenantNotifPrefs, setTenantNotifPrefs] = useState<{ notif_email: boolean; notif_sms: boolean; phone: string | null } | null>(null)
  const [contractorName, setContractorName] = useState<string | null>(null)
  const [contractorUserId, setContractorUserId] = useState<string | null>(null)
  const [propertyAddress, setPropertyAddress] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [localStatus, setLocalStatus] = useState(request.status ?? 'open')
  const [actionSaving, setActionSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showAssignSheet, setShowAssignSheet] = useState(false)
  const [contractors, setContractors] = useState<ContractorOption[]>([])
  const [contractorsLoading, setContractorsLoading] = useState(false)
  const [contractorsError, setContractorsError] = useState<string | null>(null)

  // Scheduled visit
  const [localScheduledAt, setLocalScheduledAt] = useState<string | null>(null)
  const [schedDate, setSchedDate] = useState('')
  const [schedTime, setSchedTime] = useState('')
  const [schedSaving, setSchedSaving] = useState(false)

  // Priority
  const [localPriority, setLocalPriority] = useState<string | null>(request.priority ?? null)
  const [prioritySaving, setPrioritySaving] = useState(false)

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
          .select('tenant_id, tenancy_id, assigned_contractor_id, updated_at, resolved_at, photo_urls, completion_photo_urls, completion_document_url, request_type, cost, compliance_template_url, scheduled_at, tenant_home_at_scheduled, tenant_keys_ok, tenant_alt_datetime')
          .eq('id', request.id).maybeSingle(),
        supabase.from('maintenance_status_history')
          .select('id, old_status, new_status, notes, created_at')
          .eq('maintenance_request_id', request.id)
          .order('created_at', { ascending: true }),
        supabase.from('contractor_invoices')
          .select('id, invoice_number, total, status, description, created_at, deduction_queued')
          .eq('maintenance_request_id', request.id)
          .order('created_at', { ascending: true }),
        supabase.from('maintenance_comments')
          .select('id, author_id, author_name, body, created_at')
          .eq('maintenance_request_id', request.id)
          .order('created_at', { ascending: true }),
      ])
      const full = (reqRes.data as FullRequest | null)
      setFullReq(full)
      if (full?.scheduled_at) {
        setLocalScheduledAt(full.scheduled_at)
        const d = new Date(full.scheduled_at)
        setSchedDate(d.toISOString().slice(0, 10))
        setSchedTime(d.toTimeString().slice(0, 5))
      }
      setHistory((histRes.data ?? []) as HistEntry[])
      setInvoices((invRes.data ?? []) as InvoiceRow[])
      setComments((commRes.data ?? []) as CommentRow[])

      const lookups: Promise<void>[] = []
      if (full?.tenant_id) {
        lookups.push((async () => {
          const { data: u } = await supabase.from('users').select('full_name, email, notif_email, notif_sms, phone').eq('id', full.tenant_id!).maybeSingle()
          if (u) {
            const user = u as { full_name: string | null; email: string; notif_email: boolean | null; notif_sms: boolean | null; phone: string | null }
            setTenantName(user.full_name || user.email || null)
            setTenantNotifPrefs({ notif_email: user.notif_email ?? true, notif_sms: user.notif_sms ?? false, phone: user.phone })
          }
        })())
      } else if (full?.tenancy_id) {
        lookups.push((async () => {
          const { data: ten } = await supabase.from('tenancies').select('tenant_id').eq('id', full.tenancy_id!).maybeSingle()
          const tid = (ten as { tenant_id: string | null } | null)?.tenant_id
          if (tid) {
            const { data: u } = await supabase.from('users').select('full_name, email, notif_email, notif_sms, phone').eq('id', tid).maybeSingle()
            if (u) {
              const user = u as { full_name: string | null; email: string; notif_email: boolean | null; notif_sms: boolean | null; phone: string | null }
              setTenantName(user.full_name || user.email || null)
              setTenantNotifPrefs({ notif_email: user.notif_email ?? true, notif_sms: user.notif_sms ?? false, phone: user.phone })
            }
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
              setContractorUserId(String(contractor.user_id))
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

  useEffect(() => {
    const channel = supabase
      .channel(`admin-invoices-${request.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'contractor_invoices', filter: `maintenance_request_id=eq.${request.id}` },
        (payload) => {
          const inv = payload.new as InvoiceRow
          setInvoices(prev => prev.some(i => i.id === inv.id) ? prev : [...prev, inv])
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
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
      const newEntry: HistEntry = { id: crypto.randomUUID(), old_status: localStatus, new_status: newStatus, notes: 'Work accepted by admin', created_at: now }
      setHistory(prev => [...prev, newEntry])
      setLocalStatus(newStatus)
      setFullReq(prev => prev ? { ...prev, updated_at: now, resolved_at: now } : prev)
      onUpdate?.(request.id, { status: newStatus })
      // Best-effort: notify tenant the job has been resolved
      if (fullReq?.tenant_id) {
        try {
          await supabase.from('notifications').insert({
            user_id: fullReq.tenant_id,
            type: 'job_resolved',
            title: 'Maintenance resolved',
            body: `Your maintenance request "${request.title ?? 'Untitled'}" has been resolved.`,
            data: { request_id: request.id },
          })
        } catch { /* best-effort */ }
      }
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
      const { error } = await supabase.from('contractor_invoices').update({ status: 'approved', deduction_queued: true }).eq('id', invoiceId)
      if (error) throw error
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, status: 'approved', deduction_queued: true } : inv))
      // Best-effort: notify contractor their invoice was approved
      if (contractorUserId) {
        try {
          await supabase.from('notifications').insert({
            user_id: contractorUserId,
            type: 'invoice_approved',
            title: 'Invoice approved',
            body: `Your invoice for "${request.title ?? 'Untitled'}" has been approved.`,
            data: { request_id: request.id, invoice_id: invoiceId },
          })
        } catch { /* best-effort */ }
      }
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
      // Best-effort: notify contractor their invoice was rejected
      if (contractorUserId) {
        try {
          await supabase.from('notifications').insert({
            user_id: contractorUserId,
            type: 'invoice_rejected',
            title: 'Invoice rejected',
            body: `Your invoice for "${request.title ?? 'Untitled'}" has been rejected. Please check your messages.`,
            data: { request_id: request.id, invoice_id: invoiceId },
          })
        } catch { /* best-effort */ }
      }
    } catch (err) {
      console.error('handleRejectInvoice error:', err)
      setActionError('Failed to reject invoice.')
    } finally {
      setActionSaving(false)
    }
  }

  async function handleQueueDeduction(invoiceId: string, currentlyQueued: boolean) {
    setActionSaving(true)
    setActionError(null)
    try {
      const { error } = await supabase.from('contractor_invoices').update({ deduction_queued: !currentlyQueued }).eq('id', invoiceId)
      if (error) throw error
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, deduction_queued: !currentlyQueued } : inv))
    } catch (err) {
      console.error('handleQueueDeduction error:', err)
      setActionError('Failed to update deduction.')
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

  async function handleSetScheduledAt() {
    if (!schedDate || !schedTime) return
    setSchedSaving(true)
    try {
      const iso = new Date(`${schedDate}T${schedTime}:00`).toISOString()
      const { error } = await supabase.from('maintenance_requests').update({ scheduled_at: iso }).eq('id', request.id)
      if (error) throw error
      setLocalScheduledAt(iso)
      setFullReq(prev => prev ? { ...prev, scheduled_at: iso } : prev)
    } catch (err) {
      console.error('handleSetScheduledAt error:', err)
      setActionError('Failed to save scheduled date.')
    } finally {
      setSchedSaving(false)
    }
  }

  async function handleSetPriority(p: string | null) {
    setPrioritySaving(true)
    try {
      const { error } = await supabase.from('maintenance_requests').update({ priority: p }).eq('id', request.id)
      if (error) throw error
      setLocalPriority(p)
      onUpdate?.(request.id, { priority: p })
    } catch (err) {
      console.error('handleSetPriority error:', err)
      setActionError('Failed to update priority.')
    } finally {
      setPrioritySaving(false)
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

  const STATUS_LABEL: Record<string, string> = { open: 'Open', assigned: 'Assigned', in_progress: 'In Progress', pending_review: 'Pending Review', resolved: 'Paid', closed: 'Closed' }
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
        <div style={{ ...CARD, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Status / priority badges */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4, letterSpacing: '0.08em', textTransform: 'uppercase', ...sb }}>
              {STATUS_LABEL[localStatus] ?? localStatus}
            </span>
            {request.priority && (
              <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 4, ...pb, textTransform: 'capitalize' }}>
                {request.priority} priority
              </span>
            )}
          </div>
          {/* Title */}
          <p style={{ fontSize: 16, fontWeight: 600, color: '#e8edf5', fontFamily: 'Georgia, serif', lineHeight: 1.3 }}>
            {request.title ?? 'Untitled'}
          </p>
          {/* Description */}
          {request.description && (
            <p style={{ fontSize: 13, color: '#c8d4e0', lineHeight: 1.55 }}>{request.description}</p>
          )}
          {/* Address */}
          {propertyAddress && (
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(propertyAddress)}`} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#60a5fa" style={{ flexShrink: 0 }}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
              <p style={{ fontSize: 13, color: '#60a5fa' }}>{propertyAddress}</p>
            </a>
          )}
          {/* Tenant name */}
          {tenantName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#8899aa" style={{ flexShrink: 0 }}><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
              <p style={{ fontSize: 13, color: '#e8edf5', fontWeight: 500 }}>{tenantName}</p>
            </div>
          )}
          {/* Tenant phone */}
          {tenantNotifPrefs?.phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#8899aa" style={{ flexShrink: 0 }}><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
              <a href={`tel:${tenantNotifPrefs.phone}`} style={{ fontSize: 13, color: '#60a5fa', textDecoration: 'none' }}>{tenantNotifPrefs.phone}</a>
            </div>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <p style={{ fontSize: 12, color: '#8899aa' }}>Reported by</p>
                <p style={{ fontSize: 13, color: '#e8edf5', fontWeight: 500 }}>{tenantName ?? 'Tenant'}</p>
                {tenantNotifPrefs && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                    {tenantNotifPrefs.notif_email && (
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' }}>
                        Email
                      </span>
                    )}
                    {tenantNotifPrefs.notif_sms && (
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}>
                        SMS{tenantNotifPrefs.phone ? ` · ${tenantNotifPrefs.phone}` : ''}
                      </span>
                    )}
                    {!tenantNotifPrefs.notif_email && !tenantNotifPrefs.notif_sms && (
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}>
                        No notifications
                      </span>
                    )}
                  </div>
                )}
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

            {/* Scheduled visit — admin can set/update */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 12, color: '#8899aa' }}>Scheduled visit</p>
                  <p style={{ fontSize: 13, color: localScheduledAt ? '#60a5fa' : '#8899aa', fontWeight: 500 }}>
                    {localScheduledAt
                      ? new Date(localScheduledAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + ' at ' + new Date(localScheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                      : 'Not scheduled'}
                  </p>
                </div>
              </div>
              {!isResolved && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'flex-end' }}>
                  <div>
                    <p style={{ fontSize: 10, color: '#8899aa', marginBottom: 4 }}>Date</p>
                    <input type="date" value={schedDate} min={new Date().toISOString().slice(0, 10)} onChange={e => setSchedDate(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e8edf5', fontSize: 13, outline: 'none', colorScheme: 'dark', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 10, color: '#8899aa', marginBottom: 4 }}>Time</p>
                    <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e8edf5', fontSize: 13, outline: 'none', colorScheme: 'dark', boxSizing: 'border-box' }} />
                  </div>
                  <button type="button" onClick={handleSetScheduledAt} disabled={schedSaving || !schedDate || !schedTime}
                    style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)', color: '#60a5fa', fontSize: 12, fontWeight: 600, opacity: (schedSaving || !schedDate || !schedTime) ? 0.4 : 1, whiteSpace: 'nowrap' }}>
                    {schedSaving ? '…' : localScheduledAt ? 'Update' : 'Set'}
                  </button>
                </div>
              )}
            </div>

            {/* Tenant access response */}
            {fullReq && fullReq.scheduled_at && fullReq.tenant_home_at_scheduled !== null && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ fontSize: 12, color: '#8899aa' }}>Tenant access response</p>
                {fullReq.tenant_home_at_scheduled === true && (
                  <p style={{ fontSize: 13, color: '#4ade80', fontWeight: 500 }}>✓ Tenant will be home</p>
                )}
                {fullReq.tenant_home_at_scheduled === false && fullReq.tenant_keys_ok === true && (
                  <p style={{ fontSize: 13, color: '#4ade80', fontWeight: 500 }}>✓ Tenant out — key access confirmed</p>
                )}
                {fullReq.tenant_home_at_scheduled === false && fullReq.tenant_keys_ok === false && (
                  <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
                    <p style={{ fontSize: 12, color: '#fbbf24', fontWeight: 600, marginBottom: fullReq.tenant_alt_datetime ? 6 : 0 }}>
                      ⚠ Tenant out, keys not permitted
                    </p>
                    {fullReq.tenant_alt_datetime ? (
                      <p style={{ fontSize: 12, color: '#e8edf5' }}>
                        Suggested alternative: <span style={{ color: '#60a5fa', fontWeight: 500 }}>{new Date(fullReq.tenant_alt_datetime).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} at {new Date(fullReq.tenant_alt_datetime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                      </p>
                    ) : (
                      <p style={{ fontSize: 12, color: '#8899aa' }}>Awaiting alternative time from tenant</p>
                    )}
                  </div>
                )}
                {fullReq.tenant_home_at_scheduled === false && fullReq.tenant_keys_ok === null && (
                  <p style={{ fontSize: 13, color: '#8899aa' }}>Tenant won't be home — awaiting key access decision</p>
                )}
              </div>
            )}

            {/* Priority — admin can change */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 12, color: '#8899aa' }}>Priority</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {(['routine', 'urgent', 'emergency'] as const).map(p => (
                  <button key={p} type="button" disabled={prioritySaving || isResolved}
                    onClick={() => handleSetPriority(localPriority === p ? null : p)}
                    style={{
                      padding: '7px 0', borderRadius: 8, fontSize: 11, fontWeight: 500, textTransform: 'capitalize',
                      background: localPriority === p ? (p === 'emergency' ? 'rgba(248,113,113,0.2)' : p === 'urgent' ? 'rgba(251,191,36,0.2)' : 'rgba(74,222,128,0.15)') : 'rgba(255,255,255,0.04)',
                      color: localPriority === p ? (p === 'emergency' ? '#f87171' : p === 'urgent' ? '#fbbf24' : '#4ade80') : '#8899aa',
                      border: `1px solid ${localPriority === p ? (p === 'emergency' ? 'rgba(248,113,113,0.4)' : p === 'urgent' ? 'rgba(251,191,36,0.35)' : 'rgba(74,222,128,0.3)') : 'rgba(255,255,255,0.07)'}`,
                      opacity: (prioritySaving || isResolved) ? 0.5 : 1,
                    }}>
                    {p}
                  </button>
                ))}
              </div>
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
                    <p style={{ fontSize: 14, color: '#e8edf5', fontWeight: 600, marginBottom: (inv.status === 'submitted' || inv.status === 'approved') ? 10 : 0 }}>£{Number(inv.total).toFixed(2)}</p>
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
                    {inv.status === 'approved' && (
                      <button type="button" onClick={() => handleQueueDeduction(inv.id, inv.deduction_queued)} disabled={actionSaving}
                        style={{ width: '100%', padding: '7px 0', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: actionSaving ? 0.5 : 1,
                          background: inv.deduction_queued ? 'rgba(251,191,36,0.15)' : 'rgba(136,153,170,0.1)',
                          border: inv.deduction_queued ? '1px solid rgba(251,191,36,0.35)' : '1px solid rgba(136,153,170,0.25)',
                          color: inv.deduction_queued ? '#fbbf24' : '#8899aa' }}>
                        {inv.deduction_queued ? '✓ Queued — deduct from next statement' : 'Deduct from next statement'}
                      </button>
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
                type Entry = { id: string; ts: string; sortTs?: string; dot: string; label: string; sub?: string }
                const entries: Entry[] = []

                // 1. Reported by tenant
                if (request.created_at) entries.push({ id: 'reported', ts: request.created_at, dot: '#60a5fa', label: 'Reported by tenant', sub: tenantName ?? undefined })

                // 2. Status history — deduplicate within 60s window
                const seen = new Set<string>()
                for (const h of history) {
                  const key = `${h.old_status}→${h.new_status}`
                  const tsMs = new Date(h.created_at).getTime()
                  const isDupe = [...seen].some(s => {
                    const [k, t] = s.split('|')
                    return k === key && Math.abs(tsMs - Number(t)) < 60_000
                  })
                  if (isDupe) continue
                  seen.add(`${key}|${tsMs}`)
                  const from = STATUS_LABEL[h.old_status ?? ''] ?? h.old_status ?? '—'
                  const to = STATUS_LABEL[h.new_status ?? ''] ?? h.new_status ?? '—'
                  const label = h.new_status === 'assigned' && contractorName ? 'Assigned to contractor' : `Status: ${from} → ${to}`
                  const sub = h.new_status === 'assigned' && contractorName ? contractorName : (h.notes ?? undefined)
                  entries.push({ id: h.id, ts: h.created_at, dot: '#fbbf24', label, sub })
                }

                // 3. Assigned to contractor (fallback if not in history)
                if (fullReq?.assigned_contractor_id && contractorName && !history.some(h => h.new_status === 'assigned')) {
                  entries.push({ id: 'contractor', ts: fullReq.updated_at ?? request.created_at ?? '', dot: '#4ade80', label: 'Assigned to contractor', sub: contractorName })
                }

                // 4. Visit scheduled — sort by when it was recorded (in_progress history entry),
                //    display the visit date in sub so right-side timestamp stays as "when scheduled"
                if (fullReq?.scheduled_at) {
                  const d = new Date(fullReq.scheduled_at)
                  const visitLabel = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                  const inProgressEntry = history.find(h => h.new_status === 'in_progress')
                  const sortTs = inProgressEntry?.created_at ?? fullReq.updated_at ?? fullReq.scheduled_at
                  entries.push({ id: 'scheduled', ts: sortTs, sortTs, dot: '#60a5fa', label: 'Visit scheduled', sub: visitLabel })
                }

                // 5. Tenant access responses
                if (fullReq?.tenant_home_at_scheduled === true) {
                  entries.push({ id: 'tenant_home', ts: fullReq.updated_at ?? '', dot: '#4ade80', label: 'Tenant confirmed — will be home' })
                } else if (fullReq?.tenant_home_at_scheduled === false) {
                  if (fullReq.tenant_keys_ok === true) {
                    entries.push({ id: 'tenant_keys', ts: fullReq.updated_at ?? '', dot: '#4ade80', label: 'Tenant out — key access permitted' })
                  } else if (fullReq.tenant_keys_ok === false) {
                    entries.push({ id: 'tenant_nokeys', ts: fullReq.updated_at ?? '', dot: '#fbbf24', label: 'Tenant out — keys not permitted' })
                    if (fullReq.tenant_alt_datetime) {
                      const alt = new Date(fullReq.tenant_alt_datetime)
                      const altLabel = alt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ' at ' + alt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                      entries.push({ id: 'tenant_alt', ts: fullReq.tenant_alt_datetime, dot: '#fbbf24', label: 'Tenant proposed alternative time', sub: altLabel })
                    }
                  }
                }

                // 6. Invoices submitted / uploaded
                for (const inv of invoices) {
                  if (inv.status !== 'draft') {
                    entries.push({
                      id: `inv-${inv.id}`,
                      ts: inv.created_at,
                      dot: '#a78bfa',
                      label: 'Invoice submitted',
                      sub: `${inv.invoice_number} · £${inv.total.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    })
                  }
                }

                // 7. Resolved
                if (fullReq?.resolved_at) entries.push({ id: 'resolved', ts: fullReq.resolved_at, dot: '#4ade80', label: 'Paid' })

                // Sort by sortTs when present (allows separating sort key from display timestamp)
                entries.sort((a, b) => new Date(a.sortTs ?? a.ts).getTime() - new Date(b.sortTs ?? b.ts).getTime())

                if (entries.length === 0) return <p style={{ fontSize: 12, color: '#8899aa', textAlign: 'center', padding: '8px 0' }}>No activity yet.</p>

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

        {/* Messaging threads — separate card so activity log isn't cut off */}
        {!loading && (
          <div style={{ ...CARD, padding: 16 }}>
            <p style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 12 }}>Communication Threads</p>
            <MessageThread requestId={request.id} />
          </div>
        )}
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

function capFirst(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s }

const PROP_STATUS_LABEL: Record<PropStatus, string> = {
  active:     'Tenanted',
  tenanted:   'Tenanted',
  notice:     'Handed in Notice',
  moving_in:  'Moving In',
  viewings:   'Viewings',
  for_let:    'Listed for Let',
  vacant:     'Vacant',
}

const PROP_STATUS_STYLE: Record<PropStatus, React.CSSProperties> = {
  active:    { background: 'rgba(74,222,128,0.12)',   color: '#4ade80' },
  tenanted:  { background: 'rgba(74,222,128,0.12)',   color: '#4ade80' },
  notice:    { background: 'rgba(249,115,22,0.14)',   color: '#f97316' },
  moving_in: { background: 'rgba(167,139,250,0.15)',  color: '#a78bfa' },
  viewings:  { background: 'rgba(96,165,250,0.15)',   color: '#60a5fa' },
  for_let:   { background: 'rgba(136,153,170,0.12)',  color: '#8899aa' },
  vacant:    { background: 'rgba(248,113,113,0.12)',  color: '#f87171' },
}

function AdminPropertyCard({ property, pendingNotice, onLinkTenant, onEdit, onView, onToggleListing }: { property: AdminPropRow; pendingNotice: TenancyNotice | null; onLinkTenant: (id: string) => void; onEdit: (p: AdminPropRow) => void; onView: (p: AdminPropRow) => void; onToggleListing: (p: AdminPropRow) => void }) {
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4, flexShrink: 0, letterSpacing: '0.08em', ...statusStyle }}>
              {PROP_STATUS_LABEL[statusKey] ?? capFirst(statusKey)}
            </span>
            {property.move_in_date && (
              <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                Moving in: {fmtDate(property.move_in_date)}
              </span>
            )}
            {(property.move_out_date || pendingNotice) && (
              <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                Moving out: {fmtDate((property.move_out_date ?? pendingNotice!.vacate_date))}
              </span>
            )}
          </div>
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

function DmyField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
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
  const [monthlyRent, setMonthlyRent] = useState(String(property.monthly_rent ?? ''))
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isValid = tenantName.trim().length > 0 && parseFloat(monthlyRent) > 0

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
    if (dbErr) { setError(dbErr.message); setSaving(false); return }

    // Create a tenancy record so the rent tab shows "Mark Paid" immediately.
    // tenant_id is left null until the tenant creates their account and gets linked.
    const rent = parseFloat(monthlyRent)
    await supabase.from('tenancies').insert({
      property_id: property.id,
      tenant_id: null,
      start_date: signingDate,
      monthly_rent: rent,
      deposit: 0,
      status: 'active',
      is_current: true,
    })

    await supabase.from('properties').update({ status: 'active', monthly_rent: rent }).eq('id', property.id)
    setSaving(false)
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="Signing Date">
              <DateInput value={signingDate} onChange={setSigningDate} style={INPUT_STYLE} />
            </FormField>
            <FormField label="Monthly Rent (£) *">
              <input type="number" value={monthlyRent} onChange={e => setMonthlyRent(e.target.value)} placeholder="1200" min="0" style={INPUT_STYLE} />
            </FormField>
          </div>
          <FormField label="Upload PDF">
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0', borderRadius: 8, border: '1px dashed rgba(255,255,255,0.2)', color: '#60a5fa', fontSize: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.02)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/></svg>
              {file ? file.name : 'Choose PDF (optional)'}
              <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </label>
            {file && (
              <button type="button"
                onClick={() => { const url = URL.createObjectURL(file); window.open(url, '_blank') }}
                style={{ marginTop: 8, width: '100%', padding: '8px 0', borderRadius: 8, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', color: '#60a5fa', fontSize: 12, cursor: 'pointer' }}>
                Preview PDF
              </button>
            )}
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
            <DmyField label="Issue Date" value={issueDate} onChange={handleIssueDateChange} />
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

function AddComplianceModal({ property, presetType, onClose, onSaved, onFileUploaded }: {
  property: AdminPropRow
  presetType?: string
  onClose: () => void
  onSaved: (item: ComplianceItem) => void
  onFileUploaded: (id: string, documentUrl: string) => void
}) {
  const [certType, setCertType] = useState(presetType ?? '')
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
            {presetType ? (
              <div style={{ ...INPUT_STYLE, color: '#e8edf5', display: 'flex', alignItems: 'center' }}>{presetType}</div>
            ) : (
              <select value={certType} onChange={e => handleTypeChange(e.target.value)} style={INPUT_STYLE}>
                <option value="">Select type…</option>
                {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
          </FormField>
          {certType === 'Inventory' || certType === 'Deposit Prescribed Information' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <DmyField label="Issue Date" value={issueDate} onChange={handleIssueDateChange} />
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
              <DmyField label="Issue Date" value={issueDate} onChange={handleIssueDateChange} />
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
  const addressParts = property.address.split(',').map(s => s.trim())
  const [addrLine1, setAddrLine1] = useState(addressParts[0] ?? '')
  const [addrLine2, setAddrLine2] = useState(addressParts[1] ?? '')
  const [addrLine3, setAddrLine3] = useState(addressParts[2] ?? '')
  const [postcode, setPostcode] = useState(property.postcode ?? '')
  const [propType, setPropType] = useState(property.property_type ?? '')
  const [bedrooms, setBedrooms] = useState(property.bedrooms != null ? String(property.bedrooms) : '')
  const [rent, setRent] = useState(property.monthly_rent != null ? String(property.monthly_rent) : '')
  const [description, setDescription] = useState(property.description ?? '')
  const scheduledMoveIn = !!property.move_in_date
  const [propStatus, setPropStatus] = useState<PropStatus>(scheduledMoveIn ? 'tenanted' : (property.status === 'active' ? 'tenanted' : (property.status ?? 'for_let')) as PropStatus)
  const [moveInDate, setMoveInDate] = useState(property.move_in_date ?? '')
  const [moveOutDate, setMoveOutDate] = useState(property.move_out_date ?? '')
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
    if (!addrLine1.trim()) { setError('Address line 1 is required'); return }
    if (!landlordId) { setError('Please select a landlord'); return }
    const address = [addrLine1, addrLine2, addrLine3].map(s => s.trim()).filter(Boolean).join(', ')
    const today = new Date().toISOString().slice(0, 10)
    const isFutureMoveIn = propStatus === 'tenanted' && moveInDate && moveInDate > today
    const isFutureMoveOut = propStatus === 'notice' && moveOutDate && moveOutDate > today
    const patch: Partial<AdminPropRow> = {
      address,
      postcode: postcode.trim() || null,
      property_type: propType || null,
      bedrooms: bedrooms ? parseInt(bedrooms) : null,
      monthly_rent: rent ? parseFloat(rent) : null,
      description: description.trim() || null,
      photo_urls: photoUrls,
      has_gas: hasGas,
      landlord_id: landlordId,
      ...(isFutureMoveIn ? {
        move_in_date: moveInDate,
        move_out_date: null,
      } : isFutureMoveOut ? {
        status: 'notice' as PropStatus,
        is_active: true,
        move_out_date: moveOutDate,
        move_in_date: null,
      } : {
        status: (propStatus === 'tenanted' ? 'active' : propStatus) as PropStatus,
        is_active: propStatus === 'tenanted' || propStatus === 'active' || propStatus === 'notice',
        move_in_date: null,
        move_out_date: null,
      }),
    }
    onSaved(patch)
    supabase.from('properties').update(patch).eq('id', property.id)
      .then(({ error: dbError }) => {
        if (dbError) console.error('Property save failed:', dbError.message)
      })
    if (isFutureMoveIn) {
      supabase.functions.invoke('send-tenancy-notification', {
        body: {
          propertyId: property.id,
          propertyAddress: address.trim(),
          moveInDate,
          landlordEmail: property.profiles?.email ?? '',
          landlordName: property.profiles?.full_name ?? property.profiles?.email ?? '',
        },
      }).catch(err => console.warn('Tenancy notification failed:', err))
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '0 16px' }}>
      <div style={{ background: '#112240', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90dvh', overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontSize: 16, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>Edit Property</p>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#8899aa', padding: 4, cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormField label="Full Address *">
            <input type="text" value={addrLine1} onChange={e => setAddrLine1(e.target.value)} placeholder="e.g. 3/L, 337 Strathmore Avenue" style={INPUT_STYLE} autoFocus />
          </FormField>
          <FormField label="Location">
            <input type="text" value={addrLine2} onChange={e => setAddrLine2(e.target.value)} placeholder="e.g. Dundee" style={INPUT_STYLE} />
          </FormField>
          <FormField label="County (if applicable)">
            <input type="text" value={addrLine3} onChange={e => setAddrLine3(e.target.value)} placeholder="e.g. Angus" style={INPUT_STYLE} />
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {(['tenanted', 'notice', 'viewings', 'vacant', 'for_let'] as PropStatus[]).map(s => (
                <button key={s} type="button" onClick={() => {
                  setPropStatus(s)
                  if (s === 'notice' && !moveOutDate) {
                    const d = new Date()
                    d.setDate(d.getDate() + 28)
                    setMoveOutDate(d.toISOString().slice(0, 10))
                  }
                }}
                  style={{ padding: '8px 4px', borderRadius: 8, fontSize: 10, fontWeight: 500, border: '1px solid', cursor: 'pointer',
                    borderColor: propStatus === s ? PROP_STATUS_STYLE[s].color as string : 'rgba(255,255,255,0.1)',
                    background: propStatus === s ? PROP_STATUS_STYLE[s].background as string : 'rgba(255,255,255,0.04)',
                    color: propStatus === s ? PROP_STATUS_STYLE[s].color as string : '#8899aa' }}>
                  {PROP_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </FormField>
          {propStatus === 'tenanted' && (
            <FormField label="Moving in from">
              <input type="date" value={moveInDate} onChange={e => setMoveInDate(e.target.value)} style={INPUT_STYLE} />
              {moveInDate && moveInDate > new Date().toISOString().slice(0, 10) ? (
                <p style={{ fontSize: 11, color: '#4ade80', marginTop: 4 }}>Status will update to Tenanted on {fmtDate(moveInDate)}</p>
              ) : moveInDate ? (
                <p style={{ fontSize: 11, color: '#8899aa', marginTop: 4 }}>Status will update to Tenanted immediately</p>
              ) : (
                <p style={{ fontSize: 11, color: '#8899aa', marginTop: 4 }}>Leave blank to set as Tenanted now</p>
              )}
            </FormField>
          )}
          {propStatus === 'notice' && (
            <FormField label="Move-out date (28-day notice)">
              <input type="date" value={moveOutDate} onChange={e => setMoveOutDate(e.target.value)} style={INPUT_STYLE} />
              {moveOutDate && moveOutDate > new Date().toISOString().slice(0, 10) ? (
                <p style={{ fontSize: 11, color: '#fbbf24', marginTop: 4 }}>
                  Pro-rated rent will apply from {new Date(moveOutDate + 'T12:00:00').toLocaleDateString('en-GB', { month: 'long' })} · Vacant on {fmtDate(moveOutDate)}
                </p>
              ) : moveOutDate ? (
                <p style={{ fontSize: 11, color: '#8899aa', marginTop: 4 }}>Move-out date is today or in the past — pro-rated rent applied immediately</p>
              ) : (
                <p style={{ fontSize: 11, color: '#8899aa', marginTop: 4 }}>Auto-calculated as 28 days from today — adjust if needed</p>
              )}
            </FormField>
          )}
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

function AdminPRTSignModal({ propertyId: _propertyId, sigCanvasRef, sigDrawing, sigHasStroke, sigTypedName, setSigTypedName, sigSubmitting, sigError, onClose, onSign }: {
  propertyId: string
  sigCanvasRef: React.RefObject<HTMLCanvasElement | null>
  sigDrawing: React.MutableRefObject<boolean>
  sigHasStroke: React.MutableRefObject<boolean>
  sigTypedName: string
  setSigTypedName: (v: string) => void
  sigSubmitting: boolean
  sigError: string | null
  onClose: () => void
  onSign: () => void
}) {
  function getPos(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = sigCanvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const src = 'touches' in e ? e.touches[0] : e
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY }
  }
  function onPointerDown(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    sigDrawing.current = true
    const canvas = sigCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  function onPointerMove(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!sigDrawing.current) return
    const canvas = sigCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.strokeStyle = '#0D1B3E'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    sigHasStroke.current = true
  }
  function onPointerUp() { sigDrawing.current = false }
  function clearCanvas() {
    const canvas = sigCanvasRef.current
    if (!canvas) return
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    sigHasStroke.current = false
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#0d1b2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontSize: 16, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>Sign Agreement</p>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#8899aa', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: '#8899aa', marginBottom: 6 }}>Full name</p>
          <input
            value={sigTypedName}
            onChange={e => setSigTypedName(e.target.value)}
            placeholder="Enter your full name"
            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '10px 12px', color: '#e8edf5', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <p style={{ fontSize: 11, color: '#8899aa' }}>Draw signature</p>
            <button type="button" onClick={clearCanvas}
              style={{ fontSize: 11, color: '#8899aa', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '3px 9px', cursor: 'pointer' }}>
              Clear
            </button>
          </div>
          <canvas
            ref={sigCanvasRef}
            width={600}
            height={140}
            onMouseDown={onPointerDown}
            onMouseMove={onPointerMove}
            onMouseUp={onPointerUp}
            onMouseLeave={onPointerUp}
            onTouchStart={onPointerDown}
            onTouchMove={onPointerMove}
            onTouchEnd={onPointerUp}
            style={{ width: '100%', height: 140, background: '#ffffff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 9, cursor: 'crosshair', touchAction: 'none' }}
          />
          <p style={{ fontSize: 11, color: '#8899aa', marginTop: 6, textAlign: 'center' }}>Sign with your finger or mouse</p>
        </div>
        {sigError && <p style={{ fontSize: 12, color: '#f87171', marginBottom: 12 }}>{sigError}</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button type="button" onClick={onClose}
            style={{ flex: 1, padding: '11px 0', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: '#8899aa', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="button" onClick={onSign} disabled={sigSubmitting}
            style={{ flex: 2, padding: '11px 0', borderRadius: 8, background: sigSubmitting ? 'rgba(232,237,245,0.4)' : '#e8edf5', color: '#0d1b2e', border: 'none', fontSize: 13, fontWeight: 600, cursor: sigSubmitting ? 'default' : 'pointer' }}>
            {sigSubmitting ? 'Signing…' : 'Sign & Execute Agreement'}
          </button>
        </div>
      </div>
    </div>
  )
}


import { useState, useEffect, useRef } from 'react'
import type React from 'react'
import { useAuth } from '../contexts/AuthContext'
import { initials, fmtDate } from '../lib/utils'
import { supabase } from '../lib/supabase'
import DashShell from '../components/DashShell'
import SettingsPage from './SettingsPage'
import MessageThread from '../components/MessageThread'
import { IconWrench, IconCalendar, IconGear, IconDoc } from '../components/icons'

const TABS = [
  { id: 'jobs',     label: 'Jobs',     icon: <IconWrench /> },
  { id: 'schedule', label: 'Schedule', icon: <IconCalendar /> },
  { id: 'invoices', label: 'Invoices', icon: <IconDoc /> },
  { id: 'settings', label: 'Settings', icon: <IconGear /> },
]

const CARD: React.CSSProperties = {
  background: '#112240',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 12,
}

const INPUT: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 14,
  color: '#e8edf5',
  outline: 'none',
  boxSizing: 'border-box',
}

const LABEL: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#8899aa',
  marginBottom: 6,
  display: 'block',
}

type Job = {
  id: string
  title: string | null
  status: string | null
  priority: string | null
  created_at: string | null
  property_address: string | null
  request_type: string | null
  scheduled_at: string | null
}

type Notification = {
  id: string
  title: string
  body: string | null
  created_at: string
  read_at: string | null
}

type FullJob = Job & {
  description: string | null
  photo_urls: string[] | null
  completion_photo_urls: string[] | null
  completion_document_url: string | null
  tenant_id: string | null
  tenancy_id: string | null
  compliance_template_url: string | null
  tenant_home_at_scheduled: boolean | null
  tenant_keys_ok: boolean | null
  tenant_alt_datetime: string | null
}

type LineItem = {
  key: string
  description: string
  quantity: string
  unit_price: string
}

type ContractorInvoice = {
  id: string
  maintenance_request_id: string | null
  invoice_number: string
  description: string | null
  line_items: { description: string; quantity: number; unit_price: number; amount: number }[]
  subtotal: number
  vat_rate: number
  vat_amount: number
  total: number
  status: string
  notes: string | null
  created_at: string
  invoice_pdf_url: string | null
}

function priorityStyle(p: string | null) {
  if (p === 'high' || p === 'emergency') return { bg: 'rgba(248,113,113,0.15)', color: '#f87171' }
  if (p === 'medium') return { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' }
  return { bg: 'rgba(74,222,128,0.12)', color: '#4ade80' }
}

function statusStyle(s: string | null) {
  if (s === 'in_progress' || s === 'assigned') return { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' }
  if (s === 'open') return { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' }
  if (s === 'resolved' || s === 'closed') return { bg: 'rgba(74,222,128,0.12)', color: '#4ade80' }
  return { bg: 'rgba(136,153,170,0.12)', color: '#8899aa' }
}

function statusLabel(s: string | null) {
  const map: Record<string, string> = {
    open: 'Open', assigned: 'Assigned', in_progress: 'In Progress',
    pending_review: 'Pending Review', resolved: 'Resolved', closed: 'Closed',
  }
  return s ? (map[s] ?? s) : 'Open'
}

function invoiceStatusStyle(s: string) {
  if (s === 'submitted') return { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' }
  if (s === 'approved') return { bg: 'rgba(74,222,128,0.12)', color: '#4ade80' }
  if (s === 'paid') return { bg: 'rgba(74,222,128,0.2)', color: '#22c55e' }
  if (s === 'rejected') return { bg: 'rgba(248,113,113,0.15)', color: '#f87171' }
  return { bg: 'rgba(136,153,170,0.12)', color: '#8899aa' }
}

function invoiceStatusLabel(s: string) {
  const map: Record<string, string> = {
    draft: 'Draft', submitted: 'Submitted', approved: 'Approved', paid: 'Paid', rejected: 'Rejected',
  }
  return map[s] ?? s
}

function newLineItem(): LineItem {
  return { key: String(Date.now() + Math.random()), description: '', quantity: '1', unit_price: '' }
}

function calcLineItemAmount(li: LineItem): number {
  const qty = parseFloat(li.quantity) || 0
  const price = parseFloat(li.unit_price) || 0
  return Math.round(qty * price * 100) / 100
}

export default function ContractorDashboard() {
  const { user } = useAuth()
  const [tab, setTab] = useState('jobs')
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [contractorId, setContractorId] = useState<string | null>(null)
  const [toast, setToast] = useState<Notification | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Invoice state
  const [invoices, setInvoices] = useState<ContractorInvoice[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const [invoicesLoaded, setInvoicesLoaded] = useState(false)
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [invJobId, setInvJobId] = useState('')
  const [invDescription, setInvDescription] = useState('')
  const [invLineItems, setInvLineItems] = useState<LineItem[]>([newLineItem()])
  const [invVat, setInvVat] = useState(false)
  const [invNotes, setInvNotes] = useState('')
  const [invSaving, setInvSaving] = useState(false)
  const [invError, setInvError] = useState<string | null>(null)
  const [invUploadMode, setInvUploadMode] = useState(false)
  const [invPdfFile, setInvPdfFile] = useState<File | null>(null)
  const [invManualTotal, setInvManualTotal] = useState('')
  const [invCertFile, setInvCertFile] = useState<File | null>(null)
  const [invCertUploaded, setInvCertUploaded] = useState(false)
  const invPdfRef = useRef<HTMLInputElement | null>(null)
  const invCertRef = useRef<HTMLInputElement | null>(null)

  // Job detail state
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [fullJob, setFullJob] = useState<FullJob | null>(null)
  const [fullJobLoading, setFullJobLoading] = useState(false)
  const [jobTenantName, setJobTenantName] = useState<string | null>(null)
  const [mapCoords, setMapCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [jobActionSaving, setJobActionSaving] = useState(false)
  const [jobActionError, setJobActionError] = useState<string | null>(null)
  const [jobInvoices, setJobInvoices] = useState<{ id: string; status: string }[]>([])
  const [completionUploading, setCompletionUploading] = useState(false)
  const [completionUploadError, setCompletionUploadError] = useState<string | null>(null)
  const completionFileRef = useRef<HTMLInputElement | null>(null)
  const [docUploading, setDocUploading] = useState(false)
  const [docUploadError, setDocUploadError] = useState<string | null>(null)
  const docFileRef = useRef<HTMLInputElement | null>(null)

  // Accept job scheduling
  const [acceptDate, setAcceptDate] = useState('')
  const [acceptTime, setAcceptTime] = useState('')

  const userInitials = initials(user?.full_name, user?.email ?? '')

  // Load contractor record + jobs
  useEffect(() => {
    if (!user) return
    async function load() {
      setLoading(true)
      const { data: contractorRow } = await supabase
        .from('contractors')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle()
      if (!contractorRow) { setLoading(false); return }
      const cid = (contractorRow as { id: string }).id
      setContractorId(cid)

      type RpcJob = { id: string; title: string | null; status: string | null; priority: string | null; created_at: string | null; property_id: string | null; property_address: string | null; photo_urls: string[] | null; request_type: string | null; scheduled_at: string | null }
      const { data: jobRows } = await supabase.rpc('get_my_contractor_jobs')
      setJobs(((jobRows ?? []) as RpcJob[]).map(r => ({
        id: r.id,
        title: r.title,
        status: r.status,
        priority: r.priority,
        created_at: r.created_at,
        property_address: r.property_address,
        request_type: r.request_type ?? 'maintenance',
        scheduled_at: r.scheduled_at ?? null,
      })))
      setLoading(false)
    }
    load()
  }, [user])

  // Load invoices when the invoices tab is first opened
  useEffect(() => {
    if (tab !== 'invoices' || !contractorId || invoicesLoaded) return
    async function loadInvoices() {
      setInvoicesLoading(true)
      const { data } = await supabase
        .from('contractor_invoices')
        .select('*')
        .eq('contractor_id', contractorId)
        .order('created_at', { ascending: false })
      setInvoices((data ?? []) as ContractorInvoice[])
      setInvoicesLoaded(true)
      setInvoicesLoading(false)
    }
    loadInvoices()
  }, [tab, contractorId, invoicesLoaded])

  // Realtime: subscribe to new notifications for this user
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('contractor-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as Notification
          showToast(n)
          if (n.id) {
            setJobs(prev => {
              const data = payload.new as { data?: { maintenance_request_id?: string } }
              const mid = data?.data?.maintenance_request_id
              if (!mid || prev.find(j => j.id === mid)) return prev
              supabase
                .from('maintenance_requests')
                .select('id, title, status, priority, created_at, property_id, request_type, scheduled_at')
                .eq('id', mid)
                .maybeSingle()
                .then(async ({ data: job }) => {
                  if (!job) return
                  const j = job as { id: string; title: string | null; status: string | null; priority: string | null; created_at: string | null; property_id: string | null; request_type: string | null; scheduled_at: string | null }
                  let address: string | null = null
                  if (j.property_id) {
                    const { data: prop } = await supabase.from('properties').select('address').eq('id', j.property_id).maybeSingle()
                    address = (prop as { address: string } | null)?.address ?? null
                  }
                  setJobs(p => [{ ...j, property_address: address, request_type: j.request_type ?? 'maintenance', scheduled_at: j.scheduled_at ?? null }, ...p])
                })
              return prev
            })
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  function showToast(n: Notification) {
    setToast(n)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }

  async function dismissToast() {
    if (!toast) return
    setToast(null)
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', toast.id)
  }

  async function openJob(job: Job) {
    setSelectedJob(job)
    setFullJob(null)
    setFullJobLoading(true)
    setJobActionError(null)
    setJobTenantName(null)
    setMapCoords(null)
    setCompletionUploadError(null)
    setDocUploadError(null)
    setJobInvoices([])
    setAcceptDate('')
    setAcceptTime('')

    // Geocode the address in parallel
    if (job.property_address) {
      fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(job.property_address)}&format=json&limit=1&countrycodes=gb`)
        .then(r => r.json())
        .then((data: { lat: string; lon: string }[]) => {
          if (data?.[0]) setMapCoords({ lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) })
        })
        .catch(() => {})
    }

    const [{ data }, { data: invData }] = await Promise.all([
      supabase
        .from('maintenance_requests')
        .select('id, title, description, status, priority, created_at, property_id, photo_urls, completion_photo_urls, completion_document_url, request_type, tenant_id, tenancy_id, compliance_template_url, scheduled_at, tenant_home_at_scheduled, tenant_keys_ok, tenant_alt_datetime')
        .eq('id', job.id)
        .maybeSingle(),
      supabase
        .from('contractor_invoices')
        .select('id, status')
        .eq('maintenance_request_id', job.id),
    ])

    if (data) {
      const req = data as { id: string; title: string | null; description: string | null; status: string | null; priority: string | null; created_at: string | null; property_id: string | null; photo_urls: string[] | null; completion_photo_urls: string[] | null; completion_document_url: string | null; request_type: string | null; tenant_id: string | null; tenancy_id: string | null; compliance_template_url: string | null; scheduled_at: string | null; tenant_home_at_scheduled: boolean | null; tenant_keys_ok: boolean | null; tenant_alt_datetime: string | null }
      setFullJob({ ...req, property_address: job.property_address })

      // Resolve tenant name via security-definer function (no direct tenancy/user access)
      supabase.rpc('get_tenant_name_for_job', { request_id: job.id })
        .then(({ data }) => { if (data) setJobTenantName(data as string) })
    }

    setJobInvoices((invData ?? []) as { id: string; status: string }[])
    setFullJobLoading(false)
  }

  async function handleJobStatusUpdate(newStatus: string, scheduledAt?: string) {
    if (!selectedJob) return
    setJobActionSaving(true)
    setJobActionError(null)
    try {
      const patch: Record<string, string> = { status: newStatus, updated_at: new Date().toISOString() }
      if (scheduledAt) patch.scheduled_at = scheduledAt
      const { data: updated, error } = await supabase
        .from('maintenance_requests')
        .update(patch)
        .eq('id', selectedJob.id)
        .select('id')
      if (error) throw error
      if (!updated || updated.length === 0) {
        setJobActionError('Update failed — permission denied.')
        return
      }
      setJobs(prev => prev.map(j => j.id === selectedJob.id ? { ...j, status: newStatus } : j))
      setSelectedJob(prev => prev ? { ...prev, status: newStatus } : prev)
      setFullJob(prev => prev ? { ...prev, status: newStatus, ...(scheduledAt ? { scheduled_at: scheduledAt } : {}) } : prev)

      // Best-effort notifications — errors must not block the main status update
      if (scheduledAt) {
        const dt = new Date(scheduledAt)
        const label = dt.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        try {
          await supabase.rpc('notify_tenant_job_scheduled', {
            p_request_id: selectedJob.id,
            p_title: 'Visit scheduled',
            p_body: `A contractor visit has been scheduled for ${label}. Please confirm whether you'll be home.`,
            p_data: { request_id: selectedJob.id },
          })
        } catch { /* best-effort */ }
      }

      if (newStatus === 'pending_review') {
        try {
          await supabase.rpc('notify_staff_of_event', {
            p_type: 'pending_review',
            p_title: 'Job ready for review',
            p_body: `"${selectedJob.title ?? 'Untitled'}" has been marked complete by the contractor and is awaiting review.`,
            p_data: { request_id: selectedJob.id },
          })
        } catch { /* best-effort */ }
      }
    } catch (err) {
      console.error('handleJobStatusUpdate:', err)
      setJobActionError('Failed to update status. Please try again.')
    } finally {
      setJobActionSaving(false)
    }
  }

  async function handleCompletionPhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selectedJob || !e.target.files?.length) return
    const file = e.target.files[0]
    e.target.value = ''
    setCompletionUploading(true)
    setCompletionUploadError(null)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `requests/${selectedJob.id}/completion/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('maintenance-images').upload(path, file, { upsert: false })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('maintenance-images').getPublicUrl(path)
      const newUrl = urlData.publicUrl
      const updatedUrls = [...(fullJob?.completion_photo_urls ?? []), newUrl]
      const { error: dbError } = await supabase
        .from('maintenance_requests')
        .update({ completion_photo_urls: updatedUrls })
        .eq('id', selectedJob.id)
      if (dbError) throw dbError
      setFullJob(prev => prev ? { ...prev, completion_photo_urls: updatedUrls } : prev)
    } catch (err) {
      console.error('handleCompletionPhotoUpload:', err)
      setCompletionUploadError('Upload failed. Please try again.')
    } finally {
      setCompletionUploading(false)
    }
  }

  async function handleDocumentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selectedJob || !e.target.files?.length) return
    const file = e.target.files[0]
    e.target.value = ''
    setDocUploading(true)
    setDocUploadError(null)
    try {
      const path = `contractor/${selectedJob.id}/${crypto.randomUUID()}.pdf`
      const { error: uploadError } = await supabase.storage.from('compliance-docs').upload(path, file, { upsert: false, contentType: 'application/pdf' })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('compliance-docs').getPublicUrl(path)
      const newUrl = urlData.publicUrl
      const { error: dbError } = await supabase
        .from('maintenance_requests')
        .update({ completion_document_url: newUrl })
        .eq('id', selectedJob.id)
      if (dbError) throw dbError
      setFullJob(prev => prev ? { ...prev, completion_document_url: newUrl } : prev)
    } catch (err) {
      console.error('handleDocumentUpload:', err)
      setDocUploadError('Upload failed. Please try again.')
    } finally {
      setDocUploading(false)
    }
  }

  function resetInvoiceForm() {
    setInvJobId('')
    setInvDescription('')
    setInvLineItems([newLineItem()])
    setInvVat(false)
    setInvNotes('')
    setInvError(null)
    setInvUploadMode(false)
    setInvPdfFile(null)
    setInvManualTotal('')
    setInvCertFile(null)
    setInvCertUploaded(false)
  }

  function updateLineItem(key: string, field: keyof Omit<LineItem, 'key'>, value: string) {
    setInvLineItems(prev => prev.map(li => li.key === key ? { ...li, [field]: value } : li))
  }

  function removeLineItem(key: string) {
    setInvLineItems(prev => prev.length > 1 ? prev.filter(li => li.key !== key) : prev)
  }

  function getInvoiceTotals() {
    const subtotal = Math.round(invLineItems.reduce((sum, li) => sum + calcLineItemAmount(li), 0) * 100) / 100
    const vatAmount = invVat ? Math.round(subtotal * 0.20 * 100) / 100 : 0
    const total = Math.round((subtotal + vatAmount) * 100) / 100
    return { subtotal, vatAmount, total }
  }

  async function handleSubmitInvoice(asDraft: boolean) {
    const invLinkedJob = jobs.find(j => j.id === invJobId)
    const isComplianceJob = invLinkedJob?.request_type === 'compliance'

    if (invUploadMode) {
      if (!asDraft && !invPdfFile) { setInvError('Upload your invoice PDF before submitting.'); return }
      const manualTotal = parseFloat(invManualTotal)
      if (!asDraft && (!invManualTotal || isNaN(manualTotal) || manualTotal <= 0)) {
        setInvError('Enter the total amount from your invoice.'); return
      }
    } else {
      const validItems = invLineItems.filter(li => li.description.trim() && parseFloat(li.unit_price) > 0)
      if (!asDraft && validItems.length === 0) { setInvError('Add at least one line item with a description and price.'); return }
    }

    if (!asDraft && isComplianceJob && !invCertFile && !invCertUploaded) {
      setInvError('Upload the compliance certificate before submitting.'); return
    }

    setInvSaving(true)
    setInvError(null)

    try {
      // Upload contractor's own invoice PDF if provided
      let uploadedInvPdfUrl: string | null = null
      if (invPdfFile) {
        const ext = invPdfFile.name.split('.').pop() ?? 'pdf'
        const path = `invoices/${contractorId}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage.from('compliance-docs').upload(path, invPdfFile, { upsert: false, contentType: 'application/pdf' })
        if (upErr) throw upErr
        const { data: urlData } = supabase.storage.from('compliance-docs').getPublicUrl(path)
        uploadedInvPdfUrl = urlData.publicUrl
      }

      // Upload compliance certificate if provided
      if (invCertFile && invJobId) {
        const path = `contractor/${invJobId}/${crypto.randomUUID()}.pdf`
        const { error: certErr } = await supabase.storage.from('compliance-docs').upload(path, invCertFile, { upsert: false, contentType: 'application/pdf' })
        if (certErr) throw certErr
        const { data: certUrlData } = supabase.storage.from('compliance-docs').getPublicUrl(path)
        await supabase.from('maintenance_requests').update({ completion_document_url: certUrlData.publicUrl }).eq('id', invJobId)
        if (fullJob?.id === invJobId) setFullJob(prev => prev ? { ...prev, completion_document_url: certUrlData.publicUrl } : prev)
        setInvCertUploaded(true)
      }

      const now = new Date()
      const invoiceNumber = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 9000) + 1000)}`

      let subtotal: number, vatAmount: number, total: number, items: ContractorInvoice['line_items']
      if (invUploadMode) {
        const t = Math.round((parseFloat(invManualTotal) || 0) * 100) / 100
        subtotal = t; vatAmount = 0; total = t; items = []
      } else {
        const totals = getInvoiceTotals()
        subtotal = totals.subtotal; vatAmount = totals.vatAmount; total = totals.total
        const validItems = invLineItems.filter(li => li.description.trim() && parseFloat(li.unit_price) > 0)
        items = validItems.map(li => ({
          description: li.description,
          quantity: parseFloat(li.quantity) || 1,
          unit_price: parseFloat(li.unit_price) || 0,
          amount: calcLineItemAmount(li),
        }))
      }

      const { data, error } = await supabase.from('contractor_invoices').insert({
        contractor_id: contractorId,
        maintenance_request_id: invJobId || null,
        invoice_number: invoiceNumber,
        description: invDescription.trim() || null,
        line_items: items,
        subtotal,
        vat_rate: invUploadMode ? 0 : (invVat ? 20 : 0),
        vat_amount: vatAmount,
        total,
        status: asDraft ? 'draft' : 'submitted',
        notes: invNotes.trim() || null,
        invoice_pdf_url: uploadedInvPdfUrl,
      }).select()
      if (error) throw error
      const saved = data?.[0] as ContractorInvoice | undefined
      if (saved) {
        setInvoices(prev => [saved, ...prev])
        if (saved.maintenance_request_id && saved.maintenance_request_id === selectedJob?.id) {
          setJobInvoices(prev => [...prev, { id: saved.id, status: saved.status }])
        }
      }
      setShowInvoiceForm(false)
      resetInvoiceForm()
    } catch (err) {
      console.error('handleSubmitInvoice:', err)
      setInvError('Failed to save invoice. Please try again.')
    } finally {
      setInvSaving(false)
    }
  }

  const inProgress = jobs.filter(j => j.status === 'in_progress' || j.status === 'assigned').length
  const open = jobs.filter(j => j.status === 'open').length
  const completed = jobs.filter(j => j.status === 'resolved' || j.status === 'closed').length

  const metrics = [
    { label: 'In Progress', value: String(inProgress) },
    { label: 'Open', value: String(open) },
    { label: 'Completed', value: String(completed) },
  ]

  return (
    <DashShell tabs={TABS} active={tab} onChange={setTab} metrics={metrics} userInitials={userInitials}>

      {/* Notification toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 999, width: 'calc(100% - 32px)', maxWidth: 480,
          background: '#1a3a5c', border: '1px solid rgba(96,165,250,0.4)',
          borderRadius: 12, padding: '14px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'rgba(96,165,250,0.15)', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#60a5fa">
              <path d="M20 6h-2.18c.07-.44.18-.88.18-1.34C18 2.99 16.32 1 14 1c-1.3 0-2.48.62-3.22 1.57L10 4 9.22 2.57C8.48 1.62 7.3 1 6 1 3.68 1 2 2.99 2 4.66c0 .46.1.9.18 1.34H0v2h24V6h-4zM3.87 6c-.06-.2-.17-.39-.17-.66C3.7 4.07 4.74 3 6 3c.74 0 1.4.37 1.8.97L8.98 6H3.87zm12.26 0h-5.11l1.18-2.03C12.6 3.37 13.26 3 14 3c1.26 0 2.3 1.07 2.3 2.34 0 .27-.11.46-.17.66zM4 20c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8H4v12zm8-8.5 5 3L12 18l-5-3.5 5-3z"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>{toast.title}</p>
            {toast.body && <p style={{ fontSize: 12, color: '#8899aa', marginTop: 3, lineHeight: 1.4 }}>{toast.body}</p>}
          </div>
          <button type="button" onClick={dismissToast}
            style={{ background: 'none', border: 'none', color: '#8899aa', fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}>
            ×
          </button>
        </div>
      )}

      {tab === 'jobs' && (
        <div className="px-4 py-5 flex flex-col gap-4">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {[
              { label: 'In Progress', value: inProgress, color: '#60a5fa' },
              { label: 'Open', value: open, color: '#fbbf24' },
              { label: 'Completed', value: completed, color: '#4ade80' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ ...CARD, padding: '12px 14px', textAlign: 'center' }}>
                <p style={{ fontSize: 26, fontWeight: 300, color, lineHeight: 1, fontFamily: 'Georgia, serif' }}>{value}</p>
                <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8899aa', marginTop: 5 }}>{label}</p>
              </div>
            ))}
          </div>

          {loading ? (
            <div style={{ ...CARD, height: 80, opacity: 0.4 }} className="animate-pulse" />
          ) : !contractorId ? (
            <div style={{ ...CARD, padding: 20, textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: '#8899aa' }}>No contractor profile found for this account.</p>
            </div>
          ) : jobs.length === 0 ? (
            <div style={{ ...CARD, padding: 20, textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: '#8899aa' }}>No jobs assigned yet.</p>
            </div>
          ) : (
            jobs.map((job) => {
              const ps = priorityStyle(job.priority)
              const ss = statusStyle(job.status)
              return (
                <div key={job.id} style={{ ...CARD, cursor: 'pointer' }} onClick={() => openJob(job)}>
                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, color: '#e8edf5', fontFamily: 'Georgia, serif' }} className="truncate">
                          {job.title ?? 'Untitled job'}
                        </p>
                        {job.property_address && (
                          <p style={{ fontSize: 12, color: '#8899aa', marginTop: 2 }} className="truncate">{job.property_address}</p>
                        )}
                        <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>{fmtDate(job.created_at)}</p>
                      </div>
                      {job.priority && (
                        <span style={{
                          fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
                          padding: '3px 10px', borderRadius: 4,
                          background: ps.bg, color: ps.color, flexShrink: 0,
                        }}>
                          {job.priority}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4,
                        background: ss.bg, color: ss.color, letterSpacing: '0.08em', textTransform: 'uppercase',
                      }}>
                        {statusLabel(job.status)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {tab === 'schedule' && (
        <div className="px-4 py-5 flex flex-col gap-3">
          {loading ? (
            <div style={{ ...CARD, height: 64, opacity: 0.4 }} className="animate-pulse" />
          ) : (() => {
            const scheduled = [...jobs]
              .filter(j => j.scheduled_at && j.status !== 'resolved' && j.status !== 'closed')
              .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
            if (scheduled.length === 0) return (
              <div style={{ ...CARD, padding: 20, textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: '#8899aa' }}>No scheduled visits yet. Accept a job to add it here.</p>
              </div>
            )
            return scheduled.map((job) => {
              const ps = priorityStyle(job.priority)
              const visitDate = new Date(job.scheduled_at!)
              const visitTime = visitDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
              return (
                <div key={job.id} style={{ ...CARD, padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                  onClick={() => openJob(job)}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 8, flexShrink: 0,
                    background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.15)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <p style={{ fontSize: 9, letterSpacing: '0.1em', color: '#60a5fa' }}>
                      {visitDate.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}
                    </p>
                    <p style={{ fontSize: 20, fontWeight: 300, color: '#e8edf5', lineHeight: 1.1, fontFamily: 'Georgia, serif' }}>
                      {visitDate.getDate()}
                    </p>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 500, color: '#e8edf5' }} className="truncate">
                      {job.title ?? 'Untitled job'}
                    </p>
                    {job.property_address && (
                      <p style={{ fontSize: 12, color: '#8899aa' }} className="truncate">{job.property_address}</p>
                    )}
                    <p style={{ fontSize: 11, color: '#60a5fa', marginTop: 2 }}>{visitTime}</p>
                  </div>
                  {job.priority && (
                    <span style={{
                      fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4,
                      background: ps.bg, color: ps.color, flexShrink: 0,
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                    }}>
                      {job.priority}
                    </span>
                  )}
                </div>
              )
            })
          })()}
        </div>
      )}

      {tab === 'invoices' && (
        <div className="px-4 py-5 flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setShowInvoiceForm(true)}
            style={{
              width: '100%', padding: '13px 16px',
              background: 'linear-gradient(135deg, #1a4a7a, #0f3460)',
              border: '1px solid rgba(96,165,250,0.3)',
              borderRadius: 12, color: '#e8edf5', fontSize: 14, fontWeight: 500,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
            New Invoice
          </button>

          {invoicesLoading ? (
            <>
              <div style={{ ...CARD, height: 72, opacity: 0.4 }} className="animate-pulse" />
              <div style={{ ...CARD, height: 72, opacity: 0.3 }} className="animate-pulse" />
            </>
          ) : invoices.length === 0 ? (
            <div style={{ ...CARD, padding: 32, textAlign: 'center' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(136,153,170,0.4)" style={{ margin: '0 auto 10px' }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
              </svg>
              <p style={{ fontSize: 13, color: '#8899aa' }}>No invoices yet. Create your first one above.</p>
            </div>
          ) : (
            invoices.map((inv) => {
              const ist = invoiceStatusStyle(inv.status)
              const linkedJob = jobs.find(j => j.id === inv.maintenance_request_id)
              return (
                <div key={inv.id} style={CARD}>
                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>
                          {inv.invoice_number}
                        </p>
                        {linkedJob && (
                          <p style={{ fontSize: 12, color: '#8899aa', marginTop: 2 }} className="truncate">
                            {linkedJob.title ?? 'Untitled job'}
                          </p>
                        )}
                        <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>{fmtDate(inv.created_at)}</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                        <p style={{ fontSize: 16, fontWeight: 500, color: '#e8edf5', fontFamily: 'Georgia, serif' }}>
                          £{Number(inv.total).toFixed(2)}
                        </p>
                        <span style={{
                          fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4,
                          background: ist.bg, color: ist.color, letterSpacing: '0.08em', textTransform: 'uppercase',
                        }}>
                          {invoiceStatusLabel(inv.status)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {tab === 'settings' && <SettingsPage />}

      {/* Job detail panel — full-screen overlay */}
      {selectedJob && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: '#0a192f', display: 'flex', flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 16px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          }}>
            <button
              type="button"
              onClick={() => { setSelectedJob(null); setFullJob(null); setJobActionError(null); setJobTenantName(null); setMapCoords(null) }}
              style={{
                background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8,
                width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#8899aa', flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
              </svg>
            </button>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e8edf5', fontFamily: 'Georgia, serif', margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedJob.title ?? 'Untitled job'}
            </h2>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Status + priority badges */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(() => { const ss = statusStyle(selectedJob.status); return (
                <span style={{ fontSize: 11, fontWeight: 500, padding: '4px 12px', borderRadius: 6, background: ss.bg, color: ss.color, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {statusLabel(selectedJob.status)}
                </span>
              )})()}
              {selectedJob.priority && (() => { const ps = priorityStyle(selectedJob.priority); return (
                <span style={{ fontSize: 11, fontWeight: 500, padding: '4px 12px', borderRadius: 6, background: ps.bg, color: ps.color, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {selectedJob.priority}
                </span>
              )})()}
            </div>

            {/* Property + tenant + date */}
            <div style={{ ...CARD, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selectedJob.property_address && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#8899aa" style={{ flexShrink: 0 }}>
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                  </svg>
                  <p style={{ fontSize: 13, color: '#e8edf5' }}>{selectedJob.property_address}</p>
                </div>
              )}
              {jobTenantName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#8899aa" style={{ flexShrink: 0 }}>
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                  <p style={{ fontSize: 13, color: '#e8edf5' }}>{jobTenantName}</p>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#8899aa" style={{ flexShrink: 0 }}>
                  <path d="M17 3h-1V1h-2v2H8V1H6v2H5C3.9 3 3 3.9 3 5v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5c0-1.1-.9-2-2-2zm0 18H5V9h14v12zM5 7V5h14v2H5z"/>
                </svg>
                <p style={{ fontSize: 13, color: '#8899aa' }}>Reported {fmtDate(selectedJob.created_at)}</p>
              </div>
              {fullJob?.scheduled_at && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#60a5fa" style={{ flexShrink: 0 }}>
                      <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
                    </svg>
                    <p style={{ fontSize: 13, color: '#60a5fa' }}>
                      Scheduled {new Date(fullJob.scheduled_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}{' '}
                      at {new Date(fullJob.scheduled_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {/* Tenant access response */}
                  {(() => {
                    const home = fullJob.tenant_home_at_scheduled
                    const keys = fullJob.tenant_keys_ok
                    const alt = fullJob.tenant_alt_datetime
                    if (home === null) return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8899aa', flexShrink: 0 }} />
                        <p style={{ fontSize: 12, color: '#8899aa' }}>Awaiting tenant availability response</p>
                      </div>
                    )
                    if (home === true) return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />
                        <p style={{ fontSize: 12, color: '#4ade80' }}>Tenant will be home</p>
                      </div>
                    )
                    if (keys === true) return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />
                        <p style={{ fontSize: 12, color: '#4ade80' }}>Tenant out — key access confirmed</p>
                      </div>
                    )
                    if (keys === false && alt) return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24', flexShrink: 0 }} />
                        <p style={{ fontSize: 12, color: '#fbbf24' }}>
                          Tenant out, no key access — alternative proposed:{' '}
                          {new Date(alt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}{' '}
                          at {new Date(alt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    )
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171', flexShrink: 0 }} />
                        <p style={{ fontSize: 12, color: '#f87171' }}>Tenant out, no key access — awaiting alternative time</p>
                      </div>
                    )
                  })()}
                </>
              )}
            </div>

            {/* Description / full details */}
            {fullJobLoading ? (
              <div style={{ ...CARD, height: 80, opacity: 0.4 }} className="animate-pulse" />
            ) : fullJob?.description ? (
              <div style={CARD}>
                <div style={{ padding: 14 }}>
                  <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 8 }}>Description</p>
                  <p style={{ fontSize: 14, color: '#e8edf5', lineHeight: 1.6 }}>{fullJob.description}</p>
                </div>
              </div>
            ) : null}

            {/* Map */}
            {mapCoords && (
              <div>
                <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 10 }}>Location</p>
                <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <iframe
                    title="Property location"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${mapCoords.lon - 0.004},${mapCoords.lat - 0.003},${mapCoords.lon + 0.004},${mapCoords.lat + 0.003}&layer=mapnik&marker=${mapCoords.lat},${mapCoords.lon}`}
                    style={{ width: '100%', height: 200, border: 'none', display: 'block' }}
                  />
                </div>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selectedJob?.property_address ?? '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    marginTop: 10, padding: '11px 0', borderRadius: 10,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#60a5fa', fontSize: 13, fontWeight: 500, textDecoration: 'none',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                  </svg>
                  Get Directions
                </a>
              </div>
            )}

            {fullJob?.request_type === 'compliance' ? (
              /* Compliance job — template link + PDF document upload */
              !fullJobLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {fullJob.compliance_template_url && (
                    <div>
                      <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#60a5fa', marginBottom: 8 }}>
                        Certificate Template
                      </p>
                      <a
                        href={fullJob.compliance_template_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '13px 14px', borderRadius: 10,
                          background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.3)',
                          color: '#60a5fa', textDecoration: 'none',
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15h8v2H8zm0-4h8v2H8z"/>
                        </svg>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 500 }}>Download Certificate Template</p>
                          <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>Use this format for your upload</p>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, opacity: 0.6 }}>
                          <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
                        </svg>
                      </a>
                    </div>
                  )}
                  <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: fullJob.completion_document_url ? '#4ade80' : '#fbbf24' }}>
                      Updated Certificate {fullJob.completion_document_url ? '(uploaded)' : '(required)'}
                    </p>
                    {(selectedJob?.status === 'in_progress' || selectedJob?.status === 'assigned' || selectedJob?.status === 'open') && (
                      <>
                        <input
                          ref={docFileRef}
                          type="file"
                          accept=".pdf,application/pdf"
                          style={{ display: 'none' }}
                          onChange={handleDocumentUpload}
                        />
                        <button
                          type="button"
                          disabled={docUploading}
                          onClick={() => docFileRef.current?.click()}
                          style={{
                            padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                            background: docUploading ? 'rgba(74,222,128,0.1)' : 'rgba(74,222,128,0.15)',
                            border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80',
                            cursor: docUploading ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {docUploading ? 'Uploading…' : fullJob.completion_document_url ? 'Replace PDF' : 'Upload PDF'}
                        </button>
                      </>
                    )}
                  </div>
                  {fullJob.completion_document_url ? (
                    <a
                      href={fullJob.completion_document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '13px 14px', borderRadius: 10,
                        background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)',
                        color: '#4ade80', textDecoration: 'none',
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15h8v2H8zm0-4h8v2H8z"/>
                      </svg>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 500 }}>Certificate PDF</p>
                        <p style={{ fontSize: 11, color: '#8899aa', marginTop: 2 }}>Tap to view</p>
                      </div>
                    </a>
                  ) : (
                    <div style={{
                      borderRadius: 10, border: '1px dashed rgba(251,191,36,0.35)',
                      background: 'rgba(251,191,36,0.06)', padding: '18px 14px', textAlign: 'center',
                    }}>
                      <p style={{ fontSize: 12, color: '#fbbf24', lineHeight: 1.5 }}>
                        Upload the updated compliance certificate as a PDF before submitting for review.
                      </p>
                    </div>
                  )}
                  {docUploadError && (
                    <p style={{ fontSize: 12, color: '#f87171', marginTop: 8 }}>{docUploadError}</p>
                  )}
                </div>
                </div>
              )
            ) : (
              <>
                {/* Reported photos (tenant) */}
                {fullJob?.photo_urls && fullJob.photo_urls.length > 0 && (
                  <div>
                    <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 10 }}>Reported Photos</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                      {fullJob.photo_urls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', borderRadius: 8, overflow: 'hidden', aspectRatio: '4/3' }}>
                          <img src={url} alt={`Reported photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Completion photos — required when tenant submitted photos */}
                {!fullJobLoading && (fullJob?.photo_urls?.length ?? 0) > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: (fullJob?.completion_photo_urls?.length ?? 0) > 0 ? '#4ade80' : '#fbbf24' }}>
                        Completion Photos {(fullJob?.completion_photo_urls?.length ?? 0) > 0 ? `(${fullJob!.completion_photo_urls!.length})` : '(required)'}
                      </p>
                      {(selectedJob?.status === 'in_progress' || selectedJob?.status === 'assigned' || selectedJob?.status === 'open') && (
                        <>
                          <input
                            ref={completionFileRef}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleCompletionPhotoUpload}
                          />
                          <button
                            type="button"
                            disabled={completionUploading}
                            onClick={() => completionFileRef.current?.click()}
                            style={{
                              padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                              background: completionUploading ? 'rgba(74,222,128,0.1)' : 'rgba(74,222,128,0.15)',
                              border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80',
                              cursor: completionUploading ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {completionUploading ? 'Uploading…' : '+ Add Photo'}
                          </button>
                        </>
                      )}
                    </div>
                    {(fullJob?.completion_photo_urls?.length ?? 0) > 0 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                        {fullJob!.completion_photo_urls!.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', borderRadius: 8, overflow: 'hidden', aspectRatio: '4/3' }}>
                            <img src={url} alt={`Completion photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <div style={{
                        borderRadius: 10, border: '1px dashed rgba(251,191,36,0.35)',
                        background: 'rgba(251,191,36,0.06)', padding: '18px 14px', textAlign: 'center',
                      }}>
                        <p style={{ fontSize: 12, color: '#fbbf24', lineHeight: 1.5 }}>
                          Upload a photo showing the issue has been fixed before submitting for review.
                        </p>
                      </div>
                    )}
                    {completionUploadError && (
                      <p style={{ fontSize: 12, color: '#f87171', marginTop: 8 }}>{completionUploadError}</p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Invoice shortcut */}
            {!fullJobLoading && selectedJob && selectedJob.status !== 'resolved' && selectedJob.status !== 'closed' && selectedJob.status !== 'pending_review' && (
              <div>
                <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 8 }}>Invoice</p>
                {jobInvoices.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {jobInvoices.map(inv => {
                      const ist = invoiceStatusStyle(inv.status)
                      return (
                        <div key={inv.id} style={{ ...CARD, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <p style={{ fontSize: 13, color: '#e8edf5' }}>Invoice</p>
                          <span style={{ fontSize: 10, fontWeight: 500, padding: '3px 10px', borderRadius: 4, background: ist.bg, color: ist.color, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                            {invoiceStatusLabel(inv.status)}
                          </span>
                        </div>
                      )
                    })}
                    <button type="button"
                      onClick={() => { setInvJobId(selectedJob.id); setShowInvoiceForm(true) }}
                      style={{ padding: '9px 0', borderRadius: 8, fontSize: 12, fontWeight: 500, background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.12)', color: '#8899aa', cursor: 'pointer' }}>
                      + Add Another Invoice
                    </button>
                  </div>
                ) : (
                  <button type="button"
                    onClick={() => { setInvJobId(selectedJob.id); setShowInvoiceForm(true) }}
                    style={{ width: '100%', padding: '13px 0', borderRadius: 10, fontSize: 13, fontWeight: 500, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', color: '#60a5fa', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                    Create Invoice for this Job
                  </button>
                )}
              </div>
            )}

            {jobActionError && (
              <p style={{ fontSize: 13, color: '#f87171', textAlign: 'center' }}>{jobActionError}</p>
            )}

            {/* Messaging thread with admin */}
            <div style={{ paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <MessageThread
                requestId={selectedJob.id}
                threadParticipant="contractor"
                label="Messages with admin"
              />
            </div>
          </div>

          {/* Action footer */}
          {(() => {
            const s = selectedJob.status
            const canStart = s === 'open' || s === 'assigned'
            const canComplete = s === 'in_progress'
            const isPendingOrDone = s === 'pending_review' || s === 'resolved' || s === 'closed'
            const isCompliance = fullJob?.request_type === 'compliance'
            const hasTenantPhotos = (fullJob?.photo_urls?.length ?? 0) > 0
            const hasCompletionPhotos = (fullJob?.completion_photo_urls?.length ?? 0) > 0
            const hasComplianceDoc = !!fullJob?.completion_document_url
            const hasSubmittedInvoice = jobInvoices.some(inv => inv.status !== 'draft')
            const photoRequired = !isCompliance && hasTenantPhotos && !hasCompletionPhotos
            const complianceBlocked = isCompliance && !hasComplianceDoc
            const submitBlocked = !hasSubmittedInvoice || photoRequired || complianceBlocked
            const blockReasons: string[] = []
            if (!hasSubmittedInvoice) blockReasons.push('Submit an invoice for this job.')
            if (photoRequired) blockReasons.push('Upload a completion photo showing the fix.')
            if (complianceBlocked) blockReasons.push('Upload the updated compliance certificate PDF.')
            return (
              <div style={{ padding: '12px 16px 20px', borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
                {isPendingOrDone ? (
                  <div style={{ padding: '13px 0', textAlign: 'center' }}>
                    <p style={{ fontSize: 14, color: '#8899aa' }}>
                      {s === 'pending_review' ? 'Awaiting admin review' : 'Job complete'}
                    </p>
                  </div>
                ) : canStart ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8899aa', margin: 0 }}>
                      Scheduled visit
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ ...LABEL, marginBottom: 4 }}>Date</label>
                        <input
                          type="date"
                          value={acceptDate}
                          min={new Date().toISOString().slice(0, 10)}
                          onChange={e => setAcceptDate(e.target.value)}
                          style={{ ...INPUT, fontSize: 13, colorScheme: 'dark' }}
                        />
                      </div>
                      <div>
                        <label style={{ ...LABEL, marginBottom: 4 }}>Time</label>
                        <input
                          type="time"
                          value={acceptTime}
                          onChange={e => setAcceptTime(e.target.value)}
                          style={{ ...INPUT, fontSize: 13, colorScheme: 'dark' }}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={jobActionSaving || !acceptDate || !acceptTime}
                      onClick={() => {
                        const scheduledAt = new Date(`${acceptDate}T${acceptTime}:00`).toISOString()
                        handleJobStatusUpdate('in_progress', scheduledAt)
                      }}
                      style={{
                        width: '100%', padding: '14px 0',
                        background: (!acceptDate || !acceptTime) ? 'rgba(96,165,250,0.1)' : jobActionSaving ? 'rgba(96,165,250,0.3)' : 'linear-gradient(135deg, #1a4a7a, #0f3460)',
                        border: `1px solid ${(!acceptDate || !acceptTime) ? 'rgba(96,165,250,0.2)' : 'rgba(96,165,250,0.4)'}`,
                        borderRadius: 10, color: (!acceptDate || !acceptTime) ? 'rgba(232,237,245,0.35)' : '#e8edf5',
                        fontSize: 15, fontWeight: 500,
                        cursor: (jobActionSaving || !acceptDate || !acceptTime) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {jobActionSaving ? 'Accepting…' : 'Accept Job'}
                    </button>
                  </div>
                ) : canComplete ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {blockReasons.map(r => (
                      <p key={r} style={{ fontSize: 12, color: '#fbbf24', textAlign: 'center', margin: 0 }}>• {r}</p>
                    ))}
                    <button
                      type="button"
                      disabled={jobActionSaving || submitBlocked}
                      onClick={() => handleJobStatusUpdate('pending_review')}
                      style={{
                        width: '100%', padding: '14px 0', marginTop: blockReasons.length > 0 ? 4 : 0,
                        background: submitBlocked ? 'rgba(74,222,128,0.08)' : jobActionSaving ? 'rgba(74,222,128,0.2)' : 'linear-gradient(135deg, #064e3b, #065f46)',
                        border: `1px solid ${submitBlocked ? 'rgba(74,222,128,0.15)' : 'rgba(74,222,128,0.3)'}`,
                        borderRadius: 10, color: submitBlocked ? 'rgba(232,237,245,0.35)' : '#e8edf5', fontSize: 15, fontWeight: 500,
                        cursor: (jobActionSaving || submitBlocked) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {jobActionSaving ? 'Updating…' : 'Submit for Review'}
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })()}
        </div>
      )}

      {/* Invoice create form — full-screen overlay */}
      {showInvoiceForm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: '#0a192f', display: 'flex', flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 16px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          }}>
            <button
              type="button"
              onClick={() => { setShowInvoiceForm(false); resetInvoiceForm() }}
              style={{
                background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8,
                width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#8899aa', flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
              </svg>
            </button>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e8edf5', fontFamily: 'Georgia, serif', margin: 0 }}>
              New Invoice
            </h2>
          </div>

          {/* Scrollable body */}
          {(() => {
            const invLinkedJob = jobs.find(j => j.id === invJobId)
            const isComplianceJob = invLinkedJob?.request_type === 'compliance'
            const { subtotal: formSubtotal, vatAmount: formVatAmount, total: formTotal } = getInvoiceTotals()
            return (
              <>
                <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>

                  {/* Linked Job */}
                  <div>
                    <label style={LABEL}>Linked Job (optional)</label>
                    <select value={invJobId} onChange={e => setInvJobId(e.target.value)} style={{ ...INPUT, appearance: 'none' }}>
                      <option value="">— General invoice —</option>
                      {jobs.map(j => (
                        <option key={j.id} value={j.id}>
                          {j.title ?? 'Untitled job'}{j.property_address ? ` — ${j.property_address}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Invoice mode toggle */}
                  <div>
                    <label style={LABEL}>Invoice type</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[
                        { label: 'Create invoice', value: false },
                        { label: 'Upload my invoice', value: true },
                      ].map(opt => (
                        <button key={String(opt.value)} type="button" onClick={() => setInvUploadMode(opt.value)}
                          style={{
                            padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 500,
                            border: `1px solid ${invUploadMode === opt.value ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.08)'}`,
                            background: invUploadMode === opt.value ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.04)',
                            color: invUploadMode === opt.value ? '#60a5fa' : '#8899aa', cursor: 'pointer',
                          }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label style={LABEL}>Description (optional)</label>
                    <input type="text" placeholder="e.g. Plumbing repair — bathroom" value={invDescription}
                      onChange={e => setInvDescription(e.target.value)} style={INPUT} />
                  </div>

                  {invUploadMode ? (
                    <>
                      {/* PDF upload */}
                      <div>
                        <label style={LABEL}>Invoice PDF</label>
                        <input ref={invPdfRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }}
                          onChange={e => { setInvPdfFile(e.target.files?.[0] ?? null); e.target.value = '' }} />
                        {invPdfFile ? (
                          <div style={{ ...CARD, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="#4ade80"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
                            <p style={{ fontSize: 13, color: '#4ade80', flex: 1 }} className="truncate">{invPdfFile.name}</p>
                            <button type="button" onClick={() => setInvPdfFile(null)}
                              style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}>×</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => invPdfRef.current?.click()}
                            style={{ width: '100%', padding: '22px 0', borderRadius: 10, border: '1px dashed rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.05)', color: '#60a5fa', fontSize: 13, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                            Tap to upload your invoice PDF
                          </button>
                        )}
                      </div>

                      {/* Manual total */}
                      <div>
                        <label style={LABEL}>Invoice total (£)</label>
                        <input type="number" min="0" step="0.01" placeholder="0.00" value={invManualTotal}
                          onChange={e => setInvManualTotal(e.target.value)} style={INPUT} />
                        <p style={{ fontSize: 11, color: '#8899aa', marginTop: 6 }}>Enter the total amount shown on your invoice.</p>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Line items */}
                      <div>
                        <label style={LABEL}>Line Items</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {invLineItems.map((li, idx) => (
                            <div key={li.key} style={{ ...CARD, padding: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <p style={{ fontSize: 11, color: '#8899aa', letterSpacing: '0.08em' }}>ITEM {idx + 1}</p>
                                {invLineItems.length > 1 && (
                                  <button type="button" onClick={() => removeLineItem(li.key)}
                                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px' }}>×</button>
                                )}
                              </div>
                              <input type="text" placeholder="Description" value={li.description}
                                onChange={e => updateLineItem(li.key, 'description', e.target.value)} style={{ ...INPUT, marginBottom: 8 }} />
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                <div>
                                  <p style={{ fontSize: 10, color: '#8899aa', marginBottom: 4 }}>Qty</p>
                                  <input type="number" min="0" step="0.5" value={li.quantity}
                                    onChange={e => updateLineItem(li.key, 'quantity', e.target.value)} style={INPUT} />
                                </div>
                                <div>
                                  <p style={{ fontSize: 10, color: '#8899aa', marginBottom: 4 }}>Unit Price (£)</p>
                                  <input type="number" min="0" step="0.01" placeholder="0.00" value={li.unit_price}
                                    onChange={e => updateLineItem(li.key, 'unit_price', e.target.value)} style={INPUT} />
                                </div>
                                <div>
                                  <p style={{ fontSize: 10, color: '#8899aa', marginBottom: 4 }}>Amount</p>
                                  <div style={{ ...INPUT, display: 'flex', alignItems: 'center', color: '#4ade80', pointerEvents: 'none' }}>
                                    £{calcLineItemAmount(li).toFixed(2)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <button type="button" onClick={() => setInvLineItems(prev => [...prev, newLineItem()])}
                          style={{ marginTop: 10, width: '100%', padding: '10px', background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 8, color: '#8899aa', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                          Add Item
                        </button>
                      </div>

                      {/* VAT toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <p style={{ fontSize: 14, color: '#e8edf5' }}>Include VAT (20%)</p>
                          <p style={{ fontSize: 12, color: '#8899aa', marginTop: 2 }}>UK standard rate</p>
                        </div>
                        <button type="button" onClick={() => setInvVat(v => !v)}
                          style={{ width: 48, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer', background: invVat ? '#60a5fa' : 'rgba(255,255,255,0.12)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                          <span style={{ position: 'absolute', top: 4, left: invVat ? 24 : 4, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                        </button>
                      </div>

                      {/* Totals */}
                      <div style={{ ...CARD, padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <p style={{ fontSize: 13, color: '#8899aa' }}>Subtotal</p>
                          <p style={{ fontSize: 13, color: '#e8edf5' }}>£{formSubtotal.toFixed(2)}</p>
                        </div>
                        {invVat && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <p style={{ fontSize: 13, color: '#8899aa' }}>VAT (20%)</p>
                            <p style={{ fontSize: 13, color: '#e8edf5' }}>£{formVatAmount.toFixed(2)}</p>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                          <p style={{ fontSize: 15, fontWeight: 600, color: '#e8edf5' }}>Total</p>
                          <p style={{ fontSize: 15, fontWeight: 600, color: '#4ade80', fontFamily: 'Georgia, serif' }}>£{formTotal.toFixed(2)}</p>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Compliance certificate — required when linked job is compliance */}
                  {isComplianceJob && (
                    <div>
                      <label style={{ ...LABEL, color: invCertUploaded || invCertFile ? '#4ade80' : '#fbbf24' }}>
                        Compliance Certificate {invCertUploaded || invCertFile ? '(uploaded ✓)' : '(required)'}
                      </label>
                      <input ref={invCertRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }}
                        onChange={e => { setInvCertFile(e.target.files?.[0] ?? null); setInvCertUploaded(false); e.target.value = '' }} />
                      {invCertFile ? (
                        <div style={{ ...CARD, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, borderColor: 'rgba(74,222,128,0.3)' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="#4ade80"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
                          <p style={{ fontSize: 13, color: '#4ade80', flex: 1 }} className="truncate">{invCertFile.name}</p>
                          <button type="button" onClick={() => setInvCertFile(null)}
                            style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}>×</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => invCertRef.current?.click()}
                          style={{ width: '100%', padding: '22px 0', borderRadius: 10, border: `1px dashed ${invCertUploaded ? 'rgba(74,222,128,0.4)' : 'rgba(251,191,36,0.4)'}`, background: invCertUploaded ? 'rgba(74,222,128,0.06)' : 'rgba(251,191,36,0.06)', color: invCertUploaded ? '#4ade80' : '#fbbf24', fontSize: 13, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                          {invCertUploaded ? 'Replace certificate PDF' : 'Upload compliance certificate (e.g. Gas Safety)'}
                        </button>
                      )}
                      {!invCertFile && !invCertUploaded && (
                        <p style={{ fontSize: 11, color: '#8899aa', marginTop: 6, lineHeight: 1.5 }}>
                          This is a compliance job. The updated certificate must be submitted with your invoice.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  <div>
                    <label style={LABEL}>Notes (optional)</label>
                    <textarea placeholder="Payment terms, bank details, or any additional notes…" value={invNotes}
                      onChange={e => setInvNotes(e.target.value)} rows={3}
                      style={{ ...INPUT, resize: 'vertical', lineHeight: 1.5 }} />
                  </div>

                </div>

                {/* Footer actions */}
                <div style={{ padding: '10px 16px 20px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                  {invError && <p style={{ fontSize: 12, color: '#f87171', textAlign: 'center', margin: 0 }}>{invError}</p>}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="button" disabled={invSaving} onClick={() => handleSubmitInvoice(true)}
                      style={{ flex: 1, padding: '13px 0', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#8899aa', fontSize: 14, fontWeight: 500, cursor: invSaving ? 'not-allowed' : 'pointer' }}>
                      Save Draft
                    </button>
                    <button type="button" disabled={invSaving} onClick={() => handleSubmitInvoice(false)}
                      style={{ flex: 2, padding: '13px 0', background: invSaving ? 'rgba(96,165,250,0.3)' : 'linear-gradient(135deg, #1a4a7a, #0f3460)', border: '1px solid rgba(96,165,250,0.4)', borderRadius: 10, color: '#e8edf5', fontSize: 14, fontWeight: 500, cursor: invSaving ? 'not-allowed' : 'pointer' }}>
                      {invSaving ? 'Saving…' : 'Submit Invoice'}
                    </button>
                  </div>
                </div>
              </>
            )
          })()}
        </div>
      )}

    </DashShell>
  )
}

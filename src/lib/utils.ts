export function gbp(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: decimals,
  }).format(value)
}

export function percent(value: number, decimals = 1): string {
  return value.toFixed(decimals) + '%'
}

export function shortDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function timeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'Just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days === 1) return 'Yesterday'
  return shortDate(d)
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning,'
  if (h < 17) return 'Good afternoon,'
  return 'Good evening,'
}

export function initials(name: string | null | undefined, email: string): string {
  const src = name ?? email
  const parts = src.split(' ')
  return parts
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase()
}

export function docTypeLabel(type: string): string {
  const map: Record<string, string> = {
    gas_cert: 'Gas Safety',
    epc: 'EPC',
    eicr: 'EICR',
    tenancy_agreement: 'Tenancy Agreement',
    inventory: 'Inventory',
    other: 'Other',
  }
  return map[type] ?? type
}

export function priorityColor(priority: string): string {
  const map: Record<string, string> = {
    low: '#065F46',
    medium: '#D97706',
    high: '#DC2626',
    emergency: '#7C3AED',
  }
  return map[priority] ?? '#57534E'
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    open: 'Open',
    assigned: 'Assigned',
    in_progress: 'In Progress',
    pending_review: 'Pending Review',
    resolved: 'Resolved',
    closed: 'Closed',
  }
  return map[status] ?? status
}

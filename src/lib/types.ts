export type UserRole = 'admin' | 'landlord' | 'tenant' | 'contractor' | 'master admin' | 'staff'

export interface AppUser {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  status: string | null
}

export type PaymentStatus = 'paid' | 'due' | 'overdue'

export interface Property {
  id: string
  landlord_id: string
  address: string
  postcode: string | null
  bedrooms: number | null
  property_type: string | null
  is_active: boolean
  monthly_rent: number | null
  created_at: string
}

export interface Tenancy {
  id: string
  property_id: string
  tenant_id: string
  start_date: string
  end_date: string | null
  monthly_rent: number
  deposit: number
  status: string
  tenant?: AppUser
  property?: Property
}

export interface Payment {
  id: string
  tenancy_id: string
  amount: number
  due_date: string
  paid_date: string | null
  status: PaymentStatus
  tenancy?: Tenancy
}

export type DocumentType = 'gas_cert' | 'epc' | 'eicr' | 'tenancy_agreement' | 'inventory' | 'other'

export interface PropertyDocument {
  id: string
  property_id: string
  type: DocumentType
  label: string
  url: string
  expiry_date: string | null
  uploaded_at: string
}


export interface MaintenanceRequest {
  id: string
  property_id: string | null
  tenancy_id: string | null
  tenant_id: string | null
  assigned_contractor_id: string | null
  title: string | null
  description: string | null
  priority: string | null
  status: string | null
  created_at: string | null
  updated_at: string | null
  cost: number | null
  resolved_at: string | null
}

export interface PortfolioStats {
  totalProperties: number
  occupiedProperties: number
  vacantProperties: number
  totalMonthlyRent: number
  paidThisMonth: number
  overdueCount: number
  openMaintenance: number
  expiringCerts: number
}

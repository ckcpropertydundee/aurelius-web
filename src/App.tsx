import { AuthProvider, useAuth } from './contexts/AuthContext'
import AuthPage from './pages/AuthPage'
import LandlordDashboard from './pages/LandlordDashboard'
import TenantDashboard from './pages/TenantDashboard'
import ContractorDashboard from './pages/ContractorDashboard'
import AdminDashboard from './pages/AdminDashboard'

function Splash() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-white gap-2">
      <span className="text-[42px] tracking-[16px] text-[#0D1B3E]" style={{ fontFamily: 'Georgia, serif' }}>
        AURELIUS
      </span>
      <div className="w-40 h-px bg-[#0D1B3E]/20" />
      <span className="text-[10px] tracking-[4px] text-[#4A5878] font-light">PROPERTY MANAGEMENT</span>
    </div>
  )
}

function RoleRouter() {
  const { user, isLoading } = useAuth()

  if (isLoading) return <Splash />
  if (!user) return <AuthPage />

  switch (user.role) {
    case 'admin':
    case 'master admin':
      return <AdminDashboard />
    case 'landlord':
      return <LandlordDashboard />
    case 'contractor':
      return <ContractorDashboard />
    case 'tenant':
    default:
      return <TenantDashboard />
  }
}

export default function App() {
  return (
    <AuthProvider>
      <RoleRouter />
    </AuthProvider>
  )
}

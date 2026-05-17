import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

type Role = 'landlord' | 'tenant' | 'contractor'

function friendlyError(err: unknown): string {
  const msg = (err as Error).message?.toLowerCase() ?? ''
  if (msg.includes('invalid') || msg.includes('credentials')) return 'Incorrect email or password.'
  if (msg.includes('already registered') || msg.includes('user already exists'))
    return 'An account with this email already exists.'
  if (msg.includes('password') && msg.includes('characters')) return 'Password must be at least 6 characters.'
  if (msg.includes('network') || msg.includes('connection')) return 'Network error. Check your connection.'
  return (err as Error).message ?? 'An error occurred.'
}

export default function AuthPage() {
  const { signIn, signUp, sendPasswordReset } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>('landlord')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim() || (!password && mode !== 'reset')) {
      setError('Please fill in all fields.')
      return
    }
    setIsLoading(true)
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password)
      } else if (mode === 'signup') {
        if (!fullName.trim()) { setError('Please enter your name.'); setIsLoading(false); return }
        await signUp(email.trim(), password, fullName.trim(), role)
      } else {
        await sendPasswordReset(email.trim())
        setResetSent(true)
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[#F7F6F3]">
      {/* Wordmark */}
      <div className="flex flex-col items-center justify-center flex-shrink-0 pt-16 pb-10">
        <span
          className="text-[36px] tracking-[12px] text-[#0D1B3E]"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          AURELIUS
        </span>
        <div className="mt-2 w-36 h-px bg-[#0D1B3E]/20" />
        <span className="mt-2 text-[9px] tracking-[4px] text-[#4A5878] font-light uppercase">
          Property Management
        </span>
      </div>

      {/* Card */}
      <div className="mx-4 bg-white rounded-3xl shadow-lg p-6 flex flex-col gap-5">
        {/* Mode toggle (sign in / create) */}
        {mode !== 'reset' && (
          <div className="flex bg-[#F7F6F3] rounded-xl overflow-hidden border border-[#E8E6E1]">
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null) }}
                className={`flex-1 py-2 text-[13px] transition-all rounded-[9px] m-[3px] ${
                  mode === m
                    ? 'bg-white text-[#0D1B3E] font-normal shadow-sm border border-[#E8E6E1]'
                    : 'text-[#4A5878] font-light'
                }`}
              >
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>
        )}

        {mode === 'reset' && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setMode('signin'); setError(null); setResetSent(false) }}
              className="text-[13px] text-[#57534E]">← Back</button>
            <span className="text-[14px] font-semibold text-[#0D1B3E] flex-1 text-center pr-8">Reset Password</span>
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-4">
          {mode === 'signup' && (
            <AuthField label="Full name" type="text" value={fullName} onChange={setFullName} placeholder="e.g. Chris Cruickshank" />
          )}

          {mode === 'reset' && resetSent ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="text-4xl">✉️</div>
              <p className="text-[15px] font-semibold text-[#0D1B3E]">Check your email</p>
              <p className="text-[13px] text-[#78716C] text-center">A reset link has been sent to {email}</p>
            </div>
          ) : (
            <>
              <AuthField label="Email address" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
              {mode !== 'reset' && (
                <AuthField label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
              )}

              {mode === 'signup' && (
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] tracking-[2px] text-[#C8C5BE] font-light">I AM A...</span>
                  <div className="flex gap-2">
                    {(['landlord', 'tenant', 'contractor'] as Role[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        className={`flex-1 py-3 text-[13px] rounded-xl transition-all ${
                          role === r
                            ? 'bg-[#0D1B3E] text-white font-medium'
                            : 'bg-[#F7F6F3] text-[#4A5878] font-light border border-[#E8E6E1]'
                        }`}
                      >
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-[#DC2626] text-[13px] font-light">
                  <span>⚠</span>
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-[50px] bg-[#0D1B3E] text-white rounded-xl text-[14px] tracking-wide font-normal flex items-center justify-center disabled:opacity-60 active:opacity-80 transition-opacity"
              >
                {isLoading ? (
                  <span className="animate-spin text-xl">⟳</span>
                ) : mode === 'signup' ? 'Create Account' : mode === 'reset' ? 'Send Reset Link' : 'Sign In'}
              </button>

              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => { setMode('reset'); setError(null) }}
                  className="text-[12px] font-light text-[#4A5878] text-center tracking-wide"
                >
                  Forgot password?
                </button>
              )}
            </>
          )}
        </form>
      </div>

      <div className="pb-8" />
    </div>
  )
}

function AuthField({
  label, type, value, onChange, placeholder,
}: {
  label: string; type: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] tracking-[2px] text-[#C8C5BE] font-light uppercase">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoCapitalize="off"
        autoCorrect="off"
        className="w-full px-3.5 py-3 bg-[#F7F6F3] rounded-xl text-[15px] font-light text-[#1C1917] border border-[#E8E6E1] focus:outline-none focus:border-[#0D1B3E] focus:ring-0 placeholder-[#C8C5BE] transition-colors"
      />
    </div>
  )
}

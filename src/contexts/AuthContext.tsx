import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { AppUser } from '../lib/types'

interface AuthContextType {
  user: AppUser | null
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string, role: string) => Promise<void>
  signOut: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  function profileFromSession(session: { user: { id: string; email?: string; user_metadata?: Record<string, string> } }): AppUser | null {
    const meta = session.user.user_metadata ?? {}
    if (!meta.role) return null
    return {
      id: session.user.id,
      email: session.user.email ?? '',
      full_name: meta.full_name ?? null,
      role: meta.role as AppUser['role'],
      status: 'active',
    }
  }

  async function fetchProfile(userId: string): Promise<AppUser | null> {
    const { data } = await supabase
      .from('users')
      .select('id, email, full_name, role, status')
      .eq('id', userId.toLowerCase())
      .limit(1)
      .single()
    return (data as AppUser | null) ?? null
  }

  useEffect(() => {
    let active = true

    // Read session from local storage immediately (no network call)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return
      if (session) {
        const quick = profileFromSession(session)
        if (quick) {
          // Dismiss splash immediately — metadata has everything we need
          setUser(quick)
          setIsLoading(false)
          // Enrich with DB profile in the background
          const full = await fetchProfile(session.user.id)
          if (active && full) setUser(full)
        } else {
          // No role in metadata — must wait for DB
          const full = await fetchProfile(session.user.id)
          if (active && full) setUser(full)
          if (active) setIsLoading(false)
        }
      } else {
        if (active) setIsLoading(false)
      }
    })

    // Only handle explicit auth events after initial load
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!active) return
      if (event === 'SIGNED_IN') {
        if (session) {
          const quick = profileFromSession(session)
          if (quick) setUser(quick)
          const full = await fetchProfile(session.user.id)
          if (active && full) setUser(full)
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setIsLoading(false)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signUp(email: string, password: string, fullName: string, role: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
  }

  async function sendPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) throw error
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signUp, signOut, sendPasswordReset }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

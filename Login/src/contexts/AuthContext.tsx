import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { AppUser } from '../lib/types'

interface AuthContextType {
  user: AppUser | null
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string, role: string, companyName?: string) => Promise<void>
  signOut: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  updateProfile: (fullName: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

const toTitleCase = (s: string) => s.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  async function fetchProfile(userId: string): Promise<AppUser | null> {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, status')
      .eq('id', userId.toLowerCase())
      .limit(1)
      .single()
    if (error) {
      console.error('[AuthContext] fetchProfile failed:', error.code, error.message)
      return null
    }
    const profile = data as AppUser
    if (profile?.status === 'suspended') {
      await supabase.auth.signOut()
      return null
    }
    return profile
  }

  useEffect(() => {
    let active = true

    // Role must always come from the users table — user_metadata is client-writable
    // and cannot be trusted for routing. We always wait for the DB fetch.
    function loadProfile(userId: string) {
      fetchProfile(userId).then((full) => {
        if (!active) return
        if (full) {
          setUser(full)
        } else {
          // No users row or suspended — sign out rather than fall back to metadata
          supabase.auth.signOut()
          setUser(null)
        }
        setIsLoading(false)
      }).catch(() => {
        if (active) setIsLoading(false)
      })
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      if (session) {
        loadProfile(session.user.id)
      } else {
        setIsLoading(false)
      }
    }).catch(() => {
      if (active) setIsLoading(false)
    })

    // IMPORTANT: this callback must NOT be async — Supabase awaits all subscribers
    // before resolving signInWithPassword, so any await here blocks the login button.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'SIGNED_IN') {
        if (session) loadProfile(session.user.id)
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

  async function signUp(email: string, password: string, fullName: string, role: string, companyName?: string) {
    const name = toTitleCase(fullName)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          role,
          ...(companyName?.trim() ? { company_name: toTitleCase(companyName) } : {}),
        },
      },
    })
    if (error) throw error
    supabase.functions.invoke('send-notification-email', {
      body: { event: 'new_user', data: { name, email, role } },
    }).catch(() => {})
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
  }

  async function sendPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) throw error
  }

  async function updateProfile(fullName: string) {
    if (!user) return
    const normalised = toTitleCase(fullName)
    const { error } = await supabase
      .from('users')
      .update({ full_name: normalised })
      .eq('id', user.id)
    if (error) throw error
    setUser({ ...user, full_name: normalised })
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signUp, signOut, sendPasswordReset, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

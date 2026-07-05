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
  updateProfile: (fullName: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

const toTitleCase = (s: string) => s.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

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

    // Enrich profile from DB in the background — never blocks the caller
    function enrichInBackground(userId: string) {
      fetchProfile(userId).then((full) => {
        if (active && full) setUser(full)
        if (active) setIsLoading(false)
      }).catch(() => {
        if (active) setIsLoading(false)
      })
    }

    // Read session from local storage immediately (no network call)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      if (session) {
        const quick = profileFromSession(session)
        if (quick) {
          // Dismiss splash immediately — metadata has everything we need
          setUser(quick)
          setIsLoading(false)
        }
        // Enrich with DB profile (sets isLoading=false if quick was null)
        enrichInBackground(session.user.id)
      } else {
        if (active) setIsLoading(false)
      }
    }).catch(() => {
      if (active) setIsLoading(false)
    })

    // IMPORTANT: this callback must NOT be async — Supabase awaits all subscribers
    // before resolving signInWithPassword, so any await here blocks the login button.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'SIGNED_IN') {
        if (session) {
          const quick = profileFromSession(session)
          if (quick) {
            setUser(quick)
            setIsLoading(false)
          }
          // Fire DB enrichment without blocking the Supabase subscriber
          enrichInBackground(session.user.id)
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
      options: { data: { full_name: toTitleCase(fullName), role } },
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

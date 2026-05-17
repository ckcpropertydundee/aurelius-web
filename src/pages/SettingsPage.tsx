import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { initials } from '../lib/utils'

function IconPerson() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
}
function IconLock() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
}
function IconBell() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
}
function IconShield() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4l5 2.18V11c0 3.5-2.33 6.79-5 7.93-2.67-1.14-5-4.43-5-7.93V7.18L12 5z"/></svg>
}
function IconDoc() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
}
function IconChat() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
}
function IconChevron() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
}

const ACCOUNT_ITEMS = [
  { label: 'Edit Profile',    Icon: IconPerson },
  { label: 'Change Password', Icon: IconLock },
  { label: 'Notifications',   Icon: IconBell },
]

const INFO_ITEMS = [
  { label: 'Privacy Policy',  Icon: IconShield },
  { label: 'Terms of Service',Icon: IconDoc },
  { label: 'Support',         Icon: IconChat },
]

const S = {
  card: { background: '#112240', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 } as React.CSSProperties,
  divider: { height: 1, background: 'rgba(255,255,255,0.07)', margin: '0 16px' } as React.CSSProperties,
  text: { color: '#e8edf5' } as React.CSSProperties,
  muted: { color: '#8899aa' } as React.CSSProperties,
}

import type React from 'react'

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleSignOut() {
    setIsSigningOut(true)
    await signOut()
  }

  return (
    <div className="flex flex-col">
      <div className="px-4 py-5 flex flex-col gap-4">

        {/* Profile card */}
        <div style={{ ...S.card, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            className="flex-shrink-0 rounded-full flex items-center justify-center"
            style={{ width: 52, height: 52, background: 'rgba(255,255,255,0.09)', fontSize: 16, fontWeight: 600, color: '#e8edf5' }}
          >
            {initials(user?.full_name, user?.email ?? '')}
          </div>
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 15, fontWeight: 500, ...S.text }} className="truncate">{user?.full_name ?? 'User'}</p>
            <p style={{ fontSize: 12, ...S.muted }} className="truncate">{user?.email}</p>
            <p style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa', marginTop: 2 }}>
              {user?.role}
            </p>
          </div>
        </div>

        {/* Account */}
        <div style={S.card}>
          {ACCOUNT_ITEMS.map(({ label, Icon }, i) => (
            <div key={label}>
              <button type="button"
                className="w-full flex items-center gap-3 transition-colors"
                style={{ padding: '14px 16px', color: '#e8edf5', background: 'transparent' }}
              >
                <span style={{ color: '#8899aa' }}><Icon /></span>
                <span className="flex-1 text-left" style={{ fontSize: 14 }}>{label}</span>
                <span style={{ color: '#8899aa' }}><IconChevron /></span>
              </button>
              {i < ACCOUNT_ITEMS.length - 1 && <div style={S.divider} />}
            </div>
          ))}
        </div>

        {/* App info */}
        <div style={S.card}>
          {INFO_ITEMS.map(({ label, Icon }, i) => (
            <div key={label}>
              <button type="button"
                className="w-full flex items-center gap-3 transition-colors"
                style={{ padding: '14px 16px', color: '#e8edf5', background: 'transparent' }}
              >
                <span style={{ color: '#8899aa' }}><Icon /></span>
                <span className="flex-1 text-left" style={{ fontSize: 14 }}>{label}</span>
                <span style={{ color: '#8899aa' }}><IconChevron /></span>
              </button>
              {i < INFO_ITEMS.length - 1 && <div style={S.divider} />}
            </div>
          ))}
        </div>

        {/* Sign out */}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          style={{
            width: '100%', padding: '14px', borderRadius: 12,
            fontSize: 14, fontWeight: 600,
            background: 'rgba(158,42,42,0.18)',
            color: '#f87171',
            border: '1px solid rgba(248,113,113,0.15)',
            opacity: isSigningOut ? 0.6 : 1,
          }}
        >
          {isSigningOut ? 'Signing out…' : 'Sign Out'}
        </button>

        <div className="text-center" style={{ paddingBottom: 8 }}>
          <p style={{ fontSize: 10, color: '#8899aa', letterSpacing: '0.06em' }}>Aurelius Property Management</p>
          <p style={{ fontSize: 9, color: '#8899aa', opacity: 0.5, marginTop: 2 }}>Version 1.0.0</p>
        </div>
      </div>
    </div>
  )
}

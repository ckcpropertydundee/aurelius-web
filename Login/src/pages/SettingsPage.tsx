import { useState, useEffect, useRef } from 'react'
import type React from 'react'
import { useAuth } from '../contexts/AuthContext'
import { initials } from '../lib/utils'
import { supabase } from '../lib/supabase'
import EditProfileModal from '../components/EditProfileModal'
import ChangePasswordModal from '../components/ChangePasswordModal'
import PrivacyPolicyModal from '../components/PrivacyPolicyModal'

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
function IconCheck() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
}
function IconMail() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>
}
function IconPhone() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79a15.15 15.15 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C9.61 21 3 14.39 3 6.5a1 1 0 0 1 1-1H8a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z"/></svg>
}

const S = {
  card:    { background: '#112240', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 } as React.CSSProperties,
  divider: { height: 1, background: 'rgba(255,255,255,0.07)', margin: '0 16px' } as React.CSSProperties,
  text:    { color: '#e8edf5' } as React.CSSProperties,
  muted:   { color: '#8899aa' } as React.CSSProperties,
}

// Role-specific notification descriptions
const NOTIF_DESCRIPTIONS: Record<string, string[]> = {
  tenant:       ['Rent receipt confirmations', 'Maintenance status updates', 'Scheduled visit reminders', 'Job resolved notifications'],
  landlord:     ['New maintenance requests', 'Rent payment confirmations', 'Compliance certificate expiry alerts'],
  contractor:   ['New job assignments', 'Invoice approved / rejected', 'Job review requests'],
  admin:        ['Viewing requests', 'Compliance alerts', 'Maintenance pending review', 'Tenant access issues'],
  'master admin': ['Viewing requests', 'Compliance alerts', 'Maintenance pending review', 'Tenant access issues'],
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      style={{
        width: 44, height: 24, borderRadius: 12, flexShrink: 0,
        background: on ? '#1d4ed8' : 'rgba(255,255,255,0.1)',
        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative', transition: 'background 0.2s',
        opacity: disabled ? 0.5 : 1,
      }}
      aria-checked={on}
      role="switch"
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {on && <IconCheck />}
      </span>
    </button>
  )
}

interface NotifPrefs {
  notif_email: boolean
  notif_sms:   boolean
  phone:       string
}

function NotificationDeliverySection({ userId, userRole }: { userId: string; userRole: string }) {
  const [prefs, setPrefs] = useState<NotifPrefs>({ notif_email: true, notif_sms: false, phone: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedLabel, setSavedLabel] = useState<string | null>(null)
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const phoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    supabase.from('users')
      .select('notif_email, notif_sms, phone')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const d = data as { notif_email: boolean; notif_sms: boolean; phone: string | null }
          setPrefs({ notif_email: d.notif_email ?? true, notif_sms: d.notif_sms ?? false, phone: d.phone ?? '' })
          setPhoneInput(d.phone ?? '')
        }
        setLoading(false)
      })
  }, [userId])

  async function savePrefs(patch: Partial<NotifPrefs>) {
    setSaving(true)
    const next = { ...prefs, ...patch }
    setPrefs(next)
    await supabase.from('users').update({
      notif_email: next.notif_email,
      notif_sms:   next.notif_sms,
      phone:       next.phone || null,
    }).eq('id', userId)
    setSaving(false)
    setSavedLabel('Saved')
    setTimeout(() => setSavedLabel(null), 2000)
  }

  function handlePhoneBlur() {
    const cleaned = phoneInput.trim()
    if (!cleaned) {
      savePrefs({ phone: '' })
      return
    }
    // Basic UK/international format check
    const digits = cleaned.replace(/[\s\-().+]/g, '')
    if (digits.length < 7 || digits.length > 15 || !/^\d+$/.test(digits)) {
      setPhoneError('Enter a valid phone number')
      return
    }
    setPhoneError(null)
    savePrefs({ phone: cleaned })
  }

  function handlePhoneChange(val: string) {
    setPhoneInput(val)
    setPhoneError(null)
    // Auto-save debounced
    if (phoneTimer.current) clearTimeout(phoneTimer.current)
    phoneTimer.current = setTimeout(() => {
      const cleaned = val.trim()
      const digits = cleaned.replace(/[\s\-().+]/g, '')
      if (!cleaned || (digits.length >= 7 && digits.length <= 15 && /^\d+$/.test(digits))) {
        setPhoneError(null)
        savePrefs({ phone: cleaned })
      }
    }, 1200)
  }

  const descriptions = NOTIF_DESCRIPTIONS[userRole] ?? NOTIF_DESCRIPTIONS['admin']

  if (loading) {
    return <div style={{ ...S.card, height: 120, opacity: 0.4 }} className="animate-pulse" />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#8899aa' }}><IconBell /></span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e8edf5' }}>Notification Delivery</span>
        </div>
        {saving && <span style={{ fontSize: 11, color: '#8899aa' }}>Saving…</span>}
        {!saving && savedLabel && <span style={{ fontSize: 11, color: '#4ade80' }}>✓ Saved</span>}
      </div>

      {/* What you'll be notified about */}
      <div style={{ ...S.card, padding: '12px 14px' }}>
        <p style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 8 }}>
          You'll be notified about
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {descriptions.map(d => (
            <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#60a5fa', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#c8d4e0' }}>{d}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Channel toggles */}
      <div style={S.card}>
        {/* Email */}
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(96,165,250,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#60a5fa' }}>
            <IconMail />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, color: '#e8edf5', fontWeight: 500 }}>Email</p>
            <p style={{ fontSize: 11, color: '#8899aa', marginTop: 1 }}>Sent to your registered email address</p>
          </div>
          <Toggle on={prefs.notif_email} onChange={(v) => savePrefs({ notif_email: v })} />
        </div>

        <div style={S.divider} />

        {/* SMS */}
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(74,222,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#4ade80' }}>
            <IconPhone />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, color: '#e8edf5', fontWeight: 500 }}>Text message (SMS)</p>
            <p style={{ fontSize: 11, color: '#8899aa', marginTop: 1 }}>Send notifications to your phone</p>
          </div>
          <Toggle on={prefs.notif_sms} onChange={(v) => savePrefs({ notif_sms: v })} />
        </div>

        {/* Phone number input — shown when SMS is on */}
        {prefs.notif_sms && (
          <div style={{ padding: '0 16px 14px' }}>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', marginBottom: 12 }} />
            <label style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa', display: 'block', marginBottom: 6 }}>
              Mobile number
            </label>
            <input
              type="tel"
              value={phoneInput}
              onChange={e => handlePhoneChange(e.target.value)}
              onBlur={handlePhoneBlur}
              placeholder="+44 7700 900000"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${phoneError ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.1)'}`,
                fontSize: 14, color: '#e8edf5', outline: 'none', boxSizing: 'border-box',
              }}
            />
            {phoneError && (
              <p style={{ fontSize: 11, color: '#f87171', marginTop: 5 }}>{phoneError}</p>
            )}
            {!phoneError && prefs.phone && (
              <p style={{ fontSize: 11, color: '#4ade80', marginTop: 5 }}>✓ Number saved</p>
            )}
            {!phoneError && !prefs.phone && (
              <p style={{ fontSize: 11, color: '#fbbf24', marginTop: 5 }}>Enter your number to receive SMS alerts</p>
            )}
          </div>
        )}
      </div>

      {/* Note when both are off */}
      {!prefs.notif_email && !prefs.notif_sms && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
          <p style={{ fontSize: 12, color: '#f87171', lineHeight: 1.5 }}>
            You have disabled all notification channels. You won't receive any alerts. We recommend keeping at least email on.
          </p>
        </div>
      )}
    </div>
  )
}

const INFO_ITEMS = [
  { label: 'Privacy Policy',   Icon: IconShield },
  { label: 'Terms of Service', Icon: IconDoc },
  { label: 'Support',          Icon: IconChat },
]

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const [isSigningOut, setIsSigningOut]   = useState(false)
  const [showEditProfile, setShowEditProfile]       = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [showPrivacyPolicy, setShowPrivacyPolicy]   = useState(false)

  async function handleSignOut() {
    setIsSigningOut(true)
    await signOut()
  }

  return (
    <div className="flex flex-col">
      {showEditProfile    && <EditProfileModal    onClose={() => setShowEditProfile(false)} />}
      {showChangePassword && <ChangePasswordModal  onClose={() => setShowChangePassword(false)} />}
      {showPrivacyPolicy  && <PrivacyPolicyModal   onClose={() => setShowPrivacyPolicy(false)} />}

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

        {/* Account actions */}
        <div style={S.card}>
          {[
            { label: 'Edit Profile',    Icon: IconPerson, action: () => setShowEditProfile(true) },
            { label: 'Change Password', Icon: IconLock,   action: () => setShowChangePassword(true) },
          ].map(({ label, Icon, action }, i, arr) => (
            <div key={label}>
              <button
                type="button"
                className="w-full flex items-center gap-3 transition-colors"
                style={{ padding: '14px 16px', color: '#e8edf5', background: 'transparent' }}
                onClick={action}
              >
                <span style={{ color: '#8899aa' }}><Icon /></span>
                <span className="flex-1 text-left" style={{ fontSize: 14 }}>{label}</span>
                <span style={{ color: '#8899aa' }}><IconChevron /></span>
              </button>
              {i < arr.length - 1 && <div style={S.divider} />}
            </div>
          ))}
        </div>

        {/* Notification delivery — inline, not behind a modal */}
        {user && (
          <NotificationDeliverySection userId={user.id} userRole={user.role} />
        )}

        {/* App info */}
        <div style={S.card}>
          {INFO_ITEMS.map(({ label, Icon }, i) => (
            <div key={label}>
              <button
                type="button"
                className="w-full flex items-center gap-3 transition-colors"
                style={{ padding: '14px 16px', color: '#e8edf5', background: 'transparent' }}
                onClick={label === 'Privacy Policy' ? () => setShowPrivacyPolicy(true) : undefined}
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

import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  onClose: () => void
}

const S = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    padding: '16px',
  },
  modal: {
    background: '#112240',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  label: { fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#8899aa', marginBottom: 6, display: 'block' },
  input: {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: '11px 14px',
    fontSize: 15,
    color: '#e8edf5',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  inputReadOnly: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
}

export default function EditProfileModal({ onClose }: Props) {
  const { user, updateProfile } = useAuth()
  const isLandlordOrContractor = user?.role === 'landlord' || user?.role === 'contractor'

  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    const trimmed = fullName.trim()
    if (!trimmed) return
    setIsSaving(true)
    setError(null)
    try {
      await updateProfile(trimmed)
      setSaved(true)
      setTimeout(onClose, 1000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e8edf5', margin: 0 }}>Edit Profile</h2>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#8899aa', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={S.label}>
              {isLandlordOrContractor ? 'Name / Company Name' : 'Full Name'}
            </label>
            <input
              style={S.input}
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder={isLandlordOrContractor ? 'Your name or company' : 'Enter your full name'}
              autoFocus
            />
          </div>

          <div>
            <label style={S.label}>Email</label>
            <input
              style={{ ...S.input, ...S.inputReadOnly }}
              value={user?.email ?? ''}
              readOnly
              title="Email cannot be changed here"
            />
          </div>

          {error && (
            <p style={{ fontSize: 13, color: '#f87171', margin: 0 }}>{error}</p>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 500,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#8899aa', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !fullName.trim()}
              style={{
                flex: 1, padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                background: saved ? '#16a34a' : '#e8edf5',
                color: '#0d1b2e', cursor: 'pointer',
                opacity: (isSaving || !fullName.trim()) ? 0.5 : 1,
                transition: 'background 0.2s',
              }}
            >
              {saved ? '✓ Saved' : isSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

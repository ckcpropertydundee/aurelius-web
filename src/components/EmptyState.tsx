import type { ReactNode } from 'react'

interface Props {
  icon: ReactNode
  title: string
  subtitle?: string
}

export default function EmptyState({ icon, title, subtitle }: Props) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      padding: '32px 16px',
      background: '#112240',
      borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <span style={{ color: '#8899aa', display: 'flex' }}>{icon}</span>
      <p style={{ fontSize: 14, fontWeight: 500, color: '#8899aa' }}>{title}</p>
      {subtitle && <p style={{ fontSize: 12, color: '#8899aa', opacity: 0.6, textAlign: 'center' }}>{subtitle}</p>}
    </div>
  )
}

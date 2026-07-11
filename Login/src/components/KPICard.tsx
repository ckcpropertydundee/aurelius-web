import type React from 'react'

interface Props {
  title: string
  value: string
  subtitle: string
  accent?: string
  onClick?: () => void
}

export default function KPICard({ title, value, subtitle, accent = '#e8edf5', onClick }: Props) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      style={{
        background: '#112240',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        padding: '14px 16px',
        width: '100%',
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
        transition: onClick ? 'opacity 0.15s' : undefined,
      }}
      {...(onClick ? { onMouseOver: (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.opacity = '0.75'), onMouseOut: (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.style.opacity = '1') } : {})}
    >
      <p style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 6 }}>
        {title}
      </p>
      <p style={{ fontSize: 26, fontWeight: 300, lineHeight: 1, color: accent, marginBottom: 4, fontFamily: 'Georgia, serif' }}>{value}</p>
      <p style={{ fontSize: 11, color: '#8899aa' }}>{subtitle}</p>
    </Tag>
  )
}

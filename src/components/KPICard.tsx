interface Props {
  title: string
  value: string
  subtitle: string
  accent?: string
}

export default function KPICard({ title, value, subtitle, accent = '#e8edf5' }: Props) {
  return (
    <div style={{
      background: '#112240',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12,
      padding: '14px 16px',
    }}>
      <p style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', marginBottom: 6 }}>
        {title}
      </p>
      <p style={{ fontSize: 26, fontWeight: 300, lineHeight: 1, color: accent, marginBottom: 4, fontFamily: 'Georgia, serif' }}>{value}</p>
      <p style={{ fontSize: 11, color: '#8899aa' }}>{subtitle}</p>
    </div>
  )
}

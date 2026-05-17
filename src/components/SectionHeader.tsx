interface Props {
  title: string
  action?: { label: string; onClick: () => void }
}

export default function SectionHeader({ title, action }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <span style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa', fontWeight: 500 }}>
        {title}
      </span>
      {action && (
        <button type="button" onClick={action.onClick}
          style={{ fontSize: 11, letterSpacing: '0.08em', color: '#8899aa', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '3px 10px' }}>
          {action.label}
        </button>
      )}
    </div>
  )
}

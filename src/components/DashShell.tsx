import { type ReactNode } from 'react'
import BottomNav, { type NavTab } from './BottomNav'

interface Props {
  tabs: NavTab[]
  active: string
  onChange: (id: string) => void
  metrics?: { label: string; value: string }[]
  children: ReactNode
  userInitials?: string
}

export default function DashShell({ tabs, active, onChange, metrics, children, userInitials }: Props) {
  const activeTab = tabs.find((t) => t.id === active)

  return (
    <div className="min-h-dvh flex" style={{ background: '#0d1b2e' }}>

      {/* ── Sidebar (desktop) ── */}
      <aside
        className="hidden md:flex flex-col fixed top-0 left-0 bottom-0 w-[220px] z-40"
        style={{ background: '#091422', borderRight: '1px solid rgba(255,255,255,0.07)' }}
      >
        {/* Wordmark + user */}
        <div className="px-6 py-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <span
            className="text-[13px] tracking-[0.25em]"
            style={{ fontFamily: 'Georgia, serif', color: 'rgba(232,237,245,0.8)' }}
          >
            AURELIUS
          </span>
          {userInitials && (
            <div className="mt-4 flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium"
                style={{ background: 'rgba(255,255,255,0.09)', color: '#e8edf5' }}
              >
                {userInitials}
              </div>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-5 px-4 flex flex-col gap-0.5">
          {tabs.map((tab) => {
            const isActive = tab.id === active
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChange(tab.id)}
                className="flex items-center gap-3 px-3 py-2.5 rounded w-full text-left transition-colors"
                style={{
                  background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: isActive ? '#e8edf5' : '#8899aa',
                }}
              >
                <span
                  className="rounded-full flex-shrink-0"
                  style={{
                    width: 4, height: 4,
                    background: isActive ? '#e8edf5' : '#8899aa',
                  }}
                />
                <span style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  {tab.label}
                </span>
              </button>
            )
          })}
        </nav>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col md:ml-[220px] min-w-0">

        {/* Mobile header */}
        <header
          className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3"
          style={{ background: '#091422', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <span
            className="text-[12px] tracking-[0.22em]"
            style={{ fontFamily: 'Georgia, serif', color: 'rgba(232,237,245,0.75)' }}
          >
            AURELIUS
          </span>
          {activeTab && (
            <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899aa' }}>
              {activeTab.label}
            </span>
          )}
          {userInitials && (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium"
              style={{ background: 'rgba(255,255,255,0.09)', color: '#e8edf5' }}
            >
              {userInitials}
            </div>
          )}
        </header>

        {/* Metrics strip */}
        {metrics && metrics.length > 0 && (
          <div
            className="flex items-center overflow-x-auto"
            style={{ background: '#091422', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}
          >
            {metrics.map(({ label, value }, i) => (
              <div key={label} className="flex items-center flex-shrink-0">
                {i > 0 && (
                  <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
                )}
                <div className="flex items-center gap-2 px-4 py-2.5">
                  <span style={{ fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899aa' }}>
                    {label}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: '#e8edf5' }}>{value}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Scrollable content */}
        <main className="flex-1 overflow-auto pb-20 md:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav tabs={tabs} active={active} onChange={onChange} />
    </div>
  )
}

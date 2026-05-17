import { type ReactNode } from 'react'

export interface NavTab {
  id: string
  label: string
  icon: ReactNode
  activeIcon?: ReactNode
}

interface Props {
  tabs: NavTab[]
  active: string
  onChange: (id: string) => void
}

export default function BottomNav({ tabs, active, onChange }: Props) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex safe-bottom z-50 md:hidden"
      style={{ background: '#091422', borderTop: '1px solid rgba(255,255,255,0.07)' }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className="flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors"
            style={{ color: isActive ? '#e8edf5' : '#8899aa' }}
          >
            <span className="flex items-center justify-center w-6 h-6">
              {isActive && tab.activeIcon ? tab.activeIcon : tab.icon}
            </span>
            <span style={{ fontSize: 10, letterSpacing: '0.06em', fontWeight: isActive ? 500 : 400 }}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

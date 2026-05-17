import { type ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  right?: ReactNode
  avatarInitials?: string
}

export default function PageHeader({ title, subtitle, right, avatarInitials }: Props) {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-[#E7E5E4] px-4 py-3 flex items-center gap-3">
      {avatarInitials && (
        <div className="w-8 h-8 rounded-full bg-[#1C1917] flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xs font-semibold">{avatarInitials}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[17px] font-bold text-[#1C1917] leading-tight truncate">{title}</p>
        {subtitle && <p className="text-[11px] text-[#A8A29E]">{subtitle}</p>}
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </header>
  )
}

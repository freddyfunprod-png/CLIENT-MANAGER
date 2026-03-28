import {
  LayoutDashboard, Search, BookMarked, Users,
  CalendarDays, CheckSquare, Target, MessageSquare,
} from 'lucide-react'
import type { Page } from '../types'

interface NavItem {
  id: Page
  label: string
  icon: React.ReactNode
  badge?: string
}

const NAV: NavItem[] = [
  { id: 'dashboard',   label: 'Dashboard',    icon: <LayoutDashboard size={18} /> },
  { id: 'scraper',     label: 'Scraper Maps', icon: <Search size={18} /> },
  { id: 'leads',       label: 'Leads',        icon: <BookMarked size={18} /> },
  { id: 'clients',     label: 'Clientes',     icon: <Users size={18} /> },
  { id: 'daily-plan',  label: 'Plan Diario',  icon: <CalendarDays size={18} /> },
  { id: 'checklists',  label: 'Checklists',   icon: <CheckSquare size={18} /> },
  { id: 'goals',       label: 'Metas',        icon: <Target size={18} /> },
  { id: 'ai-messages', label: 'Mensajes IA',  icon: <MessageSquare size={18} /> },
]

interface Props {
  current: Page
  onNavigate: (p: Page) => void
}

export default function Sidebar({ current, onNavigate }: Props) {
  return (
    <aside
      className="flex flex-col w-56 shrink-0 border-r"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <span className="text-xl">🎯</span>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Unified CRM</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Maps + Clientes</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((item) => {
          const active = current === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? '#fff' : 'var(--text-secondary)',
              }}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
            >
              {item.icon}
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
        Freddy Fun Producer
      </div>
    </aside>
  )
}

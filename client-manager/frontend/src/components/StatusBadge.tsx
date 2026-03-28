import type { ClientStatus } from '../types'

const STATUS_CONFIG: Record<ClientStatus, { label: string; color: string; bg: string }> = {
  prospect:    { label: 'Prospecto',   color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
  contacted:   { label: 'Contactado',  color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
  proposal:    { label: 'Propuesta',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  negotiating: { label: 'Negociando',  color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  closed:      { label: 'Cerrado ✓',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  lost:        { label: 'Perdido',     color: '#ef4444', bg: 'rgba(239,68,68,0.12)'   },
}

interface Props {
  status: ClientStatus
  size?: 'sm' | 'md'
}

export default function StatusBadge({ status, size = 'md' }: Props) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.prospect
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
  return (
    <span
      className={`${pad} rounded-full font-medium whitespace-nowrap`}
      style={{ color: cfg.color, background: cfg.bg }}
    >
      {cfg.label}
    </span>
  )
}

export { STATUS_CONFIG }

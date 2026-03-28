import { useEffect, useState } from 'react'
import { BookMarked, Users, TrendingUp, CheckCircle, CalendarDays, Target } from 'lucide-react'
import { getStats } from '../api'
import type { Page, Stats } from '../types'
import StatusBadge from '../components/StatusBadge'
import type { ClientStatus } from '../types'

interface Props {
  onNavigate: (p: Page) => void
}

export default function Dashboard({ onNavigate }: Props) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getStats().then(s => { setStats(s); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const today = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })

  if (loading) return (
    <div className="flex items-center justify-center h-64" style={{ color: 'var(--text-secondary)' }}>
      Cargando...
    </div>
  )

  const planPct = stats?.plan_today
    ? Math.round((stats.plan_done! / stats.plan_today) * 100)
    : 0

  const CARDS = [
    {
      icon: <BookMarked size={20} />,
      label: 'Leads scrapeados',
      value: stats?.total_leads ?? 0,
      sub: `+${stats?.new_leads_today ?? 0} hoy`,
      color: '#6366f1',
      page: 'leads' as Page,
    },
    {
      icon: <Users size={20} />,
      label: 'Clientes en CRM',
      value: stats?.total_clients ?? 0,
      sub: `${stats?.contacted ?? 0} contactados`,
      color: '#60a5fa',
      page: 'clients' as Page,
    },
    {
      icon: <TrendingUp size={20} />,
      label: 'Cierres totales',
      value: stats?.closed ?? 0,
      sub: 'Negocios cerrados',
      color: '#22c55e',
      page: 'clients' as Page,
    },
    {
      icon: <CalendarDays size={20} />,
      label: 'Plan de hoy',
      value: `${stats?.plan_done ?? 0}/${stats?.plan_today ?? 0}`,
      sub: `${planPct}% completado`,
      color: '#f59e0b',
      page: 'daily-plan' as Page,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold capitalize" style={{ color: 'var(--text-primary)' }}>
          📊 Dashboard
        </h1>
        <p className="text-sm mt-1 capitalize" style={{ color: 'var(--text-secondary)' }}>{today}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {CARDS.map(card => (
          <button
            key={card.label}
            onClick={() => onNavigate(card.page)}
            className="rounded-xl p-5 border text-left transition-all hover:scale-[1.02]"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
              style={{ background: `${card.color}22`, color: card.color }}
            >
              {card.icon}
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{card.value}</p>
            <p className="text-sm font-medium mt-1" style={{ color: 'var(--text-primary)' }}>{card.label}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{card.sub}</p>
          </button>
        ))}
      </div>

      {/* Status breakdown */}
      {stats?.status_breakdown && stats.status_breakdown.length > 0 && (
        <div
          className="rounded-xl border p-5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Pipeline de clientes</h2>
          <div className="space-y-2">
            {stats.status_breakdown.map(({ status, cnt }) => {
              const pct = stats.total_clients ? Math.round((cnt / stats.total_clients) * 100) : 0
              return (
                <div key={status} className="flex items-center gap-3">
                  <div className="w-28 shrink-0">
                    <StatusBadge status={status as ClientStatus} size="sm" />
                  </div>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: 'var(--accent)' }}
                    />
                  </div>
                  <span className="text-xs w-14 text-right" style={{ color: 'var(--text-secondary)' }}>
                    {cnt} ({pct}%)
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div
        className="rounded-xl border p-5"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Acciones rápidas</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: '🔍 Buscar leads',    page: 'scraper'     as Page },
            { label: '👥 Ver clientes',    page: 'clients'     as Page },
            { label: '📅 Plan de hoy',     page: 'daily-plan'  as Page },
            { label: '🎯 Actualizar metas',page: 'goals'       as Page },
            { label: '💬 Generar mensaje', page: 'ai-messages' as Page },
            { label: '✓ Ver checklists',   page: 'checklists'  as Page },
          ].map(a => (
            <button
              key={a.label}
              onClick={() => onNavigate(a.page)}
              className="px-4 py-3 rounded-lg text-sm border transition-all hover:border-indigo-500"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', background: 'var(--bg-base)' }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

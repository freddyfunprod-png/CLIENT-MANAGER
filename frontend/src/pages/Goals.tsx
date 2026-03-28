import { useEffect, useState } from 'react'
import { TrendingUp, Users, MessageSquare, CheckCircle } from 'lucide-react'
import { getGoals, upsertGoals, getTodayStats } from '../api'
import type { Goals as GoalsType } from '../types'
import { format } from 'date-fns'

const TODAY = format(new Date(), 'yyyy-MM-dd')

interface TodayStats {
  new_clients_today: number
  plan_done_today: number
  proposals_today: number
  closures_today: number
}

export default function Goals() {
  const [date, setDate] = useState(TODAY)
  const [goals, setGoals] = useState<GoalsType>({
    date, prospects: 10, contacted: 5, proposals: 3, closures: 1,
  })
  const [todayStats, setTodayStats] = useState<TodayStats>({
    new_clients_today: 0,
    plan_done_today: 0,
    proposals_today: 0,
    closures_today: 0,
  })
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    getGoals(date).then(g => setGoals(g))
  }, [date])

  useEffect(() => {
    getTodayStats().then(s => setTodayStats(s))
  }, [])

  const update = async (field: keyof GoalsType, value: number) => {
    const newGoals = { ...goals, [field]: value }
    setGoals(newGoals)
    setSaving(field as string)
    try {
      const saved = await upsertGoals(date, { [field]: value })
      setGoals(saved)
    } finally {
      setSaving(null)
    }
  }

  const isToday = date === TODAY

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('es', {
    weekday: 'long', day: 'numeric', month: 'long'
  })

  const METRICS = [
    {
      key: 'prospects' as const,
      label: 'Prospectos nuevos',
      icon: <Users size={18} />,
      color: '#6366f1',
      actual: todayStats.new_clients_today,
      actualLabel: 'clientes creados hoy',
    },
    {
      key: 'contacted' as const,
      label: 'Contactados',
      icon: <MessageSquare size={18} />,
      color: '#60a5fa',
      actual: todayStats.plan_done_today,
      actualLabel: 'plan completado hoy',
    },
    {
      key: 'proposals' as const,
      label: 'Propuestas enviadas',
      icon: <TrendingUp size={18} />,
      color: '#f59e0b',
      actual: todayStats.proposals_today,
      actualLabel: 'en propuesta/negociando',
    },
    {
      key: 'closures' as const,
      label: 'Cierres',
      icon: <CheckCircle size={18} />,
      color: '#22c55e',
      actual: todayStats.closures_today,
      actualLabel: 'cerrados hoy',
    },
  ]

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>🎯 Metas Diarias</h1>
          <p className="text-sm mt-1 capitalize" style={{ color: 'var(--text-secondary)' }}>{dateLabel}</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm border outline-none"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {METRICS.map(m => {
          const target = goals[m.key] ?? 0
          const actual = isToday ? m.actual : 0
          const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0
          const reached = target > 0 && actual >= target

          return (
            <div
              key={m.key}
              className="rounded-xl border p-5"
              style={{ background: 'var(--bg-card)', borderColor: reached ? `${m.color}40` : 'var(--border)' }}
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ background: `${m.color}22`, color: m.color }}
                >
                  {m.icon}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.label}</p>
                  {isToday ? (
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Real: <span style={{ color: m.color, fontWeight: 600 }}>{actual}</span>
                      {' '}/ Meta: {target}
                    </p>
                  ) : (
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Meta: {target}</p>
                  )}
                </div>
                {reached && isToday && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: `${m.color}22`, color: m.color }}>
                    ✓ Meta!
                  </span>
                )}
              </div>

              {/* Progress bar (today only) */}
              {isToday && target > 0 && (
                <div className="mb-4">
                  <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                    <span>{m.actualLabel}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: m.color }}
                    />
                  </div>
                </div>
              )}

              {/* Meta counter (+/-) */}
              <div>
                <p className="text-xs mb-2 text-center" style={{ color: 'var(--text-secondary)' }}>
                  Meta del día
                </p>
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => update(m.key, Math.max(0, target - 1))}
                    className="w-10 h-10 rounded-xl text-xl font-bold border transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', background: 'var(--bg-base)' }}
                  >
                    −
                  </button>
                  <span className="text-3xl font-bold w-12 text-center"
                    style={{ color: saving === m.key ? 'var(--text-secondary)' : m.color }}>
                    {target}
                  </span>
                  <button
                    onClick={() => update(m.key, target + 1)}
                    className="w-10 h-10 rounded-xl text-xl font-bold border transition-colors text-white"
                    style={{ background: m.color }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

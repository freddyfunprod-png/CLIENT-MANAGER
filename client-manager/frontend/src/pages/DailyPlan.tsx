import { useEffect, useState } from 'react'
import { Plus, Trash2, CheckCircle, Circle, Phone, MessageSquare } from 'lucide-react'
import { getPlan, addToPlan, removeFromPlan, togglePlanComplete, getClients } from '../api'
import type { Client, DailyPlanEntry } from '../types'
import StatusBadge from '../components/StatusBadge'
import { format } from 'date-fns'

export default function DailyPlan() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [plan, setPlan] = useState<DailyPlanEntry[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadPlan = async () => {
    setLoading(true)
    try {
      const { plan: data } = await getPlan(date)
      setPlan(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadPlan() }, [date])
  useEffect(() => { getClients().then(r => setClients(r.clients)) }, [])

  const clientsNotInPlan = clients.filter(
    c => !plan.find(p => p.client_id === c.id)
  )

  const handleAdd = async (client_id: number) => {
    await addToPlan(client_id, date)
    await loadPlan()
    setShowAdd(false)
  }

  const handleRemove = async (plan_id: number) => {
    await removeFromPlan(plan_id)
    setPlan(prev => prev.filter(p => p.id !== plan_id))
  }

  const handleToggle = async (entry: DailyPlanEntry) => {
    const newVal = !entry.completed
    await togglePlanComplete(entry.id, newVal)
    setPlan(prev => prev.map(p => p.id === entry.id ? { ...p, completed: newVal ? 1 : 0 } : p))
  }

  const done = plan.filter(p => p.completed).length

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('es', {
    weekday: 'long', day: 'numeric', month: 'long'
  })

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>📅 Plan Diario</h1>
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

      {/* Progress */}
      <div
        className="rounded-xl border p-4"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Progreso: {done}/{plan.length}
          </span>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {plan.length ? Math.round((done / plan.length) * 100) : 0}%
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${plan.length ? (done / plan.length) * 100 : 0}%`,
              background: 'var(--success)',
            }}
          />
        </div>
      </div>

      {/* Plan list */}
      <div className="space-y-2">
        {loading ? (
          <p className="text-center py-10" style={{ color: 'var(--text-secondary)' }}>Cargando...</p>
        ) : plan.length === 0 ? (
          <div
            className="rounded-xl border p-8 text-center"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <p className="text-3xl mb-2">📋</p>
            <p>No hay clientes en el plan de hoy.</p>
          </div>
        ) : (
          plan.map(entry => (
            <div
              key={entry.id}
              className="flex items-center gap-4 rounded-xl border p-4 transition-all"
              style={{
                background: entry.completed ? 'rgba(34,197,94,0.05)' : 'var(--bg-card)',
                borderColor: entry.completed ? 'rgba(34,197,94,0.3)' : 'var(--border)',
              }}
            >
              <button onClick={() => handleToggle(entry)} style={{ color: entry.completed ? 'var(--success)' : 'var(--text-secondary)' }}>
                {entry.completed ? <CheckCircle size={22} /> : <Circle size={22} />}
              </button>

              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="font-medium"
                    style={{
                      color: entry.completed ? 'var(--text-secondary)' : 'var(--text-primary)',
                      textDecoration: entry.completed ? 'line-through' : 'none',
                    }}
                  >
                    {entry.name}
                  </span>
                  <StatusBadge status={entry.status} size="sm" />
                </div>
                {entry.category && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{entry.category} · {entry.city}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {entry.phone && (
                  <a
                    href={`https://wa.me/${entry.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-lg"
                    title="WhatsApp"
                    style={{ color: '#22c55e', background: 'rgba(34,197,94,0.1)' }}
                  >
                    <Phone size={15} />
                  </a>
                )}
                <button
                  onClick={() => handleRemove(entry.id)}
                  className="p-2 rounded-lg"
                  title="Quitar del plan"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add client */}
      {showAdd ? (
        <div
          className="rounded-xl border p-4 space-y-2"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Agregar cliente al plan</p>
          {clientsNotInPlan.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Todos los clientes ya están en el plan.</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {clientsNotInPlan.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleAdd(c.id)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="font-medium">{c.name}</span>
                  <StatusBadge status={c.status} size="sm" />
                  {c.city && <span className="text-xs ml-auto" style={{ color: 'var(--text-secondary)' }}>{c.city}</span>}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowAdd(false)}
            className="text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <Plus size={16} /> Agregar cliente al plan
        </button>
      )}
    </div>
  )
}

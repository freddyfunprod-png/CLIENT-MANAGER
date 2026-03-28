import { useEffect, useState } from 'react'
import { CheckCircle, Circle } from 'lucide-react'
import { getClients, getChecklist, toggleChecklist } from '../api'
import type { Client, ChecklistItem } from '../types'
import StatusBadge from '../components/StatusBadge'

interface Props {
  preselectedClientId?: number | null
}

const TEAM = [
  { name: 'Diego',  initial: 'D', color: '#3B82F6' },
  { name: 'Freddy', initial: 'F', color: '#8B5CF6' },
  { name: 'João',   initial: 'J', color: '#10B981' },
]

function PersonBadge({ name }: { name: string }) {
  const p = TEAM.find(t => t.name === name)
  if (!p) return null
  return (
    <span
      title={p.name}
      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
      style={{ background: p.color + '22', color: p.color, border: `1.5px solid ${p.color}` }}
    >
      {p.initial}
    </span>
  )
}

export default function Checklists({ preselectedClientId }: Props) {
  const [clients, setClients]     = useState<Client[]>([])
  const [selected, setSelected]   = useState<number | null>(preselectedClientId ?? null)
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [picking, setPicking]     = useState<number | null>(null)  // step id awaiting person pick

  useEffect(() => {
    getClients().then(r => setClients(r.clients))
  }, [])

  useEffect(() => {
    if (preselectedClientId) setSelected(preselectedClientId)
  }, [preselectedClientId])

  useEffect(() => {
    if (selected !== null) {
      setLoading(true)
      setPicking(null)
      getChecklist(selected)
        .then(r => setChecklist(r.checklist))
        .finally(() => setLoading(false))
    }
  }, [selected])

  // Click on a completed step → uncheck immediately
  // Click on an incomplete step → open person picker
  const handleToggle = async (item: ChecklistItem) => {
    if (item.completed) {
      setPicking(null)
      await toggleChecklist(item.client_id, item.id, false)
      setChecklist(prev => prev.map(c =>
        c.id === item.id ? { ...c, completed: 0, completed_by: null } : c
      ))
    } else {
      setPicking(prev => prev === item.id ? null : item.id)
    }
  }

  // Person picked → check step and save who did it
  const handlePick = async (item: ChecklistItem, person: string) => {
    setPicking(null)
    await toggleChecklist(item.client_id, item.id, true, person)
    setChecklist(prev => prev.map(c =>
      c.id === item.id ? { ...c, completed: 1, completed_by: person } : c
    ))
  }

  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  )
  const selectedClient = clients.find(c => c.id === selected)
  const doneCount = checklist.filter(c => c.completed).length
  const progress  = checklist.length ? Math.round((doneCount / checklist.length) * 100) : 0

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>✓ Checklists</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Seguimiento paso a paso por cliente
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Client list */}
        <div className="rounded-xl border overflow-hidden"
             style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <input
              className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              placeholder="Buscar cliente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: '520px' }}>
            {filtered.map(c => {
              const isSelected = c.id === selected
              return (
                <button
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  className="w-full text-left px-4 py-3 border-b transition-colors"
                  style={{
                    borderColor: 'var(--border)',
                    background: isSelected ? 'rgba(99,102,241,0.1)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                  }}
                >
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <StatusBadge status={c.status} size="sm" />
                    {c.city && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{c.city}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Checklist panel */}
        <div className="md:col-span-2">
          {!selected ? (
            <div className="rounded-xl border p-10 text-center h-full flex items-center justify-center"
                 style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              <div>
                <p className="text-3xl mb-2">←</p>
                <p>Selecciona un cliente para ver su checklist</p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden"
                 style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>

              {/* Header */}
              <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {selectedClient?.name}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {selectedClient?.category} · {selectedClient?.city}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold"
                       style={{ color: progress === 100 ? 'var(--success)' : 'var(--accent)' }}>
                      {progress}%
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {doneCount}/{checklist.length} pasos
                    </p>
                  </div>
                </div>
                <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
                  <div className="h-full rounded-full transition-all"
                       style={{ width: `${progress}%`, background: progress === 100 ? 'var(--success)' : 'var(--accent)' }} />
                </div>
              </div>

              {/* Steps */}
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {loading ? (
                  <div className="p-8 text-center" style={{ color: 'var(--text-secondary)' }}>Cargando...</div>
                ) : (
                  checklist.map((item, idx) => (
                    <div key={item.id}>
                      {/* Step row */}
                      <button
                        onClick={() => handleToggle(item)}
                        className="w-full flex items-center gap-4 px-5 py-4 transition-colors text-left"
                        style={{ background: item.completed ? 'rgba(34,197,94,0.04)' : 'transparent' }}
                      >
                        {/* Check icon */}
                        <div style={{ color: item.completed ? 'var(--success)' : 'var(--text-secondary)' }}>
                          {item.completed ? <CheckCircle size={20} /> : <Circle size={20} />}
                        </div>

                        {/* Step name */}
                        <div className="flex-1">
                          <p className="text-sm"
                             style={{
                               color: item.completed ? 'var(--text-secondary)' : 'var(--text-primary)',
                               textDecoration: item.completed ? 'line-through' : 'none',
                             }}>
                            {item.step}
                          </p>
                        </div>

                        {/* Person badge (when completed) */}
                        {item.completed && item.completed_by && (
                          <PersonBadge name={item.completed_by} />
                        )}

                        {/* Step number */}
                        <span
                          className="text-xs w-6 h-6 rounded-full flex items-center justify-center font-medium"
                          style={{
                            background: item.completed ? 'rgba(34,197,94,0.15)' : 'var(--bg-base)',
                            color: item.completed ? 'var(--success)' : 'var(--text-secondary)',
                          }}
                        >
                          {idx + 1}
                        </span>
                      </button>

                      {/* Inline person picker (shown when this step is being picked) */}
                      {picking === item.id && (
                        <div
                          className="flex items-center gap-2 px-5 pb-3"
                          style={{ background: 'rgba(99,102,241,0.04)' }}
                        >
                          <span className="text-xs mr-1" style={{ color: 'var(--text-secondary)' }}>
                            ¿Quién lo hizo?
                          </span>
                          {TEAM.map(p => (
                            <button
                              key={p.name}
                              onClick={() => handlePick(item, p.name)}
                              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all"
                              style={{
                                background: p.color + '18',
                                color: p.color,
                                border: `1.5px solid ${p.color}44`,
                              }}
                            >
                              <span
                                className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold"
                                style={{ background: p.color, color: '#fff' }}
                              >
                                {p.initial}
                              </span>
                              {p.name}
                            </button>
                          ))}
                          <button
                            onClick={() => setPicking(null)}
                            className="ml-auto text-xs px-2 py-0.5 rounded"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

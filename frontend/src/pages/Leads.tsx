import { useEffect, useRef, useState } from 'react'
import { Star, Phone, MapPin, UserPlus, RefreshCw, ExternalLink, Instagram, Users, MessageCircle, StopCircle } from 'lucide-react'
import { getLeads, convertLeads, waBulkSend, waStop, waDailyCount, getTemplates } from '../api'
import type { Lead, Page } from '../types'

interface Props {
  onNavigate: (p: Page) => void
}

interface WaLog { t: string; msg: string }

export default function Leads({ onNavigate }: Props) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState<'all' | 'pending' | 'converted'>('all')
  const [converting, setConverting] = useState(false)
  const [search, setSearch] = useState('')

  // WhatsApp bulk send state
  const [showWaModal, setShowWaModal] = useState(false)
  const [waMessage, setWaMessage] = useState('')
  const [waSending, setWaSending] = useState(false)
  const [waLogs, setWaLogs] = useState<WaLog[]>([])
  const [waProgress, setWaProgress] = useState(0)
  const [waTotal, setWaTotal] = useState(0)
  const [waDone, setWaDone] = useState(false)
  const [waError, setWaError] = useState('')
  const [waCurrentName, setWaCurrentName] = useState('')
  const [waDailyInfo, setWaDailyInfo] = useState<{ sent_today: number; max_daily: number; remaining: number } | null>(null)
  const [waTemplates, setWaTemplates] = useState<{ id: number; name: string; body: string }[]>([])
  const [waSelectedTpl, setWaSelectedTpl] = useState('')
  const [waUseAI, setWaUseAI] = useState(false)
  const waEsRef = useRef<EventSource | null>(null)
  const waLogsRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      const { leads: data } = await getLeads()
      setLeads(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Auto-scroll WA logs
  useEffect(() => {
    if (waLogsRef.current) waLogsRef.current.scrollTop = waLogsRef.current.scrollHeight
  }, [waLogs])

  const openWaModal = async () => {
    setWaLogs([])
    setWaProgress(0)
    setWaTotal(0)
    setWaDone(false)
    setWaError('')
    setShowWaModal(true)
    try { const info = await waDailyCount(); setWaDailyInfo(info) } catch {}
    try { const r = await getTemplates(); setWaTemplates(r.templates) } catch {}
  }

  const startWaSse = () => {
    if (waEsRef.current) waEsRef.current.close()
    const es = new EventSource('/api/whatsapp/status')
    waEsRef.current = es
    es.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.new_logs?.length) setWaLogs(prev => [...prev, ...data.new_logs])
      setWaProgress(data.progress ?? 0)
      setWaTotal(data.total ?? 0)
      setWaError(data.error ?? '')
      setWaCurrentName(data.current_name ?? '')
      if (data.done) {
        setWaSending(false)
        setWaDone(true)
        es.close()
        waEsRef.current = null
      }
    }
    es.onerror = () => { es.close(); waEsRef.current = null }
  }

  const handleWaSend = async () => {
    if (!waMessage.trim()) { setWaError('Escribe un mensaje'); return }
    const pendingIds = [...selected].filter(id => {
      const lead = leads.find(l => l.id === id)
      return lead && !lead.converted
    })
    if (!pendingIds.length) { setWaError('No hay leads pendientes seleccionados'); return }
    setWaError('')
    setWaSending(true)
    setWaDone(false)
    setWaLogs([])
    const selectedTpl = waTemplates.find(t => t.id === Number(waSelectedTpl))
    try {
      await waBulkSend(pendingIds, waMessage, waUseAI, selectedTpl?.body || waMessage)
      startWaSse()
    } catch (e: any) {
      setWaError(e.message)
      setWaSending(false)
    }
  }

  const handleWaStop = async () => {
    await waStop()
  }

  const filtered = leads.filter(l => {
    if (filter === 'pending'   && l.converted) return false
    if (filter === 'converted' && !l.converted) return false
    if (search && !l.name?.toLowerCase().includes(search.toLowerCase()) &&
        !l.city?.toLowerCase().includes(search.toLowerCase()) &&
        !l.category?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAllPending = () => {
    const pendingIds = filtered.filter(l => !l.converted).map(l => l.id)
    setSelected(new Set(pendingIds))
  }

  const handleConvert = async () => {
    if (!selected.size) return
    setConverting(true)
    try {
      const res = await convertLeads([...selected])
      alert(`✅ ${res.created} cliente(s) agregados al CRM`)
      setSelected(new Set())
      await load()
      if (res.created > 0) onNavigate('clients')
    } catch (e: any) {
      alert('Error: ' + e.message)
    } finally {
      setConverting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            📋 Leads de Google Maps
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {leads.length} leads totales · {leads.filter(l => !l.converted).length} pendientes
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 rounded-lg border transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <RefreshCw size={16} />
          </button>
          {selected.size > 0 && (
            <>
              <button
                onClick={openWaModal}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: '#22c55e' }}
              >
                <MessageCircle size={16} />
                Enviar WhatsApp ({selected.size})
              </button>
              <button
                onClick={handleConvert}
                disabled={converting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                <UserPlus size={16} />
                {converting ? 'Agregando...' : `Al CRM`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* WhatsApp Bulk Send Modal */}
      {showWaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-xl border w-full max-w-lg space-y-4 p-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                📱 Enviar WhatsApp a {selected.size} leads
              </h2>
              {!waSending && (
                <button onClick={() => setShowWaModal(false)} style={{ color: 'var(--text-secondary)' }}>✕</button>
              )}
            </div>

            {waDailyInfo && (
              <div className="text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--bg-base)', color: 'var(--text-secondary)' }}>
                Enviados hoy: {waDailyInfo.sent_today}/{waDailyInfo.max_daily} · Disponibles: {waDailyInfo.remaining}
              </div>
            )}

            {!waSending && !waDone && (
              <>
                {waTemplates.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      Usar template
                    </label>
                    <select
                      className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                      style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      value={waSelectedTpl}
                      onChange={e => {
                        setWaSelectedTpl(e.target.value)
                        const tpl = waTemplates.find(t => t.id === Number(e.target.value))
                        if (tpl) setWaMessage(tpl.body)
                      }}
                    >
                      <option value="">— Elegir template —</option>
                      {waTemplates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {/* AI toggle */}
                <label className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer select-none" style={{ background: waUseAI ? 'rgba(99,102,241,0.15)' : 'var(--bg-base)', border: `1px solid ${waUseAI ? 'var(--accent)' : 'var(--border)'}` }}>
                  <input type="checkbox" checked={waUseAI} onChange={e => setWaUseAI(e.target.checked)} className="w-4 h-4 accent-indigo-500" />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>✨ Personalizar con IA para cada lead</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Gemini escribe un mensaje único por negocio usando sus datos reales</p>
                  </div>
                </label>

                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    {waUseAI ? 'Template base (guía de tono para la IA)' : <>Mensaje — <span style={{ color: 'var(--accent)' }}>{'{client_name}'}</span> se reemplaza por el nombre real</>}
                  </label>
                  <textarea
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                    style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    rows={5}
                    placeholder="Olá {nome}! Vi que vocês têm um negócio em {cidade}..."
                    value={waMessage}
                    onChange={e => setWaMessage(e.target.value)}
                  />
                </div>
                {waError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{waError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={handleWaSend}
                    disabled={!waMessage.trim()}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: '#22c55e' }}
                  >
                    Iniciar envío (delay 30-90s entre mensajes)
                  </button>
                  <button
                    onClick={() => setShowWaModal(false)}
                    className="px-4 py-2.5 rounded-lg text-sm border"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}

            {(waSending || waDone) && (
              <div className="space-y-3">
                {/* Progress */}
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {waDone ? 'Completado' : `Enviando ${waProgress}/${waTotal}...`}
                    {waCurrentName ? ` → ${waCurrentName}` : ''}
                  </span>
                  {waSending && (
                    <button onClick={handleWaStop} className="flex items-center gap-1 text-xs px-2 py-1 rounded" style={{ color: 'var(--danger)', border: '1px solid var(--danger)' }}>
                      <StopCircle size={12} /> Detener
                    </button>
                  )}
                </div>
                {waTotal > 0 && (
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((waProgress/waTotal)*100)}%`, background: '#22c55e' }} />
                  </div>
                )}
                {/* Logs */}
                <div
                  ref={waLogsRef}
                  className="rounded-lg p-3 font-mono text-xs space-y-0.5 overflow-y-auto"
                  style={{ background: 'var(--bg-base)', maxHeight: '180px' }}
                >
                  {waLogs.map((l, i) => (
                    <div key={i} style={{ color: 'var(--text-secondary)' }}>
                      <span style={{ color: '#475569', marginRight: 6 }}>[{l.t}]</span>{l.msg}
                    </div>
                  ))}
                </div>
                {waError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{waError}</p>}
                {waDone && (
                  <button
                    onClick={() => setShowWaModal(false)}
                    className="w-full py-2 rounded-lg text-sm font-medium"
                    style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                  >
                    Cerrar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div
        className="flex items-center gap-3 p-3 rounded-xl border"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex gap-1">
          {(['all', 'pending', 'converted'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: filter === f ? 'var(--accent)' : 'transparent',
                color: filter === f ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {f === 'all' ? 'Todos' : f === 'pending' ? 'Pendientes' : 'Convertidos'}
            </button>
          ))}
        </div>
        <input
          className="flex-1 px-3 py-1.5 rounded-lg text-sm border outline-none"
          style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          placeholder="Buscar por nombre, ciudad, categoría..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {filter !== 'converted' && (
          <button
            onClick={selectAllPending}
            className="px-3 py-1.5 rounded-lg text-xs border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            Seleccionar todos
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
          <p className="text-4xl mb-3">📭</p>
          <p>Sin leads todavía. Usa el Scraper para buscar negocios.</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-card)', borderBottom: `1px solid var(--border)` }}>
                <th className="w-10 px-3 py-3" />
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Negocio</th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Ciudad</th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Teléfono</th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Rating / Seguidores</th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Estado</th>
                <th className="text-center px-4 py-3 font-medium" style={{ color: 'var(--text-secondary)' }}>Links</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead, i) => {
                const isSelected = selected.has(lead.id)
                return (
                  <tr
                    key={lead.id}
                    onClick={() => !lead.converted && toggleSelect(lead.id)}
                    className="transition-colors border-b"
                    style={{
                      borderColor: 'var(--border)',
                      background: isSelected ? 'rgba(99,102,241,0.08)' : i % 2 === 0 ? 'var(--bg-base)' : 'var(--bg-card)',
                      cursor: lead.converted ? 'default' : 'pointer',
                    }}
                  >
                    <td className="px-3 py-3 text-center">
                      {!lead.converted && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(lead.id)}
                          onClick={e => e.stopPropagation()}
                          className="rounded"
                          style={{ accentColor: 'var(--accent)' }}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{lead.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{lead.category}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <MapPin size={12} />
                        {lead.city}, {lead.country}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {lead.phone ? (
                        <a
                          href={`https://wa.me/${lead.phone?.replace(/\D/g,'')}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1 text-xs"
                          style={{ color: '#22c55e' }}
                        >
                          <Phone size={12} /> {lead.phone}
                        </a>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lead.followers != null ? (
                        <div className="flex items-center gap-1 text-xs" style={{ color: '#E1306C' }}>
                          <Users size={12} />
                          {lead.followers >= 1000 ? `${(lead.followers/1000).toFixed(1)}K` : lead.followers} seg.
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs" style={{ color: '#f59e0b' }}>
                          <Star size={12} fill="#f59e0b" />
                          {lead.rating ?? '—'}
                          <span style={{ color: 'var(--text-secondary)' }}>({lead.num_reviews})</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lead.converted ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
                          En CRM ✓
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: 'rgba(148,163,184,0.1)', color: '#94a3b8' }}>
                          Pendiente
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {lead.phone && (
                          <a
                            href={`https://wa.me/${lead.phone.replace(/\D/g,'')}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="inline-flex items-center justify-center p-1.5 rounded transition-colors"
                            style={{ color: '#22c55e' }}
                            title="WhatsApp"
                          >
                            <Phone size={14} />
                          </a>
                        )}
                        {lead.instagram && (
                          <a
                            href={`https://instagram.com/${lead.instagram.replace('@','')}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="inline-flex items-center justify-center p-1.5 rounded transition-colors"
                            style={{ color: '#E1306C' }}
                            title={lead.instagram}
                          >
                            <Instagram size={14} />
                          </a>
                        )}
                        {lead.link_googlemaps && (
                          <a
                            href={lead.link_googlemaps}
                            target="_blank"
                            rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="inline-flex items-center justify-center p-1.5 rounded transition-colors"
                            style={{ color: 'var(--text-secondary)' }}
                            title="Google Maps"
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                        {!lead.phone && !lead.instagram && !lead.link_googlemaps && (
                          <span style={{ color: 'var(--text-secondary)' }}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

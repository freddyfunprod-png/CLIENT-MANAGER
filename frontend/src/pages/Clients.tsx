import { useEffect, useRef, useState } from 'react'
import { Plus, Pencil, Trash2, Phone, CheckSquare, ExternalLink, Search, StickyNote, X, Share2, Copy, Check, Download, Globe, Settings, Send, MapPin, Instagram, CalendarPlus, MessageCircle, StopCircle } from 'lucide-react'
import { getClients, deleteClient, updateClient, getVendors, createVendor, updateVendor, deleteVendor, getCategories, scheduleFollowup, waBulkSend, waStop, waDailyCount, getTemplates, markContacted } from '../api'
import type { Vendor } from '../api'
import type { Client, ClientStatus } from '../types'
import StatusBadge from '../components/StatusBadge'
import ClientForm from '../components/ClientForm'
import ImportClientModal from '../components/ImportClientModal'

interface Props {
  onOpenChecklist: (id: number) => void
}

const ALL_STATUSES: ClientStatus[] = ['prospect', 'contacted', 'proposal', 'negotiating', 'closed', 'lost']

const PRESET_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899']

// Color row based on checklist progress (0 = sin tocar → verde = completo)
const getRowBgFn = (c: Client): string => {
  const total = c.checklist_total || 0
  const done  = c.checklist_done  || 0
  if (total === 0 || done === 0) return ''
  const pct = done / total
  if (pct >= 1.0) return 'rgba(34,197,94,0.10)'    // verde  — completo ✓
  if (pct >= 0.6) return 'rgba(99,102,241,0.10)'   // violeta — casi listo
  if (pct >= 0.3) return 'rgba(245,158,11,0.09)'   // ámbar  — en progreso
  return 'rgba(96,165,250,0.07)'                    // azul   — recién empezado
}

export default function Clients({ onOpenChecklist }: Props) {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'all'>('all')
  const [showForm, setShowForm] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)

  // Quick notes modal
  const [notesClient, setNotesClient] = useState<Client | null>(null)
  const [notesText, setNotesText] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)

  // Export modal
  const [exportClient, setExportClient] = useState<Client | null>(null)
  const [copied, setCopied] = useState(false)

  // Import modal
  const [showImport, setShowImport] = useState(false)

  // Google Calendar
  const [calClient, setCalClient] = useState<Client | null>(null)
  const [calDate, setCalDate] = useState('')
  const [calNote, setCalNote] = useState('')
  const [calSaving, setCalSaving] = useState(false)
  const [calResult, setCalResult] = useState<{ event_url: string; message: string; method: string } | null>(null)

  // Vendors (dynamic team)
  const [team, setTeam] = useState<Vendor[]>([])
  const [showTeamModal, setShowTeamModal] = useState(false)
  const [newVendorName, setNewVendorName] = useState('')
  const [newVendorColor, setNewVendorColor] = useState(PRESET_COLORS[0])
  const [newVendorWa, setNewVendorWa] = useState('')
  const [editingVendorWa, setEditingVendorWa] = useState<{ [id: number]: string }>({})

  // Client selection + dispatch
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showDispatch, setShowDispatch] = useState(false)
  const [dispatchTempWa, setDispatchTempWa] = useState('')
  const [dispatchVendorId, setDispatchVendorId] = useState<number | null>(null)
  const [dispatchSent, setDispatchSent] = useState(false)

  // WhatsApp bulk send
  interface WaLog { t: string; msg: string }
  const [showWaModal, setShowWaModal] = useState(false)
  const [waMessage, setWaMessage] = useState('')
  const [waTemplates, setWaTemplates] = useState<{ id: number; name: string; body: string }[]>([])
  const [waSelectedTpl, setWaSelectedTpl] = useState('')
  const [waUseAI, setWaUseAI] = useState(false)
  const [waSending, setWaSending] = useState(false)
  const [waLogs, setWaLogs] = useState<WaLog[]>([])
  const [waProgress, setWaProgress] = useState(0)
  const [waTotal, setWaTotal] = useState(0)
  const [waDone, setWaDone] = useState(false)
  const [waError, setWaError] = useState('')
  const [waCurrentName, setWaCurrentName] = useState('')
  const [waDailyInfo, setWaDailyInfo] = useState<{ sent_today: number; max_daily: number; remaining: number } | null>(null)
  const waEsRef = useRef<EventSource | null>(null)
  const waLogsRef = useRef<HTMLDivElement>(null)

  // Responsable filter + inline assign picker
  const [assignFilter, setAssignFilter] = useState<string | 'all'>('all')
  const [assigningId, setAssigningId] = useState<number | null>(null)

  // Country filter
  const [countryFilter, setCountryFilter] = useState<string>('all')

  // Category/rubro filter
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [allCategoryLabels, setAllCategoryLabels] = useState<string[]>([])

  // Inline location editor
  const [editingLocId, setEditingLocId] = useState<number | null>(null)
  const [locCity, setLocCity] = useState('')
  const [locCountry, setLocCountry] = useState('')

  const openLocEdit = (c: Client) => {
    setEditingLocId(c.id)
    setLocCity(c.city ?? '')
    setLocCountry(c.country ?? '')
  }

  const saveLocation = async (clientId: number) => {
    const updated = await updateClient(clientId, {
      city:    locCity.trim()    || null,
      country: locCountry.trim() || null,
    } as any)
    setClients(prev => prev.map(x => x.id === clientId ? { ...x, city: updated.city, country: updated.country } : x))
    setEditingLocId(null)
  }

  const buildExportText = (c: Client) => {
    const lines = [
      `📋 FICHA PARA DISEÑO WEB`,
      `━━━━━━━━━━━━━━━━━━━━━━━`,
      `🏢 Negocio:     ${c.name}`,
      c.category      ? `🏷️  Rubro:       ${c.category}`          : null,
      c.city          ? `📍 Ciudad:      ${[c.city, c.country].filter(Boolean).join(', ')}` : null,
      ``,
      `📱 Teléfono:    ${c.phone || '—'}`,
      c.instagram     ? `📸 Instagram:   ${c.instagram}`           : null,
      c.link_googlemaps ? `📍 Google Maps: ${c.link_googlemaps}`   : null,
      c.website       ? `🌐 Web actual:  ${c.website}`             : null,
      c.landing_url   ? `🚀 Landing:     ${c.landing_url}`         : null,
      c.notes         ? `\n📝 Notas:\n${c.notes}`                  : null,
    ]
    return lines.filter(Boolean).join('\n')
  }

  const handleCopyExport = async (c: Client) => {
    try {
      await navigator.clipboard.writeText(buildExportText(c))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const loadVendors = async () => {
    const { vendors } = await getVendors()
    setTeam(vendors)
  }

  const load = async () => {
    setLoading(true)
    try {
      const { clients: data } = await getClients()
      setClients(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    loadVendors()
    getCategories().then(r => {
      setAllCategoryLabels(r.categories.map((c: any) => c.label))
    })
  }, [])

  const countries  = [...new Set(clients.map(c => c.country).filter(Boolean))].sort() as string[]
  // Merge categories from clients + all scraper categories
  const clientCats = new Set(clients.map(c => c.category).filter(Boolean) as string[])
  const categories = [...new Set([...clientCats, ...allCategoryLabels])].sort()
  const teamMap = Object.fromEntries(team.map(t => [t.name, t]))

  const filtered = clients.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (assignFilter !== 'all' && c.assigned_to !== assignFilter) return false
    if (countryFilter !== 'all' && c.country !== countryFilter) return false
    if (categoryFilter !== 'all' && c.category !== categoryFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        c.name.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q) ||
        c.category?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
      )
    }
    return true
  })

  const handleDelete = async (c: Client) => {
    if (!confirm(`¿Eliminar a "${c.name}"?`)) return
    await deleteClient(c.id)
    setClients(prev => prev.filter(x => x.id !== c.id))
  }

  const handleSave = (saved: Client) => {
    setClients(prev => {
      const idx = prev.findIndex(x => x.id === saved.id)
      return idx >= 0 ? prev.map(x => x.id === saved.id ? saved : x) : [saved, ...prev]
    })
    setShowForm(false)
    setEditClient(null)
  }

  const openNotes = (c: Client) => {
    setNotesClient(c)
    setNotesText(c.notes ?? '')
  }

  const handleSaveNotes = async () => {
    if (!notesClient) return
    setNotesSaving(true)
    try {
      const updated = await updateClient(notesClient.id, { notes: notesText })
      setClients(prev => prev.map(x => x.id === updated.id ? updated : x))
      setNotesClient(null)
    } finally {
      setNotesSaving(false)
    }
  }

  const handleAssign = async (clientId: number, person: string | null) => {
    setAssigningId(null)
    const updated = await updateClient(clientId, { assigned_to: person } as any)
    setClients(prev => prev.map(x => x.id === clientId ? { ...x, assigned_to: updated.assigned_to } : x))
  }

  const handleAddVendor = async () => {
    const name = newVendorName.trim()
    if (!name) return
    const initial = name[0].toUpperCase()
    const v = await createVendor({ name, color: newVendorColor, initial, whatsapp: newVendorWa.trim() })
    setTeam(prev => [...prev, v])
    setNewVendorName('')
    setNewVendorColor(PRESET_COLORS[0])
    setNewVendorWa('')
  }

  const handleSaveVendorWa = async (v: Vendor) => {
    const wa = editingVendorWa[v.id] ?? v.whatsapp ?? ''
    const updated = await updateVendor(v.id, { whatsapp: wa })
    setTeam(prev => prev.map(x => x.id === v.id ? updated : x))
  }

  // Build dispatch message for vendor
  const buildDispatchMsg = (vendor: Vendor, clients: Client[]): string => {
    const lines: string[] = []
    lines.push(`Hola ${vendor.name}! 👋`)
    lines.push(`Te mando los clientes que tenés que contactar hoy:\n`)
    clients.forEach((c, i) => {
      const phone = normalizePhone(c.phone, c.country)
      lines.push(`*${i + 1}. ${c.name}*`)
      if (c.category) lines.push(`   🏷️ ${c.category}`)
      if (c.city || c.country) lines.push(`   📍 ${[c.city, c.country].filter(Boolean).join(', ')}`)
      if (phone) lines.push(`   📱 +${phone}`)
      if (c.instagram) lines.push(`   📸 ${c.instagram}`)
      if (c.link_googlemaps) lines.push(`   🗺️ ${c.link_googlemaps}`)
      if (c.landing_url) lines.push(`   🚀 Demo: ${c.landing_url}`)
      lines.push('')
    })
    lines.push('─────────────────────')
    lines.push('*SCRIPT DE VENTA* 📋')
    lines.push('')
    lines.push('*LLAMADA / VIDEO LLAMADA:*')
    lines.push('1. Presentación: "Hola, soy [tu nombre] de AI Producer Studio. ¿Hablás con [nombre del negocio]?"')
    lines.push('2. Gancho: "Vi tu negocio en Google Maps y quería mostrarte algo que le puede traer más clientes."')
    lines.push('3. Propuesta: "Tenemos una landing page lista para vos — sin costo inicial. Solo pagás si te trae resultados."')
    lines.push('4. Demo: "¿Te puedo enviar el link para que la veas ahora?"')
    lines.push('5. Cierre: "¿Cuándo tenés 10 minutos para verla juntos?"')
    lines.push('')
    lines.push('*MENSAJE WHATSAPP:*')
    lines.push('Hola [nombre]! Vi tu negocio en Google y quería mostrarte algo rápido 👀')
    lines.push('Te armamos una página web lista para vos → [link demo]')
    lines.push('¿Te interesa verla? Es sin compromiso 😊')
    return lines.join('\n')
  }

  const toggleSelect = (id: number) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const handleDeleteVendor = async (v: Vendor) => {
    if (!confirm(`¿Eliminar a ${v.name}? Los clientes asignados quedarán sin responsable.`)) return
    await deleteVendor(v.id)
    setTeam(prev => prev.filter(x => x.id !== v.id))
    if (assignFilter === v.name) setAssignFilter('all')
  }

  const handleScheduleFollowup = async () => {
    if (!calClient || !calDate) return
    setCalSaving(true)
    setCalResult(null)
    try {
      const res = await scheduleFollowup(calClient.id, calDate, calNote || undefined)
      setCalResult(res)
    } catch (e: any) {
      setCalResult({ event_url: '', message: 'Error: ' + e.message, method: 'error' })
    } finally {
      setCalSaving(false)
    }
  }

  // WhatsApp auto-scroll
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
      if (data.done) { setWaSending(false); setWaDone(true); es.close(); waEsRef.current = null }
    }
    es.onerror = () => { es.close(); waEsRef.current = null }
  }

  const handleWaSend = async () => {
    if (!waMessage.trim()) { setWaError('Escribe un mensaje'); return }
    const ids = [...selectedIds]
    if (!ids.length) { setWaError('No hay clientes seleccionados'); return }
    setWaError('')
    setWaSending(true)
    setWaDone(false)
    setWaLogs([])
    const selectedTpl = waTemplates.find(t => t.id === Number(waSelectedTpl))
    try {
      await waBulkSend(ids, waMessage, waUseAI, selectedTpl?.body || waMessage, 'clients')
      startWaSse()
    } catch (e: any) {
      setWaError(e.message)
      setWaSending(false)
    }
  }

  const handleWaStop = async () => { await waStop() }

  const normalizePhone = (phone: string | null, country?: string | null): string => {
    if (!phone) return ''
    const hasPlus = phone.trim().startsWith('+')
    let digits = phone.replace(/\D/g, '')
    if (!hasPlus) {
      digits = digits.replace(/^0+/, '')
      // Add country code if we can infer it
      const co = (country || '').toLowerCase()
      if ((co.includes('brazil') || co.includes('brasil') || co === 'br') && !digits.startsWith('55'))
        digits = '55' + digits
      else if ((co.includes('chile') || co === 'cl') && !digits.startsWith('56'))
        digits = '56' + digits
      else if ((co.includes('argentin') || co === 'ar') && !digits.startsWith('54'))
        digits = '54' + digits
      else if ((co.includes('uruguay') || co === 'uy') && !digits.startsWith('598'))
        digits = '598' + digits
      else if ((co.includes('colombia') || co === 'co') && !digits.startsWith('57'))
        digits = '57' + digits
    }
    return digits
  }

  const whatsAppUrl = (phone: string | null, country?: string | null) => {
    const digits = normalizePhone(phone, country)
    return digits ? `https://wa.me/${digits}` : '#'
  }

  return (
    <div className="space-y-5">
      {(showForm || editClient) && (
        <ClientForm
          client={editClient}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditClient(null) }}
        />
      )}

      {showImport && (
        <ImportClientModal
          onClose={() => setShowImport(false)}
          onSaved={(saved) => {
            setClients(prev => [saved, ...prev])
            setShowImport(false)
          }}
        />
      )}

      {/* Export modal */}
      {exportClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={e => e.target === e.currentTarget && setExportClient(null)}
        >
          <div
            className="w-full max-w-md rounded-xl shadow-2xl border"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              <div>
                <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                  📋 Ficha para diseñador web
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{exportClient.name}</p>
              </div>
              <button onClick={() => setExportClient(null)} style={{ color: 'var(--text-secondary)' }}>
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {/* Data rows */}
              {[
                { label: '🏷️ Rubro',        value: exportClient.category },
                { label: '📍 Ciudad',        value: [exportClient.city, exportClient.country].filter(Boolean).join(', ') },
                { label: '📱 Teléfono',      value: exportClient.phone },
                { label: '📸 Instagram',     value: exportClient.instagram },
                { label: '📍 Google Maps',   value: exportClient.link_googlemaps, link: true },
                { label: '🌐 Web actual',    value: exportClient.website, link: true },
                { label: '🚀 Landing',       value: exportClient.landing_url, link: true },
              ].filter(r => r.value).map(r => (
                <div key={r.label} className="flex items-start gap-2 text-sm">
                  <span className="shrink-0 w-28 text-xs" style={{ color: 'var(--text-secondary)' }}>{r.label}</span>
                  {r.link ? (
                    <a href={r.value!} target="_blank" rel="noreferrer"
                      className="flex-1 text-xs break-all"
                      style={{ color: 'var(--accent)' }}>{r.value}</a>
                  ) : (
                    <span className="flex-1 text-xs" style={{ color: 'var(--text-primary)' }}>{r.value}</span>
                  )}
                </div>
              ))}
              {exportClient.notes && (
                <div className="pt-1 border-t text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  📝 {exportClient.notes}
                </div>
              )}
              <div className="flex gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <button
                  onClick={() => handleCopyExport(exportClient)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-white transition-all"
                  style={{ background: copied ? 'var(--success)' : 'var(--accent)' }}
                >
                  {copied ? <><Check size={14} /> ¡Copiado!</> : <><Copy size={14} /> Copiar todo</>}
                </button>
                <button
                  onClick={() => setExportClient(null)}
                  className="px-4 py-2 rounded-lg text-sm border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick notes modal */}
      {notesClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={e => e.target === e.currentTarget && setNotesClient(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl shadow-2xl border"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              <div>
                <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                  📝 {notesClient.name}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Notas rápidas</p>
              </div>
              <button onClick={() => setNotesClient(null)} style={{ color: 'var(--text-secondary)' }}>
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <textarea
                autoFocus
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none resize-none"
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                rows={5}
                placeholder="Pendientes, recordatorios, contexto..."
                value={notesText}
                onChange={e => setNotesText(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setNotesClient(null)}
                  className="px-3 py-1.5 rounded-lg text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveNotes}
                  disabled={notesSaving}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}
                >
                  {notesSaving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Bulk Send Modal */}
      {showWaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-xl border w-full max-w-lg space-y-4 p-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                📱 Enviar WhatsApp a {selectedIds.size} clientes
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
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>✨ Personalizar con IA para cada cliente</p>
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
                    placeholder="Hola {client_name}! Vi tu negocio en {city}..."
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
                <div ref={waLogsRef} className="rounded-lg p-3 font-mono text-xs space-y-0.5 overflow-y-auto" style={{ background: 'var(--bg-base)', maxHeight: '180px' }}>
                  {waLogs.map((l, i) => (
                    <div key={i} style={{ color: 'var(--text-secondary)' }}>
                      <span style={{ color: '#475569', marginRight: 6 }}>[{l.t}]</span>{l.msg}
                    </div>
                  ))}
                </div>
                {waError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{waError}</p>}
                {waDone && (
                  <button onClick={() => setShowWaModal(false)} className="w-full py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                    Cerrar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Google Calendar modal */}
      {calClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={e => e.target === e.currentTarget && setCalClient(null)}
        >
          <div className="w-full max-w-sm rounded-xl shadow-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div>
                <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                  📅 Agendar Follow-up
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{calClient.name}</p>
              </div>
              <button onClick={() => setCalClient(null)} style={{ color: 'var(--text-secondary)' }}><X size={16} /></button>
            </div>
            <div className="p-4 space-y-3">
              {!calResult ? (
                <>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Fecha</label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                      style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      value={calDate}
                      onChange={e => setCalDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nota (opcional)</label>
                    <input
                      className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                      style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      placeholder="Ej: Llamar para confirmar propuesta"
                      value={calNote}
                      onChange={e => setCalNote(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setCalClient(null)} className="px-3 py-1.5 rounded-lg text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Cancelar
                    </button>
                    <button
                      onClick={handleScheduleFollowup}
                      disabled={calSaving || !calDate}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                      style={{ background: 'var(--accent)' }}
                    >
                      <CalendarPlus size={14} />
                      {calSaving ? 'Agendando...' : 'Agendar'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm" style={{ color: calResult.method === 'error' ? 'var(--danger)' : 'var(--success)' }}>
                    {calResult.message}
                  </p>
                  {calResult.event_url && (
                    <a
                      href={calResult.event_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block w-full text-center py-2 rounded-lg text-sm font-medium text-white"
                      style={{ background: calResult.method === 'url' ? 'var(--accent)' : 'var(--success)' }}
                    >
                      {calResult.method === 'url' ? 'Abrir en Google Calendar →' : 'Ver evento →'}
                    </a>
                  )}
                  <button onClick={() => setCalClient(null)} className="w-full py-1.5 rounded-lg text-sm border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>👥 Clientes</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {clients.length} clientes totales
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={openWaModal}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: '#22c55e' }}
              >
                <MessageCircle size={15} /> Enviar WhatsApp ({selectedIds.size})
              </button>
              <button
                onClick={() => { setDispatchTempWa(''); setDispatchVendorId(null); setDispatchSent(false); setShowDispatch(true) }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: '#7C3AED' }}
              >
                <Send size={15} /> Dispatch ({selectedIds.size})
              </button>
            </>
          )}
          <button
            onClick={() => setShowTeamModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }}
            title="Gestionar equipo"
          >
            <Settings size={15} />
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}
          >
            <Download size={16} /> Importar
          </button>
          <button
            onClick={() => { setEditClient(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--accent)' }}
          >
            <Plus size={16} /> Nuevo Cliente
          </button>
        </div>
      </div>

      {/* Filters */}
      <div
        className="flex flex-wrap items-center gap-3 p-3 rounded-xl border"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-secondary)' }} />
          <input
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm border outline-none"
            style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            placeholder="Buscar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setStatusFilter('all')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              background: statusFilter === 'all' ? 'var(--accent)' : 'transparent',
              color: statusFilter === 'all' ? '#fff' : 'var(--text-secondary)',
            }}
          >Todos</button>
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{
                background: statusFilter === s ? 'var(--accent)' : 'transparent',
                color: statusFilter === s ? '#fff' : 'var(--text-secondary)',
              }}
            >
              <StatusBadge status={s} size="sm" />
            </button>
          ))}
        </div>
        {/* Filter by responsable */}
        <div className="flex gap-1 border-l pl-3" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setAssignFilter('all')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              background: assignFilter === 'all' ? 'var(--bg-base)' : 'transparent',
              color: 'var(--text-secondary)',
              border: assignFilter === 'all' ? '1px solid var(--border)' : '1px solid transparent',
            }}
          >Todos</button>
          {team.map(t => (
            <button
              key={t.name}
              onClick={() => setAssignFilter(assignFilter === t.name ? 'all' : t.name)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{
                background: assignFilter === t.name ? t.color + '22' : 'transparent',
                color: assignFilter === t.name ? t.color : 'var(--text-secondary)',
                border: `1px solid ${assignFilter === t.name ? t.color + '55' : 'transparent'}`,
              }}
            >{t.name}</button>
          ))}
        </div>
        {/* Filter by country */}
        {countries.length > 0 && (
          <div className="border-l pl-3" style={{ borderColor: 'var(--border)' }}>
            <select
              value={countryFilter}
              onChange={e => setCountryFilter(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-xs border outline-none"
              style={{ background: 'var(--bg-base)', borderColor: countryFilter !== 'all' ? 'var(--accent)' : 'var(--border)', color: 'var(--text-primary)' }}
            >
              <option value="all">Todos los países</option>
              {countries.map(co => <option key={co} value={co}>{co}</option>)}
            </select>
          </div>
        )}
        {categories.length > 0 && (
          <div className="border-l pl-3" style={{ borderColor: 'var(--border)' }}>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-xs border outline-none"
              style={{ background: 'var(--bg-base)', borderColor: categoryFilter !== 'all' ? 'var(--accent)' : 'var(--border)', color: 'var(--text-primary)', maxWidth: '160px' }}
            >
              <option value="all">Todos los rubros</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {clientCats.has(cat) ? cat : `${cat} (sin clientes)`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
          <p className="text-4xl mb-3">👤</p>
          <p>Sin clientes. Agrega uno manualmente o importa desde Leads.</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-card)', borderBottom: `1px solid var(--border)` }}>
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={selectedIds.size === filtered.length && filtered.length > 0}
                    onChange={e => setSelectedIds(e.target.checked ? new Set(filtered.map(c => c.id)) : new Set())}
                  />
                </th>
                {['Nombre', 'Ciudad', 'Resp.', 'Teléfono', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-xs"
                    style={{ color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const rowTint = getRowBgFn(c)
                const rowBase = i % 2 === 0 ? 'var(--bg-base)' : 'var(--bg-card)'
                return (
                <tr
                  key={c.id}
                  className="border-b transition-colors"
                  style={{
                    borderColor: 'var(--border)',
                    background: selectedIds.has(c.id) ? 'rgba(99,102,241,0.12)' : rowTint || rowBase,
                  }}
                >
                  <td className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
                    {c.category && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{c.category}</p>
                    )}
                    {/* Checklist progress bar */}
                    {(c.checklist_total || 0) > 0 && (() => {
                      const pct = (c.checklist_done || 0) / c.checklist_total
                      const barColor = pct >= 1 ? '#22C55E' : pct >= 0.6 ? '#8B5CF6' : pct >= 0.3 ? '#F59E0B' : '#60A5FA'
                      return (
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)', width: '72px' }}>
                            <div className="h-full rounded-full transition-all"
                                 style={{ width: `${Math.round(pct * 100)}%`, background: barColor }} />
                          </div>
                          <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                            {c.checklist_done || 0}/{c.checklist_total}
                          </span>
                        </div>
                      )
                    })()}
                    {c.notes && (
                      <p className="text-xs mt-0.5 truncate max-w-48" style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        📝 {c.notes}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {editingLocId === c.id ? (
                      <div className="flex flex-col gap-1" onClick={e => e.stopPropagation()}>
                        <input
                          autoFocus
                          className="px-2 py-1 rounded border outline-none text-xs"
                          style={{ background: 'var(--bg-base)', borderColor: 'var(--accent)', color: 'var(--text-primary)', width: '100px' }}
                          placeholder="Ciudad"
                          value={locCity}
                          onChange={e => setLocCity(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveLocation(c.id); if (e.key === 'Escape') setEditingLocId(null) }}
                        />
                        <input
                          className="px-2 py-1 rounded border outline-none text-xs"
                          style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)', width: '100px' }}
                          placeholder="País"
                          value={locCountry}
                          onChange={e => setLocCountry(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveLocation(c.id); if (e.key === 'Escape') setEditingLocId(null) }}
                          onBlur={() => saveLocation(c.id)}
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => openLocEdit(c)}
                        className="text-left hover:underline"
                        style={{ color: (c.city || c.country) ? 'var(--text-secondary)' : 'var(--danger)', opacity: (c.city || c.country) ? 1 : 0.6 }}
                        title="Clic para editar ubicación"
                      >
                        {[c.city, c.country].filter(Boolean).join(', ') || '+ añadir'}
                      </button>
                    )}
                  </td>
                  {/* Responsable column */}
                  <td className="px-4 py-3">
                    <div className="relative">
                      {(() => {
                        const member = c.assigned_to ? teamMap[c.assigned_to] : null
                        return (
                          <>
                            <button
                              onClick={() => setAssigningId(assigningId === c.id ? null : c.id)}
                              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-opacity hover:opacity-80"
                              style={member
                                ? { background: member.color + '30', color: member.color, border: `1.5px solid ${member.color}55` }
                                : { background: 'var(--bg-base)', color: 'var(--text-secondary)', border: '1.5px solid var(--border)' }
                              }
                              title={member ? member.name : 'Sin asignar'}
                            >
                              {member ? member.initial : '—'}
                            </button>
                            {assigningId === c.id && (
                              <div
                                className="absolute z-20 top-9 left-0 flex gap-1 p-1.5 rounded-lg shadow-xl border"
                                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                              >
                                {team.map(t => (
                                  <button
                                    key={t.name}
                                    onClick={() => handleAssign(c.id, c.assigned_to === t.name ? null : t.name)}
                                    className="w-7 h-7 rounded-full text-xs font-bold transition-all hover:scale-110"
                                    style={{
                                      background: t.color + (c.assigned_to === t.name ? '55' : '22'),
                                      color: t.color,
                                      border: `1.5px solid ${t.color}55`,
                                    }}
                                    title={t.name}
                                  >{t.initial}</button>
                                ))}
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {c.phone ? (
                      <a
                        href={whatsAppUrl(c.phone, c.country)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-xs"
                        style={{ color: '#22c55e' }}
                      >
                        <Phone size={12} /> {c.phone}
                      </a>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditClient(c)}
                        className="p-1.5 rounded transition-colors"
                        title="Editar"
                        style={{ color: 'var(--text-secondary)' }}
                      ><Pencil size={14} /></button>
                      <button
                        onClick={() => onOpenChecklist(c.id)}
                        className="p-1.5 rounded transition-colors"
                        title="Checklist"
                        style={{ color: 'var(--text-secondary)' }}
                      ><CheckSquare size={14} /></button>
                      <button
                        onClick={() => openNotes(c)}
                        className="p-1.5 rounded transition-colors"
                        title="Notas rápidas"
                        style={{ color: c.notes ? 'var(--accent)' : 'var(--text-secondary)' }}
                      ><StickyNote size={14} /></button>
                      <button
                        onClick={() => { setCalClient(c); setCalDate(''); setCalNote(''); setCalResult(null) }}
                        className="p-1.5 rounded transition-colors"
                        title="Agendar Follow-up en Google Calendar"
                        style={{ color: 'var(--text-secondary)' }}
                      ><CalendarPlus size={14} /></button>
                      <button
                        onClick={() => { setExportClient(c); setCopied(false) }}
                        className="p-1.5 rounded transition-colors"
                        title="Exportar ficha"
                        style={{ color: 'var(--text-secondary)' }}
                      ><Share2 size={14} /></button>
                      {c.landing_url && (
                        <a
                          href={c.landing_url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded transition-colors"
                          title="Ver landing page"
                          style={{ color: 'var(--accent)' }}
                        ><Globe size={14} /></a>
                      )}
                      {c.link_googlemaps && (
                        <a
                          href={c.link_googlemaps}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded transition-colors"
                          title="Google Maps"
                          style={{ color: 'var(--text-secondary)' }}
                        ><ExternalLink size={14} /></a>
                      )}
                      <button
                        onClick={() => handleDelete(c)}
                        className="p-1.5 rounded transition-colors"
                        title="Eliminar"
                        style={{ color: 'var(--danger)' }}
                      ><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}

      {/* Team management modal */}
      {showTeamModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={e => e.target === e.currentTarget && setShowTeamModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl shadow-2xl border"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>👥 Gestionar equipo</p>
              <button onClick={() => setShowTeamModal(false)} style={{ color: 'var(--text-secondary)' }}><X size={16} /></button>
            </div>
            <div className="p-4 space-y-3">
              {/* Current vendors */}
              {team.map(v => (
                <div key={v.id} className="space-y-1">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: v.color + '30', color: v.color, border: `1.5px solid ${v.color}55` }}>
                      {v.initial}
                    </div>
                    <span className="flex-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{v.name}</span>
                    <button
                      onClick={() => handleDeleteVendor(v)}
                      className="p-1 rounded hover:opacity-80"
                      style={{ color: 'var(--danger)' }}
                    ><X size={14} /></button>
                  </div>
                  {/* WhatsApp field per vendor */}
                  <div className="flex gap-1.5 ml-10">
                    <input
                      className="flex-1 px-2 py-1 rounded text-xs border outline-none"
                      style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      placeholder="WhatsApp del vendedor (ej: 5491112345678)"
                      value={editingVendorWa[v.id] ?? v.whatsapp ?? ''}
                      onChange={e => setEditingVendorWa(prev => ({ ...prev, [v.id]: e.target.value }))}
                      onBlur={() => handleSaveVendorWa(v)}
                      onKeyDown={e => e.key === 'Enter' && handleSaveVendorWa(v)}
                    />
                    {v.whatsapp && (
                      <a href={`https://wa.me/${v.whatsapp.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                        className="px-2 py-1 rounded text-xs flex items-center"
                        style={{ background: '#25D36620', color: '#25D366' }}
                      >✓</a>
                    )}
                  </div>
                </div>
              ))}
              {/* Add new vendor */}
              <div className="pt-3 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Agregar vendedor</p>
                <input
                  className="w-full px-3 py-1.5 rounded-lg text-sm border outline-none"
                  style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  placeholder="Nombre"
                  value={newVendorName}
                  onChange={e => setNewVendorName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddVendor()}
                />
                <input
                  className="w-full px-3 py-1.5 rounded-lg text-sm border outline-none"
                  style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  placeholder="WhatsApp (ej: 5491112345678)"
                  value={newVendorWa}
                  onChange={e => setNewVendorWa(e.target.value)}
                />
                <div className="flex gap-1.5">
                  {PRESET_COLORS.map(col => (
                    <button
                      key={col}
                      onClick={() => setNewVendorColor(col)}
                      className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                      style={{ background: col, outline: newVendorColor === col ? `2px solid ${col}` : 'none', outlineOffset: '2px' }}
                    />
                  ))}
                </div>
                <button
                  onClick={handleAddVendor}
                  disabled={!newVendorName.trim()}
                  className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-40"
                  style={{ background: 'var(--accent)' }}
                >
                  <Plus size={14} /> Agregar vendedor
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch modal */}
      {showDispatch && (() => {
        const dispatchClients = clients.filter(c => selectedIds.has(c.id))
        const selectedVendor = team.find(t => t.id === dispatchVendorId) ?? null
        const msg = buildDispatchMsg(
          selectedVendor ?? { id: 0, name: 'Equipo', color: '#6B7280', initial: 'E', whatsapp: null },
          dispatchClients
        )
        const vendorWa = selectedVendor?.whatsapp?.replace(/\D/g, '')
        const waUrl = vendorWa ? `https://wa.me/${vendorWa}?text=${encodeURIComponent(msg)}` : null
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={e => e.target === e.currentTarget && setShowDispatch(false)}
          >
            <div
              className="w-full max-w-lg rounded-xl shadow-2xl border flex flex-col"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', maxHeight: '85vh' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                  🚀 Dispatch — {dispatchClients.length} cliente{dispatchClients.length !== 1 ? 's' : ''}
                </p>
                <button onClick={() => setShowDispatch(false)} style={{ color: 'var(--text-secondary)' }}><X size={16} /></button>
              </div>

              {/* Vendor selector */}
              <div className="px-4 pt-3 pb-2 flex-shrink-0">
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Enviar a vendedor:</p>
                <div className="flex flex-wrap gap-2">
                  {team.map(v => (
                    <button
                      key={v.id}
                      onClick={() => setDispatchVendorId(v.id)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
                      style={{
                        borderColor: dispatchVendorId === v.id ? v.color : 'var(--border)',
                        background: dispatchVendorId === v.id ? v.color + '22' : 'var(--bg-base)',
                        color: dispatchVendorId === v.id ? v.color : 'var(--text-secondary)',
                      }}
                    >
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ background: v.color }}>{v.initial}</span>
                      {v.name}
                      {v.whatsapp && <span style={{ color: '#25D366' }}>✓</span>}
                    </button>
                  ))}
                </div>
                {selectedVendor && !selectedVendor.whatsapp && (
                  <p className="text-xs mt-2" style={{ color: '#F59E0B' }}>
                    ⚠️ {selectedVendor.name} no tiene WhatsApp guardado — agregalo en ⚙️
                  </p>
                )}
              </div>

              {/* Client summary cards */}
              <div className="px-4 pb-1 space-y-1.5 flex-shrink-0">
                {dispatchClients.map(c => (
                  <div key={c.id} className="rounded-lg px-3 py-2 flex gap-3 items-start text-xs border"
                    style={{ background: 'var(--bg-base)', borderColor: 'var(--border)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
                      {c.category && <p style={{ color: 'var(--text-secondary)' }}>{c.category}</p>}
                      {(c.city || c.country) && <p style={{ color: 'var(--text-secondary)' }}><MapPin size={10} className="inline mr-0.5"/>{[c.city, c.country].filter(Boolean).join(', ')}</p>}
                    </div>
                    <div className="flex gap-1.5 items-center flex-shrink-0">
                      {c.phone && <a href={whatsAppUrl(c.phone, c.country)} target="_blank" rel="noreferrer" className="px-1.5 py-1 rounded" style={{ background: '#25D36615', color: '#25D366' }}><Phone size={10} /></a>}
                      {c.instagram && <a href={`https://instagram.com/${c.instagram.replace('@','')}`} target="_blank" rel="noreferrer" className="px-1.5 py-1 rounded" style={{ background: '#E1306C15', color: '#E1306C' }}><Instagram size={10} /></a>}
                      {c.link_googlemaps && <a href={c.link_googlemaps} target="_blank" rel="noreferrer" className="px-1.5 py-1 rounded" style={{ background: 'var(--accent)15', color: 'var(--accent)' }}><MapPin size={10} /></a>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Message preview */}
              <div className="flex-1 overflow-auto px-4 pb-2">
                <p className="text-xs font-medium py-2" style={{ color: 'var(--text-secondary)' }}>Mensaje que recibirá el vendedor:</p>
                <pre className="text-xs rounded-lg p-3 border whitespace-pre-wrap font-sans"
                  style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >{msg}</pre>
              </div>

              {/* Actions */}
              <div className="px-4 py-3 border-t flex gap-2 flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                <button
                  onClick={() => navigator.clipboard.writeText(msg)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border justify-center"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  <Copy size={14} /> Copiar
                </button>
                {waUrl ? (
                  <div className="flex gap-2 flex-1">
                    <a href={waUrl} target="_blank" rel="noreferrer"
                      onClick={() => setDispatchSent(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white flex-1 justify-center"
                      style={{ background: '#25D366' }}
                    >
                      <Send size={14} /> Enviar a {selectedVendor?.name}
                    </a>
                    {dispatchSent && (
                      <button
                        onClick={async () => {
                          await markContacted(dispatchClients.map(c => c.id), selectedVendor?.name)
                          setDispatchSent(false)
                          setShowDispatch(false)
                          const updated = await getClients()
                          setClients(updated.clients ?? updated)
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white"
                        style={{ background: 'var(--accent)' }}
                        title="Confirmar que el mensaje fue enviado y marcar checklist"
                      >
                        ✓ Confirmar
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs rounded-lg border"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                    {!selectedVendor ? '← Seleccioná un vendedor' : `Agregá el WA de ${selectedVendor.name} en ⚙️`}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Search, StopCircle, MapPin, Star, Globe } from 'lucide-react'
import { getCategories, startScrape, stopScrape, resetScraper, addCategory, deleteCategory, setCategorySourceType } from '../api'
import type { Page, ScraperSettings } from '../types'
import ScraperSettingsPanel from '../components/ScraperSettings'

interface Log { t: string; level: string; msg: string }
interface ScrapeStatus {
  running: boolean
  found_urls: number
  visited: number
  leads_count: number
  total_urls: number
  done: boolean
  error: string | null
  new_logs: Log[]
}

const TIMEZONES = [
  { value: 'America/Sao_Paulo',    label: 'Brasil (SP/RJ)' },
  { value: 'America/Manaus',       label: 'Brasil (AM)' },
  { value: 'America/Bogota',       label: 'Colombia' },
  { value: 'America/Lima',         label: 'Perú' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina' },
  { value: 'America/Santiago',     label: 'Chile' },
  { value: 'America/Mexico_City',  label: 'México' },
  { value: 'Europe/Madrid',        label: 'España' },
]

const LOG_COLORS: Record<string, string> = {
  success: '#22c55e',
  error:   '#ef4444',
  warning: '#f59e0b',
  debug:   '#64748b',
  info:    '#94a3b8',
}

// Storage keys
const FORM_KEY   = 'scraper-form'
const STATUS_KEY = 'scraper-status'
const LOGS_KEY   = 'scraper-logs'

const DEFAULT_FORM = {
  category_key: '',
  city: '',
  country: '',
  timezone: 'America/Sao_Paulo',
  limit: 50,
}

interface Props {
  onNavigate: (p: Page) => void
}

export default function Scraper({ onNavigate }: Props) {
  const [categories, setCategories] = useState<{ key: string; label: string; source_type: string }[]>([])

  // Form: load from localStorage on mount
  const [form, setForm] = useState(() => {
    try {
      const saved = localStorage.getItem(FORM_KEY)
      return saved ? { ...DEFAULT_FORM, ...JSON.parse(saved) } : DEFAULT_FORM
    } catch { return DEFAULT_FORM }
  })

  // Status: load from sessionStorage on mount
  const [status, setStatus] = useState<Partial<ScrapeStatus>>(() => {
    try {
      const saved = sessionStorage.getItem(STATUS_KEY)
      return saved ? JSON.parse(saved) : { done: true }
    } catch { return { done: true } }
  })

  // Logs: load from sessionStorage on mount
  const [logs, setLogs] = useState<Log[]>(() => {
    try {
      const saved = sessionStorage.getItem(LOGS_KEY)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  const [scraperSettings, setScraperSettings] = useState<ScraperSettings | null>(null)

  const [showManageCats, setShowManageCats] = useState(false)
  const [newCatKey, setNewCatKey] = useState('')
  const [newCatLabel, setNewCatLabel] = useState('')
  const [newCatSource, setNewCatSource] = useState<'maps' | 'instagram'>('maps')
  const [catError, setCatError] = useState('')

  const logsRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)
  const [error, setError] = useState('')

  const loadCategoriesList = () => {
    getCategories().then(r => {
      setCategories(r.categories)
      setForm((prev: typeof DEFAULT_FORM) => {
        // If saved category is valid keep it, else use first
        const valid = r.categories.some((c: any) => c.key === prev.category_key)
        if (!valid && r.categories.length) {
          const next = { ...prev, category_key: r.categories[0].key }
          localStorage.setItem(FORM_KEY, JSON.stringify(next))
          return next
        }
        return prev
      })
    })
  }

  // Load categories; restore category_key if saved
  useEffect(() => {
    loadCategoriesList()
  }, [])

  // When active_categories setting changes, ensure selected category_key is still valid
  useEffect(() => {
    if (!visibleCategories.length) return
    const valid = visibleCategories.some(c => c.key === form.category_key)
    if (!valid) {
      updateForm({ category_key: visibleCategories[0].key })
    }
  }, [scraperSettings])

  // Auto-reconnect SSE if scraper was running when we left
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STATUS_KEY)
      if (saved) {
        const s = JSON.parse(saved)
        if (s.running) startSSE()
      }
    } catch {}
    // Cleanup SSE on unmount
    return () => {
      if (esRef.current) { esRef.current.close(); esRef.current = null }
    }
  }, [])

  // Auto-scroll logs
  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight
    }
  }, [logs])

  // Helper: update form AND persist to localStorage
  const updateForm = (patch: Partial<typeof DEFAULT_FORM>) => {
    setForm((prev: typeof DEFAULT_FORM) => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem(FORM_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  const startSSE = () => {
    if (esRef.current) esRef.current.close()
    const es = new EventSource('/api/scrape/status')
    esRef.current = es
    es.onmessage = (e) => {
      const data: ScrapeStatus = JSON.parse(e.data)
      setStatus(data)
      try { sessionStorage.setItem(STATUS_KEY, JSON.stringify(data)) } catch {}
      if (data.new_logs?.length) {
        setLogs(prev => {
          const next = [...prev, ...data.new_logs].slice(-500)
          try { sessionStorage.setItem(LOGS_KEY, JSON.stringify(next)) } catch {}
          return next
        })
      }
      if (data.done) {
        es.close()
        esRef.current = null
      }
    }
    es.onerror = () => {
      es.close()
      esRef.current = null
    }
  }

  const handleStart = async () => {
    if (!form.category_key || !form.city.trim() || !form.country.trim()) {
      setError('Completa categoría, ciudad y país')
      return
    }
    setError('')
    setLogs([])
    try { sessionStorage.removeItem(LOGS_KEY) } catch {}
    try {
      await startScrape(form)
      startSSE()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleStop = async () => {
    await stopScrape()
  }

  const handleReset = async () => {
    if (esRef.current) { esRef.current.close(); esRef.current = null }
    await resetScraper()
    const cleared = { running: false, found_urls: 0, visited: 0, leads_count: 0, total_urls: 0, done: true, error: null, new_logs: [] }
    setStatus(cleared)
    setLogs([])
    setError('')
    try { sessionStorage.removeItem(STATUS_KEY); sessionStorage.removeItem(LOGS_KEY) } catch {}
  }

  const handleSetSourceType = async (key: string, sourceType: 'maps' | 'instagram') => {
    await setCategorySourceType(key, sourceType)
    setCategories(prev => prev.map(c => c.key === key ? { ...c, source_type: sourceType } : c))
  }

  const running = status.running

  // Filter categories shown in dropdown based on active_categories setting
  const activeCategories = scraperSettings?.active_categories ?? []
  const visibleCategories = activeCategories.length > 0
    ? categories.filter(c => activeCategories.includes(c.key))
    : categories

  const pct = status.total_urls
    ? Math.round((status.visited! / status.total_urls) * 100)
    : 0

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          🔍 Scraper de Google Maps
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Encuentra negocios sin sitio web — tus potenciales clientes de landing page.
        </p>
      </div>

      {/* Running banner */}
      {running && (
        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm"
          style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.3)' }}
        >
          <span className="animate-pulse">●</span>
          Búsqueda en progreso — puedes navegar a otras secciones y volver aquí en cualquier momento.
        </div>
      )}

      {/* Settings panel */}
      <ScraperSettingsPanel
        categories={categories}
        disabled={!!running}
        onSettingsChange={s => setScraperSettings(s)}
      />

      {/* Form */}
      <div
        className="rounded-xl p-5 border space-y-4"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Categoría
              </label>
              <button
                onClick={() => setShowManageCats(v => !v)}
                className="text-xs px-2 py-0.5 rounded border"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                ⚙ Categorías
              </button>
            </div>
            <select
              className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              value={form.category_key}
              onChange={e => updateForm({ category_key: e.target.value })}
              disabled={!!running}
            >
              {visibleCategories.map(c => (
                <option key={c.key} value={c.key}>{c.source_type === 'instagram' ? '📸 ' : '📍 '}{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
              Zona horaria
            </label>
            <select
              className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              value={form.timezone}
              onChange={e => updateForm({ timezone: e.target.value })}
              disabled={!!running}
            >
              {TIMEZONES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
              Ciudad
            </label>
            <input
              className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              placeholder="Florianópolis"
              value={form.city}
              onChange={e => updateForm({ city: e.target.value })}
              disabled={!!running}
            />
          </div>

          <div>
            <label className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
              País
            </label>
            <input
              className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              placeholder="Brasil"
              value={form.country}
              onChange={e => updateForm({ country: e.target.value })}
              disabled={!!running}
            />
          </div>

          <div>
            <label className="block text-xs mb-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
              Límite de resultados
            </label>
            <input
              type="number"
              min={5}
              max={200}
              className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              value={form.limit}
              onChange={e => updateForm({ limit: Number(e.target.value) })}
              disabled={!!running}
            />
          </div>
        </div>

        {showManageCats && (
          <div
            className="rounded-lg border p-4 space-y-3"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-base)' }}
          >
            <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Gestionar categorías</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {categories.map(c => (
                <div key={c.key} className="flex items-center gap-2 py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
                  <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{c.label} <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>({c.key})</span></span>
                  {/* Maps / Instagram toggle */}
                  <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                    <button
                      onClick={() => handleSetSourceType(c.key, 'maps')}
                      className="px-2 py-1 text-xs transition-colors"
                      style={{
                        background: c.source_type === 'maps' ? '#3B82F6' : 'var(--bg-base)',
                        color: c.source_type === 'maps' ? 'white' : 'var(--text-secondary)',
                      }}
                    >
                      📍Maps
                    </button>
                    <button
                      onClick={() => handleSetSourceType(c.key, 'instagram')}
                      className="px-2 py-1 text-xs transition-colors"
                      style={{
                        background: c.source_type === 'instagram' ? '#E1306C' : 'var(--bg-base)',
                        color: c.source_type === 'instagram' ? 'white' : 'var(--text-secondary)',
                      }}
                    >
                      📸 IG
                    </button>
                  </div>
                  <button
                    onClick={async () => {
                      await deleteCategory(c.key)
                      loadCategoriesList()
                    }}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ color: 'var(--danger)', border: '1px solid var(--danger)' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              <input
                className="flex-1 px-2 py-1.5 rounded-lg text-xs border outline-none"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                placeholder="clave (ej: spas)"
                value={newCatKey}
                onChange={e => setNewCatKey(e.target.value)}
              />
              <input
                className="flex-1 px-2 py-1.5 rounded-lg text-xs border outline-none"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                placeholder="etiqueta (ej: spa)"
                value={newCatLabel}
                onChange={e => setNewCatLabel(e.target.value)}
              />
              {/* Source type toggle for new category */}
              <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                <button
                  onClick={() => setNewCatSource('maps')}
                  className="px-2 py-1.5 text-xs transition-colors"
                  style={{
                    background: newCatSource === 'maps' ? '#3B82F6' : 'var(--bg-card)',
                    color: newCatSource === 'maps' ? 'white' : 'var(--text-secondary)',
                  }}
                >
                  📍Maps
                </button>
                <button
                  onClick={() => setNewCatSource('instagram')}
                  className="px-2 py-1.5 text-xs transition-colors"
                  style={{
                    background: newCatSource === 'instagram' ? '#E1306C' : 'var(--bg-card)',
                    color: newCatSource === 'instagram' ? 'white' : 'var(--text-secondary)',
                  }}
                >
                  📸 IG
                </button>
              </div>
              <button
                onClick={async () => {
                  setCatError('')
                  if (!newCatKey.trim() || !newCatLabel.trim()) { setCatError('Rellena ambos campos'); return }
                  try {
                    await addCategory(newCatKey.trim(), newCatLabel.trim(), newCatSource)
                    setNewCatKey('')
                    setNewCatLabel('')
                    setNewCatSource('maps')
                    loadCategoriesList()
                  } catch (e: any) {
                    setCatError(e.message)
                  }
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: 'var(--accent)' }}
              >
                Agregar
              </button>
            </div>
            {catError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{catError}</p>}
          </div>
        )}

        {error && (
          <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
        )}

        <div className="flex gap-3">
          {!running ? (
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity"
              style={{ background: 'var(--accent)' }}
            >
              <Search size={16} /> Iniciar Búsqueda
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white"
              style={{ background: 'var(--danger)' }}
            >
              <StopCircle size={16} /> Detener
            </button>
          )}
          {!running && (
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              Resetear estado
            </button>
          )}

          {!running && status.leads_count != null && status.leads_count > 0 && (
            <button
              onClick={() => onNavigate('leads')}
              className="px-5 py-2.5 rounded-lg text-sm font-medium border transition-colors"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              Ver {status.leads_count} leads →
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      {(running || logs.length > 0) && (
        <div
          className="rounded-xl p-5 border space-y-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { label: 'Encontrados', value: status.found_urls ?? 0, icon: <MapPin size={14} /> },
              { label: 'Visitados',   value: `${status.visited ?? 0} / ${status.total_urls ?? 0}`, icon: <Globe size={14} /> },
              { label: 'Leads ✓',     value: status.leads_count ?? 0, icon: <Star size={14} />, highlight: true },
            ].map(s => (
              <div key={s.label} className="rounded-lg p-3" style={{ background: 'var(--bg-base)' }}>
                <div className="flex items-center justify-center gap-1 text-xs mb-1"
                  style={{ color: s.highlight ? 'var(--success)' : 'var(--text-secondary)' }}>
                  {s.icon} {s.label}
                </div>
                <p className="text-xl font-bold"
                  style={{ color: s.highlight ? 'var(--success)' : 'var(--text-primary)' }}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          {running && status.total_urls! > 0 && (
            <div>
              <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                <span>Progreso</span><span>{pct}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: 'var(--accent)' }}
                />
              </div>
            </div>
          )}

          {/* Logs */}
          <div
            ref={logsRef}
            className="rounded-lg p-3 font-mono text-xs space-y-0.5 overflow-y-auto"
            style={{ background: 'var(--bg-base)', maxHeight: '280px' }}
          >
            {logs.length === 0 && (
              <span style={{ color: 'var(--text-secondary)' }}>Iniciando...</span>
            )}
            {logs.map((log, i) => (
              <div key={i} style={{ color: LOG_COLORS[log.level] ?? '#94a3b8' }}>
                <span style={{ color: '#475569', marginRight: '6px' }}>[{log.t}]</span>
                {log.msg}
              </div>
            ))}
          </div>

          {status.error && (
            <p className="text-sm" style={{ color: 'var(--danger)' }}>
              Error: {status.error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

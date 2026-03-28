import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { getScraperSettings, updateScraperSettings } from '../api'
import type { ScraperSettings } from '../types'

interface Props {
  categories: { key: string; label: string; source_type: string }[]
  disabled?: boolean
  onSettingsChange?: (s: ScraperSettings) => void
}

const WEBSITE_FILTER_OPTIONS = [
  { value: 'no_website',     label: 'Sin sitio web' },
  { value: 'has_website',    label: 'Con sitio web' },
  { value: 'instagram_only', label: 'Solo Instagram' },
  { value: 'any',            label: 'Cualquiera' },
]

const RATING_OPTIONS = [3.0, 3.5, 4.0, 4.5, 5.0]

const DEFAULT_SETTINGS: ScraperSettings = {
  website_filter: 'no_website',
  min_reviews: 20,
  max_reviews: 0,
  min_rating: 4.0,
  max_results: 50,
  active_categories: [],
}

export default function ScraperSettingsPanel({ categories, disabled, onSettingsChange }: Props) {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<ScraperSettings>(DEFAULT_SETTINGS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    getScraperSettings()
      .then(s => {
        setSettings(s)
        onSettingsChange?.(s)
      })
      .catch(() => setLoadError('No se pudieron cargar los ajustes'))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const updated = await updateScraperSettings(settings)
      setSettings(updated)
      onSettingsChange?.(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setLoadError('Error al guardar ajustes')
    } finally {
      setSaving(false)
    }
  }

  const toggleCategory = (key: string) => {
    setSettings(prev => {
      const active = prev.active_categories ?? []
      const next = active.includes(key)
        ? active.filter(k => k !== key)
        : [...active, key]
      return { ...prev, active_categories: next }
    })
  }

  return (
    <div
      className="rounded-xl border"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium"
        style={{ color: 'var(--text-secondary)' }}
        disabled={disabled}
      >
        <span className="flex items-center gap-2">
          <Settings size={15} />
          Ajustes de filtrado
        </span>
        <span style={{ fontSize: '11px' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t" style={{ borderColor: 'var(--border)' }}>

          {/* Website filter */}
          <div className="pt-4">
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Filtro de sitio web
            </p>
            <div className="flex flex-wrap gap-2">
              {WEBSITE_FILTER_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className="flex items-center gap-1.5 cursor-pointer text-sm px-3 py-1.5 rounded-lg border transition-colors"
                  style={{
                    borderColor: settings.website_filter === opt.value ? 'var(--accent)' : 'var(--border)',
                    background: settings.website_filter === opt.value ? 'rgba(99,102,241,0.1)' : 'var(--bg-base)',
                    color: settings.website_filter === opt.value ? 'var(--accent)' : 'var(--text-primary)',
                  }}
                >
                  <input
                    type="radio"
                    name="website_filter"
                    value={opt.value}
                    checked={settings.website_filter === opt.value}
                    onChange={() => setSettings(prev => ({ ...prev, website_filter: opt.value as ScraperSettings['website_filter'] }))}
                    className="sr-only"
                    disabled={disabled}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Reviews & rating row */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Reseñas mínimas
              </label>
              <input
                type="number"
                min={0}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                value={settings.min_reviews}
                onChange={e => setSettings(prev => ({ ...prev, min_reviews: Number(e.target.value) }))}
                disabled={disabled}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Reseñas máximas
              </label>
              <input
                type="number"
                min={0}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                value={settings.max_reviews}
                onChange={e => setSettings(prev => ({ ...prev, max_reviews: Number(e.target.value) }))}
                disabled={disabled}
              />
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>0 = sin límite</p>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Rating mínimo
              </label>
              <select
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                value={settings.min_rating}
                onChange={e => setSettings(prev => ({ ...prev, min_rating: Number(e.target.value) }))}
                disabled={disabled}
              >
                {RATING_OPTIONS.map(r => (
                  <option key={r} value={r}>{r.toFixed(1)} ★</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Max resultados
              </label>
              <input
                type="number"
                min={1}
                max={500}
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                value={settings.max_results}
                onChange={e => setSettings(prev => ({ ...prev, max_results: Number(e.target.value) }))}
                disabled={disabled}
              />
            </div>
          </div>

          {/* Active categories */}
          {categories.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Categorías activas{' '}
                <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
                  (vacío = todas activas)
                </span>
              </p>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {categories.map(cat => {
                  const active = (settings.active_categories ?? []).length === 0
                    || (settings.active_categories ?? []).includes(cat.key)
                  const checked = (settings.active_categories ?? []).includes(cat.key)
                  return (
                    <label
                      key={cat.key}
                      className="flex items-center gap-1.5 cursor-pointer text-xs px-2.5 py-1.5 rounded-lg border transition-colors"
                      style={{
                        borderColor: checked ? 'var(--accent)' : 'var(--border)',
                        background: checked ? 'rgba(99,102,241,0.1)' : 'var(--bg-base)',
                        color: checked ? 'var(--accent)' : (active ? 'var(--text-primary)' : 'var(--text-secondary)'),
                        opacity: disabled ? 0.6 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCategory(cat.key)}
                        className="sr-only"
                        disabled={disabled}
                      />
                      {cat.source_type === 'instagram' ? '📸 ' : '📍 '}{cat.label}
                    </label>
                  )
                })}
              </div>
              {(settings.active_categories ?? []).length > 0 && (
                <button
                  onClick={() => setSettings(prev => ({ ...prev, active_categories: [] }))}
                  className="mt-2 text-xs"
                  style={{ color: 'var(--text-secondary)' }}
                  disabled={disabled}
                >
                  Limpiar selección (activar todas)
                </button>
              )}
            </div>
          )}

          {loadError && (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>{loadError}</p>
          )}

          {/* Save button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || disabled}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity"
              style={{ background: 'var(--accent)', opacity: (saving || disabled) ? 0.6 : 1 }}
            >
              {saving ? 'Guardando...' : 'Guardar ajustes'}
            </button>
            {saved && (
              <span className="text-xs" style={{ color: 'var(--success)' }}>
                Ajustes guardados
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

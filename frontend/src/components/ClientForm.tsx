import { useState, useEffect } from 'react'
import { X, MapPin, Loader2 } from 'lucide-react'
import type { Client } from '../types'
import { createClient, updateClient, extractFromUrl, getVendors } from '../api'

interface Props {
  client?: Client | null
  onSave: (c: Client) => void
  onClose: () => void
}

const STATUSES = [
  { key: 'prospect',    label: 'Prospecto'   },
  { key: 'contacted',   label: 'Contactado'  },
  { key: 'proposal',    label: 'Propuesta'   },
  { key: 'negotiating', label: 'Negociando'  },
  { key: 'closed',      label: 'Cerrado'     },
  { key: 'lost',        label: 'Perdido'     },
]

type Vendor = { id: number; name: string; color: string; initial: string }

const input =
  'w-full px-3 py-2 rounded-lg text-sm outline-none border transition-colors'

export default function ClientForm({ client, onSave, onClose }: Props) {
  const [form, setForm] = useState({
    name:            client?.name            ?? '',
    phone:           client?.phone           ?? '',
    category:        client?.category        ?? '',
    city:            client?.city            ?? '',
    country:         client?.country         ?? '',
    website:         client?.website         ?? '',
    instagram:       client?.instagram       ?? '',
    landing_url:     client?.landing_url     ?? '',
    link_googlemaps: client?.link_googlemaps ?? '',
    status:          client?.status          ?? 'prospect',
    notes:           client?.notes           ?? '',
    assigned_to:     client?.assigned_to     ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [team, setTeam] = useState<Vendor[]>([])

  useEffect(() => {
    getVendors().then(({ vendors }) => setTeam(vendors))
  }, [])

  // Maps import state
  const [mapsUrl, setMapsUrl] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleExtract = async (urlOverride?: string) => {
    const target = urlOverride ?? mapsUrl.trim()
    if (!target) return
    setExtracting(true)
    setExtractError('')
    try {
      const data = await extractFromUrl(target)
      setForm(f => ({
        ...f,
        name:            data.name            ?? f.name,
        phone:           data.phone           ?? f.phone,
        category:        data.category        ?? f.category,
        city:            data.city            || f.city,
        country:         data.country         || f.country,
        instagram:       data.instagram       ?? f.instagram,
        link_googlemaps: data.link_googlemaps ?? f.link_googlemaps,
      }))
      if (!urlOverride) setMapsUrl('')
    } catch (e: any) {
      setExtractError(e.message || 'No se pudieron extraer datos')
    } finally {
      setExtracting(false)
    }
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true)
    setError('')
    try {
      const payload: any = { ...form }
      // Clean empty strings to null
      Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null })
      const saved = client
        ? await updateClient(client.id, payload)
        : await createClient(payload)
      onSave(saved)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl border overflow-hidden"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {client ? 'Editar cliente' : 'Nuevo cliente'}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text-secondary)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">

          {/* Extract from URL — new clients: paste URL; existing: re-extract from stored URL */}
          <div
            className="rounded-lg p-3 border space-y-2"
            style={{ background: 'var(--bg-base)', borderColor: 'var(--border)' }}
          >
            <p className="text-xs font-medium flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <MapPin size={13} /> {client ? 'Re-extraer datos desde URL' : 'Importar desde URL'}
            </p>
            {/* Quick re-extract for existing clients that have a stored URL */}
            {client && (form.landing_url || form.link_googlemaps) && (
              <button
                onClick={() => handleExtract(form.landing_url || form.link_googlemaps)}
                disabled={extracting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                {extracting ? <Loader2 size={13} className="animate-spin" /> : <MapPin size={13} />}
                {extracting ? 'Extrayendo...' : `Re-extraer desde ${form.landing_url ? 'landing' : 'Maps'}`}
              </button>
            )}
            <div className="flex gap-2">
              <input
                className="flex-1 px-3 py-2 rounded-lg text-xs border outline-none"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                placeholder="Pega un link de Google Maps o landing page..."
                value={mapsUrl}
                onChange={e => setMapsUrl(e.target.value)}
                disabled={extracting}
              />
              <button
                onClick={() => handleExtract()}
                disabled={extracting || !mapsUrl.trim()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50 shrink-0"
                style={{ background: 'var(--accent)' }}
              >
                {extracting ? <Loader2 size={13} className="animate-spin" /> : <MapPin size={13} />}
                {extracting ? 'Extrayendo...' : 'Extraer datos'}
              </button>
            </div>
            {extractError && (
              <p className="text-xs" style={{ color: 'var(--danger)' }}>{extractError}</p>
            )}
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Nombre *</label>
              <input
                className={input}
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="Nombre del negocio"
              />
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Teléfono</label>
              <input
                className={input}
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="+55 11 99999-9999"
              />
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Categoría</label>
              <input
                className={input}
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                value={form.category}
                onChange={e => set('category', e.target.value)}
                placeholder="Ej: Dentista"
              />
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Ciudad</label>
              <input
                className={input}
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                value={form.city}
                onChange={e => set('city', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>País</label>
              <input
                className={input}
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                value={form.country}
                onChange={e => set('country', e.target.value)}
              />
            </div>

            {/* Responsable */}
            <div className="col-span-2">
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>Responsable</label>
              <div className="flex gap-2">
                {team.map(t => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => set('assigned_to', form.assigned_to === t.name ? '' : t.name)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: form.assigned_to === t.name ? t.color + '30' : 'var(--bg-base)',
                      color: form.assigned_to === t.name ? t.color : 'var(--text-secondary)',
                      border: `1.5px solid ${form.assigned_to === t.name ? t.color + '80' : 'var(--border)'}`,
                    }}
                  >
                    <span className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs"
                      style={{ background: t.color + '30', color: t.color }}
                    >{t.initial}</span>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Estado</label>
              <select
                className={input}
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                value={form.status}
                onChange={e => set('status', e.target.value)}
              >
                {STATUSES.map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Instagram</label>
              <input
                className={input}
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                value={form.instagram}
                onChange={e => set('instagram', e.target.value)}
                placeholder="@usuario o URL"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>URL Landing</label>
              <input
                className={input}
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                value={form.landing_url}
                onChange={e => set('landing_url', e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Link Google Maps</label>
              <input
                className={input}
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                value={form.link_googlemaps}
                onChange={e => set('link_googlemaps', e.target.value)}
                placeholder="https://maps.google.com/..."
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Notas</label>
              <textarea
                className={input}
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                rows={3}
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Notas internas..."
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-5 py-4 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ color: 'var(--text-secondary)' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

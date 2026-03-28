import { useState, useEffect } from 'react'
import { X, Link, Loader2, Save, MapPin, Globe } from 'lucide-react'
import { extractFromUrl, createClient, getVendors } from '../api'
import type { Client } from '../types'

interface Props {
  onClose: () => void
  onSaved: (client: Client) => void
}

type Fields = {
  name: string
  phone: string
  instagram: string
  category: string
  city: string
  country: string
  link_googlemaps: string
  landing_url: string
  website: string
}

type Vendor = { id: number; name: string; color: string; initial: string }

export default function ImportClientModal({ onClose, onSaved }: Props) {
  const [url, setUrl]           = useState('')
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [fields, setFields]     = useState<Fields | null>(null)
  const [source, setSource]     = useState<'maps' | 'landing' | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [team, setTeam]         = useState<Vendor[]>([])

  useEffect(() => {
    getVendors().then(({ vendors }) => setTeam(vendors))
  }, [])
  const [assignedTo, setAssignedTo] = useState<string | null>(null)

  const isMaps = url.includes('maps.google') || url.includes('goo.gl/maps') || url.includes('maps.app.goo.gl')

  const handleExtract = async () => {
    if (!url.trim()) return
    setLoading(true)
    setError(null)
    setFields(null)
    try {
      const data = await extractFromUrl(url.trim())
      setSource(data.source ?? null)
      setFields({
        name:            data.name            ?? '',
        phone:           data.phone           ?? '',
        instagram:       data.instagram       ?? '',
        category:        data.category        ?? '',
        city:            data.city            ?? '',
        country:         data.country         ?? '',
        link_googlemaps: data.link_googlemaps ?? (isMaps ? url.trim() : ''),
        landing_url:     data.landing_url     ?? (!isMaps ? url.trim() : ''),
        website:         data.website_raw     ?? '',
      })
    } catch (e: any) {
      setError(e.message || 'Error al extraer datos')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!fields || !fields.name.trim()) return
    setSaving(true)
    try {
      const client = await createClient({
        name:            fields.name.trim()            || undefined,
        phone:           fields.phone.trim()           || undefined,
        instagram:       fields.instagram.trim()       || undefined,
        category:        fields.category.trim()        || undefined,
        city:            fields.city.trim()            || undefined,
        country:         fields.country.trim()         || undefined,
        link_googlemaps: fields.link_googlemaps.trim() || undefined,
        landing_url:     fields.landing_url.trim()     || undefined,
        website:         fields.website.trim()         || undefined,
        assigned_to:     assignedTo                    || undefined,
        status: 'prospect',
      } as any)
      onSaved(client)
    } catch (e: any) {
      setError(e.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, key: keyof Fields, placeholder = '') => (
    <div key={key}>
      <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <input
        className="w-full px-3 py-1.5 rounded-lg text-sm border outline-none"
        style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        value={fields?.[key] ?? ''}
        placeholder={placeholder}
        onChange={e => setFields(f => f ? { ...f, [key]: e.target.value } : f)}
      />
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl border"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
              Importar cliente desde URL
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Pega un link de Google Maps o de la landing page que ya hiciste
            </p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-secondary)' }}><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* URL input */}
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              URL (Google Maps o landing page)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }}>
                  {isMaps ? <MapPin size={14} /> : <Globe size={14} />}
                </div>
                <input
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-sm border outline-none"
                  style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  placeholder="https://maps.google.com/... o https://tucliente.com"
                  value={url}
                  onChange={e => { setUrl(e.target.value); setFields(null); setError(null) }}
                  onKeyDown={e => e.key === 'Enter' && handleExtract()}
                />
              </div>
              <button
                onClick={handleExtract}
                disabled={loading || !url.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Link size={14} />}
                {loading ? 'Extrayendo...' : 'Extraer'}
              </button>
            </div>
            {isMaps && (
              <p className="text-xs mt-1.5" style={{ color: '#60A5FA' }}>
                Google Maps detectado — abrirá Playwright para extraer datos
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
              {error}
            </div>
          )}

          {/* Extracted fields */}
          {fields !== null && (
            <>
              <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                  {source === 'maps' ? '📍' : '🌐'}
                  Datos extraídos — edita si es necesario
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {field('Nombre *', 'name', 'Nombre del negocio')}
                  {field('Teléfono', 'phone', '+55 11 9xxxx-xxxx')}
                  {field('Instagram', 'instagram', '@usuario')}
                  {field('Categoría / Rubro', 'category', 'Dentista, Estética...')}
                  {field('Ciudad', 'city', 'Santiago')}
                  {field('País', 'country', 'Chile')}
                  {field('Google Maps URL', 'link_googlemaps', 'https://maps.google.com/...')}
                  {field('Landing page URL', 'landing_url', 'https://...')}
                </div>

                {/* Responsable picker */}
                <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>Responsable</p>
                  <div className="flex gap-2">
                    {team.map(t => (
                      <button
                        key={t.name}
                        onClick={() => setAssignedTo(assignedTo === t.name ? null : t.name)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{
                          background: assignedTo === t.name ? t.color + '30' : 'var(--bg-base)',
                          color: assignedTo === t.name ? t.color : 'var(--text-secondary)',
                          border: `1.5px solid ${assignedTo === t.name ? t.color + '80' : 'var(--border)'}`,
                        }}
                      >
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs"
                          style={{ background: t.color + '30', color: t.color }}
                        >{t.initial}</span>
                        {t.name}
                      </button>
                    ))}
                    {assignedTo && (
                      <button
                        onClick={() => setAssignedTo(null)}
                        className="px-2 py-1.5 rounded-lg text-xs"
                        style={{ color: 'var(--text-secondary)' }}
                      >✕ Quitar</button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                <button
                  onClick={handleSave}
                  disabled={saving || !fields.name.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: 'var(--success)' }}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {saving ? 'Guardando...' : 'Guardar cliente'}
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

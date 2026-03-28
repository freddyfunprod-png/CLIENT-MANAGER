import { useEffect, useState } from 'react'
import { Plus, Trash2, Copy, Check, Wand2, Save, Pencil } from 'lucide-react'
import {
  getTemplates, createTemplate, updateTemplate, deleteTemplate,
  generateFromTemplate, getClients,
} from '../api'
import type { Client } from '../types'

interface Template {
  id: number
  name: string
  body: string
  ai_style: string
  updated_at: string
}

const AI_STYLES = [
  { value: 'direto',               label: 'Direto' },
  { value: 'informal em português', label: 'Informal PT-BR' },
  { value: 'profissional',         label: 'Profesional' },
]

const PIPELINE_STAGES = [
  { value: 'prospect',    label: 'Prospect' },
  { value: 'contacted',   label: 'Contactado' },
  { value: 'proposal',    label: 'Propuesta' },
  { value: 'negotiating', label: 'Negociando' },
  { value: 'closed',      label: 'Cerrado' },
  { value: 'lost',        label: 'Perdido' },
]

const LANG_OPTIONS = [
  { code: 'pt', label: '🇧🇷 PT-BR' },
  { code: 'es', label: '🇪🇸 ES' },
  { code: 'en', label: '🇺🇸 EN' },
]

const VARS_HINT = '{nome} {negocio} {cidade} {etapa}'

export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [clients, setClients] = useState<Client[]>([])

  // Editor state
  const [editing, setEditing] = useState<Template | null>(null)
  const [editName, setEditName] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editStyle, setEditStyle] = useState('direto')
  const [saving, setSaving] = useState(false)
  const [showNew, setShowNew] = useState(false)

  // Generator state
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null)
  const [clientSearch, setClientSearch] = useState('')
  const [stage, setStage] = useState('prospect')
  const [language, setLanguage] = useState('pt')
  const [versions, setVersions] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [editedVersions, setEditedVersions] = useState<string[]>([])

  useEffect(() => {
    loadTemplates()
    getClients().then(r => setClients(r.clients))
  }, [])

  const loadTemplates = () =>
    getTemplates().then(r => setTemplates(r.templates))

  const filteredClients = clients.filter(c =>
    !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase())
  )

  const startNew = () => {
    setEditing(null)
    setEditName('')
    setEditBody('')
    setEditStyle('direto')
    setShowNew(true)
  }

  const startEdit = (t: Template) => {
    setEditing(t)
    setEditName(t.name)
    setEditBody(t.body)
    setEditStyle(t.ai_style)
    setShowNew(true)
  }

  const cancelEdit = () => {
    setShowNew(false)
    setEditing(null)
  }

  const handleSave = async () => {
    if (!editName.trim() || !editBody.trim()) return
    setSaving(true)
    try {
      if (editing) {
        await updateTemplate(editing.id, { name: editName, body: editBody, ai_style: editStyle })
        if (selectedTemplate?.id === editing.id) {
          setSelectedTemplate({ ...selectedTemplate, name: editName, body: editBody, ai_style: editStyle })
        }
      } else {
        await createTemplate({ name: editName, body: editBody, ai_style: editStyle })
      }
      await loadTemplates()
      cancelEdit()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (t: Template) => {
    if (!confirm(`Eliminar template "${t.name}"?`)) return
    await deleteTemplate(t.id)
    if (selectedTemplate?.id === t.id) setSelectedTemplate(null)
    await loadTemplates()
  }

  const handleGenerate = async () => {
    if (!selectedTemplate || !selectedClientId) {
      setGenError('Selecciona un template y un cliente')
      return
    }
    setGenerating(true)
    setGenError('')
    setVersions([])
    setEditedVersions([])
    try {
      const res = await generateFromTemplate(selectedTemplate.id, selectedClientId, stage, language)
      setVersions(res.versions)
      setEditedVersions(res.versions)
    } catch (e: any) {
      setGenError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = async (idx: number) => {
    await navigator.clipboard.writeText(editedVersions[idx] || versions[idx])
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  const insertVar = (varName: string) => {
    setEditBody(prev => prev + `{${varName}}`)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            📝 Templates de Mensajes
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Crea templates reutilizables con variables y genera 3 variantes con IA
          </p>
        </div>
        <button
          onClick={startNew}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'var(--accent)' }}
        >
          <Plus size={15} /> Nuevo template
        </button>
      </div>

      {/* Editor (new / edit) */}
      {showNew && (
        <div
          className="rounded-xl border p-5 space-y-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--accent)' }}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {editing ? 'Editar template' : 'Nuevo template'}
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Nombre del template
              </label>
              <input
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                placeholder="Ej: Primer contacto restaurantes"
                value={editName}
                onChange={e => setEditName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Estilo IA
              </label>
              <select
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                value={editStyle}
                onChange={e => setEditStyle(e.target.value)}
              >
                {AI_STYLES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Mensaje base
              </label>
              <div className="flex gap-1">
                {['nome', 'negocio', 'cidade', 'etapa'].map(v => (
                  <button
                    key={v}
                    onClick={() => insertVar(v)}
                    className="text-xs px-2 py-0.5 rounded border"
                    style={{ borderColor: 'var(--border)', color: 'var(--accent)', background: 'rgba(99,102,241,0.08)' }}
                  >
                    {'{' + v + '}'}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              rows={5}
              placeholder={`Olá {nome}! Vi que vocês têm um negócio incrível em {cidade}...\n\nVariáveis disponibles: ${VARS_HINT}`}
              value={editBody}
              onChange={e => setEditBody(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !editName.trim() || !editBody.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              <Save size={14} /> {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              onClick={cancelEdit}
              className="px-4 py-2 rounded-lg text-sm border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Templates list */}
        <div className="space-y-3">
          <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            MIS TEMPLATES ({templates.length})
          </p>
          {templates.length === 0 && (
            <div
              className="rounded-xl border p-8 text-center"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              <p className="text-2xl mb-2">📄</p>
              <p className="text-sm">Sin templates. Crea uno para empezar.</p>
            </div>
          )}
          {templates.map(t => (
            <div
              key={t.id}
              onClick={() => setSelectedTemplate(t)}
              className="rounded-xl border p-4 cursor-pointer transition-all"
              style={{
                background: selectedTemplate?.id === t.id ? 'rgba(99,102,241,0.08)' : 'var(--bg-card)',
                borderColor: selectedTemplate?.id === t.id ? 'var(--accent)' : 'var(--border)',
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                    {t.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {AI_STYLES.find(s => s.value === t.ai_style)?.label ?? t.ai_style}
                  </p>
                  <p
                    className="text-xs mt-1.5 line-clamp-2"
                    style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}
                  >
                    {t.body}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); startEdit(t) }}
                    className="p-1.5 rounded"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(t) }}
                    className="p-1.5 rounded"
                    style={{ color: 'var(--danger)' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Generator */}
        <div
          className="rounded-xl border p-5 space-y-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Generar variantes con IA
          </p>

          {/* Template selection indicator */}
          <div
            className="px-3 py-2 rounded-lg text-xs"
            style={{
              background: selectedTemplate ? 'rgba(99,102,241,0.1)' : 'var(--bg-base)',
              border: `1px solid ${selectedTemplate ? 'var(--accent)' : 'var(--border)'}`,
              color: selectedTemplate ? 'var(--accent)' : 'var(--text-secondary)',
            }}
          >
            {selectedTemplate
              ? `Template: ${selectedTemplate.name}`
              : 'Selecciona un template de la lista ←'}
          </div>

          {/* Client selector */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Cliente
            </label>
            <input
              className="w-full px-3 py-2 rounded-lg text-sm border outline-none mb-1.5"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              placeholder="Buscar cliente..."
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
            />
            <div
              className="rounded-lg border overflow-hidden"
              style={{ borderColor: 'var(--border)', maxHeight: '140px', overflowY: 'auto' }}
            >
              {filteredClients.slice(0, 20).map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedClientId(c.id)}
                  className="w-full text-left px-3 py-2 text-sm flex items-center justify-between border-b"
                  style={{
                    borderColor: 'var(--border)',
                    background: selectedClientId === c.id ? 'rgba(99,102,241,0.1)' : 'var(--bg-base)',
                    borderLeft: selectedClientId === c.id ? '3px solid var(--accent)' : '3px solid transparent',
                    color: 'var(--text-primary)',
                  }}
                >
                  <span>{c.name}</span>
                  {c.city && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{c.city}</span>}
                </button>
              ))}
              {filteredClients.length === 0 && (
                <p className="px-3 py-3 text-sm text-center" style={{ color: 'var(--text-secondary)' }}>Sin clientes</p>
              )}
            </div>
          </div>

          {/* Stage + Language row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Etapa del pipeline
              </label>
              <select
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                value={stage}
                onChange={e => setStage(e.target.value)}
              >
                {PIPELINE_STAGES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Idioma
              </label>
              <div className="flex gap-1">
                {LANG_OPTIONS.map(l => (
                  <button
                    key={l.code}
                    onClick={() => setLanguage(l.code)}
                    className="flex-1 py-2 rounded-lg text-xs border transition-colors"
                    style={{
                      background: language === l.code ? 'var(--accent)' : 'var(--bg-base)',
                      borderColor: language === l.code ? 'var(--accent)' : 'var(--border)',
                      color: language === l.code ? 'white' : 'var(--text-secondary)',
                    }}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {genError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{genError}</p>}

          <button
            onClick={handleGenerate}
            disabled={generating || !selectedTemplate || !selectedClientId}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            <Wand2 size={15} />
            {generating ? 'Generando 3 variantes...' : 'Generar 3 variantes con IA'}
          </button>

          {/* Generated versions */}
          {versions.length > 0 && (
            <div className="space-y-3 pt-1">
              <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                3 variantes generadas — edita y copia la que prefieras:
              </p>
              {versions.map((v, i) => (
                <div key={i} className="rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                  <div
                    className="flex items-center justify-between px-3 py-1.5 border-b text-xs font-medium"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-base)' }}
                  >
                    <span>Variante {i + 1}</span>
                    <button
                      onClick={() => handleCopy(i)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded"
                      style={{ color: copiedIdx === i ? 'var(--success)' : 'var(--accent)' }}
                    >
                      {copiedIdx === i ? <Check size={12} /> : <Copy size={12} />}
                      {copiedIdx === i ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <textarea
                    className="w-full px-3 py-2 text-sm outline-none rounded-b-lg"
                    style={{
                      background: 'var(--bg-base)',
                      color: 'var(--text-primary)',
                      border: 'none',
                      resize: 'vertical',
                      minHeight: '80px',
                    }}
                    value={editedVersions[i] ?? v}
                    onChange={e => {
                      const next = [...editedVersions]
                      next[i] = e.target.value
                      setEditedVersions(next)
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

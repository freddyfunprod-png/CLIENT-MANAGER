import { useEffect, useState } from 'react'
import { MessageSquare, Copy, Check, Wand2 } from 'lucide-react'
import { getClients, getMessageTypes, generateMessage } from '../api'
import type { Client } from '../types'
import StatusBadge from '../components/StatusBadge'

export default function AIMessages() {
  const [clients, setClients] = useState<Client[]>([])
  const [messageTypes, setMessageTypes] = useState<{ key: string; label: string }[]>([])
  const [selectedClient, setSelectedClient] = useState<number | null>(null)
  const [messageType, setMessageType] = useState('')
  const [baseMessage, setBaseMessage] = useState('')
  const [extraContext, setExtraContext] = useState('')
  const [language, setLanguage] = useState('es')
  const [result, setResult] = useState('')
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    getClients().then(r => setClients(r.clients))
    getMessageTypes().then(r => {
      setMessageTypes(r.types)
      if (r.types.length) setMessageType(r.types[0].key)
    })
  }, [])

  const filteredClients = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  )

  const selectedClientData = clients.find(c => c.id === selectedClient)

  const handleGenerate = async () => {
    if (!selectedClient) { setError('Selecciona un cliente'); return }
    if (!messageType) { setError('Selecciona el tipo de mensaje'); return }
    setGenerating(true)
    setError('')
    setResult('')
    try {
      const res = await generateMessage(selectedClient, messageType, extraContext || undefined, language, baseMessage || undefined)
      setResult(res.message)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const whatsAppUrl = selectedClientData?.phone
    ? `https://wa.me/${selectedClientData.phone.replace(/\D/g, '')}?text=${encodeURIComponent(result)}`
    : null

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>💬 Mensajes IA</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Genera mensajes de WhatsApp personalizados con Gemini
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Config panel */}
        <div
          className="rounded-xl border p-5 space-y-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              1. Selecciona un cliente
            </label>
            <input
              className="w-full px-3 py-2 rounded-lg text-sm border outline-none mb-2"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              placeholder="Buscar cliente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div
              className="rounded-lg border overflow-hidden"
              style={{ borderColor: 'var(--border)', maxHeight: '180px', overflowY: 'auto' }}
            >
              {filteredClients.slice(0, 30).map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedClient(c.id)}
                  className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 border-b transition-colors"
                  style={{
                    borderColor: 'var(--border)',
                    background: selectedClient === c.id ? 'rgba(99,102,241,0.1)' : 'var(--bg-base)',
                    borderLeft: selectedClient === c.id ? '3px solid var(--accent)' : '3px solid transparent',
                  }}
                >
                  <div className="flex-1">
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</span>
                    {c.city && (
                      <span className="text-xs ml-2" style={{ color: 'var(--text-secondary)' }}>{c.city}</span>
                    )}
                  </div>
                  <StatusBadge status={c.status} size="sm" />
                </button>
              ))}
              {filteredClients.length === 0 && (
                <p className="px-3 py-4 text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
                  Sin clientes
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              2. Tipo de mensaje
            </label>
            <select
              className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              value={messageType}
              onChange={e => setMessageType(e.target.value)}
            >
              {messageTypes.map(t => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              3. Mensaje base (opcional)
            </label>
            <textarea
              className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              rows={3}
              placeholder="Hola [nombre], vi que tienen su negocio en [ciudad]... Pegá aquí tu mensaje base y la IA lo personalizará para cada cliente."
              value={baseMessage}
              onChange={e => setBaseMessage(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              4. Idioma del mensaje
            </label>
            <div className="flex gap-2">
              {[{ code: 'es', label: '🇪🇸 Español' }, { code: 'pt', label: '🇧🇷 Portugués' }, { code: 'en', label: '🇺🇸 Inglés' }].map(l => (
                <button
                  key={l.code}
                  onClick={() => setLanguage(l.code)}
                  className="flex-1 py-2 rounded-lg text-xs font-medium border transition-colors"
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

          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              5. Contexto adicional (opcional)
            </label>
            <textarea
              className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              rows={2}
              placeholder="Ej: ya hablamos la semana pasada, tiene interés en landing para dentistas..."
              value={extraContext}
              onChange={e => setExtraContext(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating || !selectedClient}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            <Wand2 size={16} />
            {generating ? 'Generando con Gemini...' : 'Generar Mensaje'}
          </button>
        </div>

        {/* Result panel */}
        <div
          className="rounded-xl border p-5 flex flex-col"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>Mensaje generado</h3>
            {result && (
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
                {whatsAppUrl && (
                  <a
                    href={whatsAppUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white"
                    style={{ background: '#22c55e' }}
                  >
                    <MessageSquare size={13} /> Enviar WA
                  </a>
                )}
              </div>
            )}
          </div>

          {generating ? (
            <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-secondary)' }}>
              <div className="text-center">
                <div className="text-2xl mb-2">✨</div>
                <p className="text-sm">Gemini está escribiendo...</p>
              </div>
            </div>
          ) : result ? (
            <div
              className="flex-1 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed"
              style={{
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                minHeight: '200px',
              }}
            >
              {result}
            </div>
          ) : (
            <div
              className="flex-1 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--bg-base)', border: '1px dashed var(--border)', minHeight: '200px' }}
            >
              <div className="text-center" style={{ color: 'var(--text-secondary)' }}>
                <p className="text-3xl mb-2">✍️</p>
                <p className="text-sm">El mensaje aparecerá aquí</p>
              </div>
            </div>
          )}

          {selectedClientData && (
            <div
              className="mt-3 rounded-lg px-3 py-2.5 text-xs"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>Cliente: </span>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{selectedClientData.name}</span>
              {selectedClientData.rating && (
                <span style={{ color: 'var(--text-secondary)' }}> · ⭐ {selectedClientData.rating}</span>
              )}
              {selectedClientData.category && (
                <span style={{ color: 'var(--text-secondary)' }}> · {selectedClientData.category}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

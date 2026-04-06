/**
 * LeadsDetector — pestaña integrada en client-manager-v2
 * Conecta al backend del detector-leads en puerto 8001.
 * Muestra un iframe embebido o una UI liviana si el servicio no está corriendo.
 */
import { useState, useEffect } from 'react'
import { Zap, ExternalLink, AlertCircle } from 'lucide-react'

const DETECTOR_URL = (import.meta.env.VITE_DETECTOR_URL as string | undefined) ?? 'http://localhost:8001'

export default function LeadsDetector() {
  const [available, setAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    fetch(`${DETECTOR_URL}/api/health`)
      .then(r => setAvailable(r.ok))
      .catch(() => setAvailable(false))
  }, [])

  if (available === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!available) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
        <div className="w-14 h-14 bg-orange-500/10 rounded-2xl flex items-center justify-center">
          <AlertCircle size={28} className="text-orange-500" />
        </div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          Detector de Leads no está activo
        </h2>
        <p className="text-sm max-w-sm" style={{ color: 'var(--text-muted)' }}>
          El servicio no está corriendo en{' '}
          <code className="text-orange-400 bg-orange-500/10 px-1 rounded">localhost:8001</code>.
          Abrí{' '}
          <code className="text-orange-400 bg-orange-500/10 px-1 rounded">start.bat</code>{' '}
          en la carpeta del detector-leads para iniciarlo.
        </p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => fetch(`${DETECTOR_URL}/api/health`).then(r => setAvailable(r.ok)).catch(() => setAvailable(false))}
            className="text-sm px-4 py-2 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 rounded-lg transition-colors"
          >
            Reintentar
          </button>
          <a
            href={DETECTOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            <ExternalLink size={14} />
            Abrir en ventana
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-orange-400" />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Detector de Leads Calientes
          </span>
          <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
            Activo
          </span>
        </div>
        <a
          href={DETECTOR_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs hover:text-orange-400 transition-colors"
          style={{ color: 'var(--text-muted)' }}
        >
          <ExternalLink size={12} />
          Abrir completo
        </a>
      </div>

      {/* Iframe */}
      <iframe
        src={DETECTOR_URL}
        className="flex-1 w-full border-0"
        title="Detector de Leads Calientes"
      />
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { camillaAPI, type CamillaConfig } from '@/lib/camillaAPI'
import { Card } from '@/components/ui/Card'

interface PipelineStep {
  type: 'Filter' | 'Mixer'
  channel?: number
  names?: string[]
  name?: string
  bypassed?: boolean
}

export function Pipeline() {
  const [config, setConfig] = useState<CamillaConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    try {
      const cfg = await camillaAPI.getConfig()
      setConfig(cfg)
    } catch {
      setMessage('Sin conexión al engine')
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const pipeline = (config?.pipeline as PipelineStep[]) ?? []
  const filters = Object.keys((config?.filters as Record<string, unknown>) ?? {})
  const mixers = Object.keys((config?.mixers as Record<string, unknown>) ?? {})

  const moveStep = (idx: number, direction: 'up' | 'down') => {
    if (!config) return
    const p = [...pipeline]
    const swap = direction === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= p.length) return;
    [p[idx], p[swap]] = [p[swap], p[idx]]
    setConfig({ ...config, pipeline: p })
  }

  const toggleBypass = (idx: number) => {
    if (!config) return
    const p = pipeline.map((s, i) =>
      i === idx ? { ...s, bypassed: !s.bypassed } : s
    )
    setConfig({ ...config, pipeline: p })
  }

  const removeStep = (idx: number) => {
    if (!config) return
    setConfig({ ...config, pipeline: pipeline.filter((_, i) => i !== idx) })
  }

  const addFilter = (filterName: string) => {
    if (!config) return
    const step: PipelineStep = { type: 'Filter', channel: 0, names: [filterName] }
    setConfig({ ...config, pipeline: [...pipeline, step] })
  }

  const addMixer = (mixerName: string) => {
    if (!config) return
    const step: PipelineStep = { type: 'Mixer', name: mixerName }
    setConfig({ ...config, pipeline: [...pipeline, step] })
  }

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    try {
      const v = await camillaAPI.validateConfig(config)
      if (v.result !== 'Ok') { setMessage(`Error: ${v.error ?? v.result}`); return }
      await camillaAPI.setConfig(config)
      setMessage('Pipeline aplicado')
    } catch (e) { setMessage(`Error: ${e}`) }
    finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Pipeline visual */}
      <Card title="Signal Chain">
        {pipeline.length === 0 ? (
          <div className="text-sm text-[#55556a] text-center py-6">
            El pipeline está vacío. Agrega filtros o mixers desde abajo.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Entrada */}
            <div className="flex items-center gap-2">
              <div className="w-20 text-center text-xs bg-[#22c55e20] border border-[#22c55e40] rounded py-1.5 text-[#22c55e] font-medium">
                CAPTURE
              </div>
              <div className="flex-1 h-px bg-[#2a2a38]" />
            </div>

            {pipeline.map((step, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="w-4 flex flex-col items-center">
                  <div className="flex-1 w-px bg-[#2a2a38]" />
                </div>

                <div
                  className={`flex-1 flex items-center justify-between px-3 py-2 rounded-lg border transition-colors ${
                    step.bypassed
                      ? 'bg-[#1e1e28] border-[#2a2a38] opacity-50'
                      : step.type === 'Filter'
                      ? 'bg-[#6366f110] border-[#6366f140]'
                      : 'bg-[#eab30810] border-[#eab30840]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        step.type === 'Filter'
                          ? 'bg-[#6366f130] text-[#6366f1]'
                          : 'bg-[#eab30830] text-[#eab308]'
                      }`}
                    >
                      {step.type.toUpperCase()}
                    </span>
                    <div>
                      <div className="text-sm text-[#f0f0ff] font-medium">
                        {step.type === 'Filter'
                          ? (step.names ?? []).join(', ')
                          : step.name}
                      </div>
                      {step.type === 'Filter' && step.channel !== undefined && (
                        <div className="text-[10px] text-[#55556a]">
                          Channel {step.channel + 1}
                        </div>
                      )}
                    </div>
                    {step.bypassed && (
                      <span className="text-[10px] text-[#55556a] bg-[#1e1e28] px-1.5 py-0.5 rounded">
                        BYPASSED
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveStep(idx, 'up')}
                      disabled={idx === 0}
                      className="w-6 h-6 flex items-center justify-center text-[#55556a] hover:text-[#f0f0ff] disabled:opacity-20 rounded transition-colors"
                      title="Mover arriba"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveStep(idx, 'down')}
                      disabled={idx === pipeline.length - 1}
                      className="w-6 h-6 flex items-center justify-center text-[#55556a] hover:text-[#f0f0ff] disabled:opacity-20 rounded transition-colors"
                      title="Mover abajo"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => toggleBypass(idx)}
                      className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                        step.bypassed
                          ? 'text-[#6366f1] hover:text-[#f0f0ff]'
                          : 'text-[#55556a] hover:text-[#eab308]'
                      }`}
                      title={step.bypassed ? 'Activar' : 'Bypass'}
                    >
                      ⊘
                    </button>
                    <button
                      onClick={() => removeStep(idx)}
                      className="w-6 h-6 flex items-center justify-center text-[#55556a] hover:text-[#ef4444] rounded transition-colors"
                      title="Eliminar"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Salida */}
            <div className="flex items-center gap-2">
              <div className="w-4 flex flex-col items-center">
                <div className="flex-1 w-px bg-[#2a2a38]" />
              </div>
              <div className="w-20 text-center text-xs bg-[#6366f120] border border-[#6366f140] rounded py-1.5 text-[#6366f1] font-medium">
                PLAYBACK
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Agregar pasos */}
      <div className="grid grid-cols-2 gap-4">
        <Card title="Add Filter">
          <div className="flex flex-col gap-2">
            {filters.length === 0 ? (
              <span className="text-xs text-[#55556a]">No hay filtros definidos</span>
            ) : (
              filters.map((name) => (
                <button
                  key={name}
                  onClick={() => addFilter(name)}
                  className="text-left px-3 py-1.5 rounded-md text-sm text-[#8888aa] bg-[#111118] border border-[#2a2a38] hover:border-[#6366f1] hover:text-[#f0f0ff] transition-colors"
                >
                  + {name}
                </button>
              ))
            )}
          </div>
        </Card>

        <Card title="Add Mixer">
          <div className="flex flex-col gap-2">
            {mixers.length === 0 ? (
              <span className="text-xs text-[#55556a]">No hay mixers definidos</span>
            ) : (
              mixers.map((name) => (
                <button
                  key={name}
                  onClick={() => addMixer(name)}
                  className="text-left px-3 py-1.5 rounded-md text-sm text-[#8888aa] bg-[#111118] border border-[#2a2a38] hover:border-[#eab308] hover:text-[#f0f0ff] transition-colors"
                >
                  + {name}
                </button>
              ))
            )}
          </div>
        </Card>
      </div>

      {message && (
        <div className={`text-sm px-3 py-2 rounded-lg ${message.startsWith('Error') ? 'bg-[#ef444420] text-[#ef4444]' : 'bg-[#22c55e20] text-[#22c55e]'}`}>
          {message}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="self-start px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {saving ? 'Aplicando...' : 'Apply Pipeline'}
      </button>
    </div>
  )
}

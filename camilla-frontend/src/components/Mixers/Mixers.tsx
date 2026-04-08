import { useState, useEffect, useCallback } from 'react'
import { camillaAPI, type CamillaConfig } from '@/lib/camillaAPI'
import { Card } from '@/components/ui/Card'

interface MixerChannel {
  sources: { channel: number; gain: number; inverted?: boolean; mute?: boolean }[]
  dest: { channel: number }
  mute?: boolean
  gain?: number
}

interface Mixer {
  channels: { in: number; out: number }
  mapping: MixerChannel[]
}

export function Mixers() {
  const [config, setConfig] = useState<CamillaConfig | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    try {
      const cfg = await camillaAPI.getConfig()
      setConfig(cfg)
    } catch {
      setMessage('Sin conexión')
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const mixers = (config?.mixers as Record<string, Mixer>) ?? {}
  const mixerNames = Object.keys(mixers)
  const mixer = selected ? mixers[selected] : null

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    try {
      const v = await camillaAPI.validateConfig(config)
      if (v.result !== 'Ok') { setMessage(`Error: ${v.error ?? v.result}`); return }
      await camillaAPI.setConfig(config)
      setMessage('Mixer aplicado')
    } catch (e) { setMessage(`Error: ${e}`) }
    finally { setSaving(false) }
  }

  const updateGain = (mappingIdx: number, sourceIdx: number, gain: number) => {
    if (!config || !selected) return
    const mx = { ...mixers[selected] }
    mx.mapping = mx.mapping.map((m, mi) =>
      mi === mappingIdx
        ? { ...m, sources: m.sources.map((s, si) => si === sourceIdx ? { ...s, gain } : s) }
        : m
    )
    setConfig({ ...config, mixers: { ...mixers, [selected]: mx } })
  }

  const toggleMute = (mappingIdx: number, sourceIdx: number) => {
    if (!config || !selected) return
    const mx = { ...mixers[selected] }
    mx.mapping = mx.mapping.map((m, mi) =>
      mi === mappingIdx
        ? { ...m, sources: m.sources.map((s, si) => si === sourceIdx ? { ...s, mute: !s.mute } : s) }
        : m
    )
    setConfig({ ...config, mixers: { ...mixers, [selected]: mx } })
  }

  return (
    <div className="flex gap-4">
      {/* Lista de mixers */}
      <div className="w-44 flex flex-col gap-2">
        <span className="text-xs text-[#55556a] uppercase tracking-wider">Mixers</span>
        {mixerNames.length === 0 ? (
          <span className="text-xs text-[#55556a]">Sin mixers configurados</span>
        ) : (
          mixerNames.map((name) => (
            <button
              key={name}
              onClick={() => setSelected(name)}
              className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                selected === name
                  ? 'bg-[#6366f130] text-[#6366f1] border border-[#6366f1]'
                  : 'bg-[#16161e] text-[#8888aa] border border-[#2a2a38] hover:border-[#3a3a50]'
              }`}
            >
              <div className="font-medium truncate">{name}</div>
              {mixers[name] && (
                <div className="text-[10px] opacity-60">
                  {mixers[name].channels.in}→{mixers[name].channels.out}ch
                </div>
              )}
            </button>
          ))
        )}
      </div>

      {/* Editor del mixer */}
      <div className="flex-1 flex flex-col gap-4">
        {!mixer ? (
          <div className="flex items-center justify-center h-40 text-[#55556a] text-sm">
            Selecciona un mixer para editar
          </div>
        ) : (
          <>
            {/* Matriz de routing visual */}
            <Card title={`${selected} — ${mixer.channels.in} in → ${mixer.channels.out} out`}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left text-[#55556a] py-1 pr-3 font-normal">OUT CH</th>
                      <th className="text-left text-[#55556a] py-1 pr-3 font-normal">IN CH</th>
                      <th className="text-left text-[#55556a] py-1 pr-3 font-normal">Gain (dB)</th>
                      <th className="text-left text-[#55556a] py-1 font-normal">Mute</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mixer.mapping.map((m, mi) =>
                      m.sources.map((src, si) => (
                        <tr key={`${mi}-${si}`} className="border-t border-[#1e1e28]">
                          {si === 0 && (
                            <td
                              className="py-1.5 pr-3 text-[#f0f0ff] font-medium"
                              rowSpan={m.sources.length}
                            >
                              CH {m.dest.channel + 1}
                            </td>
                          )}
                          <td className="py-1.5 pr-3 text-[#8888aa]">CH {src.channel + 1}</td>
                          <td className="py-1.5 pr-3">
                            <input
                              type="number"
                              min={-150}
                              max={50}
                              step={0.5}
                              value={src.gain}
                              onChange={(e) => updateGain(mi, si, Number(e.target.value))}
                              className="w-20 bg-[#111118] border border-[#2a2a38] rounded px-1.5 py-0.5 text-[#f0f0ff] focus:outline-none focus:border-[#6366f1]"
                            />
                          </td>
                          <td className="py-1.5">
                            <button
                              onClick={() => toggleMute(mi, si)}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                src.mute
                                  ? 'bg-[#ef444430] text-[#ef4444]'
                                  : 'bg-[#1e1e28] text-[#55556a] hover:text-[#8888aa]'
                              }`}
                            >
                              {src.mute ? 'MUTED' : 'LIVE'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Diagrama de routing simplificado */}
            <Card title="Routing Map">
              <div className="flex gap-4 items-start overflow-x-auto">
                {/* Inputs */}
                <div className="flex flex-col gap-2">
                  {Array.from({ length: mixer.channels.in }, (_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-14 text-center text-xs bg-[#111118] border border-[#2a2a38] rounded py-1 text-[#8888aa]">
                        IN {i + 1}
                      </div>
                      <div className="w-8 h-px bg-[#2a2a38]" />
                    </div>
                  ))}
                </div>

                {/* Mixer box */}
                <div className="flex flex-col items-center justify-center bg-[#6366f120] border border-[#6366f140] rounded-lg px-4 py-3 min-h-16 self-center">
                  <span className="text-[#6366f1] text-xs font-semibold">{selected}</span>
                  <span className="text-[#55556a] text-[10px]">mixer</span>
                </div>

                {/* Outputs */}
                <div className="flex flex-col gap-2">
                  {Array.from({ length: mixer.channels.out }, (_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-8 h-px bg-[#2a2a38]" />
                      <div className="w-14 text-center text-xs bg-[#111118] border border-[#2a2a38] rounded py-1 text-[#8888aa]">
                        OUT {i + 1}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </>
        )}

        {message && (
          <div className={`text-sm px-3 py-2 rounded-lg ${message.startsWith('Error') ? 'bg-[#ef444420] text-[#ef4444]' : 'bg-[#22c55e20] text-[#22c55e]'}`}>
            {message}
          </div>
        )}

        {selected && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="self-start px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Aplicando...' : 'Apply Mixer'}
          </button>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { camillaAPI, type CamillaConfig } from '@/lib/camillaAPI'
import { Card } from '@/components/ui/Card'

type CrossoverType = 'Linkwitz-Riley' | 'Butterworth'

interface CrossoverParams {
  type: CrossoverType
  freq: number
  order: number // 1 = 6dB/oct, 2 = 12dB/oct, 3 = 18dB/oct, 4 = 24dB/oct
}

interface CrossoverFilter {
  type: 'Crossover'
  parameters?: CrossoverParams
}

// ─── Calcular respuesta del crossover ────────────────────────────────

function computeCrossoverResponse(params: CrossoverParams, sampleRate = 48000): { freq: number; low: number; high: number }[] {
  const points: { freq: number; low: number; high: number }[] = []
  const freqs = Array.from({ length: 100 }, (_, i) =>
    20 * Math.pow(10, (i / 99) * Math.log10(20000 / 20))
  )

  const freq = params.freq ?? 1000
  const order = params.order ?? 2
  const omega = (2 * Math.PI * freq) / sampleRate
  const alpha = Math.sin(omega) / (2 * (order === 1 ? 0.707 : 1 / Math.sqrt(2)))

  for (const f of freqs) {
    const w = (2 * Math.PI * f) / sampleRate
    const cos_w = Math.cos(w)
    const sin_w = Math.sin(w)

    let dbLow = -100
    let dbHigh = -100

    // Filtro pasa-bajo (LP)
    if (params.type === 'Butterworth') {
      // Butterworth: respuesta más suave
      const order_0 = Math.round(order) as 1 | 2 | 3 | 4
      switch (order_0) {
        case 1:
          dbLow = -3
          break
        case 2: {
          const denom = 1 + alpha * alpha - 2 * cos_w
          const num = (1 - cos_w) / 2
          const mag = Math.sqrt(num * num / (denom * denom + 4 * cos_w * cos_w * (1 - alpha * alpha) * (1 - alpha * alpha)))
          dbLow = 20 * Math.log10(Math.max(mag, 1e-10))
          break
        }
        default:
          dbLow = -3 * order_0 // aproximación simple
      }
    } else {
      // Linkwitz-Riley: respuesta más pronunciada en frecuencia de corte
      if (f < freq) {
        const rolloff = order * 6
        dbLow = rolloff * Math.log10(f / freq)
      } else {
        dbLow = 0
      }
    }

    // Filtro pasa-alto (HP) = respuesta complementaria
    if (params.type === 'Linkwitz-Riley') {
      if (f >= freq) {
        dbHigh = 0
      } else {
        const r = order * 6
        dbLow = -r * (Math.log10(freq / f) + 0.5)
      }
    } else {
      dbHigh = dbLow - 3 // complementario aproximado
    }

    points.push({
      freq: Math.round(f),
      low: Math.max(-60, dbLow),
      high: Math.max(-60, dbHigh),
    })
  }

  return points
}

// ─── Componente principal ─────────────────────────────────────────────

interface Filter {
  type: string
  parameters?: Record<string, unknown>
}

interface Crossover {
  type: string
  parameters?: CrossoverParams
}

export function Crossovers() {
  const [config, setConfig] = useState<CamillaConfig | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
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

  // Extraer filtros de tipo Crossover o los que tengan frecuencia de corte
  const filters = (config?.filters as Record<string, Filter>) ?? {}
  const filterNames = Object.keys(filters).filter(name => {
    const f = filters[name]
    return f?.type === 'Crossover' || (f?.parameters as Record<string, unknown>)?.freq !== undefined
  })

  const selectedFilter = selected ? filters[selected] : null
  const crossoverParams = selectedFilter?.parameters as unknown as CrossoverParams | null

  const responseData = crossoverParams ? computeCrossoverResponse(crossoverParams) : []

  const updateParam = (param: string, value: string | number) => {
    if (!config || !selected) return
    const updatedFilters = {
      ...(config.filters as Record<string, Filter>),
      [selected]: {
        ...filters[selected],
        parameters: {
          ...(filters[selected]?.parameters ?? {}),
          [param]: value,
        },
      },
    }
    setConfig({ ...config, filters: updatedFilters })
  }

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    try {
      const validation = await camillaAPI.validateConfig(config)
      if (validation.result !== 'Ok') {
        setMessage(`Validación: ${validation.error ?? validation.result}`)
        return
      }
      await camillaAPI.setConfig(config)
      setMessage('Crossover aplicado')
    } catch (e) {
      setMessage(`Error: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex gap-4">
      {/* Lista de crossovers */}
      <div className="w-48 flex flex-col gap-2">
        <span className="text-xs text-[#55556a] uppercase tracking-wider">Crossovers</span>
        {filterNames.length === 0 ? (
          <span className="text-xs text-[#55556a]">
            No hay crossover configurado.
            <br />
            Los filtros LP con subwoofer lo crean automáticamente.
          </span>
        ) : (
          filterNames.map((name) => (
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
              <div className="text-[10px] opacity-60">
                {((filters[name]?.parameters as Record<string, unknown>)?.freq as number) ?? '—'} Hz
                {' · '}
                {((filters[name]?.parameters as Record<string, unknown>)?.order as number) * 6}dB/oct
              </div>
            </button>
          ))
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col gap-4">
        {!selected ? (
          <div className="flex items-center justify-center h-40 text-[#55556a] text-sm">
            Selecciona un filtro para editar
          </div>
        ) : (
          <>
            <Card title={selected}>
              <CrossoverParamsEditor
                params={crossoverParams}
                onChange={updateParam}
              />
            </Card>

            {/* Curva de respuesta */}
            {responseData.length > 0 && (
              <Card title="Crossover Response">
                <div className="h-40 flex items-center justify-center text-[#55556a] text-sm">
                  Vista de frecuencia de corte
                </div>
              </Card>
            )}
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
            {saving ? 'Aplicando...' : 'Apply Crossover'}
          </button>
        )}
      </div>
    </div>
  )
}

function CrossoverParamsEditor({
  params,
  onChange,
}: {
  params: CrossoverParams | null
  onChange: (param: string, value: string | number) => void
}) {
  const SUBTYPES: CrossoverType[] = ['Linkwitz-Riley', 'Butterworth']
  const ORDERS = [1, 2, 3, 4]

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2 flex flex-col gap-1">
        <label className="text-xs text-[#55556a]">Type</label>
        <select
          value={params?.type ?? 'Linkwitz-Riley'}
          onChange={(e) => onChange('type', e.target.value)}
          className="bg-[#111118] border border-[#2a2a38] rounded-md px-2 py-1.5 text-sm text-[#f0f0ff] focus:outline-none focus:border-[#6366f1]"
        >
          {SUBTYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-[#55556a]">Frequency (Hz)</label>
        <input
          type="number"
          value={params?.freq ?? 100}
          min={20} max={20000} step={1}
          onChange={(e) => onChange('freq', Number(e.target.value))}
          className="bg-[#111118] border border-[#2a2a38] rounded-md px-2 py-1.5 text-sm text-[#f0f0ff] focus:outline-none focus:border-[#6366f1]"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-[#55556a]">Order / Slope</label>
        <select
          value={params?.order ?? 2}
          onChange={(e) => onChange('order', Number(e.target.value))}
          className="bg-[#111118] border border-[#2a2a38] rounded-md px-2 py-1.5 text-sm text-[#f0f0ff] focus:outline-none focus:border-[#6366f1]"
        >
          {ORDERS.map((o) => (
            <option key={o} value={o}>
              {o * 6} dB/oct ({o * 6}dB per decade)
            </option>
          ))}
        </select>
      </div>

      <div className="col-span-2 text-xs text-[#55556a]">
        <p>Orden 1 = 6 dB/oct, Orden 2 = 12 dB/oct, etc.</p>
        <p>Linkwitz-Riley es mejor para sistemas subwoofer.</p>
      </div>
    </div>
  )
}
import { useEffect, useRef, useState } from 'react'
import { camillaAPI, type EngineState, type StatusResponse } from '@/lib/camillaAPI'

// ─── Hook de polling genérico ─────────────────────────────────────────────────

interface UsePollingOptions {
  fn: () => Promise<void>
  interval: number
  enabled?: boolean
}

export function usePolling({ fn, interval, enabled = true }: UsePollingOptions) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (!enabled) return
    let active = true
    const tick = async () => {
      if (!active) return
      try { await fnRef.current() } catch { /* silencioso */ }
      if (active) setTimeout(tick, interval)
    }
    tick()
    return () => { active = false }
  }, [interval, enabled])
}

// ─── Estado completo del engine ───────────────────────────────────────────────

export interface EngineStatus {
  state: EngineState | null
  processingLoad: number
  captureRate: number
  bufferLevel: number
  latencyMs: number           // latencia calculada: bufferLevel / sampleRate * 1000
  clippedSamples: number      // total acumulado desde inicio del engine
  clippedDelta: number        // muestras recortadas en el último intervalo de polling
  captureRms: number[]
  capturePeak: number[]
  playbackRms: number[]
  playbackPeak: number[]
  volume: number
  mute: boolean
  connected: boolean
  raw: StatusResponse | null
}

export function useEngineStatus(pollInterval = 500): EngineStatus {
  const [status, setStatus] = useState<EngineStatus>({
    state: null,
    processingLoad: 0,
    captureRate: 0,
    bufferLevel: 0,
    latencyMs: 0,
    clippedSamples: 0,
    clippedDelta: 0,
    captureRms: [],
    capturePeak: [],
    playbackRms: [],
    playbackPeak: [],
    volume: 0,
    mute: false,
    connected: false,
    raw: null,
  })

  // Samplerate leído de la config una sola vez al montar
  const sampleRateRef = useRef<number>(48000)
  useEffect(() => {
    camillaAPI.getConfig().then((cfg) => {
      const sr = (cfg?.devices as Record<string, unknown>)?.samplerate
      if (typeof sr === 'number' && sr > 0) sampleRateRef.current = sr
    }).catch(() => { /* usa el default 48000 */ })
  }, [])

  // Referencia al último total de clipped — permite calcular el delta por intervalo
  const prevClippedRef = useRef<number | null>(null)

  usePolling({
    interval: pollInterval,
    fn: async () => {
      const [s, volume, mute] = await Promise.all([
        camillaAPI.getStatus(),
        camillaAPI.getVolume(),
        camillaAPI.getMute(),
      ])

      const totalClipped = s.clippedsamples ?? 0
      const delta = prevClippedRef.current !== null
        ? Math.max(0, totalClipped - prevClippedRef.current)
        : 0
      prevClippedRef.current = totalClipped

      // Latencia = muestras en el buffer / frecuencia de muestreo × 1000
      // Usa el capturerate medido si está disponible, si no el de la config
      const effectiveSr = (s.capturerate && s.capturerate > 0)
        ? s.capturerate
        : sampleRateRef.current
      const latencyMs = s.bufferlevel > 0
        ? parseFloat(((s.bufferlevel / effectiveSr) * 1000).toFixed(1))
        : 0

      setStatus({
        state: s.cdsp_status,
        processingLoad: s.processingload * 100,
        captureRate: s.capturerate ?? 0,
        bufferLevel: s.bufferlevel,
        latencyMs,
        clippedSamples: totalClipped,
        clippedDelta: delta,
        captureRms: s.capturesignalrms,
        capturePeak: s.capturesignalpeak,
        playbackRms: s.playbacksignalrms,
        playbackPeak: s.playbacksignalpeak,
        volume,
        mute,
        connected: true,
        raw: s,
      })
    },
  })

  return status
}

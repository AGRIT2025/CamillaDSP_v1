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
  clippedSamples: number
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
    clippedSamples: 0,
    captureRms: [],
    capturePeak: [],
    playbackRms: [],
    playbackPeak: [],
    volume: 0,
    mute: false,
    connected: false,
    raw: null,
  })

  usePolling({
    interval: pollInterval,
    fn: async () => {
      const [s, volume, mute] = await Promise.all([
        camillaAPI.getStatus(),
        camillaAPI.getVolume(),
        camillaAPI.getMute(),
      ])
      setStatus({
        state: s.cdsp_status,
        processingLoad: s.processingload * 100,
        captureRate: s.capturerate ?? 0,
        bufferLevel: s.bufferlevel,
        clippedSamples: s.clippedsamples,
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

import { useEffect, useRef, useCallback, useState } from 'react'

export type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface UseWebSocketOptions {
  url: string
  onMessage?: (data: unknown) => void
  reconnectDelay?: number
  enabled?: boolean
}

export function useWebSocket({ url, onMessage, reconnectDelay = 3000, enabled = true }: UseWebSocketOptions) {
  const [status, setStatus] = useState<WsStatus>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    if (!enabled) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setStatus('connected')

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        onMessageRef.current?.(data)
      } catch {
        onMessageRef.current?.(event.data)
      }
    }

    ws.onerror = () => setStatus('error')

    ws.onclose = () => {
      setStatus('disconnected')
      if (enabled) {
        reconnectTimer.current = setTimeout(connect, reconnectDelay)
      }
    }
  }, [url, reconnectDelay, enabled])

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        typeof data === 'string' ? data : JSON.stringify(data)
      )
    }
  }, [])

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    wsRef.current?.close()
    wsRef.current = null
    setStatus('disconnected')
  }, [])

  useEffect(() => {
    if (enabled) connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect, enabled])

  return { status, send, disconnect, reconnect: connect }
}

// ─── Hook de polling para métricas en tiempo real ────────────────────────────

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
      try {
        await fnRef.current()
      } catch {
        // silencioso — el componente maneja el estado de conexión
      }
      if (active) setTimeout(tick, interval)
    }

    tick()
    return () => { active = false }
  }, [interval, enabled])
}

// ─── Hook combinado para estado del engine CamillaDSP ─────────────────────────

import { useState as useStateHook } from 'react'
import { camillaAPI, type EngineState, type SignalLevels } from '@/lib/camillaAPI'

export interface EngineStatus {
  state: EngineState | null
  processingLoad: number
  captureRate: number
  bufferLevel: number
  clippedSamples: number
  signalLevels: SignalLevels | null
  volume: number
  mute: boolean
  connected: boolean
}

export function useEngineStatus(pollInterval = 500) {
  const [status, setStatus] = useStateHook<EngineStatus>({
    state: null,
    processingLoad: 0,
    captureRate: 0,
    bufferLevel: 0,
    clippedSamples: 0,
    signalLevels: null,
    volume: 0,
    mute: false,
    connected: false,
  })

  usePolling({
    interval: pollInterval,
    fn: async () => {
      const [state, load, rate, buffer, clipped, levels, volume, mute] = await Promise.all([
        camillaAPI.getState(),
        camillaAPI.getProcessingLoad(),
        camillaAPI.getCaptureRate(),
        camillaAPI.getBufferLevel(),
        camillaAPI.getClippedSamples(),
        camillaAPI.getSignalLevels(),
        camillaAPI.getVolume(),
        camillaAPI.getMute(),
      ])
      setStatus({
        state,
        processingLoad: load,
        captureRate: rate,
        bufferLevel: buffer,
        clippedSamples: clipped,
        signalLevels: levels,
        volume,
        mute,
        connected: true,
      })
    },
  })

  return status
}

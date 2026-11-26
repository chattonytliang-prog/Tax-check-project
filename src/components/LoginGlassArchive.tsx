import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { paintGlassArchive } from './loginGlassArchiveScene'
import './LoginGlassArchive.css'

export function LoginGlassArchive() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playbackRef = useRef<((paused: boolean) => void) | null>(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const motion = window.matchMedia('(min-width: 721px) and (prefers-reduced-motion: no-preference)')
    let width = 0
    let height = 0
    let time = 0
    let frame = 0
    let lastFrame: number | undefined
    let manuallyPaused = false

    const draw = () => { if (width && height) paintGlassArchive(ctx, width, height, time) }
    const tick = (now: number) => {
      if (lastFrame === undefined || now - lastFrame >= 30) {
        if (lastFrame !== undefined) time += Math.min(now - lastFrame, 65) / 1000
        lastFrame = now
        draw()
      }
      frame = requestAnimationFrame(tick)
    }
    const syncPlayback = () => {
      cancelAnimationFrame(frame)
      lastFrame = undefined
      if (!manuallyPaused && motion.matches && !document.hidden && width && height) frame = requestAnimationFrame(tick)
    }
    const resize = () => {
      width = canvas.clientWidth
      height = canvas.clientHeight
      if (width && height) {
        const ratio = Math.min(window.devicePixelRatio || 1, 1.65, Math.sqrt(2_200_000 / (width * height)))
        canvas.width = Math.max(1, Math.round(width * ratio))
        canvas.height = Math.max(1, Math.round(height * ratio))
        draw()
      }
      syncPlayback()
    }

    playbackRef.current = (next) => { manuallyPaused = next; syncPlayback() }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    motion.addEventListener('change', syncPlayback)
    document.addEventListener('visibilitychange', syncPlayback)
    return () => {
      playbackRef.current = null
      observer.disconnect()
      cancelAnimationFrame(frame)
      motion.removeEventListener('change', syncPlayback)
      document.removeEventListener('visibilitychange', syncPlayback)
    }
  }, [])

  return (
    <div className="login-glass-archive">
      <canvas ref={canvasRef} aria-hidden="true" />
      <button className="login-archive-toggle" type="button" onClick={() => {
        const next = !paused
        playbackRef.current?.(next)
        setPaused(next)
      }}>
        {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
        <span>{paused ? '播放背景' : '暂停背景'}</span>
      </button>
    </div>
  )
}

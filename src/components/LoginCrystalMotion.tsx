import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { makeCrystalScene, paintCrystalScene } from './loginCrystalScene'
import './LoginCrystalMotion.css'

export function LoginCrystalMotion() {
  const rootRef = useRef<HTMLDivElement>(null)
  const farRef = useRef<HTMLCanvasElement>(null)
  const nearRef = useRef<HTMLCanvasElement>(null)
  const timeRef = useRef(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const root = rootRef.current
    const far = farRef.current?.getContext('2d')
    const near = nearRef.current?.getContext('2d')
    if (!root || !far || !near) return

    const motion = window.matchMedia('(min-width: 721px) and (prefers-reduced-motion: no-preference)')
    let width = 0
    let height = 0
    let scene = makeCrystalScene(false)
    let frame = 0
    let lastPaint: number | undefined

    function draw() {
      if (far && near && width && height) paintCrystalScene(far, near, scene, width, height, timeRef.current)
    }

    function tick(now: number) {
      if (lastPaint === undefined || now - lastPaint >= 32) {
        if (lastPaint !== undefined) timeRef.current += Math.min(now - lastPaint, 65) / 1000
        lastPaint = now
        draw()
      }
      frame = requestAnimationFrame(tick)
    }

    function syncPlayback() {
      cancelAnimationFrame(frame)
      lastPaint = undefined
      if (!paused && motion.matches && !document.hidden && width && height) {
        frame = requestAnimationFrame(tick)
      }
    }

    function resize() {
      if (!root || !far || !near) return
      const nextWidth = root.clientWidth
      const nextHeight = root.clientHeight
      if (!nextWidth || !nextHeight) return

      width = nextWidth
      height = nextHeight
      scene = makeCrystalScene(width <= 720)
      const ratio = Math.min(window.devicePixelRatio || 1, 1.7, Math.sqrt(2_600_000 / (width * height)))
      for (const [context, scale] of [[far, Math.min(ratio, 0.8)], [near, ratio]] as const) {
        context.canvas.width = Math.max(1, Math.round(width * scale))
        context.canvas.height = Math.max(1, Math.round(height * scale))
        context.setTransform(context.canvas.width / width, 0, 0, context.canvas.height / height, 0, 0)
      }
      draw()
      syncPlayback()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(root)
    motion.addEventListener('change', syncPlayback)
    document.addEventListener('visibilitychange', syncPlayback)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      motion.removeEventListener('change', syncPlayback)
      document.removeEventListener('visibilitychange', syncPlayback)
    }
  }, [paused])

  return (
    <div className="login-crystal-motion" ref={rootRef}>
      <canvas className="login-crystal-far" ref={farRef} aria-hidden="true" />
      <canvas className="login-crystal-near" ref={nearRef} aria-hidden="true" />
      <button
        type="button"
        className="login-crystal-toggle"
        onClick={() => setPaused((value) => !value)}
      >
        {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
        <span>{paused ? '播放背景' : '暂停背景'}</span>
      </button>
    </div>
  )
}

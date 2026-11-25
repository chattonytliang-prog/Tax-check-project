type Point = readonly [number, number]
type Shard = {
  phase: number
  across: number
  size: number
  drift: number
  roll: number
  turn: number
  depth: number
  tint: number
  points: Point[]
}

type CrystalScene = {
  bands: Shard[][]
  marks: Array<{ x: number; y: number; weight: number; cross: boolean }>
}

const tau = Math.PI * 2
const hulls: Point[][] = [
  [[-1, -.22], [-.28, -.58], [.87, -.38], [.58, .43], [-.55, .51]],
  [[-1, -.39], [.91, -.19], [.25, .56], [-.56, .39]],
  [[-.89, -.46], [.51, -.50], [.93, -.10], [.30, .49], [-.63, .35]],
  [[-.9, -.09], [.51, -.51], [.96, .33], [-.37, .52]],
  [[-.82, -.47], [.81, -.27], [.37, .49]],
]
const faces = ['49,141,245', '85,171,252', '60,105,230', '56,158,225']
const edges = ['30,96,207', '40,119,223', '45,84,189', '26,128,200']

export function makeCrystalScene(compact: boolean): CrystalScene {
  let seed = 0x831f4b3
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0x100000000
  }
  const bands = (compact ? [45, 61, 107] : [112, 142, 345]).map(count =>
    Array.from({ length: count }, (_, index): Shard => ({
      phase: (index + random()) / count,
      across: (random() + random() + random() - 1.5) / 1.5,
      size: 0.42 + random() ** 1.42 * 1.09,
      drift: 0.85 + random() * 0.3,
      roll: random() * tau,
      turn: random() * tau,
      depth: random(),
      tint: Math.floor(random() * 4),
      points: hulls[Math.floor(random() * hulls.length)],
    })),
  )
  const marks = Array.from({ length: compact ? 35 : 90 }, (_, index) => ({
    x: 0.05 + random() * 0.94,
    y: 0.14 + random() * 0.77,
    weight: 0.1 + random() * 0.6,
    cross: index % 6 === 0,
  }))
  return { bands, marks }
}

function drawBand(
  context: CanvasRenderingContext2D,
  shards: Shard[],
  layer: number,
  width: number,
  height: number,
  time: number,
) {
  const main = layer === 2
  const mobile = width <= 720
  const unit = Math.min(Math.max(width / 94, mobile ? 5 : 9), 24)
  const speed = main ? 0.118 : layer === 1 ? -0.076 : 0.061
  const band = main ? 0.103 : layer === 1 ? 0.08 : 0.068
  for (const shard of shards) {
    const position = shard.phase + time * speed * shard.drift
    const u = position - Math.floor(position)
    const x = u * 1.24 - 0.12
    const fade = Math.min(1, u * 14, (1 - u) * 14)
    const undulation = Math.sin(x * 6.2 - time * (main ? 0.77 : 0.6) + layer * 1.8)
    const shoulder = Math.sin(x * 11.4 + time * 0.59 + shard.turn)
    const braid = main ? 0.34 + x * 0.39 : layer === 1 ? 0.78 - x * 0.49 : 0.30 + x * 0.057
    const y = braid + undulation * (main ? 0.108 : 0.071)
      + shard.across * band * (0.67 + 0.42 * Math.sin(x * 5.8 - time * 0.69 + layer * 2))
      + shoulder * 0.011
    const scale = shard.size * unit * (main ? 0.55 + u * 0.87 : 0.44 + shard.depth * 0.62)
    const yaw = Math.sin(time * (1.30 + shard.drift * 0.8) + shard.turn) * 1.05
    const pitch = Math.sin(time * 1.39 + shard.roll) * 0.87 + 0.16
    const roll = (main ? 0.34 : -0.18) + undulation * 0.23 + Math.sin(time * 0.93 + shard.roll) * 0.45
    const cosYaw = Math.cos(yaw)
    const sinYaw = Math.sin(yaw)
    const cosPitch = Math.cos(pitch)
    const sinPitch = Math.sin(pitch)
    const cosRoll = Math.cos(roll)
    const sinRoll = Math.sin(roll)
    const shine = 0.54 + Math.abs(sinYaw * sinPitch) * 0.47
    const opacity = fade * (main ? 0.57 + shard.depth * 0.38 : 0.30 + shard.depth * 0.31)
    if (opacity <= 0.01) continue

    const centerX = x * width
    const centerY = y * height
    const projected = shard.points.map(([px, py]) => {
      const dx = px * cosYaw
      const dy = py * cosPitch + px * sinYaw * sinPitch
      const z = py * sinPitch - px * sinYaw * cosPitch
      const perspective = 1 / (1 + z * 0.145)
      return [
        centerX + (dx * cosRoll - dy * sinRoll) * scale * perspective,
        centerY + (dx * sinRoll + dy * cosRoll) * scale * perspective,
      ] as const
    })
    const [a, b, c] = projected
    const last = projected[projected.length - 1]
    const rim = Math.max(0.8, scale * 0.14)
    const edge = edges[shard.tint]
    const face = faces[shard.tint]

    if (main) {
      context.beginPath()
      context.moveTo(...a)
      context.lineTo(...last)
      for (let index = projected.length - 1; index >= 0; index--) {
        context.lineTo(projected[index][0] + rim * .43, projected[index][1] + rim)
      }
      context.closePath()
      context.fillStyle = `rgba(${edge},${opacity * 0.19})`
      context.fill()
    }

    context.beginPath()
    context.moveTo(...a)
    for (let index = 1; index < projected.length; index++) context.lineTo(...projected[index])
    context.closePath()
    context.fillStyle = `rgba(${face},${opacity * (0.19 + shine * 0.21)})`
    context.strokeStyle = `rgba(${edge},${opacity * (0.29 + shine * 0.49)})`
    context.lineWidth = main ? 0.76 + shard.depth * 0.48 : 0.83
    context.fill()
    context.stroke()

    if (main) {
      context.beginPath()
      context.moveTo(...a)
      context.lineTo(...b)
      context.lineTo(...c)
      context.closePath()
      context.fillStyle = `rgba(${edge},${opacity * shine * 0.13})`
      context.fill()
      if (shard.depth > 0.64) {
        context.beginPath()
        context.moveTo(...b)
        context.lineTo(...c)
        context.strokeStyle = `rgba(217,242,255,${opacity * shine * 0.85})`
        context.stroke()
      }
    }
  }
}

export function paintCrystalScene(
  far: CanvasRenderingContext2D,
  near: CanvasRenderingContext2D,
  scene: CrystalScene,
  width: number,
  height: number,
  time: number,
) {
  far.clearRect(0, 0, width, height)
  near.clearRect(0, 0, width, height)
  drawBand(far, scene.bands[0], 0, width, height, time)
  drawBand(far, scene.bands[1], 1, width, height, time)
  drawBand(near, scene.bands[2], 2, width, height, time)

  for (const mark of scene.marks) {
    const x = mark.x * width
    const y = mark.y * height
    const intensity = mark.weight * (0.63 + Math.sin(time * 0.67 + mark.y * 37) * .14)
    const size = mark.cross ? 3.3 : 0.8
    near.fillStyle = `rgba(105,158,225,${intensity * 0.66})`
    near.fillRect(x - size, y - .55, size * 2, 1.1)
    if (mark.cross) near.fillRect(x - .55, y - size, 1.1, size * 2)
  }
}

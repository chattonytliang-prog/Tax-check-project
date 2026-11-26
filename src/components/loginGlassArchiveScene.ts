const sceneWidth = 1440
const sceneHeight = 900
const outline = [[-135, -229], [124, -229], [145, -207], [145, 201], [127, 222], [-129, 222], [-143, 208], [-143, -214]] as const
const stack = [
  [1219, 354, 1.33, -.116, .78],
  [1137, 383, 1.30, -.149, .94],
  [1050, 423, 1.24, -.164, .96],
  [1151, 516, 1.11, -.20, .91],
] as const

function tracePage(ctx: CanvasRenderingContext2D, dx = 0, dy = 0) {
  ctx.beginPath()
  ctx.moveTo(outline[0][0] + dx, outline[0][1] + dy)
  for (const [x, y] of outline.slice(1)) ctx.lineTo(x + dx, y + dy)
  ctx.closePath()
}

function markTax(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.fillStyle = color
  ctx.font = `500 ${size}px "Segoe UI", sans-serif`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('Tax', x, y)
}

function drawPage(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, rotation: number,
  opacity: number, lines = false, label = false) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotation)
  ctx.scale(scale, scale)
  ctx.transform(1, -.11, .037, 1, 0, 0)
  ctx.globalAlpha = opacity

  const rim = ctx.createLinearGradient(-143, -200, 140, 224)
  rim.addColorStop(0, '#ebfbff'); rim.addColorStop(.37, '#8cb7eb')
  rim.addColorStop(.64, '#e8f9ff'); rim.addColorStop(1, '#62a5e1')
  const glass = ctx.createLinearGradient(-145, -211, 135, 212)
  glass.addColorStop(0, '#f7fcffa8'); glass.addColorStop(.22, '#d1e9ff96')
  glass.addColorStop(.57, '#8fc4f4a5'); glass.addColorStop(1, '#5da1e46c')

  tracePage(ctx, 4, 6)
  ctx.fillStyle = '#578bcf31'
  ctx.fill()
  tracePage(ctx)
  ctx.fillStyle = glass
  ctx.fill()
  ctx.lineWidth = 1.75
  ctx.strokeStyle = rim
  ctx.stroke()
  ctx.save()
  ctx.scale(.96, .977)
  tracePage(ctx)
  ctx.lineWidth = .75
  ctx.strokeStyle = '#f1fbff76'
  ctx.stroke()
  ctx.restore()

  if (lines) {
    ctx.beginPath()
    for (const [i, length] of [112, 82, 96].entries()) {
      ctx.moveTo(-100, 107 + 15 * i)
      ctx.lineTo(-100 + length, 107 + 15 * i)
    }
    ctx.lineWidth = 1.45
    ctx.strokeStyle = '#3f83c16d'
    ctx.stroke()
  }
  if (label) markTax(ctx, -95, -145, 32, '#1b527ea8')
  ctx.restore()
}

export function paintGlassArchive(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  ctx.setTransform(ctx.canvas.width / sceneWidth, 0, 0, ctx.canvas.height / sceneHeight, 0, 0)
  ctx.clearRect(0, 0, sceneWidth, sceneHeight)
  const narrow = width <= 720
  const spacing = .5 + .5 * Math.sin(time * .8)
  // Whole pages move with an offset between them, so the stack opens and settles in depth.
  for (const [i, [x, y, scale, rotation, alpha]] of stack.entries()) {
    const phase = time * .73 - i * .39
    const dx = (i - 1.4) * 17 * spacing + 19 * Math.sin(phase)
    const dy = 24 * Math.cos(phase * 1.1)
    drawPage(ctx, x + dx, y + dy + (narrow ? 155 : 0), scale, rotation + .043 * Math.sin(phase),
      narrow ? alpha * .75 : alpha, i >= 2, i === 3 && !narrow)
  }
  const lower = narrow ? 765 : 670
  drawPage(ctx, 156 + 13 * Math.cos(time * .9), lower, .61, -.19, .39)
  drawPage(ctx, 204 + 21 * Math.sin(time * .76), lower + 37, .54, -.23, .57, true)

  if (narrow) {
    ctx.save()
    ctx.translate(1080, 760)
    ctx.scale((height / sceneHeight) / (width / sceneWidth), 1)
    markTax(ctx, 0, 0, 25, '#1b527e99')
    ctx.restore()
  }
}

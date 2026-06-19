// Pure canvas drawing helpers. No emoji — everything is vector art.

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function star5(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer
    const a = (Math.PI / 5) * i - Math.PI / 2
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
}

// 巧乐兹: chocolate bar on a stick with a vanilla bite
export function drawIceCream(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = '#d9a566'
  ctx.fillRect(-3, 8, 6, 30)
  const grd = ctx.createLinearGradient(0, -46, 0, 12)
  grd.addColorStop(0, '#6b3d1e')
  grd.addColorStop(1, '#3c2010')
  ctx.fillStyle = grd
  roundRect(ctx, -20, -46, 40, 58, 12)
  ctx.fill()
  ctx.fillStyle = '#fff4dd'
  roundRect(ctx, -13, -40, 12, 30, 6)
  ctx.fill()
  ctx.fillStyle = '#8a5a2b'
  for (let i = 0; i < 8; i++) {
    const ang = i * 0.9
    const rx = Math.cos(ang) * 12
    const ry = -22 + Math.sin(ang) * 16
    ctx.beginPath()
    ctx.arc(rx + 6, ry, 2.4, 0, 7)
    ctx.fill()
  }
  ctx.fillStyle = '#ffd86b'
  roundRect(ctx, -15, -4, 30, 11, 4)
  ctx.fill()
  ctx.fillStyle = '#5a3210'
  ctx.font = 'bold 8px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('巧乐兹', 0, 4.5)
  ctx.restore()
}

// 雪碧: green soda can
export function drawSprite(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  const grd = ctx.createLinearGradient(-16, 0, 16, 0)
  grd.addColorStop(0, '#0f6b32')
  grd.addColorStop(0.45, '#37c46a')
  grd.addColorStop(0.55, '#9bf0bd')
  grd.addColorStop(1, '#0f6b32')
  ctx.fillStyle = grd
  roundRect(ctx, -16, -30, 32, 52, 8)
  ctx.fill()
  ctx.fillStyle = '#cfd6da'
  roundRect(ctx, -16, -34, 32, 8, 4)
  ctx.fill()
  ctx.fillStyle = '#9aa3a8'
  ctx.fillRect(-6, -36, 12, 3)
  ctx.fillStyle = 'rgba(255,255,255,.85)'
  ctx.beginPath()
  ctx.moveTo(-16, -6)
  ctx.quadraticCurveTo(0, -14, 16, -4)
  ctx.lineTo(16, 6)
  ctx.quadraticCurveTo(0, 0, -16, 8)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#0f6b32'
  ctx.font = 'bold 9px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('雪碧', 0, 2)
  ctx.restore()
}

// jumpable striped barrier
export function drawBarrier(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = '#c43b2a'
  ctx.fillRect(-34, -6, 8, 22)
  ctx.fillRect(26, -6, 8, 22)
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : '#ff7a1a'
    ctx.fillRect(-38 + i * 9.5, -26, 9.5, 18)
  }
  ctx.strokeStyle = 'rgba(0,0,0,.3)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(-38, -26, 76, 18)
  ctx.restore()
}

// treadmill — must switch lane (cannot jump over)
export function drawTreadmill(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, time: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = '#222633'
  roundRect(ctx, -30, -6, 60, 20, 6)
  ctx.fill()
  ctx.fillStyle = '#3a4050'
  roundRect(ctx, -30, -6, 60, 7, 4)
  ctx.fill()
  const ph = (time * 6) % 8
  ctx.strokeStyle = '#11141d'
  ctx.lineWidth = 2
  for (let i = 0; i < 8; i++) {
    const lx = -28 + ((i * 8 + ph) % 56)
    ctx.beginPath()
    ctx.moveTo(lx, -2)
    ctx.lineTo(lx, 8)
    ctx.stroke()
  }
  ctx.strokeStyle = '#9aa3b2'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(-26, -6)
  ctx.lineTo(-30, -46)
  ctx.lineTo(8, -46)
  ctx.stroke()
  ctx.fillStyle = '#1a1d29'
  roundRect(ctx, -2, -58, 28, 16, 4)
  ctx.fill()
  ctx.fillStyle = '#52e0ff'
  ctx.fillRect(2, -54, 20, 8)
  ctx.restore()
}

function limb(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  ang: number,
  color: string,
  wdt: number,
  arm: boolean,
) {
  ctx.save()
  ctx.translate(ox, oy)
  ctx.rotate(ang)
  ctx.strokeStyle = color
  ctx.lineWidth = wdt
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, arm ? 16 : 20)
  ctx.stroke()
  ctx.restore()
}

// the runner character
export function drawRunner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  t: number,
  fallen: boolean,
) {
  ctx.save()
  ctx.translate(x, y)
  if (fallen) {
    ctx.rotate((Math.PI / 2) * 0.92)
    ctx.translate(0, -6)
  }
  ctx.scale(s, s)
  const swing = Math.sin(t) * 0.6
  const swing2 = Math.sin(t + Math.PI) * 0.6
  const lift = Math.abs(Math.sin(t)) * 3
  limb(ctx, 0, 8, swing2, '#2b3a67', 7, false)
  limb(ctx, 0, -16, -swing * 0.8, '#e8643c', 5, true)
  const bg = ctx.createLinearGradient(0, -26, 0, 12)
  bg.addColorStop(0, '#ff9a3c')
  bg.addColorStop(1, '#ff6f3c')
  ctx.fillStyle = bg
  roundRect(ctx, -11, -24, 22, 34, 9)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,.85)'
  roundRect(ctx, -7, -18, 14, 6, 3)
  ctx.fill()
  limb(ctx, 0, 8, swing, '#3450a0', 7, false)
  limb(ctx, 0, -16, swing * 0.9, '#ff8a4a', 5, true)
  ctx.fillStyle = '#ffd9a8'
  ctx.beginPath()
  ctx.arc(0, -34 + -lift * 0.2, 12, 0, 7)
  ctx.fill()
  ctx.fillStyle = '#2a2233'
  ctx.beginPath()
  ctx.arc(0, -38, 12, Math.PI * 1.05, Math.PI * 2.0)
  ctx.fill()
  ctx.fillRect(-12, -40, 24, 5)
  ctx.strokeStyle = '#2a2233'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(-4, -33, 3.4, 0, 7)
  ctx.arc(5, -33, 3.4, 0, 7)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-0.6, -33)
  ctx.lineTo(1.6, -33)
  ctx.stroke()
  if (fallen) {
    ctx.fillStyle = '#7a3b2a'
    ctx.beginPath()
    ctx.arc(0, -27, 2.4, 0, 7)
    ctx.fill()
  }
  ctx.restore()
}

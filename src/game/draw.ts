// Pure canvas drawing helpers. No emoji — everything is hand-drawn vector art.

type Ctx = CanvasRenderingContext2D

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

export function star5(ctx: Ctx, cx: number, cy: number, outer: number, inner: number) {
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
export function drawIceCream(ctx: Ctx, x: number, y: number, s: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = '#caa06a'
  roundRect(ctx, -3, 6, 6, 32, 3)
  ctx.fill()
  const grd = ctx.createLinearGradient(-18, -46, 18, 12)
  grd.addColorStop(0, '#7a4a25')
  grd.addColorStop(0.5, '#5a3014')
  grd.addColorStop(1, '#3c2010')
  ctx.fillStyle = grd
  roundRect(ctx, -20, -46, 40, 58, 13)
  ctx.fill()
  // glossy highlight
  ctx.fillStyle = 'rgba(255,235,200,.18)'
  roundRect(ctx, -15, -42, 11, 40, 6)
  ctx.fill()
  // vanilla bite reveal
  ctx.fillStyle = '#fff4dd'
  roundRect(ctx, -12, -38, 11, 26, 5)
  ctx.fill()
  // crunchy bits
  ctx.fillStyle = '#9a6630'
  for (let i = 0; i < 9; i++) {
    const ang = i * 0.8
    const rx = Math.cos(ang) * 11 + 6
    const ry = -22 + Math.sin(ang) * 15
    ctx.beginPath()
    ctx.arc(rx, ry, 2.2, 0, 7)
    ctx.fill()
  }
  ctx.fillStyle = '#ffd86b'
  roundRect(ctx, -15, -5, 30, 12, 4)
  ctx.fill()
  ctx.fillStyle = '#5a3210'
  ctx.font = 'bold 8px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('巧乐兹', 0, 1)
  ctx.restore()
}

// 雪碧: green soda can
export function drawSprite(ctx: Ctx, x: number, y: number, s: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  const grd = ctx.createLinearGradient(-16, 0, 16, 0)
  grd.addColorStop(0, '#0c5a2a')
  grd.addColorStop(0.42, '#2fb55f')
  grd.addColorStop(0.56, '#a9f2c6')
  grd.addColorStop(0.7, '#2fb55f')
  grd.addColorStop(1, '#0c5a2a')
  ctx.fillStyle = grd
  roundRect(ctx, -16, -30, 32, 52, 9)
  ctx.fill()
  // top rim
  ctx.fillStyle = '#c4ccd1'
  roundRect(ctx, -16, -34, 32, 9, 4)
  ctx.fill()
  ctx.fillStyle = '#9aa3a8'
  roundRect(ctx, -6, -36, 12, 4, 2)
  ctx.fill()
  // bubbly silver splash band
  ctx.fillStyle = 'rgba(255,255,255,.9)'
  ctx.beginPath()
  ctx.moveTo(-16, -6)
  ctx.quadraticCurveTo(0, -15, 16, -4)
  ctx.lineTo(16, 7)
  ctx.quadraticCurveTo(0, -1, -16, 9)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,.55)'
  for (let i = 0; i < 4; i++) {
    ctx.beginPath()
    ctx.arc(-9 + i * 6, -2 + (i % 2) * 4, 1.5, 0, 7)
    ctx.fill()
  }
  ctx.fillStyle = '#0c5a2a'
  ctx.font = 'bold 9px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('雪碧', 0, 1)
  ctx.restore()
}

// jumpable construction barricade (hazard board on A-frame feet)
export function drawBarrier(ctx: Ctx, x: number, y: number, s: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)

  // A-frame legs
  ctx.fillStyle = '#5b6068'
  for (const lx of [-30, 30]) {
    ctx.beginPath()
    ctx.moveTo(lx - 4, 16)
    ctx.lineTo(lx + 4, 16)
    ctx.lineTo(lx + 2.5, -20)
    ctx.lineTo(lx - 2.5, -20)
    ctx.closePath()
    ctx.fill()
    // foot
    ctx.fillStyle = '#3c4047'
    roundRect(ctx, lx - 8, 14, 16, 5, 2)
    ctx.fill()
    ctx.fillStyle = '#5b6068'
  }

  // hazard board with diagonal stripes
  const bx = -42
  const bw = 84
  const by = -30
  const bh = 20
  ctx.save()
  roundRect(ctx, bx, by, bw, bh, 3)
  ctx.clip()
  ctx.fillStyle = '#f0a01e'
  ctx.fillRect(bx, by, bw, bh)
  ctx.fillStyle = '#1d1d1f'
  const sw = 12
  for (let i = -2; i < bw / sw + 2; i++) {
    ctx.beginPath()
    const ox = bx + i * sw * 2
    ctx.moveTo(ox, by + bh)
    ctx.lineTo(ox + sw, by + bh)
    ctx.lineTo(ox + sw + bh, by)
    ctx.lineTo(ox + bh, by)
    ctx.closePath()
    ctx.fill()
  }
  // reflective sheen
  ctx.fillStyle = 'rgba(255,255,255,.18)'
  ctx.fillRect(bx, by + 2, bw, 4)
  ctx.restore()
  ctx.strokeStyle = 'rgba(0,0,0,.4)'
  ctx.lineWidth = 1.5
  roundRect(ctx, bx, by, bw, bh, 3)
  ctx.stroke()

  // amber warning light
  ctx.fillStyle = '#1d1d1f'
  roundRect(ctx, bx - 2, by - 8, 8, 8, 2)
  ctx.fill()
  ctx.fillStyle = '#ffb338'
  ctx.beginPath()
  ctx.arc(bx + 2, by - 6, 3.4, 0, 7)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,210,120,.5)'
  ctx.beginPath()
  ctx.arc(bx + 2, by - 6, 5.5, 0, 7)
  ctx.fill()
  ctx.restore()
}

// treadmill — must switch lane (cannot jump over)
export function drawTreadmill(ctx: Ctx, x: number, y: number, s: number, time: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)

  // deck base
  const dg = ctx.createLinearGradient(0, -8, 0, 16)
  dg.addColorStop(0, '#3a4150')
  dg.addColorStop(1, '#20242f')
  ctx.fillStyle = dg
  roundRect(ctx, -32, -8, 64, 24, 7)
  ctx.fill()

  // running belt
  ctx.save()
  roundRect(ctx, -26, -5, 52, 16, 4)
  ctx.clip()
  ctx.fillStyle = '#15181f'
  ctx.fillRect(-26, -5, 52, 16)
  const ph = (time * 14) % 7
  ctx.strokeStyle = '#2b303c'
  ctx.lineWidth = 2
  for (let i = -1; i < 9; i++) {
    const ly = -5 + ((i * 7 + ph) % 18)
    ctx.beginPath()
    ctx.moveTo(-26, ly)
    ctx.lineTo(26, ly)
    ctx.stroke()
  }
  ctx.restore()

  // side rails
  ctx.fillStyle = '#aeb6c4'
  roundRect(ctx, -32, -8, 6, 24, 3)
  ctx.fill()
  roundRect(ctx, 26, -8, 6, 24, 3)
  ctx.fill()

  // console post + screen
  ctx.strokeStyle = '#9aa3b2'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-22, -6)
  ctx.lineTo(-26, -48)
  ctx.lineTo(22, -48)
  ctx.lineTo(20, -6)
  ctx.stroke()
  ctx.fillStyle = '#14171f'
  roundRect(ctx, -16, -60, 32, 16, 3)
  ctx.fill()
  ctx.fillStyle = '#37e0b0'
  roundRect(ctx, -12, -57, 16, 10, 2)
  ctx.fill()
  // buttons
  ctx.fillStyle = '#ff5a4d'
  ctx.beginPath()
  ctx.arc(9, -52, 2, 0, 7)
  ctx.fill()
  ctx.fillStyle = '#ffd34d'
  ctx.beginPath()
  ctx.arc(9, -46, 2, 0, 7)
  ctx.fill()
  ctx.restore()
}

// ---- runner character (front-facing, running in place) ----

function capsule(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, color: string) {
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}

function leg(ctx: Ctx, hipX: number, hipY: number, lift: number, pants: string, shoe: string) {
  const kneeY = hipY + 13 - lift * 5
  const kneeX = hipX + lift * 2.5
  const footY = hipY + 27 - lift * 14
  const footX = hipX + lift * 4
  capsule(ctx, hipX, hipY, kneeX, kneeY, 8, pants)
  capsule(ctx, kneeX, kneeY, footX, footY, 6.6, pants)
  // shoe
  ctx.fillStyle = shoe
  ctx.save()
  ctx.translate(footX, footY + 1)
  ctx.rotate(0.15 - lift * 0.25)
  roundRect(ctx, -4, -2.5, 12, 6, 3)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,.8)'
  roundRect(ctx, -4, 1.5, 12, 2, 1)
  ctx.fill()
  ctx.restore()
}

function arm(ctx: Ctx, shX: number, shY: number, side: number, swing: number, sleeve: string, skin: string) {
  const elbowX = shX + side * 5 + swing * 1.5
  const elbowY = shY + 11 - Math.abs(swing) * 1.5
  const handX = elbowX + side * 1.5 + swing * 5
  const handY = elbowY + 9 - swing * 4
  capsule(ctx, shX, shY, elbowX, elbowY, 6.4, sleeve)
  capsule(ctx, elbowX, elbowY, handX, handY, 5.6, sleeve)
  ctx.fillStyle = skin
  ctx.beginPath()
  ctx.arc(handX, handY, 3.1, 0, 7)
  ctx.fill()
}

export function drawRunner(
  ctx: Ctx,
  x: number,
  y: number,
  s: number,
  t: number,
  fallen: boolean,
  jump = 0,
) {
  ctx.save()
  ctx.translate(x, y)
  if (fallen) {
    ctx.rotate(Math.PI * 0.46)
    ctx.translate(2, -4)
  }
  ctx.scale(s, s)
  ctx.lineJoin = 'round'

  const skin = '#ffd9ad'
  const skinSh = '#eab98a'
  const pants = '#26407a'
  const sleeve = '#ff7a3a'
  const shoe = '#ffffff'

  const airborne = !fallen && jump > 0.05
  const run = !fallen && !airborne

  let bob: number, liftL: number, liftR: number, swingL: number, swingR: number
  if (airborne) {
    // tuck legs up, throw arms up
    bob = -1.5
    liftL = 0.85 + jump * 0.15
    liftR = 0.7 + jump * 0.15
    swingL = 1.2
    swingR = 1.2
  } else if (run) {
    bob = Math.sin(t * 2) * 1.6
    liftL = Math.max(0, Math.sin(t))
    liftR = Math.max(0, Math.sin(t + Math.PI))
    swingL = Math.sin(t + Math.PI) * 0.9
    swingR = Math.sin(t) * 0.9
  } else {
    bob = 0
    liftL = 0.15
    liftR = 0
    swingL = -0.2
    swingR = 0.2
  }

  ctx.translate(0, bob)

  const hipY = -22
  const shY = -42

  // back leg / arm first for depth
  leg(ctx, -5, hipY, liftR, '#1f3464', shoe)
  arm(ctx, -10, shY + 2, -1, swingR, '#e8632e', skinSh)

  // torso (tracksuit) with outline
  const bodyGrad = ctx.createLinearGradient(0, shY - 4, 0, hipY + 6)
  bodyGrad.addColorStop(0, '#ff9a44')
  bodyGrad.addColorStop(1, '#ff6a30')
  ctx.fillStyle = bodyGrad
  ctx.strokeStyle = 'rgba(40,20,10,.35)'
  ctx.lineWidth = 1.5
  roundRect(ctx, -12, shY - 2, 24, hipY - shY + 16, 10)
  ctx.fill()
  ctx.stroke()
  // side stripes
  ctx.fillStyle = 'rgba(255,255,255,.92)'
  roundRect(ctx, -12, shY + 2, 3, 26, 1.5)
  ctx.fill()
  roundRect(ctx, 9, shY + 2, 3, 26, 1.5)
  ctx.fill()
  // collar
  ctx.fillStyle = '#2a4684'
  roundRect(ctx, -7, shY - 3, 14, 6, 3)
  ctx.fill()

  // front leg / arm
  leg(ctx, 5, hipY, liftL, pants, shoe)
  arm(ctx, 10, shY + 2, 1, swingL, sleeve, skin)

  // neck
  ctx.fillStyle = skinSh
  roundRect(ctx, -3.5, shY - 8, 7, 8, 3)
  ctx.fill()

  // head
  const headY = shY - 16
  const hg = ctx.createRadialGradient(-3, headY - 3, 2, 0, headY, 13)
  hg.addColorStop(0, '#ffe7c6')
  hg.addColorStop(1, skin)
  ctx.fillStyle = hg
  ctx.strokeStyle = 'rgba(40,20,10,.25)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(0, headY, 12.5, 0, 7)
  ctx.fill()
  ctx.stroke()
  // ears
  ctx.fillStyle = skin
  ctx.beginPath()
  ctx.arc(-12, headY + 1, 2.4, 0, 7)
  ctx.arc(12, headY + 1, 2.4, 0, 7)
  ctx.fill()
  // hair
  ctx.fillStyle = '#2a2233'
  ctx.beginPath()
  ctx.arc(0, headY - 1, 12.6, Math.PI * 1.04, Math.PI * 1.96)
  ctx.lineTo(11, headY - 4)
  ctx.quadraticCurveTo(2, headY - 13, -12, headY - 5)
  ctx.closePath()
  ctx.fill()
  // side fringe
  ctx.beginPath()
  ctx.moveTo(-12, headY - 5)
  ctx.quadraticCurveTo(-6, headY - 1, -3, headY - 6)
  ctx.quadraticCurveTo(2, headY - 1, 6, headY - 7)
  ctx.lineTo(2, headY - 12)
  ctx.closePath()
  ctx.fill()

  if (!fallen) {
    // glasses
    ctx.strokeStyle = '#33303d'
    ctx.lineWidth = 1.6
    ctx.fillStyle = 'rgba(190,225,255,.45)'
    roundRect(ctx, -8.5, headY - 2, 7, 6, 2.5)
    ctx.fill()
    ctx.stroke()
    roundRect(ctx, 1.5, headY - 2, 7, 6, 2.5)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-1.5, headY + 1)
    ctx.lineTo(1.5, headY + 1)
    ctx.stroke()
    // eyes
    ctx.fillStyle = '#33303d'
    ctx.beginPath()
    ctx.arc(-5, headY + 1, 1.5, 0, 7)
    ctx.arc(5, headY + 1, 1.5, 0, 7)
    ctx.fill()
    // confident smile
    ctx.strokeStyle = '#a05038'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(0, headY + 5, 3.2, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()
    // cheeks
    ctx.fillStyle = 'rgba(255,140,120,.35)'
    ctx.beginPath()
    ctx.arc(-7, headY + 4, 2, 0, 7)
    ctx.arc(7, headY + 4, 2, 0, 7)
    ctx.fill()
  } else {
    // dizzy spiral eyes
    ctx.strokeStyle = '#33303d'
    ctx.lineWidth = 1.4
    for (const ex of [-5, 5]) {
      ctx.beginPath()
      for (let a = 0; a < 6.5; a += 0.4) {
        const rr = 0.6 + a * 0.42
        const px = ex + Math.cos(a) * rr
        const py = headY + 1 + Math.sin(a) * rr
        a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
      }
      ctx.stroke()
    }
    // open dazed mouth
    ctx.fillStyle = '#7a3b2a'
    ctx.beginPath()
    ctx.ellipse(0, headY + 6, 2.4, 1.8, 0, 0, 7)
    ctx.fill()
  }

  ctx.restore()
}

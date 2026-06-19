// Procedurally generated dusk city — each building is rendered once to an
// offscreen canvas (windows drawn individually) and then blitted, scaled, by
// the engine. This keeps per-frame cost low while looking detailed.

export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  return c
}

const ri = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1))
const rf = (r: Rng, a: number, b: number) => a + r() * (b - a)
const pick = <T,>(r: Rng, arr: T[]): T => arr[Math.floor(r() * arr.length)]

// dusk facade palettes (h, s, l)
const FACADES: [number, number, number][] = [
  [216, 16, 26],
  [228, 20, 22],
  [205, 12, 30],
  [262, 16, 24],
  [24, 14, 24],
  [190, 14, 27],
  [240, 14, 20],
]

const WARM = ['#ffd27a', '#ffcf6e', '#ffe6ad', '#ffbb55', '#ffd98c']
const COOL = ['#a7ccff', '#cfe3ff', '#8fb8f0']

export interface BuildingArt {
  canvas: HTMLCanvasElement
  w: number
  h: number
}

export function makeBuilding(r: Rng, side: number): BuildingArt {
  const cols = ri(r, 2, 5)
  const floors = ri(r, 6, 18)
  const winW = ri(r, 9, 13)
  const winH = ri(r, 11, 15)
  const gapX = ri(r, 6, 11)
  const gapY = ri(r, 7, 11)
  const margin = ri(r, 8, 14)

  const bodyW = margin * 2 + cols * winW + (cols - 1) * gapX
  const bodyH = margin * 2 + floors * winH + (floors - 1) * gapY
  const roofH = ri(r, 10, 22)
  const W = bodyW
  const H = bodyH + roofH

  const c = canvas(W, H)
  const x = c.getContext('2d')!

  const [hue, sat, lig] = pick(r, FACADES)
  const jitter = rf(r, -4, 4)

  // facade body with vertical gradient (catches sky at the top)
  const g = x.createLinearGradient(0, roofH, 0, H)
  g.addColorStop(0, `hsl(${hue + jitter},${sat}%,${lig + 9}%)`)
  g.addColorStop(1, `hsl(${hue + jitter},${sat}%,${lig - 4}%)`)
  x.fillStyle = g
  x.fillRect(0, roofH, W, H - roofH)

  // faint vertical concrete pilasters between window columns
  x.fillStyle = `hsla(${hue},${sat}%,${lig + 14}%,0.10)`
  for (let cc = 0; cc <= cols; cc++) {
    const px = margin - gapX / 2 + cc * (winW + gapX)
    x.fillRect(px - 1, roofH, 2, H - roofH)
  }

  // windows — drawn one by one
  const litBias = rf(r, 0.35, 0.7)
  for (let f = 0; f < floors; f++) {
    const officeFloor = r() < 0.12 // a whole floor lit up
    for (let cc = 0; cc < cols; cc++) {
      const wx = margin + cc * (winW + gapX)
      const wy = roofH + margin + f * (winH + gapY)
      drawWindow(x, wx, wy, winW, winH, r, officeFloor || r() < litBias)
    }
  }

  // warm sunset rim on the side facing the sun (center of screen)
  const rim = x.createLinearGradient(0, 0, W, 0)
  const inner = side < 0 ? 1 : 0 // left building -> warm right edge
  rim.addColorStop(inner ? 0.6 : 0, 'rgba(255,150,80,0)')
  rim.addColorStop(inner ? 1 : 0.4, 'rgba(255,150,80,0.16)')
  x.fillStyle = rim
  x.fillRect(0, roofH, W, H - roofH)

  // shaded (away from sun) edge
  x.fillStyle = 'rgba(0,0,0,0.16)'
  x.fillRect(inner ? 0 : W - 3, roofH, 3, H - roofH)

  // roof / parapet
  x.fillStyle = `hsl(${hue},${sat}%,${lig - 7}%)`
  x.fillRect(-1, roofH - 4, W + 2, 6)
  x.fillStyle = `hsl(${hue},${sat}%,${lig - 12}%)`
  x.fillRect(2, 0, W - 4, roofH)
  x.fillStyle = `hsl(${hue},${sat}%,${lig + 4}%)`
  x.fillRect(2, 0, W - 4, 2)

  // rooftop details
  const detail = ri(r, 0, 2)
  if (detail === 0) {
    // water tank
    const tw = ri(r, 8, 14)
    x.fillStyle = '#3a3340'
    x.fillRect(W / 2 - tw / 2, 1, tw, roofH - 4)
    x.fillStyle = 'rgba(255,255,255,.08)'
    x.fillRect(W / 2 - tw / 2, 1, tw, 2)
  } else if (detail === 1) {
    // antenna with blinking-red beacon
    x.strokeStyle = '#2a2630'
    x.lineWidth = 1.5
    x.beginPath()
    x.moveTo(W / 2, roofH)
    x.lineTo(W / 2, -ri(r, 6, 16))
    x.stroke()
    x.fillStyle = '#ff5a4d'
    x.beginPath()
    x.arc(W / 2, -ri(r, 6, 14), 1.6, 0, 7)
    x.fill()
  } else {
    // rooftop housing boxes
    for (let i = 0; i < ri(r, 1, 3); i++) {
      const bw = ri(r, 6, 12)
      x.fillStyle = '#322c38'
      x.fillRect(ri(r, 2, W - bw - 2), roofH - ri(r, 4, roofH - 1), bw, ri(r, 3, 7))
    }
  }

  return { canvas: c, w: W, h: H }
}

function drawWindow(
  x: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  w: number,
  h: number,
  r: Rng,
  lit: boolean,
) {
  if (lit) {
    const cool = r() < 0.18
    const col = pick(r, cool ? COOL : WARM)
    const g = x.createLinearGradient(wx, wy, wx, wy + h)
    g.addColorStop(0, col)
    g.addColorStop(1, shade(col, -0.25))
    x.fillStyle = g
    x.fillRect(wx, wy, w, h)
    // glow
    x.save()
    x.globalAlpha = 0.5
    x.shadowColor = col
    x.shadowBlur = 6
    x.fillRect(wx + 1, wy + 1, w - 2, h - 2)
    x.restore()
    // partly drawn blinds
    if (r() < 0.4) {
      x.fillStyle = 'rgba(0,0,0,0.32)'
      const bh = Math.round(h * rf(r, 0.2, 0.6))
      x.fillRect(wx, wy, w, bh)
    }
  } else {
    // dark glass reflecting the dusk sky
    const g = x.createLinearGradient(wx, wy, wx, wy + h)
    g.addColorStop(0, '#2a3140')
    g.addColorStop(1, '#141a25')
    x.fillStyle = g
    x.fillRect(wx, wy, w, h)
  }
  // mullions (panes)
  x.strokeStyle = 'rgba(0,0,0,0.45)'
  x.lineWidth = 1
  x.strokeRect(wx + 0.5, wy + 0.5, w - 1, h - 1)
  if (w >= 11) {
    x.beginPath()
    x.moveTo(wx + w / 2, wy)
    x.lineTo(wx + w / 2, wy + h)
    x.stroke()
  }
  // sill highlight
  x.fillStyle = 'rgba(255,255,255,0.06)'
  x.fillRect(wx, wy + h, w, 1)
}

// Distant skyline silhouette with tiny lit windows + atmospheric fade.
export function makeSkyline(r: Rng, W: number, H: number): HTMLCanvasElement {
  const c = canvas(W, H)
  const x = c.getContext('2d')!
  let px = 0
  while (px < W) {
    const bw = ri(r, 26, 70)
    const bh = ri(r, Math.round(H * 0.25), Math.round(H * 0.95))
    const top = H - bh
    // bluish dusk silhouette, lighter toward the top (haze)
    const g = x.createLinearGradient(0, top, 0, H)
    g.addColorStop(0, 'rgba(70,78,110,0.95)')
    g.addColorStop(1, 'rgba(40,44,68,0.95)')
    x.fillStyle = g
    x.fillRect(px, top, bw, bh)
    // tiny windows
    for (let yy = top + 4; yy < H - 3; yy += 5) {
      for (let xx = px + 3; xx < px + bw - 2; xx += 4) {
        if (r() < 0.32) {
          x.fillStyle = r() < 0.8 ? 'rgba(255,210,140,0.85)' : 'rgba(170,200,255,0.8)'
          x.fillRect(xx, yy, 1.6, 1.8)
        }
      }
    }
    px += bw + ri(r, -6, 8)
  }
  // haze gradient over the whole strip (atmospheric perspective)
  const haze = x.createLinearGradient(0, 0, 0, H)
  haze.addColorStop(0, 'rgba(120,90,120,0.0)')
  haze.addColorStop(0.7, 'rgba(120,80,110,0.10)')
  haze.addColorStop(1, 'rgba(150,90,90,0.22)')
  x.fillStyle = haze
  x.fillRect(0, 0, W, H)
  return c
}

function shade(hex: string, amt: number): string {
  const n = hex.replace('#', '')
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  const f = 1 + amt
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)))
  return `rgb(${c(r)},${c(g)},${c(b)})`
}

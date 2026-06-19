import * as THREE from 'three'

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

const ri = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1))
const pick = <T,>(r: Rng, arr: T[]): T => arr[Math.floor(r() * arr.length)]

const FACADES = ['#3a4150', '#343b4e', '#3f3a4c', '#2f3947', '#454049', '#384450']
const WARM = ['#ffd27a', '#ffcf6e', '#ffe6ad', '#ffbb55']
const COOL = ['#a7ccff', '#cfe3ff', '#8fb8f0']

function cv(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

// A building facade: emissive window grid. Used as both map and emissiveMap so
// lit windows glow under bloom. Tileable horizontally.
export function makeFacadeTexture(r: Rng): { map: THREE.CanvasTexture; floors: number } {
  const cols = ri(r, 4, 7)
  const floors = ri(r, 6, 12)
  const cellW = 24
  const cellH = 26
  const w = cols * cellW
  const h = floors * cellH
  const c = cv(w, h)
  const x = c.getContext('2d')!

  // concrete facade with vertical gradient
  const base = pick(r, FACADES)
  const g = x.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, shade(base, 14))
  g.addColorStop(1, shade(base, -10))
  x.fillStyle = g
  x.fillRect(0, 0, w, h)

  // pilasters
  x.fillStyle = 'rgba(255,255,255,0.05)'
  for (let i = 0; i <= cols; i++) x.fillRect(i * cellW - 1, 0, 2, h)

  const litBias = 0.4 + r() * 0.3
  for (let f = 0; f < floors; f++) {
    const office = r() < 0.12
    for (let cc = 0; cc < cols; cc++) {
      const wx = cc * cellW + 5
      const wy = f * cellH + 5
      const ww = cellW - 10
      const wh = cellH - 9
      const lit = office || r() < litBias
      if (lit) {
        const cool = r() < 0.18
        const col = pick(r, cool ? COOL : WARM)
        const wg = x.createLinearGradient(wx, wy, wx, wy + wh)
        wg.addColorStop(0, col)
        wg.addColorStop(1, shade(col, -30))
        x.fillStyle = wg
        x.fillRect(wx, wy, ww, wh)
        if (r() < 0.4) {
          x.fillStyle = 'rgba(0,0,0,0.32)'
          x.fillRect(wx, wy, ww, Math.round(wh * (0.2 + r() * 0.5)))
        }
      } else {
        const wg = x.createLinearGradient(wx, wy, wx, wy + wh)
        wg.addColorStop(0, '#2b3340')
        wg.addColorStop(1, '#141a24')
        x.fillStyle = wg
        x.fillRect(wx, wy, ww, wh)
      }
      x.strokeStyle = 'rgba(0,0,0,0.5)'
      x.lineWidth = 1
      x.strokeRect(wx + 0.5, wy + 0.5, ww - 1, wh - 1)
      x.beginPath()
      x.moveTo(wx + ww / 2, wy)
      x.lineTo(wx + ww / 2, wy + wh)
      x.stroke()
    }
  }

  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = THREE.RepeatWrapping
  map.wrapT = THREE.ClampToEdgeWrapping
  map.anisotropy = 4
  return { map, floors }
}

// Asphalt road texture with center dashes + side lines (tiles along its length).
export function makeRoadTexture(r: Rng, lanes: number): THREE.CanvasTexture {
  const w = 256
  const h = 256
  const c = cv(w, h)
  const x = c.getContext('2d')!
  x.fillStyle = '#2b2b31'
  x.fillRect(0, 0, w, h)
  // subtle asphalt noise
  for (let i = 0; i < 1400; i++) {
    const v = 30 + Math.floor(r() * 30)
    x.fillStyle = `rgba(${v},${v},${v + 4},0.5)`
    x.fillRect(r() * w, r() * h, 1.5, 1.5)
  }
  // lane dashes
  x.fillStyle = 'rgba(240,220,120,0.9)'
  for (let l = 1; l < lanes; l++) {
    const lx = (w / lanes) * l - 3
    for (let yy = 10; yy < h; yy += 64) x.fillRect(lx, yy, 6, 34)
  }
  // edge lines
  x.fillStyle = 'rgba(235,235,245,0.7)'
  x.fillRect(3, 0, 5, h)
  x.fillRect(w - 8, 0, 5, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.ClampToEdgeWrapping
  t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

function shade(hex: string, amt: number): string {
  const n = hex.replace('#', '')
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  const c = (v: number) => Math.max(0, Math.min(255, v + amt))
  return `rgb(${c(r)},${c(g)},${c(b)})`
}

import type { GameCallbacks, GameObject, GameOverReason, ObjType, Screen } from './types'
import { drawBarrier, drawIceCream, drawRunner, drawSprite, drawTreadmill, star5 } from './draw'
import { makeBuilding, makeSkyline, mulberry32, type Rng } from './city'

const LANES = [-1, 0, 1]
const MAXD = 28
const FOCAL = 4.2
const PLAYER_Y_FACTOR = 0.84
// internal world-units/sec -> km/h.  Start speed 8 shows 40 km/h.
const KMH = 5
// jump tuning (px/s, px/s^2 — both scaled by artScale so airtime is constant)
const JUMP_V0 = 560
const GRAVITY = 1500

interface Building {
  side: number
  d: number
  canvas: HTMLCanvasElement
  w: number
  h: number
}

interface Particle {
  kind: 'text' | 'star'
  x: number
  y: number
  vx?: number
  vy: number
  life: number
  rot?: number
  text?: string
  color?: string
}

interface Player {
  lane: number
  displayLane: number
  yOff: number
  vy: number
  jumping: boolean
}

const SPEECH_LINES = ['你跑不过我，你信吗？', '再加把劲，跟上！', '这点距离，不算什么！']

export class Game {
  private ctx: CanvasRenderingContext2D
  private cb: GameCallbacks
  private raf = 0
  private last = 0

  // sizing
  private W = 0
  private H = 0
  private artScale = 1

  // state
  private state: Screen = 'menu'
  private objs: GameObject[] = []
  private particles: Particle[] = []
  private player: Player = { lane: 1, displayLane: 1, yOff: 0, vy: 0, jumping: false }
  private speed = 8
  private totalDist = 0
  private score = 0
  private collectScore = 0
  private sugar = 0
  private sugarFlash = 0
  private distSinceSpawn = 0
  private runCycle = 0
  private shake = 0
  private time = 0
  private speakTimer = 4
  private speakHold = 0
  private speakIdx = 0
  private best = 0
  private lastFreeLane = 1

  // city
  private cityRng: Rng = mulberry32(1)
  private buildings: Building[] = []
  private skyline: HTMLCanvasElement | null = null

  constructor(canvas: HTMLCanvasElement, cb: GameCallbacks) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    this.ctx = ctx
    this.cb = cb
    this.best = Number(localStorage.getItem('zxfrun_best') || 0)
    this.initCity()
    this.last = performance.now()
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
  }

  private initCity() {
    this.cityRng = mulberry32(20260619)
    this.skyline = makeSkyline(mulberry32(7), 2200, 260)
    this.buildings = []
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const art = makeBuilding(this.cityRng, side)
        this.buildings.push({
          side,
          d: 2 + i * 3.4 + (side < 0 ? 0 : 1.7),
          canvas: art.canvas,
          w: art.w,
          h: art.h,
        })
      }
    }
  }

  private updateCity(dist: number) {
    for (const b of this.buildings) b.d -= dist
    for (const side of [-1, 1]) {
      let maxd = 0
      for (const b of this.buildings) if (b.side === side && b.d > maxd) maxd = b.d
      for (const b of this.buildings) {
        if (b.side === side && b.d < -2.5) {
          const art = makeBuilding(this.cityRng, side)
          b.canvas = art.canvas
          b.w = art.w
          b.h = art.h
          maxd += 3.0 + this.cityRng() * 1.8
          b.d = maxd
        }
      }
    }
  }

  private jumpPeak() {
    return ((JUMP_V0 * JUMP_V0) / (2 * GRAVITY)) * this.artScale
  }

  setBest(v: number) {
    this.best = v
  }
  getBest() {
    return this.best
  }
  // small accessors (used for automated input testing).
  // "airborne" means high enough to actually clear a barrier.
  isAirborne() {
    return this.player.yOff < -this.jumpPeak() * 0.34
  }
  getLane() {
    return this.player.lane
  }
  getState() {
    return this.state
  }
  getSugar() {
    return this.sugar
  }
  // test-only: drop an obstacle in the player's lane just ahead
  debugForceObstacle(type: ObjType) {
    if (this.state !== 'playing') return
    this.objs.push({ type, lane: this.player.lane, d: 2.6, resolved: false, bob: 0 })
  }

  resize(w: number, h: number, dpr: number) {
    this.W = w
    this.H = h
    // scale the art to the viewport so it looks good on phones and big tablets
    const ref = Math.min(w, h * 0.62)
    this.artScale = Math.max(0.82, Math.min(ref / 430, 1.9))
    const c = this.ctx.canvas
    c.width = Math.max(1, Math.floor(w * dpr))
    c.height = Math.max(1, Math.floor(h * dpr))
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
  }

  start() {
    this.objs = []
    this.particles = []
    this.player = { lane: 1, displayLane: 1, yOff: 0, vy: 0, jumping: false }
    this.speed = 8
    this.totalDist = 0
    this.score = 0
    this.collectScore = 0
    this.sugar = 0
    this.sugarFlash = 0
    this.distSinceSpawn = 0
    this.runCycle = 0
    this.shake = 0
    this.speakTimer = 3
    this.speakHold = 0
    this.speakIdx = 0
    this.lastFreeLane = 1
    this.cb.onSpeak(null)
    this.state = 'playing'
  }

  moveLane(dir: number) {
    if (this.state !== 'playing') return
    this.player.lane = Math.max(0, Math.min(2, this.player.lane + dir))
  }

  jump() {
    if (this.state !== 'playing') return
    if (!this.player.jumping) {
      this.player.jumping = true
      this.player.vy = -JUMP_V0 * this.artScale
    }
  }

  // ---- projection ----
  private horizonY() {
    return this.H * 0.3
  }
  private laneSpacingPx() {
    return Math.max(72, Math.min(this.W * 0.21, 190))
  }
  private project(d: number, laneMul: number) {
    const p = FOCAL / (FOCAL + Math.max(d, -0.5))
    const hy = this.horizonY()
    return {
      x: this.W / 2 + laneMul * this.laneSpacingPx() * p,
      y: hy + p * (this.H - hy),
      p,
    }
  }

  private pushObj(lane: number, type: ObjType) {
    this.objs.push({ type, lane, d: MAXD, resolved: false, bob: Math.random() * 6.28 })
  }

  // Build one row. Always leaves a guaranteed-free lane that is reachable
  // (within one lane) from the previous row's free lane, so the run is
  // always solvable — no "impossible" walls. Up to 2 obstacles per row.
  private spawnRow() {
    const cands = [this.lastFreeLane - 1, this.lastFreeLane, this.lastFreeLane + 1].filter(
      (l) => l >= 0 && l <= 2,
    )
    const free = cands[Math.floor(Math.random() * cands.length)]
    for (let i = 0; i < 3; i++) {
      if (i === free) {
        const k = Math.random()
        if (k < 0.3) this.pushObj(i, 'ice')
        else if (k < 0.55) this.pushObj(i, 'sprite')
        continue
      }
      const k = Math.random()
      if (k < 0.42) this.pushObj(i, 'barrier')
      else if (k < 0.6) this.pushObj(i, 'treadmill')
      else if (k < 0.78) this.pushObj(i, Math.random() < 0.5 ? 'ice' : 'sprite')
    }
    this.lastFreeLane = free
  }

  private popup(text: string, color: string, laneMul: number, d: number) {
    const pr = this.project(d, laneMul)
    this.particles.push({ kind: 'text', text, color, x: pr.x, y: pr.y - 30 * pr.p, life: 1, vy: -40 })
  }
  private gameOver(reason: GameOverReason) {
    this.state = 'over'
    this.shake = 0
    this.particles = []
    this.cb.onSpeak(null)
    if (this.score > this.best) {
      this.best = this.score
      localStorage.setItem('zxfrun_best', String(this.best))
    }
    this.cb.onGameOver({ reason, score: this.score, best: this.best })
  }

  private loop(now: number) {
    let dt = (now - this.last) / 1000
    this.last = now
    if (dt > 0.05) dt = 0.05
    this.update(dt)
    this.render()
    this.raf = requestAnimationFrame(this.loop)
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.life -= dt * (p.kind === 'star' ? 1.4 : 1.1)
      if (p.kind === 'star') {
        p.vy += 300 * dt
        p.x += (p.vx ?? 0) * dt
        p.y += p.vy * dt
      } else {
        p.y += p.vy * dt
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0)
  }

  private update(dt: number) {
    // Game over: freeze the whole scene — nothing advances.
    if (this.state === 'over') return
    this.time += dt
    // the city scrolls in menu (idle) and play; frozen on game over
    this.updateCity((this.state === 'playing' ? this.speed : 7) * dt)
    if (this.state === 'menu') {
      this.runCycle += dt * 4
      this.updateParticles(dt)
      return
    }

    this.speed = Math.min(8 + this.totalDist * 0.028, 24)
    this.totalDist += this.speed * dt
    this.runCycle += dt * (this.speed * 1.1)

    this.player.displayLane += (this.player.lane - this.player.displayLane) * Math.min(1, dt * 14)
    if (this.player.jumping) {
      this.player.vy += GRAVITY * this.artScale * dt
      this.player.yOff += this.player.vy * dt
      if (this.player.yOff >= 0) {
        this.player.yOff = 0
        this.player.jumping = false
        this.player.vy = 0
      }
    }

    this.sugar = Math.max(0, this.sugar - 9 * dt)
    if (this.sugar >= 100) {
      this.gameOver('sugar')
      return
    }
    this.sugarFlash = Math.max(0, this.sugarFlash - dt)
    if (this.shake > 0) this.shake -= dt

    // speech bubbles
    this.speakTimer -= dt
    if (this.speakHold > 0) {
      this.speakHold -= dt
      if (this.speakHold <= 0) this.cb.onSpeak(null)
    } else if (this.speakTimer <= 0) {
      this.cb.onSpeak(SPEECH_LINES[this.speakIdx % SPEECH_LINES.length])
      // requested line shows most often
      this.speakIdx = this.speakIdx === 0 ? 1 : Math.random() < 0.6 ? 0 : this.speakIdx + 1
      this.speakHold = 2.6
      this.speakTimer = 6 + Math.random() * 4
    }

    this.distSinceSpawn += this.speed * dt
    const rowGap = Math.max(3.2, Math.min(3.2 + this.speed * 0.09, 6))
    if (this.distSinceSpawn >= rowGap) {
      this.distSinceSpawn = 0
      this.spawnRow()
    }

    // Fair collision: resolve once at the closest approach (d<=0), using the
    // player's height. feet >= CLEAR means high enough to clear a low barrier
    // (and high enough to fly over a collectible without taking it).
    const feet = -this.player.yOff
    const CLEAR = this.jumpPeak() * 0.3
    for (const o of this.objs) {
      o.d -= this.speed * dt
      if (!o.resolved && o.d <= 0) {
        o.resolved = true
        if (o.lane === this.player.lane) {
          if (o.type === 'barrier') {
            if (feet < CLEAR) {
              this.gameOver('crash')
              return
            }
          } else if (o.type === 'treadmill') {
            this.gameOver('crash')
            return
          } else if (o.type === 'ice') {
            if (feet < CLEAR) {
              this.collectScore += 50
              this.sugar = Math.min(100, this.sugar + 15)
              this.sugarFlash = 0.35
              this.popup('+50', '#ffd27a', LANES[o.lane], 0.4)
              if (this.sugar >= 100) {
                this.gameOver('sugar')
                return
              }
            }
          } else if (o.type === 'sprite') {
            if (feet < CLEAR) {
              this.collectScore += 30
              this.sugar = Math.min(100, this.sugar + 11)
              this.sugarFlash = 0.35
              this.popup('+30', '#7CFC9A', LANES[o.lane], 0.4)
              if (this.sugar >= 100) {
                this.gameOver('sugar')
                return
              }
            }
          }
        }
      }
    }
    this.objs = this.objs.filter((o) => o.d > -1.2)

    this.score = Math.floor(this.totalDist) + this.collectScore
    this.updateParticles(dt)

    this.cb.onHud({
      score: this.score,
      distanceM: Math.floor(this.totalDist),
      speedKmh: Math.round(this.speed * KMH),
      sugar: Math.min(100, this.sugar),
    })
  }

  // ---------- rendering ----------
  private render() {
    const ctx = this.ctx
    let sx = 0
    let sy = 0
    if (this.shake > 0) {
      sx = (Math.random() - 0.5) * this.shake * 22
      sy = (Math.random() - 0.5) * this.shake * 22
    }
    ctx.save()
    ctx.translate(sx, sy)
    this.drawSky()
    this.drawSkyline()
    this.drawGround()
    this.drawRoadMarks()
    this.drawCity()
    if (this.state === 'playing') this.drawSpeedLines()
    const sorted = this.objs.slice().sort((a, b) => b.d - a.d)
    for (const o of sorted) this.drawObject(o)
    this.drawPlayer()
    this.drawParticles()
    if (this.sugarFlash > 0) {
      ctx.fillStyle = `rgba(255,200,60,${this.sugarFlash * 0.5})`
      ctx.fillRect(-30, -30, this.W + 60, this.H + 60)
    }
    if (this.sugar > 85 && this.state === 'playing') {
      const a = ((this.sugar - 85) / 15) * 0.4 * (0.6 + 0.4 * Math.sin(this.time * 12))
      ctx.fillStyle = `rgba(255,40,40,${a})`
      ctx.fillRect(-30, -30, this.W + 60, this.H + 60)
    }
    ctx.restore()
  }

  private drawSky() {
    const ctx = this.ctx
    const hy = this.horizonY()
    const g = ctx.createLinearGradient(0, 0, 0, hy + 40)
    g.addColorStop(0, '#3a1d6e')
    g.addColorStop(0.45, '#7b3f9c')
    g.addColorStop(0.8, '#ff7a52')
    g.addColorStop(1, '#ffd36b')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, this.W, hy + 40)
    const sunY = hy - 30 + 8 * Math.sin(this.time * 0.4)
    const sg = ctx.createRadialGradient(this.W * 0.5, sunY, 4, this.W * 0.5, sunY, 90)
    sg.addColorStop(0, 'rgba(255,247,210,.95)')
    sg.addColorStop(1, 'rgba(255,200,90,0)')
    ctx.fillStyle = sg
    ctx.beginPath()
    ctx.arc(this.W * 0.5, sunY, 90, 0, 7)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,250,225,.95)'
    ctx.beginPath()
    ctx.arc(this.W * 0.5, sunY, 30, 0, 7)
    ctx.fill()
  }

  private drawGround() {
    const ctx = this.ctx
    const hy = this.horizonY()
    // urban dusk ground
    const gg = ctx.createLinearGradient(0, hy, 0, this.H)
    gg.addColorStop(0, '#2b2740')
    gg.addColorStop(1, '#16131f')
    ctx.fillStyle = gg
    ctx.fillRect(0, hy, this.W, this.H - hy)

    const apexX = this.W / 2
    const apexY = hy
    const nl = this.project(0, -1.85)
    const nr = this.project(0, 1.85)

    // sidewalks just outside the road
    for (const side of [-1, 1]) {
      const innerN = this.project(0, side * 1.85)
      const outerN = this.project(0, side * 2.4)
      ctx.fillStyle = '#39354a'
      ctx.beginPath()
      ctx.moveTo(innerN.x, innerN.y)
      ctx.lineTo(apexX, apexY)
      ctx.lineTo(outerN.x, outerN.y)
      ctx.closePath()
      ctx.fill()
    }

    // road surface converging all the way to the horizon
    const rg = ctx.createLinearGradient(0, apexY, 0, this.H)
    rg.addColorStop(0, '#3d3d47')
    rg.addColorStop(1, '#28282f')
    ctx.fillStyle = rg
    ctx.beginPath()
    ctx.moveTo(nl.x, nl.y)
    ctx.lineTo(apexX, apexY)
    ctx.lineTo(nr.x, nr.y)
    ctx.closePath()
    ctx.fill()

    // curb lines
    ctx.lineWidth = Math.max(2, this.W * 0.01)
    ctx.strokeStyle = 'rgba(240,240,255,.65)'
    ctx.beginPath()
    ctx.moveTo(nl.x, nl.y)
    ctx.lineTo(apexX, apexY)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(nr.x, nr.y)
    ctx.lineTo(apexX, apexY)
    ctx.stroke()
  }

  private drawSkyline() {
    if (!this.skyline) return
    const ctx = this.ctx
    const hy = this.horizonY()
    const sh = this.H * 0.17
    const sw = this.skyline.width * (sh / this.skyline.height)
    let x = -((this.totalDist * 1.4) % sw)
    for (; x < this.W; x += sw) {
      ctx.drawImage(this.skyline, x, hy - sh + 2, sw, sh)
    }
  }

  private drawCity() {
    const ctx = this.ctx
    const sorted = this.buildings.slice().sort((a, b) => b.d - a.d)
    for (const b of sorted) {
      if (b.d <= 0.02) continue
      const base = this.project(b.d, b.side * 2.15)
      if (base.p <= 0.02) continue
      const k = base.p * this.artScale * 1.15
      const w = b.w * k
      const h = b.h * k
      const x = b.side < 0 ? base.x - w : base.x
      const y = base.y - h
      // contact shadow
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      ctx.beginPath()
      ctx.ellipse(b.side < 0 ? base.x - w * 0.5 : base.x + w * 0.5, base.y, w * 0.5, 6 * base.p, 0, 0, 7)
      ctx.fill()
      ctx.drawImage(b.canvas, x, y, w, h)
    }
  }

  private drawSpeedLines() {
    const intensity = Math.min(1, Math.max(0, (this.speed - 9) / 15))
    if (intensity < 0.05) return
    const ctx = this.ctx
    ctx.lineCap = 'round'
    for (let i = 0; i < 7; i++) {
      const laneMul = ((i % 3) - 1) * 1.35 + (i < 3 ? 0 : 0.4)
      const ph = (this.time * 3 + i * 0.27) % 1
      const d = (1 - ph) * 6
      const p0 = this.project(d + 0.6, laneMul)
      const p1 = this.project(d, laneMul)
      ctx.strokeStyle = `rgba(255,255,255,${intensity * 0.16 * ph})`
      ctx.lineWidth = Math.max(1.5, 5 * p1.p)
      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y)
      ctx.lineTo(p1.x, p1.y)
      ctx.stroke()
    }
  }

  private drawRoadMarks() {
    const ctx = this.ctx
    const seg = 2.2
    const phase = (this.state === 'menu' ? this.time * 4 : this.totalDist) % seg
    for (const laneMul of [-0.5, 0.5]) {
      for (let i = 0; i < 30; i++) {
        const d0 = i * seg - phase
        const d1 = d0 + 1.1
        if (d1 <= 0 || d0 > 64) continue
        const a = this.project(Math.max(d0, 0.02), laneMul)
        const b = this.project(Math.max(d1, 0.02), laneMul)
        ctx.strokeStyle = 'rgba(255,220,120,.85)'
        ctx.lineWidth = Math.max(1.5, 8 * a.p)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }
  }

  private drawObject(o: GameObject) {
    const ctx = this.ctx
    const laneMul = LANES[o.lane]
    const pr = this.project(o.d, laneMul)
    if (pr.p <= 0.02) return
    const s = pr.p * this.artScale
    const bob = Math.sin(this.time * 4 + o.bob) * 4 * s
    const x = pr.x
    const y = pr.y + bob
    ctx.fillStyle = 'rgba(0,0,0,.28)'
    ctx.beginPath()
    ctx.ellipse(pr.x, pr.y + 4 * s, 28 * s, 9 * s, 0, 0, 7)
    ctx.fill()
    if (o.type === 'ice') drawIceCream(ctx, x, y, s)
    else if (o.type === 'sprite') drawSprite(ctx, x, y, s)
    else if (o.type === 'barrier') drawBarrier(ctx, pr.x, pr.y, s)
    else if (o.type === 'treadmill') drawTreadmill(ctx, pr.x, pr.y, s, this.time)
  }

  private drawPlayer() {
    const ctx = this.ctx
    const baseY = this.H * PLAYER_Y_FACTOR
    const x = this.W / 2 + (this.player.displayLane - 1) * this.laneSpacingPx()
    const y = baseY + this.player.yOff
    const s = this.artScale * 1.05
    const jp = Math.max(0, Math.min(1, -this.player.yOff / this.jumpPeak()))
    const sh = 1 - Math.min(0.62, -this.player.yOff / (this.jumpPeak() * 1.7))
    ctx.fillStyle = 'rgba(0,0,0,.3)'
    ctx.beginPath()
    ctx.ellipse(x, baseY + 34 * s, 30 * s * sh, 9 * s * sh, 0, 0, 7)
    ctx.fill()
    drawRunner(ctx, x, y, s, this.runCycle, this.state === 'over', jp)
  }

  private drawParticles() {
    const ctx = this.ctx
    for (const p of this.particles) {
      if (p.kind === 'text') {
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.fillStyle = p.color ?? '#fff'
        ctx.font = 'bold 18px "PingFang SC",sans-serif'
        ctx.textAlign = 'center'
        ctx.shadowColor = 'rgba(0,0,0,.5)'
        ctx.shadowBlur = 6
        ctx.fillText(p.text ?? '', p.x, p.y)
        ctx.shadowBlur = 0
        ctx.globalAlpha = 1
      } else {
        ctx.save()
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rot ?? 0) + p.life * 4)
        ctx.fillStyle = '#ffe66b'
        star5(ctx, 0, 0, 7, 3.2)
        ctx.restore()
        ctx.globalAlpha = 1
      }
    }
  }
}

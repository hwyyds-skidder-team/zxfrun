import type { GameCallbacks, GameObject, GameOverReason, ObjType, Screen } from './types'
import { drawBarrier, drawIceCream, drawRunner, drawSprite, drawTreadmill, star5 } from './draw'

const LANES = [-1, 0, 1]
const MAXD = 27
const FOCAL = 4.2
const PLAYER_Y_FACTOR = 0.84
// internal world-units/sec -> km/h.  Start speed 8 shows 40 km/h.
const KMH = 5

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

  constructor(canvas: HTMLCanvasElement, cb: GameCallbacks) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    this.ctx = ctx
    this.cb = cb
    this.best = Number(localStorage.getItem('zxfrun_best') || 0)
    this.last = performance.now()
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
  }

  setBest(v: number) {
    this.best = v
  }
  getBest() {
    return this.best
  }

  resize(w: number, h: number, dpr: number) {
    this.W = w
    this.H = h
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
      this.player.vy = -12.5
    }
  }

  // ---- projection ----
  private horizonY() {
    return this.H * 0.3
  }
  private laneSpacingPx() {
    return Math.min(this.W * 0.2, 118)
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

  private spawnRow() {
    const pattern: (ObjType | null)[] = []
    let obstacles = 0
    for (let i = 0; i < 3; i++) {
      const k = Math.random()
      if (k < 0.22) {
        pattern[i] = 'barrier'
        obstacles++
      } else if (k < 0.34) {
        pattern[i] = 'treadmill'
        obstacles++
      } else if (k < 0.55) {
        pattern[i] = 'ice'
      } else if (k < 0.73) {
        pattern[i] = 'sprite'
      } else {
        pattern[i] = null
      }
    }
    if (obstacles >= 3) {
      pattern[Math.floor(Math.random() * 3)] = Math.random() < 0.5 ? 'ice' : null
    }
    for (let i = 0; i < 3; i++) {
      if (pattern[i]) {
        this.objs.push({ type: pattern[i]!, lane: i, d: MAXD, resolved: false, bob: Math.random() * 6.28 })
      }
    }
  }

  private popup(text: string, color: string, laneMul: number, d: number) {
    const pr = this.project(d, laneMul)
    this.particles.push({ kind: 'text', text, color, x: pr.x, y: pr.y - 30 * pr.p, life: 1, vy: -40 })
  }
  private stars(x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        kind: 'star',
        x,
        y,
        vx: (Math.random() - 0.5) * 120,
        vy: -Math.random() * 150 - 40,
        life: 1,
        rot: Math.random() * 6.28,
      })
    }
  }

  private gameOver(reason: GameOverReason) {
    this.state = 'over'
    this.shake = 0.4
    this.cb.onSpeak(null)
    if (reason === 'sugar') this.stars(this.W / 2, this.H * PLAYER_Y_FACTOR - 40)
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
    this.time += dt
    if (this.state !== 'playing') {
      this.runCycle += dt * 4
      this.updateParticles(dt)
      return
    }

    this.speed = Math.min(8 + this.totalDist * 0.028, 24)
    this.totalDist += this.speed * dt
    this.runCycle += dt * (this.speed * 1.1)

    this.player.displayLane += (this.player.lane - this.player.displayLane) * Math.min(1, dt * 14)
    if (this.player.jumping) {
      this.player.vy += 42 * dt
      this.player.yOff += this.player.vy * dt * 4.2
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
    if (this.distSinceSpawn >= 5.4) {
      this.distSinceSpawn = 0
      this.spawnRow()
    }

    const inAir = this.player.yOff < -26
    for (const o of this.objs) {
      o.d -= this.speed * dt
      if (!o.resolved && o.d <= 0.22) {
        o.resolved = true
        if (o.lane === this.player.lane) {
          if (o.type === 'ice') {
            this.collectScore += 50
            this.sugar = Math.min(100, this.sugar + 15)
            this.sugarFlash = 0.35
            this.popup('+50', '#ffd27a', LANES[o.lane], 0.5)
            if (this.sugar >= 100) {
              this.gameOver('sugar')
              return
            }
          } else if (o.type === 'sprite') {
            this.collectScore += 30
            this.sugar = Math.min(100, this.sugar + 11)
            this.sugarFlash = 0.35
            this.popup('+30', '#7CFC9A', LANES[o.lane], 0.5)
            if (this.sugar >= 100) {
              this.gameOver('sugar')
              return
            }
          } else if (o.type === 'barrier') {
            if (!inAir) {
              this.gameOver('crash')
              return
            }
          } else if (o.type === 'treadmill') {
            this.gameOver('crash')
            return
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
    this.drawGround()
    this.drawScenery()
    this.drawRoadMarks()
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
    const gg = ctx.createLinearGradient(0, hy, 0, this.H)
    gg.addColorStop(0, '#2c8a5a')
    gg.addColorStop(1, '#1c5e3d')
    ctx.fillStyle = gg
    ctx.fillRect(0, hy, this.W, this.H - hy)
    const tl = this.project(MAXD, -1.8)
    const bl = this.project(0, -1.8)
    const tr = this.project(MAXD, 1.8)
    const br = this.project(0, 1.8)
    const rg = ctx.createLinearGradient(0, hy, 0, this.H)
    rg.addColorStop(0, '#4a4a55')
    rg.addColorStop(1, '#33333c')
    ctx.fillStyle = rg
    ctx.beginPath()
    ctx.moveTo(tl.x, tl.y)
    ctx.lineTo(tr.x, tr.y)
    ctx.lineTo(br.x, br.y)
    ctx.lineTo(bl.x, bl.y)
    ctx.closePath()
    ctx.fill()
    ctx.lineWidth = Math.max(2, this.W * 0.012)
    ctx.strokeStyle = 'rgba(255,255,255,.75)'
    ctx.beginPath()
    ctx.moveTo(tl.x, tl.y)
    ctx.lineTo(bl.x, bl.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(tr.x, tr.y)
    ctx.lineTo(br.x, br.y)
    ctx.stroke()
  }

  private drawRoadMarks() {
    const ctx = this.ctx
    const seg = 2.2
    const phase = (this.state === 'playing' ? this.totalDist : this.time * 4) % seg
    for (const laneMul of [-0.5, 0.5]) {
      for (let i = 0; i < 14; i++) {
        const d0 = i * seg - phase
        const d1 = d0 + 1.1
        if (d1 <= 0 || d0 > MAXD) continue
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

  private drawScenery() {
    const ctx = this.ctx
    const seg = 4.0
    const phase = (this.state === 'playing' ? this.totalDist : this.time * 4) % seg
    for (const side of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const d = i * seg - phase + (side < 0 ? 0 : 2.0)
        if (d <= 0.1 || d > MAXD) continue
        const base = this.project(d, side * 2.5)
        const h = (60 + ((i * 53 + (side < 0 ? 17 : 91)) % 70)) * base.p
        const w = 46 * base.p
        const hue = (i * 47 + (side < 0 ? 0 : 120)) % 360
        ctx.fillStyle = `hsl(${(260 + hue) % 360},35%,${28 + (i % 3) * 6}%)`
        ctx.fillRect(base.x - (side < 0 ? w : 0), base.y - h, w, h)
        ctx.fillStyle = 'rgba(255,220,140,.5)'
        for (let wy = 0; wy < 3; wy++)
          for (let wx = 0; wx < 2; wx++) {
            if ((i + wy + wx) % 2 === 0)
              ctx.fillRect(
                base.x - (side < 0 ? w : 0) + w * 0.18 + wx * w * 0.42,
                base.y - h + h * 0.15 + wy * h * 0.27,
                w * 0.22,
                h * 0.14,
              )
          }
      }
    }
  }

  private drawObject(o: GameObject) {
    const ctx = this.ctx
    const laneMul = LANES[o.lane]
    const pr = this.project(o.d, laneMul)
    if (pr.p <= 0.02) return
    const bob = Math.sin(this.time * 4 + o.bob) * 4 * pr.p
    const x = pr.x
    const y = pr.y + bob
    const s = pr.p
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
    const s = Math.min(this.W / 420, 1.25)
    const sh = 1 - Math.min(0.6, -this.player.yOff / 120)
    ctx.fillStyle = 'rgba(0,0,0,.3)'
    ctx.beginPath()
    ctx.ellipse(x, baseY + 34 * s, 30 * s * sh, 9 * s * sh, 0, 0, 7)
    ctx.fill()
    drawRunner(ctx, x, y, s, this.runCycle, this.state === 'over')
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

// Tiny synthesized SFX engine (Web Audio). No external assets — every sound is
// generated, so it adds zero load weight. Created lazily and resumed on the
// first user gesture (the Start button).

export class SoundManager {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private muted = false
  private vol = 0.35

  private ensure() {
    if (this.ctx) return
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : this.vol
    this.master.connect(this.ctx.destination)
  }

  resume() {
    this.ensure()
    if (this.ctx?.state === 'suspended') this.ctx.resume()
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.master) this.master.gain.value = m ? 0 : this.vol
  }

  private tone(opts: {
    freq: number
    to?: number
    dur: number
    type?: OscillatorType
    gain?: number
    delay?: number
  }) {
    if (!this.ctx || !this.master || this.muted) return
    const t0 = this.ctx.currentTime + (opts.delay ?? 0)
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = opts.type ?? 'sine'
    osc.frequency.setValueAtTime(opts.freq, t0)
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur)
    const peak = opts.gain ?? 0.4
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur)
    osc.connect(g).connect(this.master)
    osc.start(t0)
    osc.stop(t0 + opts.dur + 0.02)
  }

  private noise(dur: number, gain = 0.4, lowpass = 1200) {
    if (!this.ctx || !this.master || this.muted) return
    const t0 = this.ctx.currentTime
    const n = Math.floor(this.ctx.sampleRate * dur)
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = lowpass
    const g = this.ctx.createGain()
    g.gain.value = gain
    src.connect(lp).connect(g).connect(this.master)
    src.start(t0)
  }

  jump() {
    this.tone({ freq: 320, to: 660, dur: 0.18, type: 'triangle', gain: 0.3 })
  }
  land() {
    this.tone({ freq: 180, to: 90, dur: 0.12, type: 'sine', gain: 0.32 })
    this.noise(0.08, 0.18, 900)
  }
  coin() {
    this.tone({ freq: 880, dur: 0.08, type: 'square', gain: 0.22 })
    this.tone({ freq: 1320, dur: 0.12, type: 'square', gain: 0.22, delay: 0.06 })
  }
  drink() {
    this.tone({ freq: 700, to: 1050, dur: 0.14, type: 'sine', gain: 0.22 })
  }
  crash() {
    this.tone({ freq: 200, to: 60, dur: 0.4, type: 'sawtooth', gain: 0.4 })
    this.noise(0.35, 0.5, 1600)
  }
  faint() {
    this.tone({ freq: 520, to: 130, dur: 0.6, type: 'triangle', gain: 0.32 })
  }
  click() {
    this.tone({ freq: 600, dur: 0.05, type: 'square', gain: 0.18 })
  }
}

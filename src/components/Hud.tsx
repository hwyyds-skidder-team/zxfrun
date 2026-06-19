import { Gauge, MapPin, Trophy, Volume2, VolumeX, Zap } from 'lucide-react'

export interface HudHandles {
  score: HTMLSpanElement | null
  dist: HTMLSpanElement | null
  speed: HTMLSpanElement | null
  best: HTMLSpanElement | null
  sugarFill: HTMLDivElement | null
  warn: HTMLDivElement | null
}

interface HudProps {
  muted: boolean
  onToggleMute: () => void
  refs: React.MutableRefObject<HudHandles>
}

export function Hud({ muted, onToggleMute, refs }: HudProps) {
  return (
    <div className="hud">
      <div className="topbar">
        <div className="panel">
          <div className="label">SCORE</div>
          <span className="score-num" ref={(el) => (refs.current.score = el)}>
            0
          </span>
        </div>
        <div className="panel stat">
          <div className="stat-item">
            <Gauge size={14} className="stat-ic" />
            <span className="v">
              <span ref={(el) => (refs.current.speed = el)}>40</span> km/h
            </span>
          </div>
          <div className="stat-item">
            <MapPin size={14} className="stat-ic" />
            <span className="v">
              <span ref={(el) => (refs.current.dist = el)}>0</span>m
            </span>
          </div>
          <div className="stat-item">
            <Trophy size={14} className="stat-ic gold" />
            <span className="v" ref={(el) => (refs.current.best = el)}>
              0
            </span>
          </div>
        </div>
      </div>

      <button className="mute-btn" onClick={onToggleMute} aria-label="音乐开关">
        {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>

      <div className="sugar-wrap">
        <div className="sugar-top">
          <span className="sugar-label">糖分槽 SUGAR</span>
          <div className="warn" ref={(el) => (refs.current.warn = el)}>
            <Zap size={14} /> 快爆表了，别再吃了！
          </div>
        </div>
        <div className="bar">
          <div className="fill" ref={(el) => (refs.current.sugarFill = el)} />
          <div className="ticks">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    </div>
  )
}

export type Screen = 'menu' | 'playing' | 'paused' | 'over'

// barrier/treadmill = jump over · overhead = slide under · wall = switch lane
export type ObjType = 'ice' | 'sprite' | 'barrier' | 'treadmill' | 'overhead' | 'wall'

export type GameOverReason = 'sugar' | 'crash'

export interface HudData {
  score: number
  distanceM: number
  speedKmh: number
  sugar: number // 0..100
}

export interface GameOverInfo {
  reason: GameOverReason
  score: number
  best: number
}

export interface GameCallbacks {
  onHud: (h: HudData) => void
  onSpeak: (text: string | null) => void
  onGameOver: (info: GameOverInfo) => void
}

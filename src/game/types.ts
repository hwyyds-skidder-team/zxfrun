export type Screen = 'menu' | 'playing' | 'over'

export type ObjType = 'ice' | 'sprite' | 'barrier' | 'treadmill'

export interface GameObject {
  type: ObjType
  lane: number // 0,1,2
  d: number // distance from player (0 = at player)
  resolved: boolean
  bob: number
}

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

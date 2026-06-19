import { useCallback, useEffect, useRef, useState } from 'react'
import { ThreeGame as Game } from './three/ThreeGame'
import type { GameOverInfo } from './game/types'
import { Pause, ArrowUp, ArrowDown, MoveHorizontal } from 'lucide-react'
import { Hud, type HudHandles } from './components/Hud'
import { StartScreen } from './components/StartScreen'
import { GameOverScreen } from './components/GameOverScreen'
import { PauseScreen } from './components/PauseScreen'

type Screen = 'menu' | 'playing' | 'paused' | 'over'

const BGM_URL = `${import.meta.env.BASE_URL}bgm.mp3`
const AUTOPLAY_PARAM = (() => {
  const value = new URLSearchParams(window.location.search).get('autoplay')
  return value !== null && value !== '0' && value !== 'false'
})()

export default function App() {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const gameRef = useRef<Game | null>(null)
  const mutedRef = useRef(false)
  const screenRef = useRef<Screen>('menu')
  const pendingAudioResumeRef = useRef(false)
  const hudRefs = useRef<HudHandles>({
    score: null,
    dist: null,
    speed: null,
    best: null,
    sugarFill: null,
    warn: null,
  })

  const [screen, setScreen] = useState<Screen>('menu')
  const [overInfo, setOverInfo] = useState<GameOverInfo | null>(null)
  const [muted, setMuted] = useState(false)
  const [speech, setSpeech] = useState<{ text: string; id: number } | null>(null)
  const [showHint, setShowHint] = useState(false)
  const hintTimer = useRef<number | undefined>(undefined)
  const [best, setBest] = useState<number>(() => Number(localStorage.getItem('zxfrun_best') || 0))

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  useEffect(() => {
    screenRef.current = screen
  }, [screen])

  const playAudio = useCallback((allowDeferred = true) => {
    const a = audioRef.current
    if (!a) return
    if (mutedRef.current) {
      pendingAudioResumeRef.current = false
      a.pause()
      return
    }
    a.volume = 0.55
    const attempt = a.play()
    if (!attempt) {
      pendingAudioResumeRef.current = false
      return
    }
    void attempt
      .then(() => {
        pendingAudioResumeRef.current = false
      })
      .catch(() => {
        pendingAudioResumeRef.current = allowDeferred
      })
  }, [])

  const startRun = useCallback(() => {
    gameRef.current?.start()
    setOverInfo(null)
    setSpeech(null)
    setScreen('playing')
    setShowHint(true)
    window.clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => setShowHint(false), 4500)
    playAudio()
  }, [playAudio])

  // create the engine once
  useEffect(() => {
    const canvas = canvasRef.current!
    const stage = stageRef.current!

    const game = new Game(canvas, {
      onHud: (h) => {
        const r = hudRefs.current
        if (r.score) r.score.textContent = String(h.score)
        if (r.dist) r.dist.textContent = String(h.distanceM)
        if (r.speed) r.speed.textContent = String(h.speedKmh)
        if (r.best) r.best.textContent = String(game.getBest())
        if (r.sugarFill) r.sugarFill.style.width = `${h.sugar}%`
        if (r.warn) r.warn.classList.toggle('on', h.sugar > 78)
      },
      onSpeak: (text) => setSpeech(text ? { text, id: Date.now() } : null),
      onGameOver: (info) => {
        setOverInfo(info)
        setBest(info.best)
        setScreen('over')
      },
    })
    gameRef.current = game

    // debug handle for automated input tests (only when ?debug is present)
    if (new URLSearchParams(window.location.search).has('debug')) {
      ;(window as unknown as { __zxfGame?: Game }).__zxfGame = game
    }

    const applySize = () => {
      const rect = stage.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      game.resize(rect.width, rect.height, dpr)
    }
    applySize()
    const ro = new ResizeObserver(applySize)
    ro.observe(stage)

    if (AUTOPLAY_PARAM) {
      requestAnimationFrame(() => {
        if (gameRef.current === game && screenRef.current === 'menu') startRun()
      })
    }

    return () => {
      window.clearTimeout(hintTimer.current)
      ro.disconnect()
      if ((window as unknown as { __zxfGame?: Game }).__zxfGame === game) {
        delete (window as unknown as { __zxfGame?: Game }).__zxfGame
      }
      game.destroy()
    }
  }, [startRun])

  useEffect(() => {
    const resumeDeferredAudio = () => {
      if (!pendingAudioResumeRef.current) return
      if (screenRef.current !== 'playing') return
      playAudio(false)
    }
    window.addEventListener('pointerdown', resumeDeferredAudio, { passive: true })
    window.addEventListener('keydown', resumeDeferredAudio)
    return () => {
      window.removeEventListener('pointerdown', resumeDeferredAudio)
      window.removeEventListener('keydown', resumeDeferredAudio)
    }
  }, [playAudio])

  const handlePause = useCallback(() => {
    gameRef.current?.pause()
    setShowHint(false)
    setScreen('paused')
  }, [])

  const handleRevive = useCallback(() => {
    gameRef.current?.revive()
    setOverInfo(null)
    setScreen('playing')
    playAudio()
  }, [playAudio])

  const handleResume = useCallback(() => {
    gameRef.current?.resume()
    setScreen('playing')
  }, [])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m
      mutedRef.current = next
      const a = audioRef.current
      if (a) {
        if (next) {
          pendingAudioResumeRef.current = false
          a.pause()
        } else {
          playAudio()
        }
      }
      gameRef.current?.setMuted(next)
      return next
    })
  }, [playAudio])

  // keyboard input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault()
      if (k === 'p' || k === 'escape') {
        if (screen === 'playing') handlePause()
        else if (screen === 'paused') handleResume()
        return
      }
      if (screen === 'paused') return
      if (screen !== 'playing') {
        if (k === ' ' || k === 'enter') startRun()
        return
      }
      const g = gameRef.current
      if (!g) return
      if (k === 'arrowleft' || k === 'a') g.moveLane(-1)
      else if (k === 'arrowright' || k === 'd') g.moveLane(1)
      else if (k === 'arrowup' || k === 'w' || k === ' ') g.jump()
      else if (k === 'arrowdown' || k === 's') g.slide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handlePause, handleResume, screen, startRun])

  // touch input (swipe up/down/left/right + tap)
  useEffect(() => {
    let tx = 0
    let ty = 0
    let tracking = false
    const onStart = (e: TouchEvent) => {
      const t = e.changedTouches[0]
      tx = t.clientX
      ty = t.clientY
      tracking = true
    }
    const onMove = (e: TouchEvent) => {
      // stop the browser from scrolling / pull-to-refresh eating the swipe
      if (screen === 'playing') e.preventDefault()
    }
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return
      tracking = false
      if (screen !== 'playing') return
      // let taps on buttons (e.g. mute) behave normally
      if ((e.target as HTMLElement | null)?.closest('button')) return
      const g = gameRef.current
      if (!g) return
      const t = e.changedTouches[0]
      const dx = t.clientX - tx
      const dy = t.clientY - ty
      const adx = Math.abs(dx)
      const ady = Math.abs(dy)
      if (adx < 18 && ady < 18) {
        g.jump()
        return
      }
      if (adx > ady) g.moveLane(dx > 0 ? 1 : -1)
      else if (dy < 0) g.jump()
      else g.slide()
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [screen])

  return (
    <div className="app">
      <div className="stage" ref={stageRef}>
        <canvas ref={canvasRef} className="game-canvas" />
        <audio ref={audioRef} src={BGM_URL} loop preload="auto" autoPlay={AUTOPLAY_PARAM} />

        <Hud muted={muted} onToggleMute={toggleMute} refs={hudRefs} />

        {screen === 'playing' && (
          <button className="pause-btn" onClick={handlePause} aria-label="暂停">
            <Pause size={20} />
          </button>
        )}

        {screen === 'playing' && showHint && (
          <div className="tutorial">
            <span>
              <ArrowUp size={16} /> 跳
            </span>
            <span>
              <ArrowDown size={16} /> 滑铲
            </span>
            <span>
              <MoveHorizontal size={16} /> 换道
            </span>
          </div>
        )}

        {speech && screen === 'playing' && (
          <div className="speech" key={speech.id}>
            <span>{speech.text}</span>
            <div className="speech-tail" />
          </div>
        )}

        {screen === 'menu' && <StartScreen best={best} onPlay={startRun} />}
        {screen === 'paused' && (
          <PauseScreen
            muted={muted}
            onResume={handleResume}
            onRestart={startRun}
            onToggleMute={toggleMute}
          />
        )}
        {screen === 'over' && overInfo && (
          <GameOverScreen
            info={overInfo}
            canRevive={gameRef.current?.canRevive() ?? false}
            onRevive={handleRevive}
            onRestart={startRun}
          />
        )}
      </div>
    </div>
  )
}

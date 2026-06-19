import { Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'

interface Props {
  muted: boolean
  onResume: () => void
  onRestart: () => void
  onToggleMute: () => void
}

export function PauseScreen({ muted, onResume, onRestart, onToggleMute }: Props) {
  return (
    <div className="screen">
      <h2 className="reason">已暂停</h2>
      <button className="btn" onClick={onResume}>
        <Play size={20} fill="currentColor" /> 继续
      </button>
      <div className="pause-row">
        <button className="pill" onClick={onRestart}>
          <RotateCcw size={18} /> 重新开始
        </button>
        <button className="pill" onClick={onToggleMute}>
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />} {muted ? '音乐已关' : '音乐开'}
        </button>
      </div>
    </div>
  )
}

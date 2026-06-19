import { RotateCcw, Candy, AlertTriangle, HeartPulse } from 'lucide-react'
import type { GameOverInfo } from '../game/types'

interface Props {
  info: GameOverInfo
  canRevive: boolean
  onRevive: () => void
  onRestart: () => void
}

export function GameOverScreen({ info, canRevive, onRevive, onRestart }: Props) {
  const isSugar = info.reason === 'sugar'
  return (
    <div className="screen">
      <div className={`over-icon ${isSugar ? 'sugar' : 'crash'}`}>
        {isSugar ? <Candy size={46} /> : <AlertTriangle size={46} />}
      </div>
      <h2 className={`reason ${isSugar ? 'sugar' : 'crash'}`}>
        {isSugar ? '糖分超标，当场晕倒！' : '撞上障碍，翻车了！'}
      </h2>
      <div className="final-block">
        <div className="label center">本局得分</div>
        <div className="big-score">{info.score}</div>
        <div className="best-line">最高分 {info.best}</div>
      </div>
      {canRevive && (
        <button className="btn revive" onClick={onRevive}>
          <HeartPulse size={20} /> 原地复活
        </button>
      )}
      <button className={canRevive ? 'pill' : 'btn'} onClick={onRestart}>
        <RotateCcw size={canRevive ? 18 : 20} /> 再来一局
      </button>
      <div className="tip">
        {isSugar
          ? '提示：别在短时间内连吃猛喝，让糖分槽降下来再补给。'
          : '提示：跑步机必须换道躲避，护栏可以跳过去。'}
      </div>
    </div>
  )
}

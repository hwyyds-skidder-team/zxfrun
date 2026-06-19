import { IceCream, Play, CupSoda, Footprints } from 'lucide-react'

interface Props {
  best: number
  onPlay: () => void
}

export function StartScreen({ best, onPlay }: Props) {
  return (
    <div className="screen">
      <div className="brand-icons">
        <IceCream size={34} className="ic-choco" />
        <CupSoda size={34} className="ic-sprite" />
        <Footprints size={34} className="ic-run" />
      </div>
      <h1 className="title">张雪峰跑酷</h1>
      <p className="sub">
        以 <b>40km/h</b> 极速狂奔，沿途狂炫 <b>巧乐兹</b>、猛灌 <b>雪碧</b> 拿高分。
        但短时间吃喝太多会 <b className="hot">糖分爆表当场晕倒</b>！躲开跑步机和护栏，越跑越快。
      </p>
      <button className="btn" onClick={onPlay}>
        <Play size={20} fill="currentColor" /> 开始跑酷
      </button>
      {best > 0 && <div className="best-line">历史最高 {best}</div>}
      <div className="controls-hint">
        <span>← → / A D 换道</span>
        <span>↑ / 空格 跳跃</span>
        <span>手机：左右滑动换道，上滑跳跃</span>
      </div>
      <div className="disclaimer">本游戏纯属虚构娱乐，角色与情节均为创作，请勿对号入座</div>
    </div>
  )
}

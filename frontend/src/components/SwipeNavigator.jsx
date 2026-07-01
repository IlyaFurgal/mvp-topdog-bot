import { useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const TAB_ORDER = ['/ai', '/profile', '/club']

const THRESHOLD    = 60   // мин. горизонтальное смещение, px
const MAX_OFF_AXIS = 50   // макс. вертикальное смещение, px
const MAX_DURATION = 600  // макс. длительность жеста, мс

export default function SwipeNavigator({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const start = useRef(null)

  function onTouchStart(e) {
    const t = e.changedTouches[0]
    start.current = { x: t.clientX, y: t.clientY, time: Date.now() }
  }

  function onTouchEnd(e) {
    if (!start.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.current.x
    const dy = t.clientY - start.current.y
    const dt = Date.now() - start.current.time
    start.current = null

    if (Math.abs(dx) < THRESHOLD) return             // слишком короткий
    if (Math.abs(dy) > MAX_OFF_AXIS) return           // слишком вертикальный
    if (Math.abs(dx) < Math.abs(dy) * 1.5) return    // не явно горизонтальный
    if (dt > MAX_DURATION) return                     // слишком медленный

    const idx = TAB_ORDER.indexOf(location.pathname)
    if (idx === -1) return

    if (dx < 0 && idx < TAB_ORDER.length - 1) {
      navigate(TAB_ORDER[idx + 1])   // свайп влево → следующая вкладка
    } else if (dx > 0 && idx > 0) {
      navigate(TAB_ORDER[idx - 1])   // свайп вправо → предыдущая вкладка
    }
  }

  return (
    <div
      key={location.pathname}
      className="page-slide"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{ minHeight: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      {children}
    </div>
  )
}

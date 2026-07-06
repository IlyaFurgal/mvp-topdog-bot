
export const CHECKIN_TYPE_INFO = {
  morning: {
    title: 'УТРО',
    subtitle: 'ТВОЁ ВОССТАНОВЛЕНИЕ',
  },
  post_workout: {
    title: 'ТРЕНИРОВКА',
    subtitle: 'ТВОЯ НАГРУЗКА',
  },
  evening: {
    title: 'ВЕЧЕР',
    subtitle: 'ТВОЁ СОСТОЯНИЕ',
  },
}

export default function CheckinCard({ type, checkin, onClick, onEdit }) {
  const cfg = CHECKIN_TYPE_INFO[type]
  const done = Boolean(checkin)

  return (
    <div
      className={`checkin-card skew-chip ${done ? 'checkin-card--done' : 'checkin-card--empty'}`}
      onClick={done ? onEdit : onClick}
    >
      <div className="checkin-card__title">{cfg.title}</div>
      <div className="checkin-card__subtitle">{cfg.subtitle}</div>
    </div>
  )
}

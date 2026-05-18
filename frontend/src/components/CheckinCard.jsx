const CONFIG = {
  morning: {
    title: 'УТРО',
    subtitle: 'СОСТОЯНИЕ',
    summaryKey: 'body_feeling',
    summaryMap: { fresh: 'Свежий', slightly_tired: 'Немного устал', heavy: 'Тяжело' },
  },
  post_workout: {
    title: 'ТРЕНИРОВКА',
    subtitle: 'НАГРУЗКА',
    summaryKey: 'plan_completed',
    summaryMap: { fully: 'План выполнен', partially: 'Частично', not: 'Не выполнил' },
  },
  evening: {
    title: 'ВЕЧЕР',
    subtitle: 'ВОССТАНОВЛЕНИЕ',
    summaryKey: 'day_rating',
    summaryMap: { good: 'Хорошо', okay: 'Нормально', hard: 'Тяжело' },
  },
}

export default function CheckinCard({ type, checkin, onClick }) {
  const cfg = CONFIG[type]
  const done = Boolean(checkin)

  const summary = done
    ? (cfg.summaryMap[checkin.data?.[cfg.summaryKey]] ?? 'Заполнен')
    : 'Не заполнен'

  return (
    <div
      className={`checkin-card ${done ? 'checkin-card--done' : 'checkin-card--empty'}`}
      onClick={!done ? onClick : undefined}
    >
      <div className="checkin-card__left">
        <div>
          <div className="checkin-card__title">
            {cfg.title} <span className="checkin-card__arrow">→</span> {cfg.subtitle}
          </div>
          <div className="checkin-card__status">{summary}</div>
        </div>
      </div>
      {!done && <span className="checkin-card__caret">›</span>}
    </div>
  )
}

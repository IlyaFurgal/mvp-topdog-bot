
const CONFIG = {
  morning: {
    title: 'УТРО',
    subtitle: 'СОСТОЯНИЕ',
    summaryKey: 'feeling',
    summaryMap: {
      excellent: 'Отличное',
      okay: 'Удовлетворительное',
      broken: 'Разбитое',
    },
  },
  post_workout: {
    title: 'ТРЕНИРОВКА',
    subtitle: 'НАГРУЗКА',
    summaryKey: 'plan_completed',
    summaryMap: {
      full:    'Выполнил полностью',
      partial: 'Выполнил частично',
      skipped: 'Не тренировался',
    },
  },
  evening: {
    title: 'ВЕЧЕР',
    subtitle: 'СОСТОЯНИЕ',
    summaryKey: 'productivity',
    summaryMap: {
      high: 'Бодрый',
      medium: 'Средний',
      low: 'Разбит',
    },
  },
}

export default function CheckinCard({ type, checkin, onClick, onEdit }) {
  const cfg = CONFIG[type]
  const done = Boolean(checkin)

  const summary = done
    ? (cfg.summaryMap[checkin.data?.[cfg.summaryKey]] ?? 'Заполнен')
    : 'Не заполнен'

  return (
    <div
      className={`checkin-card skew-chip ${done ? 'checkin-card--done' : 'checkin-card--empty'}`}
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
      {done && onEdit && (
        <button
          className="checkin-card__edit-btn"
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          aria-label="Редактировать"
        >
          ✏
        </button>
      )}
    </div>
  )
}

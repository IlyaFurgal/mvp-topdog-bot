const CONFIG = {
  weight:   { label: 'ВЕС' },
  water:    { label: 'ВОДА' },
  sleep:    { label: 'СОН' },
  calories: { label: 'КАЛОРИИ' },
}

function formatValue(type, data) {
  if (!data) return null
  const { value } = data
  if (type === 'weight') return `${value.toFixed(1)} кг`
  if (type === 'water') {
    return value >= 1000 ? `${(value / 1000).toFixed(1)} л` : `${Math.round(value)} мл`
  }
  if (type === 'sleep') {
    const h = Math.floor(value)
    const m = Math.round((value - h) * 60)
    return m > 0 ? `${h}ч ${m}м` : `${h}ч`
  }
  if (type === 'calories') {
    return `${Math.round(value)} ккал`
  }
  return null
}

export default function TrackerRow({ type, data, onAdd }) {
  const cfg = CONFIG[type]
  const formatted = formatValue(type, data)

  return (
    <div className="tracker-row">
      <div className="tracker-row__left">
        <span className="tracker-row__label">{cfg.label}</span>
      </div>
      <div className="tracker-row__right">
        <span className={`tracker-row__value ${formatted ? 'tracker-row__value--filled' : ''}`}>
          {formatted ?? '—'}
        </span>
        <button className="tracker-row__add" onClick={onAdd}>+</button>
      </div>
    </div>
  )
}

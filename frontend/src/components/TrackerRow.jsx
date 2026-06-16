import { useEffect, useRef, useState } from 'react'
import { deleteTracker, setCaloriesToday, setWaterToday, updateTracker } from '../api/trackers'

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

function rawValue(type, data) {
  if (!data) return ''
  if (type === 'weight') return data.value.toFixed(1)
  if (type === 'calories') return String(Math.round(data.manual_value ?? data.value))
  return String(Math.round(data.value))
}

export default function TrackerRow({ type, data, calorieLimit, mealsBreakdown, onAdd, onEdited, onDeleted }) {
  const cfg = CONFIG[type]
  const formatted = formatValue(type, data)

  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  function startEdit() {
    setEditVal(rawValue(type, data))
    setEditing(true)
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function cancelEdit() {
    setEditing(false)
    setSaving(false)
  }

  async function confirmEdit() {
    const num = parseFloat(editVal)
    if (isNaN(num) || num < 0 || !data?.id) { cancelEdit(); return }
    setSaving(true)
    try {
      if (type === 'water') {
        await setWaterToday(num)
        setEditing(false)
        onDeleted?.(type)
      } else if (type === 'calories') {
        await setCaloriesToday(num)
        setEditing(false)
        onDeleted?.(type)
      } else {
        await updateTracker(data.id, num)
        onEdited?.(type, num)
        setEditing(false)
      }
    } catch (_) {}
    setSaving(false)
  }

  async function handleDelete() {
    if (!data?.id) return
    setSaving(true)
    try {
      if (type === 'water') {
        await setWaterToday(0)
      } else if (type === 'calories') {
        await setCaloriesToday(0)
      } else {
        await deleteTracker(data.id)
      }
      onDeleted?.(type)
    } catch (_) {}
    setSaving(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') confirmEdit()
    if (e.key === 'Escape') cancelEdit()
  }

  const hasMeals = mealsBreakdown && Object.values(mealsBreakdown).some(v => v > 0)

  return (
    <div className="tracker-row-wrap">
      <div className="tracker-row">
        <div className="tracker-row__left">
          <span className="tracker-row__label">{cfg.label}</span>
        </div>
        <div className="tracker-row__right">
          {editing ? (
            <>
              <input
                ref={inputRef}
                className="tracker-row__edit-input"
                type="number"
                value={editVal}
                step={type === 'weight' ? '0.1' : '1'}
                min="0"
                onChange={(e) => setEditVal(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={saving}
              />
              <button className="tracker-row__edit-btn tracker-row__edit-btn--confirm" onClick={confirmEdit} disabled={saving}>✓</button>
              <button className="tracker-row__edit-btn tracker-row__edit-btn--cancel" onClick={cancelEdit} disabled={saving}>✗</button>
            </>
          ) : (
            <>
              <span className={`tracker-row__value ${formatted ? 'tracker-row__value--filled' : ''}`}>
                {formatted ?? '—'}
              </span>
              {data?.id && (
                <button className="tracker-row__edit" onClick={startEdit} title="Редактировать">
                  ✏
                </button>
              )}
              {data?.id && (type !== 'calories' || (data?.manual_value ?? 0) > 0) && (
                <button className="tracker-row__del" onClick={handleDelete} disabled={saving} title="Удалить">
                  🗑
                </button>
              )}
              <button className="tracker-row__add" onClick={onAdd}>+</button>
            </>
          )}
        </div>
      </div>
      {hasMeals && (
        <div className="meals-breakdown meals-breakdown--inline">
          {[
            ['breakfast',    'Завтрак'],
            ['lunch',        'Обед'],
            ['dinner',       'Ужин'],
            ['snack',        'Перекус'],
            ['uncategorized','Без категории'],
          ].filter(([key]) => mealsBreakdown[key] > 0).map(([key, label]) => (
            <div key={key} className="meals-breakdown__row">
              <span className="meals-breakdown__label">{label}</span>
              <span className="meals-breakdown__value">{mealsBreakdown[key]} ккал</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

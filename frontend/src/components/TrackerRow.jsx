import { useEffect, useRef, useState } from 'react'
import { updateTracker } from '../api/trackers'

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
  return String(Math.round(data.value))
}

export default function TrackerRow({ type, data, calorieLimit, onAdd, onEdited }) {
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
      await updateTracker(data.id, num)
      onEdited?.(type, num)
      setEditing(false)
    } catch (_) {}
    setSaving(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') confirmEdit()
    if (e.key === 'Escape') cancelEdit()
  }

  return (
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
            <button className="tracker-row__add" onClick={onAdd}>+</button>
          </>
        )}
      </div>
    </div>
  )
}

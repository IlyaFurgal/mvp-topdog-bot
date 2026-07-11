import { useState } from 'react'
import { createWorkout, updateWorkout } from '../api/workouts'

export default function WorkoutModal({ editWorkout, initialDate, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const today = new Date().toISOString().split('T')[0]

  const [date, setDate] = useState(editWorkout?.date ?? initialDate ?? today)
  const [time, setTime] = useState(editWorkout?.planned_time ?? '')
  const [note, setNote] = useState(editWorkout?.note ?? '')
  const [durationMin, setDurationMin] = useState(
    editWorkout?.duration_min != null ? String(editWorkout.duration_min) : ''
  )
  const [rpe, setRpe] = useState(editWorkout?.rpe ?? null)

  async function handleSubmit() {
    if (!date) return
    setSaving(true)
    setError('')
    try {
      const durationNum = parseInt(durationMin, 10)
      const body = {
        date,
        note: note.trim() || null,
        planned_time: time || null,
        duration_min: !isNaN(durationNum) && durationNum > 0 ? durationNum : null,
        rpe,
      }
      if (editWorkout) {
        await updateWorkout(editWorkout.id, body)
      } else {
        await createWorkout({ ...body, category_id: null, entries: [] })
      }
      onSaved()
    } catch (e) {
      setError('Не удалось сохранить. Попробуй ещё раз.')
      setSaving(false)
    }
  }

  return (
    <div className="page club-page workout-page-overlay">
      <button className="club-back" onClick={onClose}>‹ НАЗАД</button>

      <div className="tracker-page-title-plate skew-chip">
        <span className="tracker-page-title">
          {editWorkout ? 'РЕДАКТИРОВАТЬ ТРЕНИРОВКУ' : 'ЗАПИСАТЬ ТРЕНИРОВКУ'}
        </span>
      </div>

      <div className="workout-modal__form">
        {/* date */}
        <div className="wf-section">
          <label className="wf-label">ДАТА</label>
          <input
            type="date"
            className="field-input"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        {/* duration */}
        <div className="wf-section">
          <label className="wf-label">ДЛИТЕЛЬНОСТЬ (МИН)</label>
          <input
            type="number"
            inputMode="numeric"
            className="field-input"
            placeholder="напр. 60"
            min="1"
            value={durationMin}
            onChange={e => setDurationMin(e.target.value)}
          />
        </div>

        {/* RPE */}
        <div className="wf-section">
          <label className="wf-label">RPE — НАСКОЛЬКО ТЯЖЕЛО ПРОШЛА (НЕОБЯЗАТЕЛЬНО)</label>
          <input
            type="number"
            inputMode="numeric"
            className="field-input"
            placeholder="1–10"
            min="1"
            max="10"
            value={rpe ?? ''}
            onChange={e => {
              const v = e.target.value
              if (v === '') { setRpe(null); return }
              const n = Math.max(1, Math.min(10, parseInt(v, 10) || 0))
              setRpe(n)
            }}
          />
        </div>

        {/* note */}
        <div className="wf-section">
          <label className="wf-label">ЗАМЕТКА</label>
          <textarea
            className="additional-info-textarea"
            placeholder="Напиши заметку о тренировке..."
            value={note}
            rows={3}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        {error && <p className="wf-error">{error}</p>}

        <button
          className="btn tracker-save-btn--side"
          onClick={handleSubmit}
          disabled={saving || !date}
          style={{ marginTop: 8 }}
        >
          {saving ? 'СОХРАНЯЕМ...' : 'СОХРАНИТЬ'}
        </button>
      </div>
    </div>
  )
}

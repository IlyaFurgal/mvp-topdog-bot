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
    <div className="workout-modal">
      <div className="workout-modal__header">
        <button className="checkin-flow__back" onClick={onClose}>‹</button>
        <span className="workout-modal__title">
          {editWorkout ? 'РЕДАКТИРОВАТЬ ТРЕНИРОВКУ' : 'НОВАЯ ТРЕНИРОВКА'}
        </span>
      </div>

      <div className="workout-modal__form">
        {/* Date + time */}
        <div className="wf-section">
          <label className="wf-label">ДАТА И ВРЕМЯ</label>
          <div className="wf-inline">
            <input
              type="date"
              className="wf-input wf-input--flex"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
            <input
              type="time"
              className="wf-input"
              value={time}
              onChange={e => setTime(e.target.value)}
            />
          </div>
        </div>

        {/* duration */}
        <div className="wf-section">
          <label className="wf-label">ДЛИТЕЛЬНОСТЬ (МИН, НЕОБЯЗАТЕЛЬНО)</label>
          <input
            type="number"
            inputMode="numeric"
            className="wf-input"
            placeholder="напр. 60"
            min="1"
            value={durationMin}
            onChange={e => setDurationMin(e.target.value)}
          />
        </div>

        {/* RPE */}
        <div className="wf-section">
          <label className="wf-label">RPE — НАСКОЛЬКО ТЯЖЕЛО ПРОШЛА (НЕОБЯЗАТЕЛЬНО)</label>
          <div className="checkin-flow__rpe">
            {[1,2,3,4,5,6,7,8,9,10].map((n) => (
              <button
                key={n}
                type="button"
                className={`checkin-flow__rpe-btn ${n >= 8 ? 'checkin-flow__rpe-btn--high' : n >= 5 ? 'checkin-flow__rpe-btn--mid' : ''}${rpe === n ? ' checkin-flow__rpe-btn--selected' : ''}`}
                onClick={() => setRpe(rpe === n ? null : n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* note */}
        <div className="wf-section">
          <label className="wf-label">ЗАМЕТКА (необязательно)</label>
          <textarea
            className="wf-textarea"
            placeholder="Напиши заметку о тренировке..."
            value={note}
            rows={3}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        {error && <p className="wf-error">{error}</p>}

        <button
          className="btn btn-accent"
          onClick={handleSubmit}
          disabled={saving || !date}
        >
          {saving ? 'СОХРАНЯЕМ...' : (editWorkout ? 'СОХРАНИТЬ' : 'ЗАПИСАТЬ ТРЕНИРОВКУ')}
        </button>
      </div>
    </div>
  )
}

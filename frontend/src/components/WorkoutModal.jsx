import { useState } from 'react'
import { createWorkout, updateWorkout } from '../api/workouts'

export default function WorkoutModal({ editWorkout, initialDate, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  const [date, setDate] = useState(editWorkout?.date ?? initialDate ?? today)
  const [time, setTime] = useState(editWorkout?.planned_time ?? '')
  const [note, setNote] = useState(editWorkout?.note ?? '')

  async function handleSubmit() {
    if (!date) return
    setSaving(true)
    try {
      const body = {
        date,
        note: note.trim() || null,
        planned_time: time || null,
      }
      if (editWorkout) {
        await updateWorkout(editWorkout.id, body)
      } else {
        await createWorkout({ ...body, category_id: null, entries: [] })
      }
      onSaved()
    } catch (_) {}
    setSaving(false)
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

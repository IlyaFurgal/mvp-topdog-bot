import { useEffect, useState } from 'react'
import { createWorkout, createWorkoutItem, getWorkoutItems, updateWorkout } from '../api/workouts'

export default function WorkoutModal({ categories, editWorkout, initialDate, onClose, onSaved }) {
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)

  // Custom exercises still need a category_id in the DB (workout_items.category_id
  // is NOT NULL), but the user no longer picks one — pick a fixed default silently.
  const defaultCategoryId = categories.find(c => c.code === 'gym')?.id ?? categories[0]?.id ?? null

  const today = new Date().toISOString().split('T')[0]

  // ── Common fields ─────────────────────────────────────────────────────────
  const [date, setDate] = useState(editWorkout?.date ?? initialDate ?? today)
  const [durationMin, setDurationMin] = useState(
    editWorkout?.duration_min != null ? String(editWorkout.duration_min) : ''
  )
  const [note, setNote] = useState(editWorkout?.note ?? '')

  // ── unified exercise list (no category pre-selection) ─────────────────────
  const initEntries = editWorkout?.entries?.length
    ? editWorkout.entries.map(e => ({
        item_id: e.item_id,
        item_name: e.item_name ?? '',
        isCustom: false,
        customName: '',
        weight: e.weight_kg != null ? String(e.weight_kg) : '',
        reps: e.reps != null ? String(e.reps) : '',
        sets: e.sets != null ? String(e.sets) : '',
      }))
    : [emptyEntry()]
  const [entries, setEntries] = useState(initEntries)

  useEffect(() => {
    getWorkoutItems().then(setItems).catch(() => setItems([]))
  }, [])

  function emptyEntry() {
    return { item_id: null, item_name: '', isCustom: false, customName: '', weight: '', reps: '', sets: '' }
  }

  function updEntry(i, patch) {
    setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, ...patch } : e))
  }

  async function createCustomItem(i) {
    const name = entries[i].customName.trim()
    if (!name || !defaultCategoryId) return
    setSaving(true)
    try {
      const item = await createWorkoutItem(defaultCategoryId, name)
      setItems(prev => [...prev, item])
      updEntry(i, { item_id: item.id, item_name: item.name, isCustom: false, customName: '' })
    } catch (_) {}
    setSaving(false)
  }

  function buildEntries() {
    return entries
      .filter(e => e.item_id != null)
      .map(e => ({
        item_id: e.item_id,
        weight_kg: e.weight ? parseFloat(e.weight) || null : null,
        reps: e.reps ? parseInt(e.reps, 10) || null : null,
        sets: e.sets ? parseInt(e.sets, 10) || null : null,
      }))
  }

  async function handleSubmit() {
    if (!date) return
    setSaving(true)
    try {
      const body = {
        date,
        category_id: null,
        duration_min: durationMin ? parseInt(durationMin, 10) || null : null,
        note: note.trim() || null,
        entries: buildEntries(),
      }
      if (editWorkout) {
        await updateWorkout(editWorkout.id, body)
      } else {
        await createWorkout(body)
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
        {/* Date */}
        <div className="wf-section">
          <label className="wf-label">ДАТА</label>
          <input
            type="date"
            className="wf-input"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        {/* exercise entries — unified list, no sport-type pre-selection */}
        <div className="wf-section">
          <label className="wf-label">УПРАЖНЕНИЯ</label>
          {entries.map((e, i) => (
            <div key={i} className="wf-entry">
              {e.isCustom ? (
                <div className="wf-custom-row">
                  <input
                    className="wf-input wf-input--flex"
                    placeholder="Название упражнения..."
                    value={e.customName}
                    onChange={ev => updEntry(i, { customName: ev.target.value })}
                    autoFocus
                  />
                  <button
                    className="wf-add-btn"
                    onClick={() => createCustomItem(i)}
                    disabled={saving || !e.customName.trim()}
                  >Добавить</button>
                  <button
                    className="wf-icon-btn"
                    onClick={() => updEntry(i, { isCustom: false, customName: '' })}
                  >✕</button>
                </div>
              ) : (
                <div className="wf-entry-row">
                  <select
                    className="wf-select wf-select--flex"
                    value={e.item_id ?? ''}
                    onChange={ev => {
                      if (ev.target.value === '__custom__') {
                        updEntry(i, { isCustom: true, item_id: null, item_name: '' })
                      } else {
                        const id = ev.target.value ? parseInt(ev.target.value, 10) : null
                        const found = items.find(it => it.id === id)
                        updEntry(i, { item_id: id, item_name: found?.name ?? '' })
                      }
                    }}
                  >
                    <option value="">— упражнение —</option>
                    {items.map(it => (
                      <option key={it.id} value={it.id}>{it.name}</option>
                    ))}
                    <option value="__custom__">Своё упражнение…</option>
                  </select>
                  {entries.length > 1 && (
                    <button
                      className="wf-icon-btn"
                      onClick={() => setEntries(prev => prev.filter((_, idx) => idx !== i))}
                    >✕</button>
                  )}
                </div>
              )}
              {!e.isCustom && e.item_id && (
                <div className="wf-metrics-row">
                  <div className="wf-metric">
                    <input
                      type="number"
                      inputMode="decimal"
                      className="wf-num"
                      placeholder="кг"
                      value={e.weight}
                      step="0.5"
                      min="0"
                      onChange={ev => updEntry(i, { weight: ev.target.value })}
                    />
                    <span className="wf-unit">кг</span>
                  </div>
                  <span className="wf-times">×</span>
                  <div className="wf-metric">
                    <input
                      type="number"
                      inputMode="numeric"
                      className="wf-num"
                      placeholder="повт"
                      value={e.reps}
                      min="0"
                      onChange={ev => updEntry(i, { reps: ev.target.value })}
                    />
                    <span className="wf-unit">п</span>
                  </div>
                  <span className="wf-times">×</span>
                  <div className="wf-metric">
                    <input
                      type="number"
                      inputMode="numeric"
                      className="wf-num"
                      placeholder="подх"
                      value={e.sets}
                      min="0"
                      onChange={ev => updEntry(i, { sets: ev.target.value })}
                    />
                    <span className="wf-unit">под</span>
                  </div>
                </div>
              )}
            </div>
          ))}
          <button
            className="wf-link-btn"
            onClick={() => setEntries(prev => [...prev, emptyEntry()])}
          >+ Добавить упражнение</button>
        </div>

        {/* duration_min */}
        <div className="wf-section">
          <label className="wf-label">ДЛИТЕЛЬНОСТЬ (необязательно)</label>
          <div className="wf-inline">
            <input
              type="number"
              inputMode="numeric"
              className="wf-input wf-input--big"
              placeholder="0"
              value={durationMin}
              min="1"
              onChange={e => setDurationMin(e.target.value)}
            />
            <span className="wf-unit-lg">мин</span>
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

import { useEffect, useState } from 'react'
import { createWorkout, createWorkoutItem, getWorkoutItems, updateWorkout } from '../api/workouts'

const CAT_EMOJIS = {
  gym: '🏋', bodybuilding: '💪', fitness: '🧘',
  combat: '🥊', running: '🏃', swimming: '🏊', team_sports: '⚽',
}

export default function WorkoutModal({ categories, editWorkout, initialDate, onClose, onSaved }) {
  const [step, setStep] = useState(editWorkout ? 2 : 1)
  const [cat, setCat] = useState(() =>
    editWorkout ? (categories.find(c => c.id === editWorkout.category_id) ?? null) : null
  )
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  // ── Common fields ─────────────────────────────────────────────────────────
  const [date, setDate] = useState(editWorkout?.date ?? initialDate ?? today)
  const [durationMin, setDurationMin] = useState(
    editWorkout?.duration_min != null ? String(editWorkout.duration_min) : ''
  )
  const [note, setNote] = useState(editWorkout?.note ?? '')

  // ── strength: multi-entry list ────────────────────────────────────────────
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

  // ── distance_time / duration_rounds / duration_only (single entry) ────────
  const fe = editWorkout?.entries?.[0]
  const [itemId, setItemId] = useState(fe?.item_id ?? null)
  const [distanceKm, setDistanceKm] = useState(
    fe?.distance_m != null ? String(+(fe.distance_m / 1000).toFixed(3)) : ''
  )
  const [timeMin, setTimeMin] = useState(
    fe?.time_sec != null ? String(Math.floor(fe.time_sec / 60)) : ''
  )
  const [timeSec, setTimeSec] = useState(
    fe?.time_sec != null ? String(fe.time_sec % 60) : ''
  )
  const [rounds, setRounds] = useState(fe?.rounds != null ? String(fe.rounds) : '')

  useEffect(() => {
    if (cat?.id) getWorkoutItems(cat.id).then(setItems).catch(() => setItems([]))
  }, [cat?.id])

  function emptyEntry() {
    return { item_id: null, item_name: '', isCustom: false, customName: '', weight: '', reps: '', sets: '' }
  }

  function updEntry(i, patch) {
    setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, ...patch } : e))
  }

  async function createCustomItem(i) {
    const name = entries[i].customName.trim()
    if (!name || !cat) return
    setSaving(true)
    try {
      const item = await createWorkoutItem(cat.id, name)
      setItems(prev => [...prev, item])
      updEntry(i, { item_id: item.id, item_name: item.name, isCustom: false, customName: '' })
    } catch (_) {}
    setSaving(false)
  }

  function buildEntries() {
    const mt = cat.metric_type
    if (mt === 'strength') {
      return entries
        .filter(e => e.item_id != null)
        .map(e => ({
          item_id: e.item_id,
          weight_kg: e.weight ? parseFloat(e.weight) || null : null,
          reps: e.reps ? parseInt(e.reps, 10) || null : null,
          sets: e.sets ? parseInt(e.sets, 10) || null : null,
        }))
    }
    if (mt === 'distance_time') {
      const distM = distanceKm ? Math.round(parseFloat(distanceKm) * 1000) || null : null
      const tSec = ((parseInt(timeMin, 10) || 0) * 60 + (parseInt(timeSec, 10) || 0)) || null
      return [{ item_id: itemId, distance_m: distM, time_sec: tSec }]
    }
    if (mt === 'duration_rounds') {
      const tSec = ((parseInt(timeMin, 10) || 0) * 60 + (parseInt(timeSec, 10) || 0)) || null
      return [{ item_id: itemId, rounds: rounds ? parseInt(rounds, 10) || null : null, time_sec: tSec }]
    }
    if (mt === 'duration_only') {
      return itemId ? [{ item_id: itemId }] : []
    }
    return []
  }

  async function handleSubmit() {
    if (!cat || !date) return
    setSaving(true)
    try {
      const body = {
        date,
        category_id: cat.id,
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

  // ── Step 1: category selection ────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="workout-modal">
        <div className="workout-modal__header">
          <button className="checkin-flow__back" onClick={onClose}>‹</button>
          <span className="workout-modal__title">ВЫБЕРИ ТРЕНИРОВКУ</span>
        </div>
        <div className="wf-cat-grid">
          {categories.map(c => (
            <button
              key={c.id}
              className="wf-cat-card"
              onClick={() => { setCat(c); setStep(2) }}
            >
              <span className="wf-cat-emoji">{CAT_EMOJIS[c.code] ?? '🏃'}</span>
              <span className="wf-cat-name">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Step 2: form ──────────────────────────────────────────────────────────
  const mt = cat?.metric_type
  const hasItems = mt === 'distance_time' || mt === 'duration_rounds' ||
    (mt === 'duration_only' && cat?.code === 'team_sports')
  const durationRequired = mt === 'duration_only'

  return (
    <div className="workout-modal">
      <div className="workout-modal__header">
        <button
          className="checkin-flow__back"
          onClick={() => editWorkout ? onClose() : setStep(1)}
        >‹</button>
        <span className="workout-modal__title">
          {CAT_EMOJIS[cat?.code] ?? ''} {cat?.name?.toUpperCase()}
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

        {/* Item select (style / surface / sport / martial art) */}
        {hasItems && (
          <div className="wf-section">
            <label className="wf-label">
              {cat?.item_label?.toUpperCase() ?? 'ВИД'}
              {mt !== 'duration_only' ? ' (необязательно)' : ''}
            </label>
            <select
              className="wf-select"
              value={itemId ?? ''}
              onChange={e => setItemId(e.target.value ? parseInt(e.target.value, 10) : null)}
            >
              <option value="">— не выбрано —</option>
              {items.map(it => (
                <option key={it.id} value={it.id}>{it.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* strength: exercise entries */}
        {mt === 'strength' && (
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
        )}

        {/* distance_time */}
        {mt === 'distance_time' && (
          <>
            <div className="wf-section">
              <label className="wf-label">ДИСТАНЦИЯ</label>
              <div className="wf-inline">
                <input
                  type="number"
                  inputMode="decimal"
                  className="wf-input wf-input--big"
                  placeholder="0.0"
                  value={distanceKm}
                  step="0.1"
                  min="0"
                  onChange={e => setDistanceKm(e.target.value)}
                />
                <span className="wf-unit-lg">км</span>
              </div>
            </div>
            <div className="wf-section">
              <label className="wf-label">ВРЕМЯ</label>
              <div className="wf-time-row">
                <input
                  type="number"
                  inputMode="numeric"
                  className="wf-num wf-num--time"
                  placeholder="00"
                  value={timeMin}
                  min="0"
                  onChange={e => setTimeMin(e.target.value)}
                />
                <span className="wf-colon">:</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="wf-num wf-num--time"
                  placeholder="00"
                  value={timeSec}
                  min="0"
                  max="59"
                  onChange={e => setTimeSec(e.target.value)}
                />
                <span className="wf-unit">мин:сек</span>
              </div>
            </div>
          </>
        )}

        {/* duration_rounds */}
        {mt === 'duration_rounds' && (
          <>
            <div className="wf-section">
              <label className="wf-label">РАУНДЫ</label>
              <div className="wf-inline">
                <input
                  type="number"
                  inputMode="numeric"
                  className="wf-input wf-input--big"
                  placeholder="0"
                  value={rounds}
                  min="1"
                  onChange={e => setRounds(e.target.value)}
                />
                <span className="wf-unit-lg">раундов</span>
              </div>
            </div>
            <div className="wf-section">
              <label className="wf-label">ВРЕМЯ (необязательно)</label>
              <div className="wf-time-row">
                <input
                  type="number"
                  inputMode="numeric"
                  className="wf-num wf-num--time"
                  placeholder="00"
                  value={timeMin}
                  min="0"
                  onChange={e => setTimeMin(e.target.value)}
                />
                <span className="wf-colon">:</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="wf-num wf-num--time"
                  placeholder="00"
                  value={timeSec}
                  min="0"
                  max="59"
                  onChange={e => setTimeSec(e.target.value)}
                />
                <span className="wf-unit">мин:сек</span>
              </div>
            </div>
          </>
        )}

        {/* duration_only or all: duration_min */}
        <div className="wf-section">
          <label className="wf-label">
            ДЛИТЕЛЬНОСТЬ{durationRequired ? '' : ' (необязательно)'}
          </label>
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
          disabled={saving || !date || (durationRequired && !durationMin)}
        >
          {saving ? 'СОХРАНЯЕМ...' : (editWorkout ? 'СОХРАНИТЬ' : 'ЗАПИСАТЬ ТРЕНИРОВКУ')}
        </button>
      </div>
    </div>
  )
}

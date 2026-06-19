import { useEffect, useState } from 'react'
import { deleteWorkout, getWorkoutCategories, getWorkouts } from '../api/workouts'
import WorkoutModal from './WorkoutModal'

// ── Formatters ──────────────────────────────────────────────────────────────

const MONTHS = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']

function fmtDate(str) {
  const d = new Date(str + 'T00:00:00')
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

function fmtTime(sec) {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function calcPace(time_sec, distance_m) {
  if (!time_sec || !distance_m) return null
  const paceSecPerKm = time_sec / (distance_m / 1000)
  const m = Math.floor(paceSecPerKm / 60)
  const s = Math.round(paceSecPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}/км`
}

function fmtSummary(w, mt) {
  const entries = w.entries ?? []
  if (mt === 'strength') {
    const parts = entries
      .filter(e => e.item_name)
      .slice(0, 3)
      .map(e => {
        let s = e.item_name
        if (e.weight_kg != null && e.reps != null && e.sets != null)
          s += ` ${e.weight_kg}кг×${e.reps}×${e.sets}`
        else if (e.weight_kg != null)
          s += ` ${e.weight_kg}кг`
        return s
      })
    return parts.join(', ') + (entries.length > 3 ? '…' : '')
  }
  if (mt === 'distance_time') {
    const e = entries[0]
    const parts = []
    if (e?.item_name) parts.push(e.item_name)
    if (e?.distance_m) parts.push(`${+(e.distance_m / 1000).toFixed(1)} км`)
    if (e?.time_sec) {
      parts.push(fmtTime(e.time_sec))
      const pace = calcPace(e.time_sec, e.distance_m)
      if (pace) parts.push(`темп ${pace}`)
    }
    if (w.duration_min && !e?.time_sec) parts.push(`${w.duration_min} мин`)
    return parts.join(' · ')
  }
  if (mt === 'duration_rounds') {
    const e = entries[0]
    const parts = []
    if (e?.item_name) parts.push(e.item_name)
    if (e?.rounds) parts.push(`${e.rounds} раундов`)
    if (w.duration_min) parts.push(`${w.duration_min} мин`)
    else if (e?.time_sec) parts.push(fmtTime(e.time_sec))
    return parts.join(' · ')
  }
  if (mt === 'duration_only') {
    const e = entries[0]
    const parts = []
    if (e?.item_name) parts.push(e.item_name)
    if (w.duration_min) parts.push(`${w.duration_min} мин`)
    return parts.join(' · ')
  }
  return w.duration_min ? `${w.duration_min} мин` : ''
}

// ── WorkoutHistoryItem ──────────────────────────────────────────────────────

function WorkoutHistoryItem({ workout, mt, onEdit, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false)

  return (
    <div className="wo-item">
      <div className="wo-item__row">
        <div className="wo-item__info">
          <span className="wo-item__date">{fmtDate(workout.date)}</span>
          <span className="wo-item__cat">{workout.category_name}</span>
          {fmtSummary(workout, mt) && (
            <span className="wo-item__summary">{fmtSummary(workout, mt)}</span>
          )}
        </div>
        <div className="wo-item__actions">
          <button className="tracker-row__edit" onClick={onEdit} title="Редактировать">✏</button>
          <button
            className="tracker-row__del"
            onClick={() => setConfirmDel(true)}
            title="Удалить"
          >🗑</button>
        </div>
      </div>
      {confirmDel && (
        <div className="wo-item__confirm">
          <span className="wo-item__confirm-text">Удалить тренировку?</span>
          <button className="wo-item__confirm-yes" onClick={onDelete}>Да</button>
          <button className="wo-item__confirm-no" onClick={() => setConfirmDel(false)}>Нет</button>
        </div>
      )}
    </div>
  )
}

// ── WorkoutBlock ────────────────────────────────────────────────────────────

export default function WorkoutBlock() {
  const [categories, setCategories] = useState([])
  const [workouts, setWorkouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editWorkout, setEditWorkout] = useState(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    getWorkoutCategories().then(setCategories).catch(() => {})
    loadWorkouts()
  }, [])

  async function loadWorkouts() {
    try {
      const from = new Date()
      from.setDate(from.getDate() - 60)
      const data = await getWorkouts(from.toISOString().split('T')[0])
      setWorkouts(data)
    } catch (_) {}
    setLoading(false)
  }

  const catMap = Object.fromEntries(categories.map(c => [c.id, c]))
  const shown = showAll ? workouts : workouts.slice(0, 3)

  async function handleDelete(id) {
    try {
      await deleteWorkout(id)
      setWorkouts(prev => prev.filter(w => w.id !== id))
    } catch (_) {}
  }

  function openEdit(w) {
    setEditWorkout(w)
    setModalOpen(true)
  }

  function handleSaved() {
    setModalOpen(false)
    setEditWorkout(null)
    loadWorkouts()
  }

  function handleClose() {
    setModalOpen(false)
    setEditWorkout(null)
  }

  return (
    <>
      {modalOpen && categories.length > 0 && (
        <WorkoutModal
          categories={categories}
          editWorkout={editWorkout}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}

      <div className="card tracker-card">
        <div className="wo-block-header">
          <span className="tracker-row__label">ТРЕНИРОВКИ</span>
          <button className="tracker-row__add" onClick={() => { setEditWorkout(null); setModalOpen(true) }}>+</button>
        </div>

        {loading && (
          <p className="wo-empty">Загрузка...</p>
        )}

        {!loading && workouts.length === 0 && (
          <p className="wo-empty">Ещё нет записей · нажми +</p>
        )}

        {shown.map(w => (
          <WorkoutHistoryItem
            key={w.id}
            workout={w}
            mt={catMap[w.category_id]?.metric_type}
            onEdit={() => openEdit(w)}
            onDelete={() => handleDelete(w.id)}
          />
        ))}

        {workouts.length > 3 && (
          <button className="wo-show-all" onClick={() => setShowAll(v => !v)}>
            {showAll ? 'Свернуть ↑' : `Показать все (${workouts.length}) →`}
          </button>
        )}
      </div>
    </>
  )
}

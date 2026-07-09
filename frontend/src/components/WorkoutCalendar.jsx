import { useEffect, useState } from 'react'
import { deleteWorkout, getWorkoutCategories, getWorkouts, updateWorkout } from '../api/workouts'
import WorkoutModal from './WorkoutModal'

const DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTHS_RU = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь',
]
const MONTHS_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']

const CAT_COLORS = {
  gym:          '#aaff00',
  bodybuilding: '#aaff00',
  running:      '#3b82f6',
  swimming:     '#06b6d4',
  combat:       '#f97316',
  team_sports:  '#a855f7',
  cycling:      '#f59e0b',
}

function fmtTime(sec) {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtSummary(w, mt) {
  const entries = w.entries ?? []
  if (mt === 'strength') {
    const parts = entries.filter(e => e.item_name).slice(0, 2).map(e => {
      let s = e.item_name
      if (e.weight_kg != null && e.reps != null) s += ` ${+e.weight_kg}×${e.reps}`
      return s
    })
    return parts.join(', ') + (entries.length > 2 ? '…' : '')
  }
  if (mt === 'distance_time') {
    const e = entries[0]
    const parts = []
    if (e?.distance_m) parts.push(`${+(e.distance_m / 1000).toFixed(1)} км`)
    if (e?.time_sec)   parts.push(fmtTime(e.time_sec))
    return parts.join(' · ')
  }
  if (mt === 'duration_rounds') {
    const e = entries[0]
    const parts = []
    if (e?.rounds)      parts.push(`${e.rounds} раундов`)
    if (w.duration_min) parts.push(`${w.duration_min} мин`)
    return parts.join(' · ')
  }
  if (mt === 'duration_only') {
    return w.duration_min ? `${w.duration_min} мин` : ''
  }
  return w.duration_min ? `${w.duration_min} мин` : ''
}

export default function WorkoutCalendar() {
  const now = new Date()
  const [year, setYear]           = useState(now.getFullYear())
  const [month, setMonth]         = useState(now.getMonth())
  const [workouts, setWorkouts]   = useState([])
  const [categories, setCategories] = useState([])
  const [selectedDay, setSelectedDay] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editWorkout, setEditWorkout] = useState(null)
  const [rescheduleFor, setRescheduleFor] = useState(null) // workout id
  const [rescheduleTime, setRescheduleTime] = useState('')

  useEffect(() => {
    getWorkoutCategories().then(setCategories).catch(() => {})
  }, [])

  function loadMonth() {
    setLoading(true)
    const from = new Date(year, month, 1).toISOString().split('T')[0]
    const to   = new Date(year, month + 1, 0).toISOString().split('T')[0]
    getWorkouts(from, to)
      .then(setWorkouts)
      .catch(() => setWorkouts([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setSelectedDay(null)
    loadMonth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  function openAdd() {
    setEditWorkout(null)
    setModalOpen(true)
  }
  function openEdit(w) {
    setEditWorkout(w)
    setModalOpen(true)
  }
  function closeModal() {
    setModalOpen(false)
    setEditWorkout(null)
  }
  function handleSaved() {
    closeModal()
    loadMonth()
  }
  async function handleDelete(id) {
    try {
      await deleteWorkout(id)
      loadMonth()
    } catch (_) {}
  }

  function openReschedule(w) {
    setRescheduleFor(w.id)
    setRescheduleTime(w.planned_time ?? '')
  }
  function closeReschedule() {
    setRescheduleFor(null)
    setRescheduleTime('')
  }
  async function handleReschedule() {
    if (!rescheduleTime) return
    try {
      await updateWorkout(rescheduleFor, { planned_time: rescheduleTime })
      closeReschedule()
      loadMonth()
    } catch (_) {}
  }

  const catMap = Object.fromEntries(categories.map(c => [c.id, c]))

  // date string → workout[]
  const dayMap = {}
  for (const w of workouts) {
    if (!dayMap[w.date]) dayMap[w.date] = []
    dayMap[w.date].push(w)
  }

  // Calendar grid, Monday-first
  const firstDow  = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMon = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMon; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const today = new Date()
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()

  const selectedKey = selectedDay
    ? `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
    : null
  const selectedWorkouts = selectedKey ? (dayMap[selectedKey] ?? []) : []

  return (
    <div className="wo-calendar">
      {/* Navigation */}
      <div className="wo-cal-nav">
        <button className="wo-cal-btn" onClick={prevMonth}>‹</button>
        <span className="wo-cal-month">{MONTHS_RU[month]} {year}</span>
        <button className="wo-cal-btn" onClick={nextMonth}>›</button>
      </div>

      {/* Day-of-week header */}
      <div className="wo-cal-grid">
        {DAYS_SHORT.map(d => (
          <div key={d} className="wo-cal-dow">{d}</div>
        ))}

        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} className="wo-cal-cell wo-cal-cell--empty" />
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayW = dayMap[key] ?? []
          const isToday    = isCurrentMonth && day === today.getDate()
          const isSelected = selectedDay === day
          const hasDots    = dayW.length > 0

          const dotColors = [
            ...new Set(dayW.map(w => CAT_COLORS[catMap[w.category_id]?.code] ?? '#aaff00'))
          ].slice(0, 3)

          return (
            <div
              key={key}
              className={[
                'wo-cal-cell',
                isToday    ? 'wo-cal-cell--today'    : '',
                isSelected ? 'wo-cal-cell--selected' : '',
                hasDots    ? 'wo-cal-cell--active'   : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setSelectedDay(selectedDay === day ? null : day)}
            >
              <span className="wo-cal-day-num">{day}</span>
              {hasDots && (
                <div className="wo-cal-dots">
                  {dotColors.map((color, idx) => (
                    <span key={idx} className="wo-cal-dot" style={{ background: color }} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {loading && <p className="wo-cal-loading">Загрузка...</p>}

      {/* Day detail */}
      {selectedDay && (
        <div className="wo-cal-detail">
          <div className="wo-cal-detail-header">
            <span className="wo-cal-detail-date">{selectedDay} {MONTHS_SHORT[month]}</span>
            <button className="wo-cal-detail-add" onClick={openAdd}>+</button>
          </div>

          {selectedWorkouts.length === 0 && (
            <p className="wo-cal-detail-empty">Нет тренировок на этот день</p>
          )}

          {selectedWorkouts.map(w => {
            const cat    = catMap[w.category_id]
            const color  = CAT_COLORS[cat?.code] ?? '#aaff00'
            const summary = fmtSummary(w, cat?.metric_type)
            return (
              <div key={w.id} className="wo-cal-detail-item">
                <div className="wo-cal-detail-item__text">
                  <span className="wo-cal-detail-cat" style={{ color }}>{cat?.name ?? '—'}</span>
                  {w.planned_time && <span className="wo-cal-detail-summary">🕐 {w.planned_time}</span>}
                  {summary && <span className="wo-cal-detail-summary">{summary}</span>}
                  {w.note  && <span className="wo-cal-detail-note">{w.note}</span>}
                </div>
                <div className="wo-cal-detail-item__actions">
                  <button className="tracker-row__edit" onClick={() => openReschedule(w)} title="Перенести тренировку">🕐</button>
                  <button className="tracker-row__edit" onClick={() => openEdit(w)} title="Редактировать">✏</button>
                  <button className="tracker-row__del" onClick={() => handleDelete(w.id)} title="Удалить">🗑</button>
                </div>
                {rescheduleFor === w.id && (
                  <div className="wo-cal-reschedule">
                    <input
                      type="time"
                      className="wo-cal-reschedule-input"
                      value={rescheduleTime}
                      onChange={(e) => setRescheduleTime(e.target.value)}
                      autoFocus
                    />
                    <button className="wo-cal-reschedule-save" onClick={handleReschedule} disabled={!rescheduleTime}>Перенести</button>
                    <button className="wo-cal-reschedule-cancel" onClick={closeReschedule}>Отмена</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && categories.length > 0 && (
        <WorkoutModal
          categories={categories}
          editWorkout={editWorkout}
          initialDate={selectedKey}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

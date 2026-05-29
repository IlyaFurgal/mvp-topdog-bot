import { useEffect, useState } from 'react'
import { getTodayCheckins } from '../api/checkins'
import { getTodayTrackers } from '../api/trackers'
import CheckinCard from '../components/CheckinCard'
import CheckinFlow from '../components/CheckinFlow'
import TrackerModal from '../components/TrackerModal'
import TrackerRow from '../components/TrackerRow'

const CHECKIN_TYPES = ['morning', 'post_workout', 'evening']
const TRACKER_TYPES = ['weight', 'water', 'sleep', 'calories']

function getOverallStatus(checkins) {
  const done = CHECKIN_TYPES.filter((t) => checkins[t]).length
  if (done === 3) return { label: 'LOCKED IN 🔒', cls: 'status--locked' }
  if (done > 0) return { label: 'IN PROGRESS ⚡', cls: 'status--progress' }
  return { label: 'OPEN 📋', cls: 'status--open' }
}

function nextUndone(checkins) {
  return CHECKIN_TYPES.find((t) => !checkins[t]) ?? null
}

export default function TrackersPage() {
  const [checkins, setCheckins] = useState({ morning: null, post_workout: null, evening: null })
  const [trackers, setTrackers] = useState({ weight: null, water: null, sleep: null, calories: null })
  const [calorieLimit, setCalorieLimit] = useState(2000)
  const [loading, setLoading] = useState(true)
  const [activeFlow, setActiveFlow] = useState(null)
  const [activeTracker, setActiveTracker] = useState(null)

  async function load() {
    try {
      const [checkData, trackData] = await Promise.all([
        getTodayCheckins(),
        getTodayTrackers(),
      ])
      setCheckins(checkData)
      const { calorie_limit, ...rest } = trackData
      setTrackers(rest)
      if (calorie_limit) setCalorieLimit(calorie_limit)
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (activeFlow) {
    return (
      <CheckinFlow
        type={activeFlow}
        onClose={() => { setActiveFlow(null); load() }}
      />
    )
  }

  const status = getOverallStatus(checkins)
  const next = nextUndone(checkins)

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">ТРЕКЕРЫ</h1>
        {status.cls !== 'status--open' && (
          <span className={`checkin-status ${status.cls}`}>{status.label}</span>
        )}
      </div>
      <p className="page-subtitle">СЕГОДНЯ</p>

      {loading ? (
        <div className="card"><p className="card-muted">Загрузка...</p></div>
      ) : (
        <>
          {/* Чекины */}
          <p className="section-label">ЧЕКИНЫ</p>
          <div className="checkin-cards">
            {CHECKIN_TYPES.map((type) => (
              <CheckinCard
                key={type}
                type={type}
                checkin={checkins[type]}
                onClick={() => setActiveFlow(type)}
              />
            ))}
          </div>

          {next ? (
            <button className="btn btn-accent" onClick={() => setActiveFlow(next)}>
              ЗАПОЛНИТЬ ЧЕКИН →
            </button>
          ) : (
            <p className="checkin-complete-msg">Все чекины выполнены 💪</p>
          )}

          {/* Трекеры */}
          <p className="section-label">ПОКАЗАТЕЛИ</p>
          <div className="card tracker-card">
            {TRACKER_TYPES.map((type) => (
              <TrackerRow
                key={type}
                type={type}
                data={trackers[type]}
                calorieLimit={type === 'calories' ? calorieLimit : undefined}
                onAdd={() => setActiveTracker(type)}
                onEdited={(t, newVal) => setTrackers(prev => ({
                  ...prev,
                  [t]: { ...prev[t], value: newVal },
                }))}
              />
            ))}
          </div>
          {trackers.calories && trackers.calories.value > calorieLimit && (
            <p className="calorie-overrun">
              Вы превысили норму калорий на {Math.round(trackers.calories.value - calorieLimit)} ккал
            </p>
          )}
        </>
      )}

      {activeTracker && (
        <TrackerModal
          type={activeTracker}
          todayData={trackers[activeTracker]}
          calorieLimit={activeTracker === 'calories' ? calorieLimit : undefined}
          onClose={() => setActiveTracker(null)}
          onSaved={(type, newValue) => {
            setActiveTracker(null)
            if (type && newValue !== undefined) {
              setTrackers(prev => ({ ...prev, [type]: { ...prev[type], value: newValue } }))
            } else {
              load()
            }
          }}
        />
      )}
    </div>
  )
}

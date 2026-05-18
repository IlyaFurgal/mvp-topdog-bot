import { useEffect, useState } from 'react'
import { getTodayCheckins } from '../api/checkins'
import { getTodayTrackers } from '../api/trackers'
import CheckinCard from '../components/CheckinCard'
import CheckinFlow from '../components/CheckinFlow'
import TrackerModal from '../components/TrackerModal'
import TrackerRow from '../components/TrackerRow'

const CHECKIN_TYPES = ['morning', 'post_workout', 'evening']
const TRACKER_TYPES = ['weight', 'water', 'sleep']

function getOverallStatus(checkins) {
  const done = CHECKIN_TYPES.filter((t) => checkins[t]).length
  if (done === 3) return { label: 'LOCKED IN 🔒', cls: 'status--locked' }
  if (done > 0) return { label: 'IN PROGRESS ⚡', cls: 'status--progress' }
  return { label: 'OPEN 📋', cls: 'status--open' }
}

function nextUndone(checkins) {
  return CHECKIN_TYPES.find((t) => !checkins[t]) ?? null
}

export default function CheckPage() {
  const [checkins, setCheckins] = useState({ morning: null, post_workout: null, evening: null })
  const [trackers, setTrackers] = useState({ weight: null, water: null, sleep: null })
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
      setTrackers(trackData)
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
        <h1 className="page-title">SYSTEM CHECK</h1>
        <span className={`checkin-status ${status.cls}`}>{status.label}</span>
      </div>

      <p className="page-subtitle">СЕГОДНЯ</p>

      {loading ? (
        <div className="card"><p className="card-muted">Загрузка...</p></div>
      ) : (
        <>
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
              НАЧАТЬ ЧЕКИН →
            </button>
          ) : (
            <p className="checkin-complete-msg">Все чекины за сегодня выполнены 💪</p>
          )}

          <p className="section-label">ТРЕКЕРЫ НА СЕГОДНЯ</p>
          <div className="card tracker-card">
            {TRACKER_TYPES.map((type) => (
              <TrackerRow
                key={type}
                type={type}
                data={trackers[type]}
                onAdd={() => setActiveTracker(type)}
              />
            ))}
          </div>
        </>
      )}

      {activeTracker && (
        <TrackerModal
          type={activeTracker}
          todayData={trackers[activeTracker]}
          onClose={() => setActiveTracker(null)}
          onSaved={() => { setActiveTracker(null); load() }}
        />
      )}
    </div>
  )
}

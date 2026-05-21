import { useRef, useState } from 'react'
import { saveTracker } from '../api/trackers'

const GOAL_WATER = 2000

const TITLES = {
  weight:   'ЗАПИСАТЬ ВЕС',
  water:    'ЗАПИСАТЬ ВОДУ',
  sleep:    'ЗАПИСАТЬ СОН',
  calories: 'ЗАПИСАТЬ КАЛОРИИ',
}

export default function TrackerModal({ type, todayData, onClose, onSaved }) {
  const overlayRef = useRef(null)
  const [saving, setSaving] = useState(false)

  const [weight, setWeight] = useState(todayData?.value ?? 70.0)
  const [waterAmount, setWaterAmount] = useState(200)
  const [caloriesAmount, setCaloriesAmount] = useState(0)
  const [sleepHours, setSleepHours] = useState(() => {
    if (todayData?.value) return Math.floor(todayData.value)
    return 8
  })
  const [sleepMinutes, setSleepMinutes] = useState(() => {
    if (todayData?.value) return Math.round((todayData.value - Math.floor(todayData.value)) * 60)
    return 0
  })

  const waterTotal = todayData?.value ?? 0
  const caloriesTotal = todayData?.value ?? 0

  async function handleSave() {
    setSaving(true)
    try {
      if (type === 'weight') {
        await saveTracker('weight', parseFloat(weight.toFixed(1)), 'kg')
      } else if (type === 'water') {
        await saveTracker('water', waterAmount, 'ml')
      } else if (type === 'calories') {
        await saveTracker('calories', caloriesAmount, 'kcal')
      } else {
        const val = sleepHours + sleepMinutes / 60
        await saveTracker('sleep', parseFloat(val.toFixed(2)), 'h')
      }
      onSaved()
    } catch (_) {
      setSaving(false)
    }
  }

  function handleOverlay(e) {
    if (e.target === overlayRef.current) onClose()
  }

  const addLabel = type === 'water' || type === 'calories' ? 'ДОБАВИТЬ' : 'СОХРАНИТЬ'

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={handleOverlay}>
      <div className="modal-sheet">
        <div className="modal-header">
          <span className="modal-title">{TITLES[type]}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {type === 'weight' && (
          <WeightInput value={weight} onChange={setWeight} />
        )}
        {type === 'water' && (
          <WaterInput amount={waterAmount} onChange={setWaterAmount} total={waterTotal} />
        )}
        {type === 'sleep' && (
          <SleepInput
            hours={sleepHours}
            minutes={sleepMinutes}
            onHours={setSleepHours}
            onMinutes={setSleepMinutes}
          />
        )}
        {type === 'calories' && (
          <CaloriesInput amount={caloriesAmount} onChange={setCaloriesAmount} total={caloriesTotal} />
        )}

        <button className="btn btn-accent" onClick={handleSave} disabled={saving}>
          {saving ? 'СОХРАНЯЕМ...' : addLabel}
        </button>
      </div>
    </div>
  )
}

function WeightInput({ value, onChange }) {
  function adjust(delta) {
    onChange((v) => parseFloat(Math.max(0, v + delta).toFixed(1)))
  }

  return (
    <div className="tracker-input">
      <div className="weight-display">
        <span className="weight-value">{value.toFixed(1)}</span>
        <span className="weight-unit">кг</span>
      </div>
      <div className="weight-controls">
        <button className="weight-btn" onClick={() => adjust(-0.5)}>−0.5</button>
        <button className="weight-btn" onClick={() => adjust(-0.1)}>−0.1</button>
        <input
          type="number"
          className="weight-num-input"
          value={value}
          step="0.1"
          min="0"
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
        <button className="weight-btn" onClick={() => adjust(0.1)}>+0.1</button>
        <button className="weight-btn" onClick={() => adjust(0.5)}>+0.5</button>
      </div>
    </div>
  )
}

function WaterInput({ amount, onChange, total }) {
  const pct = Math.min((total / GOAL_WATER) * 100, 100)
  return (
    <div className="tracker-input">
      <p className="water-today">
        Сегодня: <strong>{total.toLocaleString('ru')} мл</strong>
      </p>
      <div className="progress-bar">
        <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="progress-label">{Math.round(total)} / {GOAL_WATER} мл</p>
      <div className="water-quick">
        {[200, 300, 500].map((ml) => (
          <button
            key={ml}
            className={`water-btn ${amount === ml ? 'water-btn--active' : ''}`}
            onClick={() => onChange(ml)}
          >
            +{ml} мл
          </button>
        ))}
      </div>
      <div className="water-custom">
        <input
          type="number"
          className="weight-num-input"
          value={amount}
          min="1"
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        />
        <span className="weight-unit">мл</span>
      </div>
    </div>
  )
}

function CaloriesInput({ amount, onChange, total }) {
  const GOAL_KCAL = 2500
  const pct = Math.min((total / GOAL_KCAL) * 100, 100)
  return (
    <div className="tracker-input">
      <p className="water-today">
        Сегодня: <strong>{Math.round(total).toLocaleString('ru')} ккал</strong>
      </p>
      <div className="progress-bar">
        <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="progress-label">{Math.round(total)} / {GOAL_KCAL} ккал</p>
      <div className="water-quick">
        {[100, 300, 500].map((kcal) => (
          <button
            key={kcal}
            className={`water-btn ${amount === kcal ? 'water-btn--active' : ''}`}
            onClick={() => onChange(kcal)}
          >
            +{kcal}
          </button>
        ))}
      </div>
      <div className="water-custom">
        <input
          type="number"
          className="weight-num-input"
          value={amount}
          min="0"
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        />
        <span className="weight-unit">ккал</span>
      </div>
    </div>
  )
}

function SleepInput({ hours, minutes, onHours, onMinutes }) {
  return (
    <div className="tracker-input">
      <div className="sleep-quick">
        {[6, 7, 8, 9].map((h) => (
          <button
            key={h}
            className={`sleep-btn ${hours === h && minutes === 0 ? 'sleep-btn--active' : ''}`}
            onClick={() => { onHours(h); onMinutes(0) }}
          >
            {h}ч
          </button>
        ))}
      </div>
      <div className="sleep-inputs">
        <div className="sleep-input-group">
          <input
            type="number"
            className="weight-num-input"
            value={hours}
            min="0"
            max="23"
            onChange={(e) => onHours(parseInt(e.target.value) || 0)}
          />
          <span className="weight-unit">ч</span>
        </div>
        <div className="sleep-input-group">
          <input
            type="number"
            className="weight-num-input"
            value={minutes}
            min="0"
            max="59"
            step="15"
            onChange={(e) => onMinutes(parseInt(e.target.value) || 0)}
          />
          <span className="weight-unit">м</span>
        </div>
      </div>
      {(hours > 0 || minutes > 0) && (
        <p className="sleep-preview">
          {hours}ч {minutes > 0 ? `${minutes}м` : ''}
        </p>
      )}
    </div>
  )
}

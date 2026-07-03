import { useEffect, useRef, useState } from 'react'
import { saveTracker } from '../api/trackers'

const GOAL_WATER = 2000

const MEAL_OPTIONS = [
  { value: 'breakfast', label: 'Завтрак' },
  { value: 'lunch',     label: 'Обед'   },
  { value: 'dinner',    label: 'Ужин'   },
  { value: 'snack',     label: 'Перекус'},
]

function getDefaultMealType() {
  const h = new Date().getHours()
  if (h >= 5  && h < 11) return 'breakfast'
  if (h >= 11 && h < 15) return 'lunch'
  if (h >= 15 && h < 18) return 'snack'
  if (h >= 18 && h < 23) return 'dinner'
  return null
}

const TITLES = {
  weight:   'ЗАПИСАТЬ ВЕС',
  water:    'ЗАПИСАТЬ ВОДУ',
  sleep:    'ЗАПИСАТЬ СОН',
  calories: 'ЗАПИСАТЬ КАЛОРИИ',
  pulse:    'ЗАПИСАТЬ ПУЛЬС',
}

export default function TrackerModal({ type, todayData, calorieLimit, onClose, onSaved }) {
  const overlayRef = useRef(null)
  const [saving, setSaving] = useState(false)

  const [weight, setWeight] = useState(todayData?.value ?? 70.0)
  const [pulse, setPulse] = useState(todayData?.value ?? 60)
  const [waterAmount, setWaterAmount] = useState(0)
  const [caloriesAmount, setCaloriesAmount] = useState(0)
  const [mealType, setMealType] = useState(() => type === 'calories' ? getDefaultMealType() : null)
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
        const val = parseFloat(weight.toFixed(1))
        await saveTracker('weight', val, 'kg')
        onSaved('weight', val)
      } else if (type === 'water') {
        await saveTracker('water', waterAmount, 'ml')
        onSaved('water')
      } else if (type === 'calories') {
        await saveTracker('calories', caloriesAmount, 'kcal', {
          meal_type: mealType || undefined,
          source: 'manual',
        })
        onSaved('calories')
      } else if (type === 'pulse') {
        const val = Math.round(pulse)
        await saveTracker('pulse', val, 'bpm')
        onSaved('pulse', val)
      } else {
        const val = parseFloat((sleepHours + sleepMinutes / 60).toFixed(2))
        await saveTracker('sleep', val, 'h')
        onSaved('sleep', val)
      }
    } catch (_) {
      setSaving(false)
    }
  }

  function handleOverlay(e) {
    if (saving) return
    if (e.target === overlayRef.current) onClose()
  }

  const addLabel = type === 'water' || type === 'calories' ? 'ДОБАВИТЬ' : 'СОХРАНИТЬ'

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={handleOverlay}>
      <div className="modal-sheet">
        <div className="modal-header">
          <span className="modal-title">{TITLES[type]}</span>
          <button className="modal-close" onClick={onClose} disabled={saving}>✕</button>
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
          <CaloriesInput
            amount={caloriesAmount}
            onChange={setCaloriesAmount}
            total={caloriesTotal}
            limit={calorieLimit ?? 2000}
            mealType={mealType}
            onMealType={setMealType}
          />
        )}
        {type === 'pulse' && (
          <PulseInput value={pulse} onChange={setPulse} />
        )}

        <button className="btn btn-accent" onClick={handleSave} disabled={saving}>
          {saving ? 'СОХРАНЯЕМ...' : addLabel}
        </button>
      </div>
    </div>
  )
}

function WeightInput({ value, onChange }) {
  const [draft, setDraft] = useState(() => value.toFixed(1))

  // Sync draft when value changes via adjust buttons
  useEffect(() => { setDraft(value.toFixed(1)) }, [value])

  function adjust(delta) {
    onChange((v) => parseFloat(Math.max(30, Math.min(300, v + delta)).toFixed(1)))
  }

  function handleBlur() {
    const parsed = parseFloat(draft)
    if (!isNaN(parsed) && parsed >= 30 && parsed <= 300) {
      onChange(parseFloat(parsed.toFixed(1)))
    } else {
      setDraft(value.toFixed(1))  // revert on invalid
    }
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
          inputMode="decimal"
          className="weight-num-input"
          value={draft}
          step="0.1"
          min="30"
          max="300"
          placeholder="кг"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
        />
        <button className="weight-btn" onClick={() => adjust(0.1)}>+0.1</button>
        <button className="weight-btn" onClick={() => adjust(0.5)}>+0.5</button>
      </div>
    </div>
  )
}

function PulseInput({ value, onChange }) {
  const [draft, setDraft] = useState(() => String(Math.round(value)))

  useEffect(() => { setDraft(String(Math.round(value))) }, [value])

  function adjust(delta) {
    onChange((v) => Math.max(30, Math.min(220, Math.round(v) + delta)))
  }

  function handleBlur() {
    const parsed = parseInt(draft, 10)
    if (!isNaN(parsed) && parsed >= 30 && parsed <= 220) {
      onChange(parsed)
    } else {
      setDraft(String(Math.round(value)))  // revert on invalid
    }
  }

  return (
    <div className="tracker-input">
      <div className="weight-display">
        <span className="weight-value">{Math.round(value)}</span>
        <span className="weight-unit">уд/мин</span>
      </div>
      <div className="weight-controls">
        <button className="weight-btn" onClick={() => adjust(-5)}>−5</button>
        <button className="weight-btn" onClick={() => adjust(-1)}>−1</button>
        <input
          type="number"
          inputMode="numeric"
          className="weight-num-input"
          value={draft}
          step="1"
          min="30"
          max="220"
          placeholder="уд/мин"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
        />
        <button className="weight-btn" onClick={() => adjust(1)}>+1</button>
        <button className="weight-btn" onClick={() => adjust(5)}>+5</button>
      </div>
    </div>
  )
}

function WaterInput({ amount, onChange, total }) {
  const [draft, setDraft] = useState('')
  // Live preview: bar reflects saved + current draft
  const displayTotal = total + amount
  const pct = Math.min((displayTotal / GOAL_WATER) * 100, 100)

  function addPreset(ml) {
    const current = parseInt(draft, 10) || 0
    const newVal = current + ml
    setDraft(String(newVal))
    onChange(newVal)
  }

  function handleBlur() {
    const n = parseInt(draft, 10)
    if (!isNaN(n) && n >= 0) onChange(n)
    else setDraft(amount > 0 ? String(amount) : '')
  }

  return (
    <div className="tracker-input">
      <p className="water-today">
        Сегодня: <strong>{Math.round(displayTotal).toLocaleString('ru')} мл</strong> из {GOAL_WATER} мл
      </p>
      <div className="progress-bar">
        <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="water-quick">
        {[100, 250, 500].map((ml) => (
          <button key={ml} className="water-btn" onClick={() => addPreset(ml)}>
            +{ml} мл
          </button>
        ))}
        <button
          className="water-btn water-btn--reset"
          onClick={() => { setDraft(''); onChange(0) }}
          disabled={!draft}
        >
          Сброс
        </button>
      </div>
      <div className="water-custom">
        <input
          type="number"
          inputMode="numeric"
          className="weight-num-input"
          value={draft}
          min="0"
          placeholder="или введи, мл"
          onChange={(e) => setDraft(e.target.value.replace(/^0+(?=\d)/, ''))}
          onBlur={handleBlur}
        />
        <span className="weight-unit">мл</span>
      </div>
    </div>
  )
}

function CaloriesInput({ amount, onChange, total, limit = 2000, mealType, onMealType }) {
  const [draft, setDraft] = useState('')
  // Live preview: bar reflects saved + current draft
  const displayTotal = total + amount
  const pct = Math.min((displayTotal / limit) * 100, 100)
  const overLimit = displayTotal > limit

  function addPreset(kcal) {
    const current = parseInt(draft, 10) || 0
    const newVal = current + kcal
    setDraft(String(newVal))
    onChange(newVal)
  }

  function handleBlur() {
    const n = parseInt(draft, 10)
    if (!isNaN(n) && n >= 0) onChange(n)
    else setDraft(amount > 0 ? String(amount) : '')
  }

  return (
    <div className="tracker-input">
      <div className="meal-type-row">
        {MEAL_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            className={`meal-type-btn${mealType === value ? ' meal-type-btn--active' : ''}`}
            onClick={() => onMealType(mealType === value ? null : value)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="water-today">
        Сегодня: <strong>{Math.round(displayTotal).toLocaleString('ru')} ккал</strong>
        {' '}/ норма {limit.toLocaleString('ru')} ккал
      </p>
      <div className="progress-bar">
        <div
          className="progress-bar__fill"
          style={{ width: `${pct}%`, background: overLimit ? 'var(--danger)' : undefined }}
        />
      </div>
      {overLimit && (
        <p className="progress-label" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          Норма на сегодня превышена — если хочешь, обсуди с ассистентом.
        </p>
      )}
      <div className="water-quick">
        {[100, 300, 500].map((kcal) => (
          <button key={kcal} className="water-btn" onClick={() => addPreset(kcal)}>
            +{kcal}
          </button>
        ))}
        <button
          className="water-btn water-btn--reset"
          onClick={() => { setDraft(''); onChange(0) }}
          disabled={!draft}
        >
          Сброс
        </button>
      </div>
      <div className="water-custom">
        <input
          type="number"
          inputMode="numeric"
          className="weight-num-input"
          value={draft}
          min="0"
          placeholder="или введи, ккал"
          onChange={(e) => setDraft(e.target.value.replace(/^0+(?=\d)/, ''))}
          onBlur={handleBlur}
        />
        <span className="weight-unit">ккал</span>
      </div>
    </div>
  )
}

function SleepInput({ hours, minutes, onHours, onMinutes }) {
  const [draftH, setDraftH] = useState(() => String(hours))
  const [draftM, setDraftM] = useState(() => minutes > 0 ? String(minutes) : '')

  // Sync drafts when preset buttons update the parent state
  useEffect(() => { setDraftH(String(hours)) }, [hours])
  useEffect(() => { setDraftM(minutes > 0 ? String(minutes) : '') }, [minutes])

  function commitH() {
    const n = parseInt(draftH, 10)
    if (!isNaN(n) && n >= 0 && n <= 23) onHours(n)
    else setDraftH(String(hours))  // revert on invalid
  }

  function commitM() {
    if (draftM === '') { onMinutes(0); return }
    const n = parseInt(draftM, 10)
    if (!isNaN(n) && n >= 0 && n <= 59) onMinutes(n)
    else setDraftM('')  // revert to empty (= 0 minutes)
  }

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
            inputMode="numeric"
            className="weight-num-input"
            value={draftH}
            min="0"
            max="23"
            placeholder="ч"
            onChange={(e) => setDraftH(e.target.value)}
            onBlur={commitH}
          />
          <span className="weight-unit">ч</span>
        </div>
        <div className="sleep-input-group">
          <input
            type="number"
            inputMode="numeric"
            className="weight-num-input"
            value={draftM}
            min="0"
            max="59"
            step="15"
            placeholder="0"
            onChange={(e) => setDraftM(e.target.value)}
            onBlur={commitM}
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

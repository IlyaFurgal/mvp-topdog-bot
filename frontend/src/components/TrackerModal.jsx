import { useRef, useState } from 'react'
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
}

export default function TrackerModal({ type, todayData, calorieLimit, onClose, onSaved }) {
  const overlayRef = useRef(null)
  const [saving, setSaving] = useState(false)

  const [weight, setWeight] = useState(todayData?.value ?? 70.0)
  const [waterAmount, setWaterAmount] = useState(200)
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
        onSaved('water', waterTotal + waterAmount)
      } else if (type === 'calories') {
        await saveTracker('calories', caloriesAmount, 'kcal', {
          meal_type: mealType || undefined,
          source: 'manual',
        })
        onSaved('calories', caloriesTotal + caloriesAmount)
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
          inputMode="decimal"
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
  const newTotal = total + amount
  return (
    <div className="tracker-input">
      {/* Текущий дневной итог — явно, чтобы видно было накопление */}
      <p className="water-today">
        Сегодня: <strong>{Math.round(total).toLocaleString('ru')} мл</strong> из {GOAL_WATER} мл
      </p>
      <div className="progress-bar">
        <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
      </div>

      {/* Пресеты: каждое нажатие задаёт порцию (SET, не накопление) */}
      <div className="water-quick">
        {[100, 250, 500].map((ml) => (
          <button
            key={ml}
            className={`water-btn${amount === ml ? ' water-btn--active' : ''}`}
            onClick={() => onChange(ml)}
          >
            +{ml} мл
          </button>
        ))}
      </div>

      {/* Мелкий ручной ввод */}
      <div className="water-custom">
        <input
          type="number"
          inputMode="numeric"
          className="weight-num-input"
          value={amount === 0 ? '' : amount}
          min="1"
          placeholder="другое"
          onChange={(e) => {
            const v = e.target.value.replace(/^0+(?=\d)/, '')
            onChange(v === '' ? 0 : parseInt(v, 10) || 0)
          }}
        />
        <span className="weight-unit">мл</span>
      </div>

      {/* Предпросмотр результата */}
      {amount > 0 && (
        <p className="progress-label">
          +{amount} мл → итого {Math.round(newTotal).toLocaleString('ru')} мл
        </p>
      )}
    </div>
  )
}

function CaloriesInput({ amount, onChange, total, limit = 2000, mealType, onMealType }) {
  const newTotal = total + amount
  const pct = Math.min((newTotal / limit) * 100, 100)
  const overLimit = newTotal > limit
  return (
    <div className="tracker-input">
      {/* Выбор приёма пищи */}
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
        Сегодня: <strong>{Math.round(total).toLocaleString('ru')} ккал</strong>
        {' '}/ норма {limit.toLocaleString('ru')} ккал
      </p>
      <div className="progress-bar">
        <div
          className="progress-bar__fill"
          style={{ width: `${pct}%`, background: overLimit ? 'var(--danger)' : undefined }}
        />
      </div>
      <p className="progress-label" style={{ color: overLimit ? 'var(--danger)' : undefined }}>
        {Math.round(newTotal)} / {limit} ккал{overLimit ? ` (+${Math.round(newTotal - limit)} сверх нормы)` : ''}
      </p>
      <div className="water-quick">
        {[100, 300, 500].map((kcal) => (
          <button
            key={kcal}
            className="water-btn"
            onClick={() => onChange(amount + kcal)}
          >
            +{kcal}
          </button>
        ))}
        <button
          className="water-btn water-btn--reset"
          onClick={() => onChange(0)}
          disabled={amount === 0}
        >
          Сброс
        </button>
      </div>
      <div className="water-custom">
        <input
          type="number"
          inputMode="numeric"
          className="weight-num-input"
          value={amount === 0 ? '' : amount}
          min="0"
          onChange={(e) => {
            const v = e.target.value.replace(/^0+(?=\d)/, '')
            onChange(v === '' ? 0 : parseInt(v, 10) || 0)
          }}
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

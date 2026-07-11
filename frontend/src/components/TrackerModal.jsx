import { useState } from 'react'
import { saveTracker } from '../api/trackers'
import ScrollPicker from './ScrollPicker'

const GOAL_WATER = 2000
const BOTTLE_ML = 500
const BOTTLE_COUNT = 8   // 4L range — comfortably covers a typical day incl. overshoot
const WATER_MANUAL_MAX_ML = 5000

const TITLES = {
  weight:   'ЗАПИСАТЬ ВЕС',
  water:    'ЗАПИСАТЬ ВОДУ',
  sleep:    'ЗАПИСАТЬ СОН',
  calories: 'ЗАПИСАТЬ КАЛОРИИ',
  pulse:    'ЗАПИСАТЬ ПУЛЬС',
}

export default function TrackerModal({ type, todayData, calorieLimit, macroTargets, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)

  const [weight, setWeight] = useState(todayData?.value ?? 70.0)
  const [pulse, setPulse] = useState(todayData?.value ?? 60)
  const [waterAmount, setWaterAmount] = useState(0)
  const [caloriesAmount, setCaloriesAmount] = useState(0)
  const [protein, setProtein] = useState('')
  const [fat, setFat] = useState('')
  const [carbs, setCarbs] = useState('')
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
          source: 'manual',
          protein_g: protein ? parseFloat(protein) : undefined,
          fat_g: fat ? parseFloat(fat) : undefined,
          carbs_g: carbs ? parseFloat(carbs) : undefined,
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

  const addLabel = type === 'water' ? 'ДОБАВИТЬ' : 'СОХРАНИТЬ'

  return (
    <div className="page club-page">
      <button className="club-back" onClick={onClose} disabled={saving}>‹ НАЗАД</button>

      <div className="tracker-page-title-plate skew-chip">
        <span className="tracker-page-title">{TITLES[type]}</span>
      </div>
      <div className="stripe-divider" />

      <div className="tracker-page-body">
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
            todayMacros={todayData}
            macroTargets={macroTargets}
            protein={protein}
            onProtein={setProtein}
            fat={fat}
            onFat={setFat}
            carbs={carbs}
            onCarbs={setCarbs}
          />
        )}
        {type === 'pulse' && (
          <PulseInput value={pulse} onChange={setPulse} />
        )}

        <button
          className={type === 'calories' ? 'btn tracker-save-btn--side' : 'btn btn-accent'}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'СОХРАНЯЕМ...' : addLabel}
        </button>
      </div>
    </div>
  )
}

function WeightInput({ value, onChange }) {
  return (
    <div className="tracker-input">
      <ScrollPicker
        value={value}
        onChange={onChange}
        min={30}
        max={300}
        step={0.1}
        decimals={1}
        unit="кг"
      />
    </div>
  )
}

function PulseInput({ value, onChange }) {
  return (
    <div className="tracker-input">
      <ScrollPicker
        value={value}
        onChange={onChange}
        min={30}
        max={220}
        step={1}
        decimals={0}
        unit="уд/мин"
      />
    </div>
  )
}

function WaterInput({ amount, onChange, total }) {
  const [unit, setUnit] = useState('ml')  // 'ml' | 'l'
  // Bumped whenever a bottle tap changes `amount` externally, forcing the
  // ScrollPicker to remount and re-sync its scroll position to the new
  // value — it only reads `value` once, on mount.
  const [resetSignal, setResetSignal] = useState(0)
  // Live preview: bar reflects saved + current draft
  const displayTotal = total + amount
  const filledCount = Math.min(Math.round(displayTotal / BOTTLE_ML), BOTTLE_COUNT)

  function addPreset(ml) {
    // Today's total (already-saved + this delta) can't go below 0.
    const newVal = Math.max(amount + ml, -total)
    onChange(newVal)
    setResetSignal((s) => s + 1)
  }

  function handlePickerChange(v) {
    const ml = Math.max(Math.round(unit === 'l' ? v * 1000 : v), -total)
    onChange(ml)
  }

  function switchUnit(next) {
    if (next !== unit) { setUnit(next); setResetSignal((s) => s + 1) }
  }

  const pickerValue = unit === 'l' ? amount / 1000 : amount
  const pickerMin = unit === 'l' ? -total / 1000 : -total

  return (
    <div className="tracker-input">
      <p className="water-today">
        Сегодня: <strong>{Math.round(displayTotal).toLocaleString('ru')} мл</strong> из {GOAL_WATER} мл
      </p>

      <div className="water-bottle-grid">
        {Array.from({ length: BOTTLE_COUNT }, (_, i) => {
          const active = i < filledCount
          return (
            <button
              key={i}
              type="button"
              className={`water-bottle${active ? ' water-bottle--active' : ''}`}
              onClick={() => addPreset(active ? -BOTTLE_ML : BOTTLE_ML)}
              title={active ? `Убрать ${BOTTLE_ML} мл` : `Добавить ${BOTTLE_ML} мл`}
            >
              0.5Л
            </button>
          )
        })}
      </div>

      <div className="water-manual">
        <ScrollPicker
          key={`${unit}-${resetSignal}`}
          value={pickerValue}
          onChange={handlePickerChange}
          min={pickerMin}
          max={unit === 'l' ? WATER_MANUAL_MAX_ML / 1000 : WATER_MANUAL_MAX_ML}
          step={unit === 'l' ? 0.1 : 50}
          decimals={unit === 'l' ? 1 : 0}
        />
        <div className="water-unit-toggle water-unit-toggle--vertical">
          <button
            className={`water-unit-btn${unit === 'ml' ? ' water-unit-btn--active' : ''}`}
            onClick={() => switchUnit('ml')}
          >МЛ</button>
          <button
            className={`water-unit-btn${unit === 'l' ? ' water-unit-btn--active' : ''}`}
            onClick={() => switchUnit('l')}
          >Л</button>
        </div>
      </div>
    </div>
  )
}

function CalorieRing({ pct, overLimit, remaining, limit }) {
  // Gauge-style ring (gap at the bottom, like the reference asset) built in
  // SVG rather than the static progress_ring PNG, since the PNG bakes in
  // one fixed percentage — this needs to fill dynamically 0-100% and turn
  // red past the limit. Arc spans 270° with a 90° gap centered at the
  // bottom (from 135° to 405°/45°).
  const r = 42
  const circumference = 2 * Math.PI * r
  const arcFraction = 270 / 360
  const arcLength = circumference * arcFraction
  const fillLength = arcLength * (pct / 100)

  return (
    <div className="calorie-ring">
      <svg viewBox="0 0 100 100" className="calorie-ring__svg">
        <circle
          cx="50" cy="50" r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={0}
          transform="rotate(135 50 50)"
        />
        <circle
          cx="50" cy="50" r={r}
          fill="none"
          stroke={overLimit ? 'var(--danger)' : 'var(--accent-club)'}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${fillLength} ${circumference}`}
          strokeDashoffset={0}
          transform="rotate(135 50 50)"
        />
      </svg>
      <div className="calorie-ring__center">
        <span className="calorie-ring__label">ОСТАЛОСЬ</span>
        <span className="calorie-ring__value">{Math.round(remaining).toLocaleString('ru')}</span>
        <span className="calorie-ring__goal">ЦЕЛЬ {limit.toLocaleString('ru')} ККАЛ</span>
      </div>
    </div>
  )
}

function CaloriesInput({ amount, onChange, total, limit = 2000, todayMacros, macroTargets, protein, onProtein, fat, onFat, carbs, onCarbs }) {
  const [draft, setDraft] = useState('')
  // Live preview: ring reflects saved + current draft
  const displayTotal = total + amount
  const pct = Math.min((displayTotal / limit) * 100, 100)
  const overLimit = displayTotal > limit
  const remaining = Math.max(limit - displayTotal, 0)

  function addPreset(kcal) {
    const current = parseInt(draft, 10) || 0
    // Today's total (already-saved + this delta) can't go below 0.
    const newVal = Math.max(current + kcal, -total)
    setDraft(String(newVal))
    onChange(newVal)
  }

  function handleBlur() {
    const n = parseInt(draft, 10)
    if (!isNaN(n)) {
      const kcal = Math.max(n, -total)
      onChange(kcal)
      setDraft(String(kcal))
    }
    else setDraft('')
  }

  return (
    <div className="tracker-input">
      <p className="water-today water-today--calories">
        СЕГОДНЯ: {Math.round(displayTotal).toLocaleString('ru')} ККАЛ
        {' '}/ НОРМА {limit.toLocaleString('ru')} ККАЛ
      </p>

      <CalorieRing pct={pct} overLimit={overLimit} remaining={remaining} limit={limit} />

      {overLimit && (
        <p className="progress-label" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          Норма на сегодня превышена — если хочешь, обсуди с ассистентом.
        </p>
      )}

      <div className="kcal-input-pill">
        <input
          type="number"
          inputMode="numeric"
          className="kcal-input-pill__field"
          value={draft}
          placeholder="ВВЕДИ ККАЛ..."
          onChange={(e) => setDraft(e.target.value.replace(/^0+(?=\d)/, ''))}
          onBlur={handleBlur}
        />
        <span className="kcal-input-pill__unit">ККАЛ</span>
      </div>

      <div className="macro-cols">
        <MacroCol
          label="УГЛЕВОДЫ"
          current={todayMacros?.carbs_g || 0} delta={carbs} target={macroTargets?.carbs_g}
          onChangeDelta={onCarbs}
        />
        <MacroCol
          label="БЕЛКИ"
          current={todayMacros?.protein_g || 0} delta={protein} target={macroTargets?.protein_g}
          onChangeDelta={onProtein}
        />
        <MacroCol
          label="ЖИРЫ"
          current={todayMacros?.fat_g || 0} delta={fat} target={macroTargets?.fat_g}
          onChangeDelta={onFat}
        />
      </div>
    </div>
  )
}

function MacroCol({ label, current, delta, target, onChangeDelta }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const display = current + (parseFloat(delta) || 0)

  function startEdit() {
    setDraft(delta || '')
    setEditing(true)
  }

  function commit() {
    onChangeDelta(draft)
    setEditing(false)
  }

  return (
    <div className="macro-col">
      <span className="macro-col__label">{label}</span>
      {editing ? (
        <input
          type="number"
          inputMode="decimal"
          autoFocus
          className="macro-col__edit-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
        />
      ) : (
        <button type="button" className="macro-col__value" onClick={startEdit}>
          {Math.round(display)}{target ? `/${target}` : ''}г
        </button>
      )}
    </div>
  )
}

function formatSleepMinutes(mins) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

function parseSleepMinutes(str) {
  const m = str.trim().match(/^(\d{1,2}):?(\d{0,2})$/)
  if (!m) return NaN
  const h = parseInt(m[1], 10)
  const mm = m[2] ? parseInt(m[2], 10) : 0
  return h * 60 + mm
}

function SleepInput({ hours, minutes, onHours, onMinutes }) {
  const totalMinutes = hours * 60 + minutes
  // Bumped on quick-button taps so the ScrollPicker (which only reads
  // `value` once, on mount) remounts and re-syncs its scroll position.
  const [resetSignal, setResetSignal] = useState(0)

  function handlePickerChange(mins) {
    onHours(Math.floor(mins / 60))
    onMinutes(mins % 60)
  }

  function pickQuick(h) {
    onHours(h)
    onMinutes(0)
    setResetSignal((s) => s + 1)
  }

  return (
    <div className="tracker-input">
      <div className="sleep-quick">
        {[5, 6, 7, 8, 9].map((h) => (
          <button
            key={h}
            className={`sleep-btn sleep-btn--${h} ${hours === h && minutes === 0 ? 'sleep-btn--active' : ''}`}
            onClick={() => pickQuick(h)}
          >
            {h}
          </button>
        ))}
      </div>
      <ScrollPicker
        key={resetSignal}
        value={totalMinutes}
        onChange={handlePickerChange}
        min={0}
        max={16 * 60}
        step={15}
        format={formatSleepMinutes}
        parse={parseSleepMinutes}
      />
    </div>
  )
}

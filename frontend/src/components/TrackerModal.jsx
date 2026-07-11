import { useEffect, useRef, useState } from 'react'
import { saveTracker } from '../api/trackers'
import ScrollPicker from './ScrollPicker'
import waterBottleIcon from '../assets/water_bottle_бутылка_воды.png'

const GOAL_WATER = 2000
const BOTTLE_ML = 500
const BOTTLE_COUNT = 8   // 4L range — comfortably covers a typical day incl. overshoot

const TITLES = {
  weight:   'ЗАПИСАТЬ ВЕС',
  water:    'ЗАПИСАТЬ ВОДУ',
  sleep:    'ЗАПИСАТЬ СОН',
  calories: 'ЗАПИСАТЬ КАЛОРИИ',
  pulse:    'ЗАПИСАТЬ ПУЛЬС',
}

export default function TrackerModal({ type, todayData, calorieLimit, macroTargets, onClose, onSaved }) {
  const overlayRef = useRef(null)
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

        <button className="btn btn-accent" onClick={handleSave} disabled={saving}>
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
  const [draft, setDraft] = useState('')
  const [unit, setUnit] = useState('ml')  // 'ml' | 'l'
  // Live preview: bar reflects saved + current draft
  const displayTotal = total + amount
  const filledCount = Math.min(Math.round(displayTotal / BOTTLE_ML), BOTTLE_COUNT)

  function addPreset(ml) {
    const current = parseInt(draft, 10) || 0
    // Today's total (already-saved + this delta) can't go below 0.
    const newVal = Math.max(current + ml, -total)
    setDraft(String(newVal))
    onChange(newVal)
  }

  function handleBlur() {
    const n = parseFloat(draft)
    if (!isNaN(n)) {
      const ml = Math.max(Math.round(unit === 'l' ? n * 1000 : n), -total)
      onChange(ml)
      setDraft(String(unit === 'l' ? ml / 1000 : ml))
    }
    else setDraft('')
  }

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
              <span className="water-bottle__icon" style={{ WebkitMaskImage: `url(${waterBottleIcon})`, maskImage: `url(${waterBottleIcon})` }} />
              <span className="water-bottle__label">0.5Л</span>
            </button>
          )
        })}
      </div>

      <div className="water-custom">
        <input
          type="number"
          inputMode="decimal"
          className="weight-num-input"
          value={draft}
          step={unit === 'l' ? '0.1' : '1'}
          placeholder={unit === 'l' ? 'или введи ± л' : 'или введи ± мл'}
          onChange={(e) => setDraft(e.target.value.replace(/^0+(?=\d)/, ''))}
          onBlur={handleBlur}
        />
        <div className="water-unit-toggle">
          <button
            className={`water-unit-btn${unit === 'ml' ? ' water-unit-btn--active' : ''}`}
            onClick={() => setUnit('ml')}
          >МЛ</button>
          <button
            className={`water-unit-btn${unit === 'l' ? ' water-unit-btn--active' : ''}`}
            onClick={() => setUnit('l')}
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
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={0}
          transform="rotate(135 50 50)"
        />
        <circle
          cx="50" cy="50" r={r}
          fill="none"
          stroke={overLimit ? 'var(--danger)' : 'var(--accent-club)'}
          strokeWidth="8"
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
  const hasMacroTotals = todayMacros && (todayMacros.protein_g || todayMacros.fat_g || todayMacros.carbs_g)

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
      <p className="water-today">
        Сегодня: <strong>{Math.round(displayTotal).toLocaleString('ru')} ккал</strong>
        {' '}/ норма {limit.toLocaleString('ru')} ккал
      </p>

      <CalorieRing pct={pct} overLimit={overLimit} remaining={remaining} limit={limit} />

      {overLimit && (
        <p className="progress-label" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          Норма на сегодня превышена — если хочешь, обсуди с ассистентом.
        </p>
      )}
      {(hasMacroTotals || macroTargets) && (
        <p className="water-today" style={{ marginTop: 4 }}>
          Б: <strong>{Math.round(todayMacros?.protein_g || 0)}{macroTargets ? `/${macroTargets.protein_g}` : ''}г</strong>
          {' '}Ж: <strong>{Math.round(todayMacros?.fat_g || 0)}{macroTargets ? `/${macroTargets.fat_g}` : ''}г</strong>
          {' '}У: <strong>{Math.round(todayMacros?.carbs_g || 0)}{macroTargets ? `/${macroTargets.carbs_g}` : ''}г</strong>
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
      <div className="water-quick">
        {[100, 300, 500].map((kcal) => (
          <button key={kcal} className="water-btn water-btn--minus" onClick={() => addPreset(-kcal)} disabled={displayTotal <= 0}>
            −{kcal}
          </button>
        ))}
      </div>
      <div className="water-custom">
        <input
          type="number"
          inputMode="numeric"
          className="weight-num-input"
          value={draft}
          placeholder="или введи ± ккал"
          onChange={(e) => setDraft(e.target.value.replace(/^0+(?=\d)/, ''))}
          onBlur={handleBlur}
        />
        <span className="weight-unit">ккал</span>
      </div>

      <div className="macro-row">
        <div className="macro-field">
          <span className="macro-field__label">БЕЛКИ, Г</span>
          <input
            type="number"
            inputMode="decimal"
            className="weight-num-input"
            value={protein}
            min="0"
            placeholder="0"
            onChange={(e) => onProtein(e.target.value)}
          />
        </div>
        <div className="macro-field">
          <span className="macro-field__label">ЖИРЫ, Г</span>
          <input
            type="number"
            inputMode="decimal"
            className="weight-num-input"
            value={fat}
            min="0"
            placeholder="0"
            onChange={(e) => onFat(e.target.value)}
          />
        </div>
        <div className="macro-field">
          <span className="macro-field__label">УГЛЕВОДЫ, Г</span>
          <input
            type="number"
            inputMode="decimal"
            className="weight-num-input"
            value={carbs}
            min="0"
            placeholder="0"
            onChange={(e) => onCarbs(e.target.value)}
          />
        </div>
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

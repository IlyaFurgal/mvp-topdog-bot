import { useEffect, useState } from 'react'
import client from '../api/client'
import { getTodayCheckins } from '../api/checkins'
import { getTodayTrackers } from '../api/trackers'
import myDataHeading from '../assets/8.png'
import profileHeading from '../assets/7.png'
import progressHeading from '../assets/12.png'
import CheckinCard from '../components/CheckinCard'
import CheckinFlow from '../components/CheckinFlow'
import MyDataCard from '../components/MyDataCard'
import ProgressSection from '../components/ProgressSection'
import ScrollPicker from '../components/ScrollPicker'
import TrackerModal from '../components/TrackerModal'
import { useProfile } from '../context/ProfileContext'
import { useUniformChipWidth } from '../hooks/useUniformChipWidth'

const CHECKIN_TYPES = ['morning', 'post_workout', 'evening']

const GOAL_OPTIONS = [
  ['muscle_gain',    'Набор мышц'],
  ['weight_loss',    'Похудение'],
  ['endurance',      'Выносливость'],
  ['maintenance',    'Поддержание / здоровье'],
  ['stress',         'Снижение стресса'],
  ['sleep_quality',  'Улучшение сна'],
  ['rehabilitation', 'Реабилитация'],
  ['competition',    'Соревнования'],
  ['flexibility',    'Гибкость / растяжка'],
]

const FITNESS_OPTIONS = [
  ['beginner',     '🌱 Новичок'],
  ['intermediate', '💪 Средний'],
  ['advanced',     '🔥 Продвинутый'],
]

const FITNESS_LABELS_PLAIN = {
  beginner: 'Новичок',
  intermediate: 'Средний',
  advanced: 'Продвинутый',
}

const NEAT_OPTIONS = [
  ['sedentary',    'Сидячая — офис/удалёнка'],
  ['moderate',     'Умеренная — часть дня на ногах'],
  ['active',       'Активная — много хожу'],
  ['very_active',  'Очень активная — физический труд'],
]

const TIMEZONE_OPTIONS = [
  ['UTC-12', 'UTC-12 — Бейкер'],
  ['UTC-11', 'UTC-11 — Самоа'],
  ['UTC-10', 'UTC-10 — Гавайи'],
  ['UTC-9',  'UTC-9  — Аляска'],
  ['UTC-8',  'UTC-8  — Лос-Анджелес'],
  ['UTC-7',  'UTC-7  — Денвер'],
  ['UTC-6',  'UTC-6  — Чикаго, Мехико'],
  ['UTC-5',  'UTC-5  — Нью-Йорк'],
  ['UTC-4',  'UTC-4  — Каракас'],
  ['UTC-3',  'UTC-3  — Буэнос-Айрес'],
  ['UTC-2',  'UTC-2  — Срединная Атлантика'],
  ['UTC-1',  'UTC-1  — Азорские острова'],
  ['UTC+0',  'UTC+0  — Лондон'],
  ['UTC+1',  'UTC+1  — Берлин, Париж'],
  ['UTC+2',  'UTC+2  — Калининград'],
  ['UTC+3',  'UTC+3  — Москва, Санкт-Петербург'],
  ['UTC+4',  'UTC+4  — Самара, Ижевск'],
  ['UTC+5',  'UTC+5  — Екатеринбург, Уфа'],
  ['UTC+6',  'UTC+6  — Омск'],
  ['UTC+7',  'UTC+7  — Новосибирск, Красноярск'],
  ['UTC+8',  'UTC+8  — Иркутск'],
  ['UTC+9',  'UTC+9  — Якутск, Чита'],
  ['UTC+10', 'UTC+10 — Владивосток, Хабаровск'],
  ['UTC+11', 'UTC+11 — Магадан, Сахалин'],
  ['UTC+12', 'UTC+12 — Камчатка, Анадырь'],
]

// Morning: 05:00–12:00 step 30min
const MORNING_TIMES = []
for (let h = 5; h <= 12; h++) {
  MORNING_TIMES.push(`${String(h).padStart(2,'0')}:00`)
  if (h < 12) MORNING_TIMES.push(`${String(h).padStart(2,'0')}:30`)
}

// Evening: 18:00–23:30 step 30min
const EVENING_TIMES = []
for (let h = 18; h <= 23; h++) {
  EVENING_TIMES.push(`${String(h).padStart(2,'0')}:00`)
  EVENING_TIMES.push(`${String(h).padStart(2,'0')}:30`)
}

// ── РОСТ (для ИМТ) full-page screen ─────────────────────────────────────────────

function HeightPage({ initialHeight, onClose, onSaved }) {
  const [height, setHeight] = useState(initialHeight ?? 170)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await client.patch('/profile/me', { height })
      onSaved(height)
    } catch (_) {
      setSaving(false)
    }
  }

  return (
    <div className="page club-page">
      <button className="club-back" onClick={onClose} disabled={saving}>‹ НАЗАД</button>

      <div className="tracker-page-title-plate skew-chip">
        <span className="tracker-page-title">РОСТ (ДЛЯ ИМТ)</span>
      </div>

      <p className="progress-label" style={{ marginBottom: 8 }}>Показатель учитывается для расчёта ИМТ</p>

      <div className="tracker-input">
        <ScrollPicker value={height} onChange={setHeight} min={100} max={230} step={1} decimals={0} unit="см" />
      </div>
      <button className="btn btn-accent" onClick={handleSave} disabled={saving}>
        {saving ? 'СОХРАНЯЕМ...' : 'СОХРАНИТЬ'}
      </button>
    </div>
  )
}

// ── МОИ ДАННЫЕ — single-page summary + inline editing ───────────────────────────

function EditableRow({ label, value, onChange, placeholder, type = 'text', suffix }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function startEdit() {
    setDraft(value ?? '')
    setEditing(true)
  }

  function commit() {
    onChange(draft)
    setEditing(false)
  }

  return (
    <div className="data-row skew-chip">
      <span className="data-row__label">{label}</span>
      <span className="data-row__value">
        {editing ? (
          <input
            type={type}
            inputMode={type === 'number' ? 'decimal' : undefined}
            autoFocus
            className="data-row__input"
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
          />
        ) : (
          <span onClick={startEdit}>{value ? `${value}${suffix ?? ''}` : (placeholder ?? '+')}</span>
        )}
      </span>
    </div>
  )
}

function ExpandableTextRow({ label, value, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="data-row skew-chip" onClick={() => setOpen((v) => !v)}>
        <span className="data-row__label">{label}</span>
        <span className="data-row__value"><span>{value ? 'Изменить' : '+'}</span></span>
      </div>
      {open && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={1000}
          rows={4}
          placeholder={"Например:\nболит правое плечо\nизбегаю прыжков и тяжёлых приседаний"}
          className="additional-info-textarea"
        />
      )}
    </>
  )
}

function MyDataView({ profile, onBack, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [preferredName, setPreferredName] = useState(profile?.preferred_name ?? '')
  const [tone, setTone] = useState(profile?.tone ?? 'soft')
  const [selectedGoals, setSelectedGoals] = useState(profile?.goals ?? (profile?.goal ? [profile.goal] : []))
  const [fitnessLevel, setFitnessLevel] = useState(profile?.fitness_level ?? '')
  const [neatLevel, setNeatLevel] = useState(profile?.neat_level ?? '')
  const [sportType, setSportType] = useState(profile?.sport_type ?? '')
  const [tz, setTz] = useState(profile?.timezone ?? 'UTC+3')
  const [morningTime, setMorningTime] = useState(profile?.morning_reminder_time ?? '08:00')
  const [eveningTime, setEveningTime] = useState(profile?.evening_reminder_time ?? '21:00')
  const [notifEnabled, setNotifEnabled] = useState(profile?.notifications_enabled ?? true)
  const [restingPulseEnabled, setRestingPulseEnabled] = useState(profile?.resting_pulse_enabled ?? false)
  const [weight, setWeight] = useState(profile?.weight != null ? String(profile.weight) : '')
  const [height, setHeight] = useState(profile?.height != null ? String(profile.height) : '')
  const [workoutDaysPerWeek, setWorkoutDaysPerWeek] = useState(
    profile?.workout_days_per_week != null ? String(profile.workout_days_per_week) : ''
  )
  const [additionalInfo, setAdditionalInfo] = useState(profile?.additional_info ?? '')

  useEffect(() => {
    if (!profile) return
    setPreferredName(profile.preferred_name ?? '')
    setTone(profile.tone ?? 'soft')
    setSelectedGoals(profile.goals ?? (profile.goal ? [profile.goal] : []))
    setFitnessLevel(profile.fitness_level ?? '')
    setNeatLevel(profile.neat_level ?? '')
    setSportType(profile.sport_type ?? '')
    setTz(profile.timezone ?? 'UTC+3')
    setMorningTime(profile.morning_reminder_time ?? profile.push_time ?? '08:00')
    setEveningTime(profile.evening_reminder_time ?? '21:00')
    setNotifEnabled(profile.notifications_enabled ?? true)
    setRestingPulseEnabled(profile.resting_pulse_enabled ?? false)
    setWeight(profile.weight != null ? String(profile.weight) : '')
    setHeight(profile.height != null ? String(profile.height) : '')
    setWorkoutDaysPerWeek(profile.workout_days_per_week != null ? String(profile.workout_days_per_week) : '')
    setAdditionalInfo(profile.additional_info ?? '')
  }, [profile])

  const tierLabel = profile?.subscription_type === 'pro' ? 'PRO' : profile?.subscription_type === 'plus' ? 'PLUS' : '—'
  const fitnessLabel = fitnessLevel ? (FITNESS_LABELS_PLAIN[fitnessLevel] ?? fitnessLevel) : '—'
  const neatLabel = NEAT_OPTIONS.find(([k]) => k === neatLevel)?.[1] ?? '—'

  const chipRef = useUniformChipWidth([
    tierLabel, tone, fitnessLabel, neatLabel, sportType, tz, morningTime, eveningTime,
    notifEnabled, restingPulseEnabled, weight, height, workoutDaysPerWeek,
  ])

  function toggleGoal(key) {
    setSelectedGoals((prev) => (prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key]))
  }

  function cycleTone() {
    setTone((t) => (t === 'aggressive' ? 'soft' : 'aggressive'))
  }

  function cycleFitness() {
    const keys = FITNESS_OPTIONS.map(([k]) => k)
    const idx = keys.indexOf(fitnessLevel)
    setFitnessLevel(keys[(idx + 1) % keys.length])
  }

  function cycleNeat() {
    const keys = NEAT_OPTIONS.map(([k]) => k)
    const idx = keys.indexOf(neatLevel)
    setNeatLevel(keys[(idx + 1) % keys.length])
  }

  async function handleSave() {
    setError(null)
    setSaving(true)
    try {
      const weightNum = weight !== '' ? parseFloat(String(weight).replace(',', '.')) : undefined
      const heightNum = height !== '' ? parseInt(height, 10) : undefined
      const workoutDaysNum = workoutDaysPerWeek !== '' ? parseInt(workoutDaysPerWeek, 10) : undefined
      await client.patch('/profile/me', {
        preferred_name:         preferredName || undefined,
        tone:                   tone || undefined,
        goals:                  selectedGoals.length > 0 ? selectedGoals : undefined,
        fitness_level:          fitnessLevel || undefined,
        neat_level:             neatLevel || undefined,
        sport_type:             sportType || undefined,
        timezone:               tz || undefined,
        morning_reminder_time:  morningTime || undefined,
        evening_reminder_time:  eveningTime || undefined,
        weight:                 (!isNaN(weightNum) && weightNum > 0) ? weightNum : undefined,
        height:                 (!isNaN(heightNum) && heightNum > 0) ? heightNum : undefined,
        workout_days_per_week:  (!isNaN(workoutDaysNum) && workoutDaysNum >= 1 && workoutDaysNum <= 7) ? workoutDaysNum : undefined,
        notifications_enabled:  notifEnabled,
        resting_pulse_enabled:  restingPulseEnabled,
        additional_info:        additionalInfo.trim() || null,
      })
      onSaved()
    } catch (e) {
      setError('Ошибка сохранения. Попробуй ещё раз.')
      setSaving(false)
    }
  }

  return (
    <div className="page club-page" ref={chipRef}>
      <button className="club-back" onClick={onBack} disabled={saving}>‹ НАЗАД</button>

      <img src={myDataHeading} alt="МОИ ДАННЫЕ" className="screen-title-img" />
      <div className="stripe-divider" />

      <div className="data-row data-row--name skew-chip">
        <input
          className="data-row__input data-row__input--name"
          value={preferredName}
          placeholder="Как к тебе обращаться?"
          onChange={(e) => setPreferredName(e.target.value)}
        />
        <span className="data-row__value"><span>{tierLabel}</span></span>
      </div>

      <div className="data-row skew-chip" onClick={cycleTone}>
        <span className="data-row__label">ТОН ОБЩЕНИЯ</span>
        <span className="data-row__value"><span>{tone === 'aggressive' ? 'ЖЁСТКИЙ' : 'МЯГКИЙ'}</span></span>
      </div>

      <p className="section-heading">ЦЕЛИ</p>
      {GOAL_OPTIONS.map(([key, label]) => (
        <div key={key} className="data-row skew-chip" onClick={() => toggleGoal(key)}>
          <span className="data-row__label">{label.toUpperCase()}</span>
          <span className="data-row__value"><span>{selectedGoals.includes(key) ? '✓' : '+'}</span></span>
        </div>
      ))}

      <div className="data-row skew-chip" onClick={cycleFitness}>
        <span className="data-row__label">УРОВЕНЬ ПОДГОТОВКИ</span>
        <span className="data-row__value"><span>{fitnessLabel}</span></span>
      </div>

      <div className="data-row skew-chip" onClick={cycleNeat}>
        <span className="data-row__label">АКТИВНОСТЬ ВНЕ ТРЕНИРОВОК</span>
        <span className="data-row__value"><span>{neatLabel}</span></span>
      </div>

      <EditableRow label="ВИД СПОРТА" value={sportType} onChange={setSportType} placeholder="Фитнес, бег, бокс..." />

      <div className="data-row skew-chip">
        <span className="data-row__label">ЧАСОВОЙ ПОЯС</span>
        <span className="data-row__value">
          <select className="data-row__input" value={tz} onChange={(e) => setTz(e.target.value)}>
            {!TIMEZONE_OPTIONS.some(([k]) => k === tz) && tz && <option value={tz}>{tz}</option>}
            {TIMEZONE_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </span>
      </div>

      <div className="data-row skew-chip">
        <span className="data-row__label">УТРЕННЕЕ НАПОМИНАНИЕ</span>
        <span className="data-row__value">
          <select className="data-row__input" value={morningTime} onChange={(e) => setMorningTime(e.target.value)}>
            {!MORNING_TIMES.includes(morningTime) && morningTime && <option value={morningTime}>{morningTime}</option>}
            {MORNING_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </span>
      </div>

      <div className="data-row skew-chip">
        <span className="data-row__label">ВЕЧЕРНЕЕ НАПОМИНАНИЕ</span>
        <span className="data-row__value">
          <select className="data-row__input" value={eveningTime} onChange={(e) => setEveningTime(e.target.value)}>
            {!EVENING_TIMES.includes(eveningTime) && eveningTime && <option value={eveningTime}>{eveningTime}</option>}
            {EVENING_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </span>
      </div>

      <div className="data-row skew-chip" onClick={() => setNotifEnabled((v) => !v)}>
        <span className="data-row__label">УВЕДОМЛЕНИЯ</span>
        <span className="data-row__value"><span>{notifEnabled ? 'ВКЛ.' : 'ВЫКЛ.'}</span></span>
      </div>

      <div className="data-row skew-chip" onClick={() => setRestingPulseEnabled((v) => !v)}>
        <span className="data-row__label">ПУЛЬС ПОКОЯ</span>
        <span className="data-row__value"><span>{restingPulseEnabled ? 'ВКЛ.' : 'ВЫКЛ.'}</span></span>
      </div>

      <EditableRow label="ВЕС (СТАРТОВЫЙ, КГ)" value={weight} onChange={setWeight} type="number" suffix=" КГ" placeholder="Например: 75.5" />
      <EditableRow label="РОСТ (СМ)" value={height} onChange={setHeight} type="number" suffix=" СМ" placeholder="Например: 178" />
      <EditableRow label="ТРЕНИРОВОК В НЕДЕЛЮ" value={workoutDaysPerWeek} onChange={setWorkoutDaysPerWeek} type="number" placeholder="Например: 4" />

      <ExpandableTextRow label="ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ" value={additionalInfo} onChange={setAdditionalInfo} />

      {error && <p style={{ color: '#ff4444', fontSize: '0.85rem', marginTop: 8 }}>{error}</p>}

      <button className="btn btn-accent" onClick={handleSave} disabled={saving} style={{ marginTop: 20 }}>
        {saving ? 'СОХРАНЯЕМ...' : 'СОХРАНИТЬ'}
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { profile, refreshProfile } = useProfile()
  const [myDataOpen, setMyDataOpen] = useState(false)
  const [trackerViewOpen, setTrackerViewOpen] = useState(false)
  const [dataVersion, setDataVersion] = useState(0)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('section') === 'checkins') {
      setTrackerViewOpen(true)
    }
  }, [])

  const [checkins, setCheckins] = useState({ morning: null, post_workout: null, evening: null })
  const [checkinsLoading, setCheckinsLoading] = useState(true)
  const [activeFlow, setActiveFlow] = useState(null)
  const [editCheckin, setEditCheckin] = useState(null) // { type, id, data }

  const [trackers, setTrackers] = useState({ weight: null, water: null, sleep: null, calories: null, pulse: null })
  const [calorieLimit, setCalorieLimit] = useState(null)
  const [macroTargets, setMacroTargets] = useState(null)
  const [activeTracker, setActiveTracker] = useState(null)
  const [heightOpen, setHeightOpen] = useState(false)

  async function loadTrackers() {
    try {
      const trackData = await getTodayTrackers()
      const { calorie_limit, calories_meals, macro_targets, ...rest } = trackData
      setTrackers(rest)
      setCalorieLimit(calorie_limit ?? null)
      setMacroTargets(macro_targets ?? null)
    } catch (_) {}
  }

  async function loadCheckins() {
    try {
      setCheckins(await getTodayCheckins())
    } catch (_) {}
    setCheckinsLoading(false)
  }

  useEffect(() => { loadCheckins(); loadTrackers() }, [])

  if (activeFlow) {
    return (
      <CheckinFlow
        type={activeFlow}
        ctx={{ hasPostWorkout: !!checkins.post_workout }}
        onClose={() => { setActiveFlow(null); loadCheckins() }}
      />
    )
  }

  if (editCheckin) {
    return (
      <CheckinFlow
        type={editCheckin.type}
        ctx={{ hasPostWorkout: !!checkins.post_workout }}
        editMode
        checkinId={editCheckin.id}
        initialData={editCheckin.data}
        onClose={() => { setEditCheckin(null); loadCheckins() }}
      />
    )
  }

  if (myDataOpen) {
    return (
      <MyDataView
        profile={profile}
        onBack={() => setMyDataOpen(false)}
        onSaved={() => { setMyDataOpen(false); refreshProfile() }}
      />
    )
  }

  if (activeTracker) {
    return (
      <TrackerModal
        type={activeTracker}
        todayData={trackers[activeTracker]}
        calorieLimit={calorieLimit}
        macroTargets={macroTargets}
        onClose={() => setActiveTracker(null)}
        onSaved={() => { setActiveTracker(null); loadTrackers(); setDataVersion((v) => v + 1) }}
      />
    )
  }

  if (heightOpen) {
    return (
      <HeightPage
        initialHeight={profile?.height}
        onClose={() => setHeightOpen(false)}
        onSaved={() => { setHeightOpen(false); refreshProfile(); setDataVersion((v) => v + 1) }}
      />
    )
  }

  if (trackerViewOpen) {
    return (
      <div className="page club-page">
        <button className="club-back" onClick={() => setTrackerViewOpen(false)}>‹ НАЗАД</button>

        <div className="checkin-cards" style={{ marginTop: 12 }}>
          {CHECKIN_TYPES.map((type) => (
            <CheckinCard
              key={type}
              type={type}
              checkin={checkins[type]}
              onClick={() => setActiveFlow(type)}
              onEdit={checkins[type] ? () => setEditCheckin({
                type,
                id: checkins[type].id,
                data: checkins[type].data,
              }) : undefined}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="page club-page" style={{ position: 'relative' }}>
      <img src={profileHeading} alt="ПРОФИЛЬ" className="screen-title-img screen-title-img--hero" />

      <MyDataCard
        onEditClick={() => setMyDataOpen(true)}
        trackers={trackers}
        onOpenTracker={setActiveTracker}
        onOpenHeight={() => setHeightOpen(true)}
      />

      {!checkinsLoading && (
        <button
          className="tracker-cta-btn skew-chip"
          style={{ marginTop: 28 }}
          onClick={() => setTrackerViewOpen(true)}
        >
          <span className="tracker-cta-btn__title">ЗАПОЛНИ ТРЕКЕР</span>
        </button>
      )}

      <img src={progressHeading} alt="ПРОГРЕСС" className="screen-title-img screen-title-img--hero" style={{ marginTop: 32, marginBottom: 14 }} />
      <ProgressSection refreshKey={dataVersion} />
    </div>
  )
}

import { useEffect, useState } from 'react'
import client from '../api/client'
import { getTodayCheckins } from '../api/checkins'
import { getTodayTrackers } from '../api/trackers'
import goalsHeading from '../assets/Цели.png'
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
        <span className="tracker-page-title">ЗАПИСАТЬ РОСТ</span>
      </div>

      <p className="progress-label" style={{ textAlign: 'left', fontSize: '0.7rem', marginBottom: 8 }}>Показатель учитывается для расчёта ИМТ</p>

      <div className="tracker-input">
        <ScrollPicker value={height} onChange={setHeight} min={100} max={230} step={1} decimals={0} unit="см" />
      </div>
      <button className="btn tracker-save-btn--side" onClick={handleSave} disabled={saving} style={{ marginTop: 16 }}>
        {saving ? 'СОХРАНЯЕМ...' : 'СОХРАНИТЬ'}
      </button>
    </div>
  )
}

// ── МОИ ДАННЫЕ — summary list + one dedicated edit page per field ───────────────

// Full-page text/number/multiline field editor — "РЕДАКТИРОВАТЬ ИМЯ",
// "ВИД СПОРТА", "ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ" etc.
function TextEditPage({ title, subtitle, value, onChange, placeholder, multiline, numeric, onBack, onSave, saving }) {
  return (
    <div className="page club-page">
      <button className="club-back" onClick={onBack} disabled={saving}>‹ НАЗАД</button>

      <div className="tracker-page-title-plate skew-chip">
        <span className="tracker-page-title">{title}</span>
      </div>

      {subtitle && <p className="progress-label" style={{ textAlign: 'left', marginBottom: 8 }}>{subtitle}</p>}

      {multiline ? (
        <textarea
          className="additional-info-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={1000}
          rows={5}
          placeholder={placeholder}
          autoFocus
        />
      ) : (
        <input
          type={numeric ? 'number' : 'text'}
          inputMode={numeric ? 'decimal' : undefined}
          className="field-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus
        />
      )}

      <button className="btn tracker-save-btn--side" onClick={onSave} disabled={saving} style={{ marginTop: 16 }}>
        {saving ? 'СОХРАНЯЕМ...' : 'СОХРАНИТЬ'}
      </button>
    </div>
  )
}

// Full-page single-select list — "СТИЛЬ ОБЩЕНИЯ", "ЧАСОВОЙ ПОЯС" etc.
// Tapping an option commits immediately, no separate save step.
function OptionEditPage({ title, options, value, onSelect, onBack, saving }) {
  return (
    <div className="page club-page">
      <button className="club-back" onClick={onBack} disabled={saving}>‹ НАЗАД</button>

      <div className="tracker-page-title-plate skew-chip">
        <span className="tracker-page-title">{title}</span>
      </div>

      <div className="option-list">
        {options.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`option-list__item${key === value ? ' option-list__item--active' : ''}`}
            onClick={() => onSelect(key)}
            disabled={saving}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function buildProfilePayload(s) {
  const weightNum = s.weight !== '' ? parseFloat(String(s.weight).replace(',', '.')) : undefined
  const heightNum = s.height !== '' ? parseInt(s.height, 10) : undefined
  const workoutDaysNum = s.workoutDaysPerWeek !== '' ? parseInt(s.workoutDaysPerWeek, 10) : undefined
  return {
    preferred_name:         s.preferredName || undefined,
    tone:                   s.tone || undefined,
    goals:                  s.selectedGoals.length > 0 ? s.selectedGoals : undefined,
    fitness_level:          s.fitnessLevel || undefined,
    neat_level:             s.neatLevel || undefined,
    sport_type:             s.sportType || undefined,
    timezone:               s.tz || undefined,
    morning_reminder_time:  s.morningTime || undefined,
    evening_reminder_time:  s.eveningTime || undefined,
    weight:                 (!isNaN(weightNum) && weightNum > 0) ? weightNum : undefined,
    height:                 (!isNaN(heightNum) && heightNum > 0) ? heightNum : undefined,
    workout_days_per_week:  (!isNaN(workoutDaysNum) && workoutDaysNum >= 1 && workoutDaysNum <= 7) ? workoutDaysNum : undefined,
    notifications_enabled:  s.notifEnabled,
    resting_pulse_enabled:  s.restingPulseEnabled,
    additional_info:        s.additionalInfo.trim() || null,
  }
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

  const [editField, setEditField] = useState(null)

  async function persist(overrides = {}) {
    setError(null)
    setSaving(true)
    const snapshot = {
      preferredName, tone, selectedGoals, fitnessLevel, neatLevel, sportType, tz,
      morningTime, eveningTime, notifEnabled, restingPulseEnabled, weight, height,
      workoutDaysPerWeek, additionalInfo, ...overrides,
    }
    try {
      await client.patch('/profile/me', buildProfilePayload(snapshot))
      onSaved()
      setEditField(null)
      return true
    } catch (e) {
      setError('Ошибка сохранения. Попробуй ещё раз.')
      setSaving(false)
      return false
    }
  }

  function toggleGoal(key) {
    setSelectedGoals((prev) => (prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key]))
  }

  if (editField === 'name') {
    return (
      <TextEditPage
        title="РЕДАКТИРОВАТЬ ИМЯ" subtitle="ИМЯ"
        value={preferredName} onChange={setPreferredName}
        placeholder="Как к тебе обращаться?"
        onBack={() => setEditField(null)} onSave={() => persist()} saving={saving}
      />
    )
  }
  if (editField === 'tone') {
    return (
      <OptionEditPage
        title="СТИЛЬ ОБЩЕНИЯ"
        options={[['soft', 'Мягкий'], ['aggressive', 'Жёсткий']]}
        value={tone}
        onSelect={(v) => { setTone(v); persist({ tone: v }) }}
        onBack={() => setEditField(null)} saving={saving}
      />
    )
  }
  if (editField === 'fitness') {
    return (
      <OptionEditPage
        title="УРОВЕНЬ ПОДГОТОВКИ"
        options={FITNESS_OPTIONS}
        value={fitnessLevel}
        onSelect={(v) => { setFitnessLevel(v); persist({ fitnessLevel: v }) }}
        onBack={() => setEditField(null)} saving={saving}
      />
    )
  }
  if (editField === 'neat') {
    return (
      <OptionEditPage
        title="АКТИВНОСТЬ ВНЕ ТРЕНИРОВОК"
        options={NEAT_OPTIONS}
        value={neatLevel}
        onSelect={(v) => { setNeatLevel(v); persist({ neatLevel: v }) }}
        onBack={() => setEditField(null)} saving={saving}
      />
    )
  }
  if (editField === 'sport') {
    return (
      <TextEditPage
        title="ВИД СПОРТА"
        value={sportType} onChange={setSportType}
        placeholder="Фитнес, бег, бокс..."
        onBack={() => setEditField(null)} onSave={() => persist()} saving={saving}
      />
    )
  }
  if (editField === 'timezone') {
    return (
      <OptionEditPage
        title="ЧАСОВОЙ ПОЯС"
        options={TIMEZONE_OPTIONS}
        value={tz}
        onSelect={(v) => { setTz(v); persist({ tz: v }) }}
        onBack={() => setEditField(null)} saving={saving}
      />
    )
  }
  if (editField === 'morning') {
    return (
      <OptionEditPage
        title="УТРЕННЕЕ НАПОМИНАНИЕ"
        options={MORNING_TIMES.map((t) => [t, t])}
        value={morningTime}
        onSelect={(v) => { setMorningTime(v); persist({ morningTime: v }) }}
        onBack={() => setEditField(null)} saving={saving}
      />
    )
  }
  if (editField === 'evening') {
    return (
      <OptionEditPage
        title="ВЕЧЕРНЕЕ НАПОМИНАНИЕ"
        options={EVENING_TIMES.map((t) => [t, t])}
        value={eveningTime}
        onSelect={(v) => { setEveningTime(v); persist({ eveningTime: v }) }}
        onBack={() => setEditField(null)} saving={saving}
      />
    )
  }
  if (editField === 'notifications') {
    return (
      <OptionEditPage
        title="УВЕДОМЛЕНИЯ"
        options={[['on', 'Включены'], ['off', 'Выключены']]}
        value={notifEnabled ? 'on' : 'off'}
        onSelect={(v) => { const val = v === 'on'; setNotifEnabled(val); persist({ notifEnabled: val }) }}
        onBack={() => setEditField(null)} saving={saving}
      />
    )
  }
  if (editField === 'pulse') {
    return (
      <OptionEditPage
        title="ПУЛЬС ПОКОЯ"
        options={[['on', 'Включён'], ['off', 'Выключен']]}
        value={restingPulseEnabled ? 'on' : 'off'}
        onSelect={(v) => { const val = v === 'on'; setRestingPulseEnabled(val); persist({ restingPulseEnabled: val }) }}
        onBack={() => setEditField(null)} saving={saving}
      />
    )
  }
  if (editField === 'weight') {
    return (
      <TextEditPage
        title="ВЕС (СТАРТОВЫЙ, КГ)" numeric
        value={weight} onChange={setWeight}
        placeholder="Например: 75.5"
        onBack={() => setEditField(null)} onSave={() => persist()} saving={saving}
      />
    )
  }
  if (editField === 'height') {
    return (
      <HeightPage
        initialHeight={height ? parseFloat(height) : 170}
        onClose={() => setEditField(null)}
        onSaved={(v) => { setHeight(String(v)); onSaved(); setEditField(null) }}
      />
    )
  }
  if (editField === 'workoutDays') {
    return (
      <TextEditPage
        title="ТРЕНИРОВОК В НЕДЕЛЮ" numeric
        value={workoutDaysPerWeek} onChange={setWorkoutDaysPerWeek}
        placeholder="Например: 4"
        onBack={() => setEditField(null)} onSave={() => persist()} saving={saving}
      />
    )
  }
  if (editField === 'additional') {
    return (
      <TextEditPage
        title="ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ" multiline
        subtitle="Травмы, ограничения, пожелания — ИИ учтёт это в рекомендациях"
        value={additionalInfo} onChange={setAdditionalInfo}
        placeholder="Например: болит правое плечо..."
        onBack={() => setEditField(null)} onSave={() => persist()} saving={saving}
      />
    )
  }

  return (
    <div className="page club-page">
      <button className="club-back" onClick={onBack} disabled={saving}>‹ НАЗАД</button>

      <img src={myDataHeading} alt="МОИ ДАННЫЕ" className="screen-title-img" />
      <div className="stripe-divider" />

      <div className="data-row skew-chip" onClick={() => setEditField('name')}>
        <span className="data-row__label">{preferredName || 'ИМЯ'}</span>
        <span className="data-row__value data-row__value--fixed"><span>{tierLabel}</span></span>
      </div>

      <div className="data-row skew-chip" onClick={() => setEditField('tone')}>
        <span className="data-row__label">ТОН ОБЩЕНИЯ</span>
        <span className="data-row__value data-row__value--fixed"><span>{tone === 'aggressive' ? 'ЖЁСТКИЙ' : 'МЯГКИЙ'}</span></span>
      </div>

      <img src={goalsHeading} alt="ЦЕЛИ" className="goals-heading-img" />
      {GOAL_OPTIONS.map(([key, label]) => (
        <div key={key} className="flat-row" onClick={() => toggleGoal(key)}>
          <span className="flat-row__label">{label.toUpperCase()}</span>
          <span className="flat-row__value">{selectedGoals.includes(key) ? '−' : '+'}</span>
        </div>
      ))}

      <div className="flat-row" onClick={() => setEditField('fitness')}>
        <span className="flat-row__label">УРОВЕНЬ ПОДГОТОВКИ</span>
        <span className="flat-row__value">+</span>
      </div>

      <div className="flat-row" onClick={() => setEditField('neat')}>
        <span className="flat-row__label">АКТИВНОСТЬ ВНЕ ТРЕНИРОВОК</span>
        <span className="flat-row__value">+</span>
      </div>

      <div className="flat-row" onClick={() => setEditField('sport')}>
        <span className="flat-row__label">ВИД СПОРТА</span>
        <span className="flat-row__value">+</span>
      </div>

      <div className="flat-row" onClick={() => setEditField('timezone')}>
        <span className="flat-row__label">ЧАСОВОЙ ПОЯС</span>
        <span className="flat-row__value">{tz}</span>
      </div>

      <div className="flat-row" onClick={() => setEditField('morning')}>
        <span className="flat-row__label">УТРЕННЕЕ НАПОМИНАНИЕ</span>
        <span className="flat-row__value">{morningTime}</span>
      </div>

      <div className="flat-row" onClick={() => setEditField('evening')}>
        <span className="flat-row__label">ВЕЧЕРНЕЕ НАПОМИНАНИЕ</span>
        <span className="flat-row__value">{eveningTime}</span>
      </div>

      <div className="flat-row" onClick={() => setEditField('notifications')}>
        <span className="flat-row__label">УВЕДОМЛЕНИЯ</span>
        <span className="flat-row__value">+</span>
      </div>

      <div className="flat-row" onClick={() => setEditField('pulse')}>
        <span className="flat-row__label">ПУЛЬС ПОКОЯ</span>
        <span className="flat-row__value">+</span>
      </div>

      <div className="flat-row" onClick={() => setEditField('weight')}>
        <span className="flat-row__label">ВЕС (СТАРТОВЫЙ, КГ)</span>
        <span className="flat-row__value">{weight ? `${weight} КГ` : '+'}</span>
      </div>

      <div className="flat-row" onClick={() => setEditField('height')}>
        <span className="flat-row__label">РОСТ (СМ)</span>
        <span className="flat-row__value">{height ? `${height} СМ` : '+'}</span>
      </div>

      <div className="flat-row" onClick={() => setEditField('workoutDays')}>
        <span className="flat-row__label">ТРЕНИРОВОК В НЕДЕЛЮ</span>
        <span className="flat-row__value">{workoutDaysPerWeek || '+'}</span>
      </div>

      <div className="flat-row" onClick={() => setEditField('additional')}>
        <span className="flat-row__label">ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ</span>
        <span className="flat-row__value">+</span>
      </div>

      {error && <p style={{ color: '#ff4444', fontSize: '0.85rem', marginTop: 8 }}>{error}</p>}
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
        onSaved={() => refreshProfile()}
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

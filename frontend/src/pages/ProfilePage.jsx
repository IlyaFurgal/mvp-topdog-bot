import { useEffect, useRef, useState } from 'react'
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

      <span className="tracker-page-title">РОСТ (ДЛЯ ИМТ)</span>
      <div className="stripe-divider" />

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

// ── МОИ ДАННЫЕ summary screen ──────────────────────────────────────────────────

function MyDataView({ profile, onBack, onEdit }) {
  const fitnessLabel = profile?.fitness_level
    ? (FITNESS_LABELS_PLAIN[profile.fitness_level] ?? profile.fitness_level)
    : '—'

  const chipRef = useUniformChipWidth([
    profile?.tone, fitnessLabel, profile?.morning_reminder_time,
    profile?.evening_reminder_time, profile?.notifications_enabled,
    profile?.weight, profile?.height, profile?.workout_days_per_week,
  ])

  return (
    <div className="page club-page" ref={chipRef}>
      <button className="club-back" onClick={onBack}>‹ НАЗАД</button>

      <img src={myDataHeading} alt="МОИ ДАННЫЕ" className="screen-title-img" />
      <div className="stripe-divider" />

      <div className="data-row skew-chip" onClick={() => onEdit('tone')}>
        <span className="data-row__label">СТИЛЬ ОБЩЕНИЯ</span>
        <span className="data-row__value">
          <span>{profile?.tone === 'aggressive' ? 'Жёсткий' : profile?.tone === 'soft' ? 'Мягкий' : '—'}</span>
        </span>
      </div>
      <div className="data-row skew-chip" onClick={() => onEdit('goals')}>
        <span className="data-row__label">ЦЕЛИ</span>
        <span className="data-row__value"><span>Подроб.</span></span>
      </div>
      <div className="data-row skew-chip" onClick={() => onEdit('fitness')}>
        <span className="data-row__label">УРОВЕНЬ ПОДГОТОВКИ</span>
        <span className="data-row__value"><span>{fitnessLabel}</span></span>
      </div>
      <div className="data-row skew-chip" onClick={() => onEdit('sport')}>
        <span className="data-row__label">ВИД СПОРТА</span>
        <span className="data-row__value"><span>Подроб.</span></span>
      </div>
      <div className="data-row skew-chip" onClick={() => onEdit('morning')}>
        <span className="data-row__label">УТРЕННЕЕ НАПОМИНАНИЕ</span>
        <span className="data-row__value"><span>{profile?.morning_reminder_time ?? '08:00'}</span></span>
      </div>
      <div className="data-row skew-chip" onClick={() => onEdit('evening')}>
        <span className="data-row__label">ВЕЧЕРНЕЕ НАПОМИНАНИЕ</span>
        <span className="data-row__value"><span>{profile?.evening_reminder_time ?? '21:00'}</span></span>
      </div>
      <div className="data-row skew-chip" onClick={() => onEdit('notifications')}>
        <span className="data-row__label">УВЕДОМЛЕНИЯ</span>
        <span className="data-row__value">
          <span>{profile?.notifications_enabled === false ? 'Выкл.' : 'Вкл.'}</span>
        </span>
      </div>
      <div className="data-row skew-chip" onClick={() => onEdit('weight')}>
        <span className="data-row__label">ВЕС</span>
        <span className="data-row__value">
          <span>{profile?.weight != null ? `${profile.weight} кг` : '—'}</span>
        </span>
      </div>
      <div className="data-row skew-chip" onClick={() => onEdit('height')}>
        <span className="data-row__label">РОСТ</span>
        <span className="data-row__value">
          <span>{profile?.height != null ? `${profile.height} см` : '—'}</span>
        </span>
      </div>
      <div className="data-row skew-chip" onClick={() => onEdit('workoutDaysPerWeek')}>
        <span className="data-row__label">ТРЕНИРОВОК В НЕДЕЛЮ</span>
        <span className="data-row__value">
          <span>{profile?.workout_days_per_week != null ? profile.workout_days_per_week : '—'}</span>
        </span>
      </div>
      <div className="data-row skew-chip" onClick={() => onEdit('additional')}>
        <span className="data-row__label">ДОП. ИНФОРМАЦИЯ</span>
        <span className="data-row__value"><span>Подроб.</span></span>
      </div>
    </div>
  )
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditProfileModal({ profile, focusField, onClose, onSaved }) {
  const overlayRef = useRef(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Preferred name
  const [preferredName, setPreferredName] = useState(profile?.preferred_name ?? '')

  // Tone
  const [tone, setTone] = useState(profile?.tone ?? 'soft')

  // Goals: multi-select
  const initialGoals = profile?.goals ?? (profile?.goal ? [profile.goal] : [])
  const [selectedGoals, setSelectedGoals] = useState(initialGoals)

  // Fitness level
  const [fitnessLevel, setFitnessLevel] = useState(profile?.fitness_level ?? '')

  // NEAT — дневная активность вне тренировок (влияет на норму калорий)
  const [neatLevel, setNeatLevel] = useState(profile?.neat_level ?? '')

  // Sport type (free text)
  const [sportType, setSportType] = useState(profile?.sport_type ?? '')

  // Timezone
  const [tz, setTz] = useState(profile?.timezone ?? 'UTC+3')

  // Reminder times
  const [morningTime, setMorningTime] = useState(profile?.morning_reminder_time ?? '08:00')
  const [eveningTime, setEveningTime] = useState(profile?.evening_reminder_time ?? '21:00')

  // Notifications toggle
  const [notifEnabled, setNotifEnabled] = useState(profile?.notifications_enabled ?? true)

  // Body metrics
  const [weight, setWeight] = useState(profile?.weight != null ? String(profile.weight) : '')
  const [height, setHeight] = useState(profile?.height != null ? String(profile.height) : '')

  // Target training frequency
  const [workoutDaysPerWeek, setWorkoutDaysPerWeek] = useState(
    profile?.workout_days_per_week != null ? String(profile.workout_days_per_week) : ''
  )

  // Additional info (free-form notes for AI)
  const [additionalInfo, setAdditionalInfo] = useState(profile?.additional_info ?? '')

  // Sync all form fields when profile loads or changes
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
    setWeight(profile.weight != null ? String(profile.weight) : '')
    setHeight(profile.height != null ? String(profile.height) : '')
    setWorkoutDaysPerWeek(profile.workout_days_per_week != null ? String(profile.workout_days_per_week) : '')
    setAdditionalInfo(profile.additional_info ?? '')
  }, [profile])

  // Jump straight to the field the user tapped in МОИ ДАННЫЕ instead of
  // always opening at the top of a long form
  useEffect(() => {
    if (!focusField) return
    const id = setTimeout(() => {
      document.getElementById(`field-${focusField}`)?.scrollIntoView({ block: 'start' })
    }, 0)
    return () => clearTimeout(id)
  }, [focusField])

  function toggleGoal(key) {
    setSelectedGoals((prev) =>
      prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key]
    )
  }

  async function handleSave() {
    setError(null)
    setSaving(true)
    try {
      const weightNum = weight !== '' ? parseFloat(weight.replace(',', '.')) : undefined
      const heightNum = height !== '' ? parseInt(height, 10) : undefined
      const workoutDaysNum = workoutDaysPerWeek !== '' ? parseInt(workoutDaysPerWeek, 10) : undefined
      await client.patch('/profile/me', {
        preferred_name:        preferredName || undefined,
        tone:                  tone || undefined,
        goals:                 selectedGoals.length > 0 ? selectedGoals : undefined,
        fitness_level:         fitnessLevel || undefined,
        neat_level:            neatLevel || undefined,
        sport_type:            sportType || undefined,
        timezone:              tz || undefined,
        morning_reminder_time: morningTime || undefined,
        evening_reminder_time: eveningTime || undefined,
        weight:                (!isNaN(weightNum) && weightNum > 0) ? weightNum : undefined,
        height:                (!isNaN(heightNum) && heightNum > 0) ? heightNum : undefined,
        workout_days_per_week: (!isNaN(workoutDaysNum) && workoutDaysNum >= 1 && workoutDaysNum <= 7) ? workoutDaysNum : undefined,
        notifications_enabled: notifEnabled,
        additional_info:       additionalInfo.trim() || null,
      })
      onSaved()
    } catch (e) {
      setError('Ошибка сохранения. Попробуй ещё раз.')
      setSaving(false)
    }
  }

  function handleOverlay(e) {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={handleOverlay}>
      <div className="modal-sheet modal-sheet--scroll">
        <div className="modal-header">
          <span className="modal-title">РЕДАКТИРОВАТЬ ПРОФИЛЬ</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Preferred name */}
        <p id="field-name" className="section-label" style={{ marginBottom: 8 }}>ИМЯ</p>
        <input
          type="text"
          value={preferredName}
          onChange={(e) => setPreferredName(e.target.value)}
          placeholder="Как к тебе обращаться?"
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--card-bg)',
            color: 'var(--text)',
            fontSize: '0.9rem',
            boxSizing: 'border-box',
            marginBottom: 16,
          }}
        />

        {/* Tone */}
        <p id="field-tone" className="section-label" style={{ marginBottom: 8 }}>СТИЛЬ ОБЩЕНИЯ</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            ['aggressive', '💪 Жёсткий'],
            ['soft',       '🤝 Мягкий'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTone(key)}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: tone === key ? 'var(--accent)' : 'var(--card-bg)',
                color: tone === key ? '#000' : 'var(--text)',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Goals */}
        <p id="field-goals" className="section-label" style={{ marginBottom: 8 }}>ЦЕЛИ</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {GOAL_OPTIONS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => toggleGoal(key)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: selectedGoals.includes(key) ? 'var(--accent)' : 'var(--card-bg)',
                color: selectedGoals.includes(key) ? '#000' : 'var(--text)',
                fontWeight: 700,
                fontSize: '0.85rem',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              {selectedGoals.includes(key) ? '✅ ' : '◻️ '}{label}
            </button>
          ))}
        </div>

        {/* Fitness level */}
        <p id="field-fitness" className="section-label" style={{ marginBottom: 8 }}>УРОВЕНЬ ПОДГОТОВКИ</p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {FITNESS_OPTIONS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFitnessLevel(key)}
              style={{
                padding: '7px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: fitnessLevel === key ? 'var(--accent)' : 'var(--card-bg)',
                color: fitnessLevel === key ? '#000' : 'var(--text)',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* NEAT — дневная активность вне тренировок, влияет на норму калорий */}
        <p id="field-neat" className="section-label" style={{ marginBottom: 8 }}>ДНЕВНАЯ АКТИВНОСТЬ ВНЕ ТРЕНИРОВОК</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {NEAT_OPTIONS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setNeatLevel(key)}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: neatLevel === key ? 'var(--accent)' : 'var(--card-bg)',
                color: neatLevel === key ? '#000' : 'var(--text)',
                fontWeight: 700,
                fontSize: '0.8rem',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sport type */}
        <p id="field-sport" className="section-label" style={{ marginBottom: 8 }}>ВИД СПОРТА</p>
        <input
          type="text"
          value={sportType}
          onChange={(e) => setSportType(e.target.value)}
          placeholder="Фитнес / зал, Бег, Бокс..."
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--card-bg)',
            color: 'var(--text)',
            fontSize: '0.9rem',
            boxSizing: 'border-box',
            marginBottom: 16,
          }}
        />

        {/* Timezone */}
        <p id="field-timezone" className="section-label" style={{ marginBottom: 8 }}>ЧАСОВОЙ ПОЯС</p>
        <select
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--card-bg)',
            color: 'var(--text)',
            fontSize: '0.9rem',
            marginBottom: 16,
            appearance: 'none',
            WebkitAppearance: 'none',
          }}
        >
          {!TIMEZONE_OPTIONS.some(([k]) => k === tz) && tz && (
            <option value={tz}>{tz}</option>
          )}
          {TIMEZONE_OPTIONS.map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        {/* Morning reminder */}
        <p id="field-morning" className="section-label" style={{ marginBottom: 8 }}>УТРЕННЕЕ НАПОМИНАНИЕ</p>
        <select
          value={morningTime}
          onChange={(e) => setMorningTime(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--card-bg)',
            color: 'var(--text)',
            fontSize: '0.9rem',
            marginBottom: 16,
            appearance: 'none',
            WebkitAppearance: 'none',
          }}
        >
          {!MORNING_TIMES.includes(morningTime) && morningTime && (
            <option value={morningTime}>{morningTime}</option>
          )}
          {MORNING_TIMES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Evening reminder */}
        <p id="field-evening" className="section-label" style={{ marginBottom: 8 }}>ВЕЧЕРНЕЕ НАПОМИНАНИЕ</p>
        <select
          value={eveningTime}
          onChange={(e) => setEveningTime(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--card-bg)',
            color: 'var(--text)',
            fontSize: '0.9rem',
            marginBottom: 16,
            appearance: 'none',
            WebkitAppearance: 'none',
          }}
        >
          {!EVENING_TIMES.includes(eveningTime) && eveningTime && (
            <option value={eveningTime}>{eveningTime}</option>
          )}
          {EVENING_TIMES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Notifications toggle */}
        <p id="field-notifications" className="section-label" style={{ marginBottom: 8 }}>УВЕДОМЛЕНИЯ</p>
        <div
          onClick={() => setNotifEnabled(v => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--card-bg)',
            marginBottom: 16,
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
            {notifEnabled ? '🔔 Напоминания включены' : '🔕 Напоминания выключены'}
          </span>
          <div style={{
            width: 44,
            height: 24,
            borderRadius: 12,
            background: notifEnabled ? 'var(--accent)' : '#444',
            position: 'relative',
            transition: 'background 0.2s',
            flexShrink: 0,
          }}>
            <div style={{
              position: 'absolute',
              top: 3,
              left: notifEnabled ? 23 : 3,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: notifEnabled ? '#000' : '#888',
              transition: 'left 0.2s',
            }} />
          </div>
        </div>

        {/* Weight */}
        <p id="field-weight" className="section-label" style={{ marginBottom: 8 }}>ВЕС (стартовый, кг)</p>
        <input
          className="field-input"
          type="number"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="Например: 75.5"
          min="30"
          max="300"
          step="0.1"
          style={{ marginBottom: 4 }}
        />
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Стартовый вес для расчёта нормы калорий. Текущий вес меняй через трекер.
        </p>

        {/* Height */}
        <p id="field-height" className="section-label" style={{ marginBottom: 8 }}>РОСТ (см)</p>
        <input
          className="field-input"
          type="number"
          inputMode="numeric"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          placeholder="Например: 178"
          min="100"
          max="250"
          style={{ marginBottom: 16 }}
        />

        {/* Target workouts per week */}
        <p id="field-workoutDaysPerWeek" className="section-label" style={{ marginBottom: 8 }}>ТРЕНИРОВОК В НЕДЕЛЮ</p>
        <input
          className="field-input"
          type="number"
          inputMode="numeric"
          value={workoutDaysPerWeek}
          onChange={(e) => setWorkoutDaysPerWeek(e.target.value)}
          placeholder="Например: 4"
          min="1"
          max="7"
          style={{ marginBottom: 4 }}
        />
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Сколько тренировок в неделю планируешь — тренер будет строить программу под это количество.
        </p>

        {/* Additional info */}
        <p id="field-additional" className="section-label" style={{ marginBottom: 4 }}>ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ</p>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8 }}>
          Травмы, ограничения, пожелания — ИИ учтёт это в рекомендациях
        </p>
        <textarea
          value={additionalInfo}
          onChange={(e) => setAdditionalInfo(e.target.value)}
          maxLength={1000}
          rows={5}
          placeholder={"Например:\nболит правое плечо\nгрыжа L4-L5\nизбегаю прыжков и тяжёлых приседаний"}
          style={{
            width: '100%',
            minHeight: 110,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--card-bg)',
            color: 'var(--text)',
            fontSize: '0.9rem',
            boxSizing: 'border-box',
            marginBottom: 4,
            resize: 'vertical',
            fontFamily: 'inherit',
            lineHeight: 1.5,
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
          }}
        />
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16, textAlign: 'right' }}>
          {additionalInfo.length}/1000
        </p>

        {error && (
          <p style={{ color: '#ff4444', fontSize: '0.85rem', marginBottom: 8 }}>{error}</p>
        )}

        <button
          className="btn btn-accent"
          onClick={handleSave}
          disabled={saving}
          style={{ marginTop: 8 }}
        >
          {saving ? 'СОХРАНЯЕМ...' : 'СОХРАНИТЬ'}
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { profile, refreshProfile } = useProfile()
  const [editOpen, setEditOpen] = useState(false)
  const [editFocusField, setEditFocusField] = useState(null)
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
      <>
        <MyDataView
          profile={profile}
          onBack={() => setMyDataOpen(false)}
          onEdit={(field) => { setEditFocusField(field); setEditOpen(true) }}
        />
        {editOpen && (
          <EditProfileModal
            profile={profile}
            focusField={editFocusField}
            onClose={() => { setEditOpen(false); setEditFocusField(null) }}
            onSaved={() => { setEditOpen(false); setEditFocusField(null); refreshProfile() }}
          />
        )}
      </>
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

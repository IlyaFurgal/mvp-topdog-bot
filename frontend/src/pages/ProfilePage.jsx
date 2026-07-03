import { useEffect, useRef, useState } from 'react'
import client from '../api/client'
import { getTodayCheckins } from '../api/checkins'
import { trackUpgradeIntent } from '../api/trackUpgrade'
import CheckinCard from '../components/CheckinCard'
import CheckinFlow from '../components/CheckinFlow'
import MvpRibbon from '../components/MvpRibbon'
import MyDataCard from '../components/MyDataCard'
import ProgressSection from '../components/ProgressSection'
import SavedProgramsBlock from '../components/SavedProgramsBlock'
import WorkoutBlock from '../components/WorkoutBlock'
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

const PRO_URL = import.meta.env.VITE_GC_PAYMENT_URL_PRO || import.meta.env.VITE_GETCOURSE_PRO_URL || '#'

function getOverallStatus(checkins) {
  const done = CHECKIN_TYPES.filter((t) => checkins[t]).length
  if (done === 3) return { label: 'LOCKED IN 🔒', cls: 'status--locked' }
  if (done > 0) return { label: 'IN PROGRESS ⚡', cls: 'status--progress' }
  return { label: 'OPEN 📋', cls: 'status--open' }
}

function formatTariff(profile) {
  if (!profile?.subscription_type) return null
  const typeLabel = profile.subscription_type === 'pro' ? 'PRO' : 'PLUS'
  const periodDays = profile.subscription_period === 'biannual' ? 180 : 30
  const periodLabel = profile.subscription_period === 'biannual' ? '6 МЕС' : '1 МЕС'
  if (!profile.subscription_expires_at) return `${typeLabel} | ${periodLabel}`
  const end = new Date(profile.subscription_expires_at)
  const start = new Date(end.getTime() - periodDays * 24 * 60 * 60 * 1000)
  const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
  return `${typeLabel} | ${periodLabel} · ${fmt(start)}–${fmt(end)}`
}

// ── МОИ ДАННЫЕ summary screen ──────────────────────────────────────────────────

function MyDataView({ profile, onBack, onEdit }) {
  const tzLabel = profile?.timezone
    ? (TIMEZONE_OPTIONS.find(([k]) => k === profile.timezone)?.[1] ?? profile.timezone)
    : '—'
  const tariff = formatTariff(profile)

  return (
    <div className="page club-page">
      <button className="club-back" onClick={onBack}>‹ ПРОФИЛЬ</button>
      <MvpRibbon />

      <h1 className="screen-title" data-text="МОИ ДАННЫЕ">
        МОИ ДАННЫЕ
        <span className="title-mid-mask"><span className="title-mid-text" aria-hidden="true">МОИ ДАННЫЕ</span></span>
      </h1>
      <div className="stripe-divider" />

      <div className="data-row skew-chip" onClick={onEdit}>
        <span className="data-row__label">ТОН ОБЩЕНИЯ</span>
        <span className="data-row__value">
          <span>{profile?.tone === 'aggressive' ? 'ЖЁСТКИЙ' : profile?.tone === 'soft' ? 'МЯГКИЙ' : '—'}</span>
        </span>
      </div>
      <div className="data-row skew-chip" onClick={onEdit}>
        <span className="data-row__label">ЧАСОВОЙ ПОЯС</span>
        <span className="data-row__value"><span style={{ fontSize: '0.85rem' }}>{tzLabel}</span></span>
      </div>
      <div className="data-row skew-chip" onClick={onEdit}>
        <span className="data-row__label">УТРО</span>
        <span className="data-row__value"><span>{profile?.morning_reminder_time ?? '08:00'}</span></span>
      </div>
      <div className="data-row skew-chip" onClick={onEdit}>
        <span className="data-row__label">ВЕЧЕР</span>
        <span className="data-row__value"><span>{profile?.evening_reminder_time ?? '21:00'}</span></span>
      </div>
      <div className="data-row skew-chip" onClick={onEdit}>
        <span className="data-row__label">ПУШИ</span>
        <span className="data-row__value">
          <span>{profile?.notifications_enabled === false ? 'ВЫКЛ.' : 'ВКЛ.'}</span>
        </span>
      </div>
      <div className="data-row skew-chip" onClick={onEdit}>
        <span className="data-row__label">ТАРИФ</span>
        <span className="data-row__value"><span>{tariff ?? '—'}</span></span>
      </div>
    </div>
  )
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditProfileModal({ profile, onClose, onSaved }) {
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

  // Additional info (free-form notes for AI)
  const [additionalInfo, setAdditionalInfo] = useState(profile?.additional_info ?? '')

  // Sync all form fields when profile loads or changes
  useEffect(() => {
    if (!profile) return
    setPreferredName(profile.preferred_name ?? '')
    setTone(profile.tone ?? 'soft')
    setSelectedGoals(profile.goals ?? (profile.goal ? [profile.goal] : []))
    setFitnessLevel(profile.fitness_level ?? '')
    setSportType(profile.sport_type ?? '')
    setTz(profile.timezone ?? 'UTC+3')
    setMorningTime(profile.morning_reminder_time ?? profile.push_time ?? '08:00')
    setEveningTime(profile.evening_reminder_time ?? '21:00')
    setNotifEnabled(profile.notifications_enabled ?? true)
    setWeight(profile.weight != null ? String(profile.weight) : '')
    setHeight(profile.height != null ? String(profile.height) : '')
    setAdditionalInfo(profile.additional_info ?? '')
  }, [profile])

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
      await client.patch('/profile/me', {
        preferred_name:        preferredName || undefined,
        tone:                  tone || undefined,
        goals:                 selectedGoals.length > 0 ? selectedGoals : undefined,
        fitness_level:         fitnessLevel || undefined,
        sport_type:            sportType || undefined,
        timezone:              tz || undefined,
        morning_reminder_time: morningTime || undefined,
        evening_reminder_time: eveningTime || undefined,
        weight:                (!isNaN(weightNum) && weightNum > 0) ? weightNum : undefined,
        height:                (!isNaN(heightNum) && heightNum > 0) ? heightNum : undefined,
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
        <p className="section-label" style={{ marginBottom: 8 }}>ИМЯ</p>
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
        <p className="section-label" style={{ marginBottom: 8 }}>СТИЛЬ ОБЩЕНИЯ</p>
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
        <p className="section-label" style={{ marginBottom: 8 }}>ЦЕЛИ</p>
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
        <p className="section-label" style={{ marginBottom: 8 }}>УРОВЕНЬ ПОДГОТОВКИ</p>
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

        {/* Sport type */}
        <p className="section-label" style={{ marginBottom: 8 }}>ВИД СПОРТА</p>
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
        <p className="section-label" style={{ marginBottom: 8 }}>ЧАСОВОЙ ПОЯС</p>
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
        <p className="section-label" style={{ marginBottom: 8 }}>УТРЕННЕЕ НАПОМИНАНИЕ</p>
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
        <p className="section-label" style={{ marginBottom: 8 }}>ВЕЧЕРНЕЕ НАПОМИНАНИЕ</p>
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
        <p className="section-label" style={{ marginBottom: 8 }}>УВЕДОМЛЕНИЯ</p>
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
        <p className="section-label" style={{ marginBottom: 8 }}>ВЕС (стартовый, кг)</p>
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
        <p className="section-label" style={{ marginBottom: 8 }}>РОСТ (см)</p>
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

        {/* Additional info */}
        <p className="section-label" style={{ marginBottom: 4 }}>ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ</p>
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
  const { profile, subscriptionType, refreshProfile } = useProfile()
  const [editOpen, setEditOpen] = useState(false)
  const [myDataOpen, setMyDataOpen] = useState(false)

  const [checkins, setCheckins] = useState({ morning: null, post_workout: null, evening: null })
  const [checkinsLoading, setCheckinsLoading] = useState(true)
  const [activeFlow, setActiveFlow] = useState(null)
  const [editCheckin, setEditCheckin] = useState(null) // { type, id, data }

  async function loadCheckins() {
    try {
      setCheckins(await getTodayCheckins())
    } catch (_) {}
    setCheckinsLoading(false)
  }

  useEffect(() => { loadCheckins() }, [])

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
          onEdit={() => setEditOpen(true)}
        />
        {editOpen && (
          <EditProfileModal
            profile={profile}
            onClose={() => setEditOpen(false)}
            onSaved={() => { setEditOpen(false); refreshProfile() }}
          />
        )}
      </>
    )
  }

  const status = getOverallStatus(checkins)

  return (
    <div className="page club-page" style={{ position: 'relative' }}>
      <MvpRibbon />

      <h1 className="screen-title" data-text="ПРОФИЛЬ">
        ПРОФИЛЬ
        <span className="title-mid-mask"><span className="title-mid-text" aria-hidden="true">ПРОФИЛЬ</span></span>
      </h1>

      <MyDataCard onEditClick={() => setMyDataOpen(true)} />

      {subscriptionType === 'plus' && (
        <a
          href={PRO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-accent clip-skew"
          style={{ textDecoration: 'none', textAlign: 'center' }}
          onClick={() => trackUpgradeIntent()}
        >
          УЛУЧШИТЬ ДО PRO
        </a>
      )}

      <h2 className="screen-title" data-text="ПРОГРЕСС" style={{ fontSize: '1.7rem', marginTop: 28, marginBottom: 4 }}>
        ПРОГРЕСС
        <span className="title-mid-mask"><span className="title-mid-text" aria-hidden="true">ПРОГРЕСС</span></span>
      </h2>
      <ProgressSection />

      {checkinsLoading ? (
        <div className="card"><p className="card-muted">Загрузка...</p></div>
      ) : (
        <>
          <div className="card tracker-tip" style={{ marginTop: 24 }}>
            <p className="tracker-tip__text">
              💡 Чем качественнее заполняешь метрики — тем точнее ассистент подбирает рекомендации.
              Чекины и трекеры можно заполнить в любое время дня.
            </p>
          </div>

          <div className="page-header">
            <p className="section-label">ЧЕКИНЫ</p>
            {status.cls !== 'status--open' && (
              <span className={`checkin-status ${status.cls}`}>{status.label}</span>
            )}
          </div>
          <div className="checkin-cards">
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

          <p className="section-label">ТРЕНИРОВКИ</p>
          <WorkoutBlock />

          <p className="section-label">СОХРАНЁННЫЕ ПРОГРАММЫ</p>
          <SavedProgramsBlock />
        </>
      )}
    </div>
  )
}

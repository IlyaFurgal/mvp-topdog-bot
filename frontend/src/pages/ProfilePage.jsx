import { useEffect, useRef, useState } from 'react'
import client from '../api/client'
import { trackUpgradeIntent } from '../api/trackUpgrade'
import { useProfile } from '../context/ProfileContext'
import { useTelegram } from '../hooks/useTelegram'

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

const GOAL_LABELS = Object.fromEntries(GOAL_OPTIONS)

const FITNESS_LABELS = {
  beginner:     'Начинающий',
  intermediate: 'Средний',
  advanced:     'Продвинутый',
}

const FITNESS_OPTIONS = [
  ['beginner',     '🌱 Новичок'],
  ['intermediate', '💪 Средний'],
  ['advanced',     '🔥 Продвинутый'],
]

const TIMEZONE_OPTIONS = [
  ['UTC-12', 'UTC-12 — Baker Island'],
  ['UTC-11', 'UTC-11 — Samoa'],
  ['UTC-10', 'UTC-10 — Hawaii'],
  ['UTC-9',  'UTC-9  — Alaska'],
  ['UTC-8',  'UTC-8  — Los Angeles, Vancouver'],
  ['UTC-7',  'UTC-7  — Denver, Phoenix'],
  ['UTC-6',  'UTC-6  — Chicago, Mexico City'],
  ['UTC-5',  'UTC-5  — New York, Toronto'],
  ['UTC-4',  'UTC-4  — Caracas, Halifax'],
  ['UTC-3',  'UTC-3  — Buenos Aires, São Paulo'],
  ['UTC-2',  'UTC-2  — Mid-Atlantic'],
  ['UTC-1',  'UTC-1  — Azores'],
  ['UTC+0',  'UTC+0  — London, Lisbon'],
  ['UTC+1',  'UTC+1  — Berlin, Paris, Warsaw'],
  ['UTC+2',  'UTC+2  — Cairo, Kyiv, Helsinki'],
  ['UTC+3',  'UTC+3  — Москва, Стамбул, Эр-Рияд'],
  ['UTC+4',  'UTC+4  — Дубай, Баку'],
  ['UTC+5',  'UTC+5  — Карачи, Ташкент'],
  ['UTC+6',  'UTC+6  — Алматы, Дакка'],
  ['UTC+7',  'UTC+7  — Бангкок, Новосибирск'],
  ['UTC+8',  'UTC+8  — Пекин, Сингапур, Иркутск'],
  ['UTC+9',  'UTC+9  — Токио, Сеул, Якутск'],
  ['UTC+10', 'UTC+10 — Сидней, Владивосток'],
  ['UTC+11', 'UTC+11 — Магадан, Соломоновы острова'],
  ['UTC+12', 'UTC+12 — Окленд, Камчатка'],
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

const SUB_BADGE = {
  plus: { label: 'Plus', cls: 'badge--plus' },
  pro:  { label: 'Pro',  cls: 'badge--pro'  },
}

const PRICES = {
  plus: { monthly: 990,  biannual: 4990  },
  pro:  { monthly: 2990, biannual: 14990 },
}

function fmtPrice(n) {
  return new Intl.NumberFormat('ru-RU').format(n) + ' ₽'
}

function SubInfo({ type, period }) {
  if (!type) return <span>Нет подписки</span>

  const typeLabel = type === 'pro' ? 'Pro' : 'Plus'
  const periodLabel = period === 'biannual' ? '6 месяцев' : '1 месяц'
  const price = PRICES[type]?.[period ?? 'monthly']
  const isDiscount = period === 'biannual'

  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <span style={{ fontWeight: 800, color: 'var(--accent)' }}>
        {typeLabel} / {periodLabel}
      </span>
      {price != null && (
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
          {fmtPrice(price)}{isDiscount ? ' (–16%)' : ''}
        </span>
      )}
    </span>
  )
}

const SUPPORT_URL = import.meta.env.VITE_SUPPORT_TG_URL || 'https://t.me/topdog_support'
const PRO_URL = import.meta.env.VITE_GC_PAYMENT_URL_PRO || import.meta.env.VITE_GETCOURSE_PRO_URL || '#'

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
          type="number"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="Например: 75.5"
          min="30"
          max="300"
          step="0.1"
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--card-bg)',
            color: 'var(--text)',
            fontSize: '0.9rem',
            boxSizing: 'border-box',
            marginBottom: 4,
          }}
        />
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Стартовый вес для расчёта нормы калорий. Текущий вес меняй через трекер.
        </p>

        {/* Height */}
        <p className="section-label" style={{ marginBottom: 8 }}>РОСТ (см)</p>
        <input
          type="number"
          inputMode="numeric"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          placeholder="Например: 178"
          min="100"
          max="250"
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

        {/* Additional info */}
        <p className="section-label" style={{ marginBottom: 4 }}>ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ</p>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8 }}>
          Травмы, ограничения, пожелания — ИИ учтёт это в рекомендациях
        </p>
        <textarea
          value={additionalInfo}
          onChange={(e) => setAdditionalInfo(e.target.value)}
          maxLength={1000}
          rows={4}
          placeholder="Например: болит правое плечо, грыжа L4-L5, избегаю прыжков..."
          style={{
            width: '100%',
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
            lineHeight: 1.4,
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
  const { user } = useTelegram()
  const { profile, subscriptionType, subscriptionPeriod, refreshProfile } = useProfile()
  const [editOpen, setEditOpen] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)

  // Prefer the name the user set during registration
  const displayName = profile?.preferred_name
    || (user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : 'Пользователь')

  const initials = (() => {
    const words = displayName.trim().split(/\s+/)
    return words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : displayName.slice(0, 2).toUpperCase()
  })()

  const badge = subscriptionType ? SUB_BADGE[subscriptionType] : null

  // Goals display: prefer new goals array, fall back to single goal
  const goalsDisplay = (() => {
    const arr = profile?.goals ?? (profile?.goal ? [profile.goal] : [])
    if (!arr.length) return '—'
    return arr.map((g) => GOAL_LABELS[g] ?? g).join(', ')
  })()

  const tzLabel = profile?.timezone
    ? (TIMEZONE_OPTIONS.find(([k]) => k === profile.timezone)?.[1] ?? profile.timezone)
    : '—'

  return (
    <div className="page" style={{ position: 'relative' }}>
      <h1 className="page-title">ПРОФИЛЬ</h1>
      <button
        onClick={() => setEditOpen(true)}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          background: 'transparent',
          border: '1px solid #2a2a2a',
          color: '#888888',
          fontSize: 12,
          padding: '6px 12px',
          borderRadius: 4,
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontWeight: 600,
          letterSpacing: '0.04em',
        }}
      >
        Изменить
      </button>

      <div className="profile-header">
        {user?.photo_url && !imgFailed ? (
          <div className="avatar avatar--photo">
            <img
              src={user.photo_url}
              alt=""
              className="avatar-img"
              onError={() => setImgFailed(true)}
            />
          </div>
        ) : (
          <div className="avatar">{initials}</div>
        )}
        <div className="profile-name">
          <div className="profile-name-row">
            <span className="profile-name-text">{displayName}</span>
            {badge && (
              <span className={`sub-badge ${badge.cls}`}>{badge.label}</span>
            )}
          </div>
          {user?.username && (
            <span className="profile-username">@{user.username}</span>
          )}
        </div>
      </div>

      <div className="card">
        <div className="profile-row" style={{ alignItems: 'flex-start' }}>
          <span className="profile-label" style={{ paddingTop: 2 }}>ЦЕЛЬ</span>
          <span className="profile-value" style={{ textAlign: 'right' }}>
            {goalsDisplay === '—' ? '—' : goalsDisplay.split(', ').map((g) => (
              <span key={g} style={{ display: 'block' }}>{g}</span>
            ))}
          </span>
        </div>
        <div className="profile-row">
          <span className="profile-label">УРОВЕНЬ</span>
          <span className="profile-value">{FITNESS_LABELS[profile?.fitness_level] ?? '—'}</span>
        </div>
        <div className="profile-row">
          <span className="profile-label">ВИД СПОРТА</span>
          <span className="profile-value">{profile?.sport_type ?? '—'}</span>
        </div>
        <div className="profile-row">
          <span className="profile-label">ТОН ОБЩЕНИЯ</span>
          <span className="profile-value">
            {profile?.tone === 'aggressive' ? 'Жёсткий' : profile?.tone === 'soft' ? 'Мягкий' : '—'}
          </span>
        </div>
        <div className="profile-row">
          <span className="profile-label">ЧАСОВОЙ ПОЯС</span>
          <span className="profile-value" style={{ fontSize: '0.85rem' }}>{profile?.timezone ?? '—'}</span>
        </div>
        <div className="profile-row">
          <span className="profile-label">УТРО</span>
          <span className="profile-value">{profile?.morning_reminder_time ?? '08:00'}</span>
        </div>
        <div className="profile-row">
          <span className="profile-label">ВЕЧЕР</span>
          <span className="profile-value">{profile?.evening_reminder_time ?? '21:00'}</span>
        </div>
        <div className="profile-row">
          <span className="profile-label">ПУШИ</span>
          <span className="profile-value">
            {profile?.notifications_enabled === false ? '🔕 выкл' : '🔔 вкл'}
          </span>
        </div>
        <div className="profile-row">
          <span className="profile-label">ВЕС (старт)</span>
          <span className="profile-value">
            {profile?.weight != null ? `${profile.weight} кг` : '—'}
          </span>
        </div>
        <div className="profile-row">
          <span className="profile-label">РОСТ</span>
          <span className="profile-value">
            {profile?.height != null ? `${profile.height} см` : '—'}
          </span>
        </div>
        <div className="profile-row">
          <span className="profile-label">ТАРИФ</span>
          <SubInfo type={subscriptionType} period={subscriptionPeriod} />
        </div>
      </div>

      {subscriptionType === 'plus' && (
        <a
          href={PRO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-accent"
          style={{ textDecoration: 'none', textAlign: 'center' }}
          onClick={() => trackUpgradeIntent()}
        >
          УЛУЧШИТЬ ДО PRO
        </a>
      )}

      <a
        href={SUPPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-support"
      >
        ПОДДЕРЖКА
      </a>

      {editOpen && (
        <EditProfileModal
          profile={profile}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); refreshProfile() }}
        />
      )}
    </div>
  )
}

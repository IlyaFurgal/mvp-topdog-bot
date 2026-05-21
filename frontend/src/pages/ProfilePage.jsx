import { useRef, useState } from 'react'
import client from '../api/client'
import { trackUpgradeIntent } from '../api/trackUpgrade'
import { useProfile } from '../context/ProfileContext'
import { useTelegram } from '../hooks/useTelegram'

const GOAL_LABELS = {
  weight_loss: 'Похудение',
  muscle_gain: 'Набор мышц',
  maintenance: 'Поддержание',
  endurance:   'Выносливость',
}

const GOAL_OPTIONS = [
  ['muscle_gain', 'Набор мышц'],
  ['weight_loss',  'Похудение'],
  ['endurance',    'Выносливость'],
  ['maintenance',  'Поддержание / здоровье'],
]

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
  ['Europe/Kaliningrad', 'UTC+2  Калининград'],
  ['Europe/Moscow',      'UTC+3  Москва / Питер'],
  ['Europe/Samara',      'UTC+4  Самара'],
  ['Asia/Yekaterinburg', 'UTC+5  Екатеринбург'],
  ['Asia/Omsk',          'UTC+6  Омск'],
  ['Asia/Krasnoyarsk',   'UTC+7  Новосибирск / Красноярск'],
  ['Asia/Irkutsk',       'UTC+8  Иркутск'],
  ['Asia/Yakutsk',       'UTC+9  Якутск'],
  ['Asia/Vladivostok',   'UTC+10 Владивосток'],
  ['Asia/Magadan',       'UTC+11 Магадан'],
  ['Asia/Kamchatka',     'UTC+12 Камчатка'],
]

const PUSH_TIMES = ['06:00', '07:00', '08:00', '09:00', '10:00']

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

  // Goals: multi-select
  const initialGoals = profile?.goals ?? (profile?.goal ? [profile.goal] : [])
  const [selectedGoals, setSelectedGoals] = useState(initialGoals)

  // Fitness level
  const [fitnessLevel, setFitnessLevel] = useState(profile?.fitness_level ?? '')

  // Sport type (free text)
  const [sportType, setSportType] = useState(profile?.sport_type ?? '')

  // Push time
  const [pushTime, setPushTime] = useState(profile?.push_time ?? '')
  const [customTime, setCustomTime] = useState('')
  const [showCustomTime, setShowCustomTime] = useState(false)

  // Timezone
  const [tz, setTz] = useState(profile?.timezone ?? 'Europe/Moscow')

  function toggleGoal(key) {
    setSelectedGoals((prev) =>
      prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key]
    )
  }

  async function handleSave() {
    setError(null)
    // Validate custom time
    let finalPushTime = pushTime
    if (showCustomTime) {
      const parts = customTime.split(':')
      if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
        setError('Неверный формат времени. Используй ЧЧ:ММ, например 07:30')
        return
      }
      const hh = parseInt(parts[0], 10)
      const mm = parseInt(parts[1], 10)
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
        setError('Время вне допустимого диапазона')
        return
      }
      finalPushTime = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
    }

    setSaving(true)
    try {
      await client.patch('/profile/me', {
        goals:         selectedGoals.length > 0 ? selectedGoals : undefined,
        fitness_level: fitnessLevel || undefined,
        sport_type:    sportType || undefined,
        push_time:     finalPushTime || undefined,
        timezone:      tz || undefined,
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
      <div className="modal-sheet" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <span className="modal-title">РЕДАКТИРОВАТЬ ПРОФИЛЬ</span>
          <button className="modal-close" onClick={onClose}>✕</button>
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
          }}
        >
          {TIMEZONE_OPTIONS.map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        {/* Push time */}
        <p className="section-label" style={{ marginBottom: 8 }}>ВРЕМЯ НАПОМИНАНИЯ</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {PUSH_TIMES.map((t) => (
            <button
              key={t}
              onClick={() => { setPushTime(t); setShowCustomTime(false) }}
              style={{
                padding: '7px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: pushTime === t && !showCustomTime ? 'var(--accent)' : 'var(--card-bg)',
                color: pushTime === t && !showCustomTime ? '#000' : 'var(--text)',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              {t}
            </button>
          ))}
          <button
            onClick={() => { setShowCustomTime(true); setPushTime('') }}
            style={{
              padding: '7px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: showCustomTime ? 'var(--accent)' : 'var(--card-bg)',
              color: showCustomTime ? '#000' : 'var(--text)',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            ✏️ Другое
          </button>
        </div>
        {showCustomTime && (
          <input
            type="text"
            value={customTime}
            onChange={(e) => setCustomTime(e.target.value)}
            placeholder="07:30"
            maxLength={5}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--card-bg)',
              color: 'var(--text)',
              fontSize: '0.9rem',
              boxSizing: 'border-box',
              marginBottom: 8,
            }}
          />
        )}

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

  const initials = user
    ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase() || 'TG'
    : 'TG'

  const fullName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ')
    : (profile?.preferred_name ?? 'Пользователь')

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
    <div className="page">
      <h1 className="page-title">ПРОФИЛЬ</h1>

      <div className="profile-header">
        <div className="avatar">{initials}</div>
        <div className="profile-name">
          <div className="profile-name-row">
            <span className="profile-name-text">{fullName}</span>
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
        <div className="profile-row">
          <span className="profile-label">ЦЕЛЬ</span>
          <span className="profile-value">{goalsDisplay}</span>
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
          <span className="profile-value" style={{ fontSize: '0.8rem' }}>{tzLabel}</span>
        </div>
        <div className="profile-row">
          <span className="profile-label">НАПОМИНАНИЕ</span>
          <span className="profile-value">{profile?.push_time ?? '—'}</span>
        </div>
        <div className="profile-row">
          <span className="profile-label">ТАРИФ</span>
          <SubInfo type={subscriptionType} period={subscriptionPeriod} />
        </div>
      </div>

      <button
        className="btn btn-outline"
        onClick={() => setEditOpen(true)}
        style={{ marginBottom: 8 }}
      >
        ✏️ РЕДАКТИРОВАТЬ
      </button>

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

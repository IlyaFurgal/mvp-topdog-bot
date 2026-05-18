import { useTelegram } from '../hooks/useTelegram'
import { useProfile } from '../context/ProfileContext'

const GOAL_LABELS = {
  weight_loss: 'Похудение',
  muscle_gain: 'Набор мышц',
  maintenance: 'Поддержание',
  endurance: 'Выносливость',
}

const FITNESS_LABELS = {
  beginner: 'Начинающий',
  intermediate: 'Средний',
  advanced: 'Продвинутый',
}

const SUB_BADGE = {
  ai:  { label: 'AI',  cls: 'badge--ai'  },
  mvp: { label: 'MVP', cls: 'badge--mvp' },
}

const SUPPORT_URL = import.meta.env.VITE_SUPPORT_TG_URL || 'https://t.me/topdog_support'
const MVP_URL = import.meta.env.VITE_GC_PAYMENT_URL_MVP || '#'

export default function ProfilePage() {
  const { user } = useTelegram()
  const { profile, subscriptionType } = useProfile()

  const initials = user
    ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase() || 'TG'
    : 'TG'

  const fullName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ')
    : (profile?.preferred_name ?? 'Пользователь')

  const badge = subscriptionType ? SUB_BADGE[subscriptionType] : null

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
          <span className="profile-value">
            {GOAL_LABELS[profile?.goal] ?? '—'}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="profile-row">
          <span className="profile-label">УРОВЕНЬ</span>
          <span className="profile-value">
            {FITNESS_LABELS[profile?.fitness_level] ?? '—'}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="profile-row">
          <span className="profile-label">ВИД СПОРТА</span>
          <span className="profile-value">{profile?.sport_type ?? '—'}</span>
        </div>
      </div>

      <div className="card">
        <div className="profile-row">
          <span className="profile-label">ТОН ОБЩЕНИЯ</span>
          <span className="profile-value">
            {profile?.tone === 'aggressive' ? 'Жёсткий' : profile?.tone === 'soft' ? 'Мягкий' : '—'}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="profile-row">
          <span className="profile-label">ТАРИФ</span>
          <span className="profile-value">
            {subscriptionType === 'mvp' ? 'MVP' : subscriptionType === 'ai' ? 'AI' : 'Нет подписки'}
          </span>
        </div>
      </div>

      {/* Upgrade button for AI users */}
      {subscriptionType === 'ai' && (
        <a
          href={MVP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-accent"
          style={{ textDecoration: 'none', textAlign: 'center' }}
        >
          УЛУЧШИТЬ ДО MVP
        </a>
      )}

      {/* Support button — always visible */}
      <a
        href={SUPPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-support"
      >
        ПОДДЕРЖКА
      </a>
    </div>
  )
}

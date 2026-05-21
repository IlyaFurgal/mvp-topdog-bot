import { trackUpgradeIntent } from '../api/trackUpgrade'
import { useProfile } from '../context/ProfileContext'
import { useTelegram } from '../hooks/useTelegram'

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

export default function ProfilePage() {
  const { user } = useTelegram()
  const { profile, subscriptionType, subscriptionPeriod } = useProfile()

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
          <span className="profile-value">{GOAL_LABELS[profile?.goal] ?? '—'}</span>
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
    </div>
  )
}

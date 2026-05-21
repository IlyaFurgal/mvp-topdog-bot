import { trackUpgradeIntent } from '../api/trackUpgrade'
import { useProfile } from '../context/ProfileContext'

const PRO_URL = import.meta.env.VITE_GC_PAYMENT_URL_PRO || import.meta.env.VITE_GETCOURSE_PRO_URL || '#'
const CHAT_URL = import.meta.env.VITE_RESIDENTS_CHAT_URL || 'https://t.me/topdog_residents'

function LockedScreen() {
  return (
    <div className="locked-page">
      <h2 className="locked-title">ЧАТ РЕЗИДЕНТОВ</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center' }}>
        Доступен на тарифе Pro
      </p>

      <div className="card" style={{ width: '100%', marginTop: 8 }}>
        <div className="profile-row">
          <span className="profile-label">1 месяц</span>
          <span className="profile-value">2 990 ₽</span>
        </div>
        <div className="profile-row">
          <span className="profile-label">6 месяцев</span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span className="profile-value">14 990 ₽</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>–16%</span>
          </span>
        </div>
      </div>

      <a
        href={PRO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-accent"
        style={{ textDecoration: 'none', textAlign: 'center', width: '100%' }}
        onClick={() => trackUpgradeIntent()}
      >
        UPGRADE →
      </a>
    </div>
  )
}

export default function ResidentsChatPage() {
  const { subscriptionType } = useProfile()

  if (subscriptionType !== 'pro') {
    return (
      <div className="page">
        <LockedScreen />
      </div>
    )
  }

  return (
    <div className="page">
      <h1 className="page-title">ЧАТ</h1>
      <p className="page-subtitle">РЕЗИДЕНТЫ PRO</p>

      <div className="card" style={{ textAlign: 'center', padding: '32px 16px' }}>
        <p style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8, letterSpacing: '0.04em' }}>
          Telegram-группа резидентов
        </p>
        <p className="card-muted" style={{ marginBottom: 24 }}>
          Общение, поддержка и совместные активности с резидентами клуба.
        </p>
        <a
          href={CHAT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-accent"
          style={{ textDecoration: 'none', textAlign: 'center' }}
        >
          ОТКРЫТЬ ЧАТ В TELEGRAM →
        </a>
      </div>
    </div>
  )
}

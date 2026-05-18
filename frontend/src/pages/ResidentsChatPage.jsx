import { useProfile } from '../context/ProfileContext'

const MVP_URL = import.meta.env.VITE_GC_PAYMENT_URL_MVP || '#'
const CHAT_URL = import.meta.env.VITE_RESIDENTS_CHAT_URL || 'https://t.me/topdog_residents'

function LockedScreen() {
  return (
    <div className="locked-page">
      <h2 className="locked-title">ЧАТ РЕЗИДЕНТОВ</h2>
      <p className="locked-sub">Доступно на тарифе MVP</p>
      <p className="locked-desc">
        Закрытое сообщество резидентов. Поддержка, обмен опытом и совместные активности.
      </p>
      <a
        href={MVP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-accent"
        style={{ textDecoration: 'none', textAlign: 'center' }}
      >
        УЛУЧШИТЬ ДО MVP
      </a>
    </div>
  )
}

export default function ResidentsChatPage() {
  const { subscriptionType } = useProfile()

  if (subscriptionType !== 'mvp') {
    return (
      <div className="page">
        <LockedScreen />
      </div>
    )
  }

  return (
    <div className="page">
      <h1 className="page-title">ЧАТ</h1>
      <p className="page-subtitle">РЕЗИДЕНТЫ MVP</p>

      <div className="card" style={{ textAlign: 'center', padding: '32px 16px' }}>
        <div style={{ marginBottom: 16 }} />
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

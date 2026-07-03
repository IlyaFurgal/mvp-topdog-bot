import { useState } from 'react'
import { trackUpgradeIntent } from '../api/trackUpgrade'
import knowledgeImg from '../assets/1.png'
import communityImg from '../assets/2.png'
import supportImg from '../assets/3.png'
import clubHeading from '../assets/9.png'
import { useProfile } from '../context/ProfileContext'
import { openPaymentLink, PAYMENT_URLS } from '../config/payments'

function CardArt({ img }) {
  return (
    <span
      className="club-card__art"
      style={{
        backgroundImage: `linear-gradient(135deg, transparent 35%, rgba(255,255,255,0.10) 50%, transparent 65%), url(${img})`,
        backgroundSize: 'auto, cover',
        backgroundPosition: 'center, center',
      }}
    />
  )
}

const CHAT_URL = import.meta.env.VITE_RESIDENTS_CHAT_URL || 'https://t.me/+5_3U13qeveA3OWJi'
const KNOWLEDGE_URL = 'https://topdog-mvp.ru/teach/control/stream'
const SUPPORT_URL = import.meta.env.VITE_SUPPORT_TG_URL || 'https://t.me/topdog_support'

function BackButton({ onBack }) {
  return (
    <button className="club-back" onClick={onBack}>‹ КЛУБ</button>
  )
}

function CommunityView({ subscriptionType, onBack }) {
  return (
    <div className="page club-page">
      <BackButton onBack={onBack} />
      {subscriptionType !== 'pro' ? (
        <div className="locked-page">
          <h2 className="locked-title">
            {subscriptionType === 'plus' ? 'КОМЬЮНИТИ ДОСТУПНО НА ТАРИФЕ PRO' : 'КОМЬЮНИТИ РЕЗИДЕНТОВ'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center' }}>
            {subscriptionType === 'plus' ? 'Закрытое сообщество резидентов клуба.' : 'Доступен на тарифе Pro'}
          </p>
          {subscriptionType !== 'plus' && (
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
          )}
          <button
            className="btn btn-accent"
            style={{ textAlign: 'center', width: '100%' }}
            onClick={() => { trackUpgradeIntent(); openPaymentLink(PAYMENT_URLS.pro1m) }}
          >
            УЛУЧШИТЬ ДО PRO →
          </button>
        </div>
      ) : (
        <>
          <div className="club-block-header">
            <h1 className="page-title page-title--lime">КОМЬЮНИТИ</h1>
            <p className="page-subtitle">РЕЗИДЕНТЫ PRO</p>
          </div>
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
        </>
      )}
    </div>
  )
}

export default function ClubPage() {
  const { subscriptionType } = useProfile()
  const [view, setView] = useState('hub')

  if (view === 'community') {
    return <CommunityView subscriptionType={subscriptionType} onBack={() => setView('hub')} />
  }

  return (
    <div className="page club-page">
      <img src={clubHeading} alt="КЛУБ" className="screen-title-img" />

      <a
        className="club-card"
        href={KNOWLEDGE_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="club-card__title">БАЗА ЗНАНИЙ</span>
        <span className="club-card__sub">ПОЛЕЗНЫЕ МАТЕРИАЛЫ</span>
        <CardArt img={knowledgeImg} />
      </a>

      <button className="club-card" onClick={() => setView('community')}>
        <span className="club-card__title">КОМЬЮНИТИ</span>
        <span className="club-card__sub">ОБЩЕНИЕ И ВСТРЕЧИ</span>
        <CardArt img={communityImg} />
      </button>

      <a
        className="club-card"
        href={SUPPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="club-card__title">ПОДДЕРЖКА</span>
        <span className="club-card__sub">НУЖНА ПОМОЩЬ? НАПИШИ</span>
        <CardArt img={supportImg} />
      </a>
    </div>
  )
}

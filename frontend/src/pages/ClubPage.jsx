import { useState } from 'react'
import { trackUpgradeIntent } from '../api/trackUpgrade'
import { useProfile } from '../context/ProfileContext'
import { openPaymentLink, PAYMENT_URLS } from '../config/payments'

const GC_BASE = import.meta.env.VITE_GC_BASE_URL || 'https://topdog-mvp.getcourse.ru'
const CHAT_URL = import.meta.env.VITE_RESIDENTS_CHAT_URL || 'https://t.me/topdog_residents'
const SUPPORT_URL = import.meta.env.VITE_SUPPORT_TG_URL || 'https://t.me/topdog_support'

const MATERIALS = [
  { title: 'Тренировочные программы', desc: 'Программы под твой уровень и цель', path: '/pl/teach/courses' },
  { title: 'Нутрициология', desc: 'Питание, дефицит, масса — всё по науке', path: '/pl/teach/courses' },
  { title: 'Восстановление и сон', desc: 'Протоколы восстановления', path: '/pl/teach/courses' },
  { title: 'Ментальная подготовка', desc: 'Фокус, дисциплина, мотивация', path: '/pl/teach/courses' },
  { title: 'Записи эфиров', desc: 'Прошедшие прямые эфиры с экспертами', path: '/pl/teach/courses' },
]

function BackButton({ onBack }) {
  return (
    <button className="club-back" onClick={onBack}>‹ КЛУБ</button>
  )
}

function LockedBlock({ title, sub, desc, isPlusUser }) {
  return (
    <div className="locked-page">
      <h2 className="locked-title">{title}</h2>
      <p className="locked-sub">{sub}</p>
      <p className="locked-desc">{desc}</p>
      <button
        className="btn btn-accent"
        style={{ textAlign: 'center' }}
        onClick={() => { trackUpgradeIntent(); openPaymentLink(PAYMENT_URLS.pro1m) }}
      >
        {isPlusUser ? 'УЛУЧШИТЬ ДО PRO →' : 'УЛУЧШИТЬ ДО PRO →'}
      </button>
    </div>
  )
}

function KnowledgeView({ subscriptionType, onBack }) {
  return (
    <div className="page club-page">
      <BackButton onBack={onBack} />
      {!subscriptionType || subscriptionType === 'plus' ? (
        <LockedBlock
          title="БАЗА ЗНАНИЙ"
          sub="Доступно на тарифе Pro"
          desc="Тренировочные программы, записи эфиров, нутрициология и протоколы восстановления."
          isPlusUser={subscriptionType === 'plus'}
        />
      ) : (
        <>
          <div className="club-block-header">
            <h1 className="page-title page-title--lime">БАЗА ЗНАНИЙ</h1>
            <p className="page-subtitle">МАТЕРИАЛЫ НА GETCOURSE</p>
          </div>
          <div className="knowledge-list">
            {MATERIALS.map((item) => (
              <a
                key={item.title}
                href={`${GC_BASE}${item.path}`}
                target="_blank"
                rel="noopener noreferrer"
                className="knowledge-item"
              >
                <div className="knowledge-item__text">
                  <span className="knowledge-item__title">{item.title}</span>
                  <span className="knowledge-item__desc">{item.desc}</span>
                </div>
                <span className="knowledge-item__arrow">›</span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
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

  if (view === 'knowledge') {
    return <KnowledgeView subscriptionType={subscriptionType} onBack={() => setView('hub')} />
  }
  if (view === 'community') {
    return <CommunityView subscriptionType={subscriptionType} onBack={() => setView('hub')} />
  }

  return (
    <div className="page club-page">
      <div className="mvp-ribbon" style={{ margin: '0 -16px 16px' }}>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="mvp-ribbon__unit">
            <b>MVP</b><i>BY TOP DOG</i>
          </span>
        ))}
      </div>

      <h1 className="screen-title" data-text="КЛУБ">
        КЛУБ
        <span className="title-mid-mask"><span className="title-mid-text" aria-hidden="true">КЛУБ</span></span>
      </h1>

      <button className="club-card" onClick={() => setView('knowledge')}>
        <span className="club-card__title">БАЗА ЗНАНИЙ</span>
        <span className="club-card__sub">ПОЛЕЗНЫЕ МАТЕРИАЛЫ</span>
        <span className="club-card__art" />
      </button>

      <button className="club-card" onClick={() => setView('community')}>
        <span className="club-card__title">КОМЬЮНИТИ</span>
        <span className="club-card__sub">ОБЩЕНИЕ И ВСТРЕЧИ</span>
        <span className="club-card__art" />
      </button>

      <a
        className="club-card"
        href={SUPPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="club-card__title">ПОДДЕРЖКА</span>
        <span className="club-card__sub">НУЖНА ПОМОЩЬ? НАПИШИ</span>
        <span className="club-card__art" />
      </a>
    </div>
  )
}

import { useState } from 'react'
import knowledgeImg from '../assets/1.png'
import communityImg from '../assets/2.png'
import supportImg from '../assets/3.png'
import clubHeading from '../assets/9.png'
import { trackUpgradeIntent } from '../api/trackUpgrade'
import { useProfile } from '../context/ProfileContext'

const PRO_URL = import.meta.env.VITE_GC_PAYMENT_URL_PRO || import.meta.env.VITE_GETCOURSE_PRO_URL || '#'

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

const CHAT_URL = 'https://t.me/+5_3U13qeveA3OWJi'
const BOT_LINK = 'https://t.me/topdogmvp_tech_bot?start=72c5c848698acb28ae772166e4b45dfd__s4'
const KNOWLEDGE_URL = 'https://topdog-mvp.ru/teach/control/stream'
const SUPPORT_URL = 'https://t.me/mvp_topdog_support'

function handleConnectBot() {
  if (window.Telegram?.WebApp?.openTelegramLink) {
    window.Telegram.WebApp.openTelegramLink(BOT_LINK)
  } else {
    window.open(BOT_LINK, '_blank')
  }
}

function BackButton({ onBack }) {
  return (
    <button className="club-back" onClick={onBack}>‹ НАЗАД</button>
  )
}

// Restores the Plus-tier paywall stub that used to gate База знаний /
// Комьюнити (dropped in an earlier Club-section redesign) — see ТЗ
// «пул правок», 2026-07-10, п.17. Pro is unaffected, freemium (no sub)
// never reaches this page in the first place (gated earlier by
// SubscriptionWall).
function ProUpsellStub({ title, onBack }) {
  return (
    <div className="page club-page">
      <BackButton onBack={onBack} />
      <h1 className="page-title page-title--lime">{title}</h1>
      <p className="club-community-hint">
        Доступно на тарифе PRO — закрытое сообщество резидентов, база знаний
        и участие в мероприятиях клуба.
      </p>
      <a
        href={PRO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="tracker-cta-btn skew-chip"
        style={{ textDecoration: 'none' }}
        onClick={() => trackUpgradeIntent()}
      >
        <span className="tracker-cta-btn__title">УЛУЧШИТЬ ДО PRO</span>
      </a>
    </div>
  )
}

function CommunityView({ onBack }) {
  return (
    <div className="page club-page">
      <BackButton onBack={onBack} />

      <h1 className="page-title page-title--lime">КОМЬЮНИТИ</h1>
      <p className="club-community-hint">
        Чтобы попасть в чат MVP, проверь, что у тебя активирован бот чата
      </p>

      <button onClick={handleConnectBot} className="tracker-cta-btn skew-chip" style={{ marginBottom: 12 }}>
        <span className="tracker-cta-btn__title">ПОДКЛЮЧИ БОТ</span>
      </button>

      <a
        href={CHAT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="tracker-cta-btn skew-chip"
        style={{ textDecoration: 'none' }}
      >
        <span className="tracker-cta-btn__title">ПЕРЕЙТИ В КОММЬЮНИТИ</span>
      </a>
    </div>
  )
}

export default function ClubPage() {
  const [view, setView] = useState('hub')
  const { subscriptionType } = useProfile()
  const isPlus = subscriptionType === 'plus'

  if (view === 'knowledge-locked') {
    return <ProUpsellStub title="БАЗА ЗНАНИЙ" onBack={() => setView('hub')} />
  }
  if (view === 'community-locked') {
    return <ProUpsellStub title="КОМЬЮНИТИ" onBack={() => setView('hub')} />
  }
  if (view === 'community') {
    return <CommunityView onBack={() => setView('hub')} />
  }

  return (
    <div className="page club-page">
      <img src={clubHeading} alt="КЛУБ" className="screen-title-img" />

      {isPlus ? (
        <button className="club-card" onClick={() => setView('knowledge-locked')}>
          <span className="club-card__title">БАЗА ЗНАНИЙ</span>
          <span className="club-card__sub">ПОЛЕЗНЫЕ МАТЕРИАЛЫ</span>
          <CardArt img={knowledgeImg} />
        </button>
      ) : (
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
      )}

      <button className="club-card" onClick={() => setView(isPlus ? 'community-locked' : 'community')}>
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

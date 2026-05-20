import { useEffect, useState } from 'react'

const DEFAULT_CONFIG = {
  getcourse_ai_url: '#',
  getcourse_mvp_url: '#',
  subscription_ai_1m_price: 990,
  subscription_ai_6m_price: 4990,
  subscription_mvp_1m_price: 2990,
  subscription_mvp_6m_price: 14990,
}

function fmt(n) {
  return new Intl.NumberFormat('ru-RU').format(n)
}

export default function LandingPage() {
  const [cfg, setCfg] = useState(DEFAULT_CONFIG)

  useEffect(() => {
    fetch('/api/config/public')
      .then((r) => r.json())
      .then((data) => setCfg({ ...DEFAULT_CONFIG, ...data }))
      .catch(() => {})
  }, [])

  const aiUrl = cfg.getcourse_ai_url || '#'
  const mvpUrl = cfg.getcourse_mvp_url || '#'

  return (
    <div className="landing">
      {/* Hero */}
      <div className="landing-hero">
        <div className="landing-logo">MVP by TopDog</div>
        <h1 className="landing-title">
          ЗАКРЫТЫЙ<br />ФИТНЕС-КЛУБ
        </h1>
        <p className="landing-tagline">ДЛЯ ТЕХ, КТО ХОЧЕТ РЕЗУЛЬТАТ</p>
      </div>

      <div className="landing-divider" />

      {/* AI plan */}
      <div className="landing-plan">
        <div className="landing-plan__header">
          <span className="landing-plan__badge badge--ai">AI</span>
          <span className="landing-plan__price">от {fmt(cfg.subscription_ai_1m_price)} ₽/мес</span>
        </div>
        <ul className="landing-plan__features">
          <li>🤖 Персональный ИИ-ассистент 24/7</li>
          <li>📊 Трекеры состояния и прогресса</li>
        </ul>
        <a
          href={aiUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-accent landing-plan__btn"
        >
          ВЫБРАТЬ AI →
        </a>
      </div>

      <div className="landing-divider" />

      {/* MVP plan */}
      <div className="landing-plan landing-plan--featured">
        <div className="landing-plan__header">
          <span className="landing-plan__badge badge--mvp">MVP</span>
          <span className="landing-plan__price">от {fmt(cfg.subscription_mvp_1m_price)} ₽/мес</span>
        </div>
        <ul className="landing-plan__features">
          <li>🤖 Персональный ИИ-ассистент 24/7</li>
          <li>📊 Трекеры состояния и прогресса</li>
          <li>💬 Закрытый чат резидентов</li>
          <li>📚 База знаний (программы, нутрициология, эфиры)</li>
        </ul>
        <a
          href={mvpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-accent landing-plan__btn"
        >
          ВЫБРАТЬ MVP →
        </a>
      </div>

      <div className="landing-divider" />

      <p className="landing-footer">
        После оплаты вернись в бот и нажми /start
      </p>
    </div>
  )
}

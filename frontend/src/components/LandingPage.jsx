import { useEffect, useState } from 'react'

const DEFAULT_CONFIG = {
  getcourse_plus_url: '#',
  getcourse_pro_url: '#',
  subscription_plus_1m_price: 990,
  subscription_plus_6m_price: 4990,
  subscription_pro_1m_price: 2990,
  subscription_pro_6m_price: 14990,
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

  const plusUrl = cfg.getcourse_plus_url || '#'
  const proUrl  = cfg.getcourse_pro_url  || '#'

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

      {/* Plus plan */}
      <div className="landing-plan">
        <div className="landing-plan__header">
          <span className="landing-plan__badge badge--plus">Plus</span>
          <span className="landing-plan__price">от {fmt(cfg.subscription_plus_1m_price)} ₽/мес</span>
        </div>
        <ul className="landing-plan__features">
          <li>🤖 Персональный ИИ-ассистент 24/7</li>
          <li>📊 Трекеры состояния и прогресса</li>
        </ul>
        <a
          href={plusUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-accent landing-plan__btn"
        >
          ВЫБРАТЬ PLUS →
        </a>
      </div>

      <div className="landing-divider" />

      {/* Pro plan */}
      <div className="landing-plan landing-plan--featured">
        <div className="landing-plan__header">
          <span className="landing-plan__badge badge--pro">Pro</span>
          <span className="landing-plan__price">от {fmt(cfg.subscription_pro_1m_price)} ₽/мес</span>
        </div>
        <ul className="landing-plan__features">
          <li>🤖 Персональный ИИ-ассистент 24/7</li>
          <li>📊 Трекеры состояния и прогресса</li>
          <li>💬 Закрытый чат резидентов</li>
          <li>📚 База знаний (программы, нутрициология, эфиры)</li>
        </ul>
        <a
          href={proUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-accent landing-plan__btn"
        >
          ВЫБРАТЬ PRO →
        </a>
      </div>

      <div className="landing-divider" />

      <p className="landing-footer">
        После оплаты вернись в бот и нажми /start
      </p>
    </div>
  )
}

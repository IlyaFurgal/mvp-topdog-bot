import { openPaymentLink, PAYMENT_URLS } from '../config/payments'

const PLANS = [
  {
    id: 'ai',
    name: 'AI',
    price: 'до 1 000 ₽/мес',
    url: PAYMENT_URLS.plus1m,
    features: [
      'ИИ-тренер и нутрициолог 24/7',
      'Контроль здоровья и фокуса',
      'Ежедневные чекины',
      'Трекеры веса, воды и сна',
    ],
    accent: false,
  },
  {
    id: 'mvp',
    name: 'MVP',
    price: '2 990 ₽/мес',
    url: PAYMENT_URLS.pro1m,
    features: [
      'Всё из тарифа AI',
      'Telegram-группа резидентов',
      'База знаний и эфиры на GetCourse',
      'Офлайн-активности и мероприятия',
    ],
    accent: true,
  },
]

export default function SubscriptionWall() {
  return (
    <div className="sub-wall">
      <div className="sub-wall__hero">
        <h1 className="sub-wall__title">MVP by TopDog</h1>
        <p className="sub-wall__sub">Выбери тариф и начни работу над собой</p>
      </div>

      <div className="sub-wall__plans">
        {PLANS.map((plan) => (
          <div key={plan.id} className={`sub-plan ${plan.accent ? 'sub-plan--accent' : ''}`}>
            <div className="sub-plan__header">
              <span className="sub-plan__name">{plan.name}</span>
              <span className="sub-plan__price">{plan.price}</span>
            </div>
            <ul className="sub-plan__features">
              {plan.features.map((f) => (
                <li key={f} className="sub-plan__feature">
                  <span className="sub-plan__check">✓</span> {f}
                </li>
              ))}
            </ul>
            <button
              className={`btn ${plan.accent ? 'btn-accent' : 'btn-outline'}`}
              onClick={() => openPaymentLink(plan.url)}
            >
              ОФОРМИТЬ →
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

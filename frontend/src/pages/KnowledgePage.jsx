import { useProfile } from '../context/ProfileContext'

const PRO_URL = import.meta.env.VITE_GC_PAYMENT_URL_PRO || import.meta.env.VITE_GETCOURSE_PRO_URL || '#'
const GC_BASE = import.meta.env.VITE_GC_BASE_URL || 'https://topdog-mvp.getcourse.ru'

const MATERIALS = [
  { title: 'Тренировочные программы', desc: 'Программы под твой уровень и цель', path: '/pl/teach/courses' },
  { title: 'Нутрициология', desc: 'Питание, дефицит, масса — всё по науке', path: '/pl/teach/courses' },
  { title: 'Восстановление и сон', desc: 'Протоколы восстановления', path: '/pl/teach/courses' },
  { title: 'Ментальная подготовка', desc: 'Фокус, дисциплина, мотивация', path: '/pl/teach/courses' },
  { title: 'Записи эфиров', desc: 'Прошедшие прямые эфиры с экспертами', path: '/pl/teach/courses' },
]

function NoSubScreen() {
  return (
    <div className="locked-page">
      <h2 className="locked-title">БАЗА ЗНАНИЙ</h2>
      <p className="locked-sub">Доступно на тарифе Pro</p>
      <p className="locked-desc">
        Тренировочные программы, записи эфиров, нутрициология и протоколы восстановления.
      </p>
      <a
        href={PRO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-accent"
        style={{ textDecoration: 'none', textAlign: 'center' }}
      >
        УЛУЧШИТЬ ДО PRO →
      </a>
    </div>
  )
}

function PlusScreen() {
  return (
    <div className="locked-page">
      <h2 className="locked-title">БАЗА ЗНАНИЙ</h2>
      <p className="locked-sub">ДОСТУПНО НА ТАРИФЕ PRO</p>
      <p className="locked-desc">
        Тренировочные программы, записи эфиров, нутрициология и протоколы восстановления.
      </p>
      <a
        href={PRO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-accent"
        style={{ textDecoration: 'none', textAlign: 'center' }}
      >
        УЛУЧШИТЬ ДО PRO →
      </a>
    </div>
  )
}

export default function KnowledgePage() {
  const { subscriptionType } = useProfile()

  if (!subscriptionType) {
    return <div className="page"><NoSubScreen /></div>
  }

  if (subscriptionType === 'plus') {
    return <div className="page"><PlusScreen /></div>
  }

  // pro — full content
  return (
    <div className="page">
      <h1 className="page-title">БАЗА ЗНАНИЙ</h1>
      <p className="page-subtitle">МАТЕРИАЛЫ НА GETCOURSE</p>

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
    </div>
  )
}

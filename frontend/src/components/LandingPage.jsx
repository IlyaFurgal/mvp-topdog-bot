import { useRef, useState, useEffect } from 'react'
import { openPaymentLink, PAYMENT_URLS } from '../config/payments'

const DEFAULT_CONFIG = {
  getcourse_plus_url:          PAYMENT_URLS.plus1m,
  getcourse_pro_url:           PAYMENT_URLS.pro1m,
  subscription_plus_1m_price:  990,
  subscription_pro_1m_price:   2990,
}

function fmt(n) { return new Intl.NumberFormat('ru-RU').format(n) }

// ─── Static content ───────────────────────────────────────────────────────────

const ACTIVITIES = [
  { type: 'ОНЛАЙН', title: 'Онлайн-тренировка', date: 'Пт, 27 июн', time: '20:00' },
  { type: 'ЭФИР',   title: 'Нутрициология: базовый эфир', date: 'Сб, 28 июн', time: '12:00' },
  { type: 'ОФЛАЙН', title: 'Офлайн-тренировка МСК', date: 'Вс, 29 июн', time: '11:00' },
]

const REVIEWS = [
  { name: 'Алексей М.', text: 'За 2 месяца минус 8 кг. ИИ-коуч отвечает быстрее любого тренера.', stars: 5 },
  { name: 'Дарья К.',   text: 'Наконец-то понимаю, что ем и как восстанавливаться. Трекеры реально помогают.', stars: 5 },
  { name: 'Иван Р.',    text: 'Окружение решает. В клубе все двигаются к цели — это заряжает.', stars: 5 },
]

const FAQ = [
  {
    q: 'Как получить доступ после оплаты?',
    a: 'После оплаты вернись в бот и нажми /start — доступ откроется автоматически в течение нескольких минут.',
  },
  {
    q: 'Чем отличается Плюс от Про?',
    a: 'Плюс — ИИ-ассистент и трекеры прогресса. Про — всё из Плюс плюс закрытый чат резидентов, база знаний (программы, эфиры, нутрициология) и офлайн-активности.',
  },
  {
    q: 'Можно ли отменить подписку?',
    a: 'Да, в любой момент через поддержку. Никаких скрытых условий и автосписаний без согласия.',
  },
  {
    q: 'Откуда берётся персонализация?',
    a: 'При первом запуске бот собирает твои параметры: цель, вес, режим, тон общения. ИИ учитывает их в каждом ответе и адаптируется к твоему прогрессу.',
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACC = '#C8FF00'
const BG  = '#111'

function scrollTo(ref) {
  ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children }) {
  return (
    <div style={{
      fontFamily: "'Barlow Condensed', sans-serif",
      fontSize: 22,
      fontWeight: 700,
      fontStyle: 'italic',
      textTransform: 'uppercase',
      color: '#fff',
      letterSpacing: '0.03em',
      marginBottom: 16,
    }}>
      {children}
    </div>
  )
}

function FeatureCard({ icon, text }) {
  return (
    <div style={{
      background: '#1e1e1e',
      border: '1px solid #2a2a2a',
      borderRadius: 8,
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
    }}>
      <div style={{
        width: 40, height: 40, minWidth: 40,
        borderRadius: 8,
        background: ACC,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20,
      }}>
        {icon}
      </div>
      <p style={{ fontSize: 13, color: '#ccc', lineHeight: 1.5, margin: 0 }}>{text}</p>
    </div>
  )
}

function ActivityCard({ item }) {
  const typeColor = item.type === 'ОФЛАЙН' ? '#ff9900' : ACC
  return (
    <div style={{
      minWidth: 200,
      background: '#1e1e1e',
      border: '1px solid #2a2a2a',
      borderRadius: 8,
      padding: 14,
      scrollSnapAlign: 'start',
      flexShrink: 0,
    }}>
      <span style={{
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: '0.1em',
        color: typeColor,
        background: `${typeColor}22`,
        padding: '2px 7px',
        borderRadius: 2,
        textTransform: 'uppercase',
      }}>
        {item.type}
      </span>
      <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: '8px 0 4px', lineHeight: 1.35 }}>
        {item.title}
      </p>
      <p style={{ fontSize: 11, color: '#888', margin: 0 }}>{item.date} · {item.time}</p>
    </div>
  )
}

function ReviewCard({ item }) {
  return (
    <div style={{
      minWidth: 240,
      background: '#1e1e1e',
      border: '1px solid #2a2a2a',
      borderRadius: 8,
      padding: 14,
      scrollSnapAlign: 'start',
      flexShrink: 0,
    }}>
      <div style={{ color: ACC, fontSize: 13, marginBottom: 8 }}>{'★'.repeat(item.stars)}</div>
      <p style={{ fontSize: 13, color: '#ccc', lineHeight: 1.5, margin: '0 0 10px' }}>«{item.text}»</p>
      <p style={{ fontSize: 11, color: '#666', margin: 0 }}>— {item.name}</p>
    </div>
  )
}

function HScroll({ children }) {
  return (
    <div style={{
      display: 'flex',
      gap: 10,
      overflowX: 'auto',
      scrollSnapType: 'x mandatory',
      WebkitOverflowScrolling: 'touch',
      paddingBottom: 4,
    }}>
      {children}
    </div>
  )
}

function FaqItem({ item }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      borderBottom: '1px solid #2a2a2a',
      paddingBottom: 12,
      marginBottom: 12,
    }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          padding: 0,
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.45 }}>{item.q}</span>
        <span style={{ fontSize: 18, color: ACC, flexShrink: 0, lineHeight: 1 }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <p style={{ fontSize: 12, color: '#999', lineHeight: 1.55, marginTop: 8, marginBottom: 0 }}>
          {item.a}
        </p>
      )}
    </div>
  )
}

function PlanCard({ label, price, features, accent, url }) {
  return (
    <div style={{
      background: accent ? '#1e1e1e' : '#1a1a1a',
      border: accent ? `2px solid ${ACC}` : '1px solid #2a2a2a',
      borderRadius: 8,
      padding: 16,
      position: 'relative',
      flex: 1,
    }}>
      {accent && (
        <span style={{
          position: 'absolute', top: -10, right: 10,
          background: ACC, color: '#000',
          fontSize: 9, fontWeight: 800,
          padding: '2px 7px', borderRadius: 2,
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          РЕКОМЕНДУЕМ
        </span>
      )}
      <div style={{ marginBottom: 10 }}>
        <span style={{
          background: accent ? ACC : '#333',
          color: accent ? '#000' : '#888',
          fontSize: 10, fontWeight: 700,
          padding: '2px 8px', borderRadius: 2,
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 12 }}>
        от {fmt(price)} ₽/мес
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {features.map((f) => (
          <li key={f} style={{ fontSize: 12, color: '#ccc', display: 'flex', gap: 8, lineHeight: 1.4 }}>
            <span style={{ color: ACC, fontWeight: 700, flexShrink: 0 }}>✓</span>{f}
          </li>
        ))}
      </ul>
      <button
        onClick={() => openPaymentLink(url)}
        style={{
          display: 'block', width: '100%', height: 44,
          background: accent ? ACC : '#2a2a2a',
          color: accent ? '#000' : '#ccc',
          border: 'none', borderRadius: 4,
          fontWeight: 800, fontSize: 13,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        ВЫБРАТЬ {label} →
      </button>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [cfg, setCfg] = useState(DEFAULT_CONFIG)

  const refHero      = useRef(null)
  const refFeatures  = useRef(null)
  const refPlans     = useRef(null)
  const refFaq       = useRef(null)

  useEffect(() => {
    fetch('/api/config/public')
      .then((r) => r.json())
      .then((data) => setCfg({ ...DEFAULT_CONFIG, ...data }))
      .catch(() => {})
  }, [])

  const plusUrl = cfg.getcourse_plus_url || PAYMENT_URLS.plus1m
  const proUrl  = cfg.getcourse_pro_url  || PAYMENT_URLS.pro1m

  const NAV = [
    { label: 'Главная',   ref: refHero     },
    { label: 'Что внутри', ref: refFeatures },
    { label: 'Тарифы',    ref: refPlans    },
    { label: 'FAQ',       ref: refFaq      },
  ]

  return (
    <div style={{ background: BG, minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Sticky top nav ─────────────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(17,17,17,0.96)',
        backdropFilter: 'blur(6px)',
        borderBottom: '1px solid #222',
        display: 'flex',
        justifyContent: 'space-around',
        padding: '10px 0 9px',
      }}>
        {NAV.map(({ label, ref }) => (
          <button
            key={label}
            onClick={() => scrollTo(ref)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
              color: '#ccc', textTransform: 'uppercase', padding: '2px 6px',
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>

        {/* ── Hero / Offer ─────────────────────────────────────────────────── */}
        <section ref={refHero} style={{ padding: '36px 0 32px', textAlign: 'center' }}>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 56, fontWeight: 700, fontStyle: 'italic',
            color: '#fff', lineHeight: 1, letterSpacing: '-0.01em',
          }}>
            MVP
          </div>
          <div style={{ fontSize: 11, color: '#888', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 2 }}>
            BY TOPDOG
          </div>
          <div style={{ width: 40, height: 2, background: ACC, margin: '10px auto 0', borderRadius: 1 }} />

          <p style={{ fontSize: 15, color: '#ccc', lineHeight: 1.6, margin: '24px 0 0', textAlign: 'left' }}>
            MVP от TOP DOG — закрытый клуб, который помогает людям по всей России выстраивать
            здоровый образ жизни с помощью технологий, научного подхода и сильного окружения.
          </p>
          <p style={{ fontSize: 11, color: '#666', lineHeight: 1.55, margin: '12px 0 0', textAlign: 'left' }}>
            * MVP (Most Valuable Player) — самый ценный игрок: в спорте так называют участника, который определяет исход игры.
          </p>

          <button
            onClick={() => scrollTo(refPlans)}
            style={{
              marginTop: 28, width: '100%', height: 52,
              background: ACC, color: '#000', border: 'none', borderRadius: 4,
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 17, fontWeight: 800, letterSpacing: '0.08em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            СТАТЬ MVP →
          </button>
        </section>

        {/* ── Что ты получишь ──────────────────────────────────────────────── */}
        <section ref={refFeatures} style={{ paddingBottom: 32 }}>
          <SectionTitle>Что ты получишь</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <FeatureCard
              icon="🤖"
              text="Персональный ИИ: тренер, нутрициолог, трекер анализов, контроль состояния"
            />
            <FeatureCard
              icon="🔥"
              text="Сильная среда единомышленников, поддержка, челленджи"
            />
            <FeatureCard
              icon="🏆"
              text="Мастер-классы, эфиры, тренировки с ТОП-атлетами и ведущими специалистами из мира спорта"
            />
          </div>
        </section>

        {/* ── График активностей ───────────────────────────────────────────── */}
        <section style={{ paddingBottom: 32 }}>
          <SectionTitle>График активностей</SectionTitle>
          <HScroll>
            {ACTIVITIES.map((item, i) => <ActivityCard key={i} item={item} />)}
            <div style={{ minWidth: 1, flexShrink: 0 }} />
          </HScroll>
          <p style={{ fontSize: 11, color: '#555', marginTop: 8, marginBottom: 0 }}>
            * Расписание обновляется еженедельно — актуальный список в чате резидентов
          </p>
        </section>

        {/* ── Как вступить ─────────────────────────────────────────────────── */}
        <section ref={refPlans} style={{ paddingBottom: 32 }}>
          <SectionTitle>Как вступить в клуб</SectionTitle>

          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            {[
              { n: '1', label: 'Выбрать тариф' },
              { n: '2', label: 'Оформить подписку' },
            ].map(({ n, label }) => (
              <div key={n} style={{
                flex: 1,
                background: '#1e1e1e',
                border: '1px solid #2a2a2a',
                borderRadius: 8,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: ACC, color: '#000',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 14, flexShrink: 0,
                }}>
                  {n}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#ccc', lineHeight: 1.35 }}>{label}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <PlanCard
              label="ПЛЮС"
              price={cfg.subscription_plus_1m_price}
              url={plusUrl}
              accent={false}
              features={[
                'Персональный ИИ-ассистент 24/7',
                'Ежедневные чекины состояния',
                'Трекеры веса, воды, сна и калорий',
                'Прогресс и аналитика',
              ]}
            />
            <PlanCard
              label="ПРО"
              price={cfg.subscription_pro_1m_price}
              url={proUrl}
              accent
              features={[
                'Всё из тарифа ПЛЮС',
                'Закрытый чат резидентов клуба',
                'База знаний: программы, эфиры, нутрициология',
                'Офлайн-активности и мероприятия',
              ]}
            />
          </div>

          <p style={{ fontSize: 11, color: '#666', textAlign: 'center', marginTop: 12, marginBottom: 0 }}>
            Оплата через защищённую платформу GetCourse · после оплаты вернись в бот и нажми /start
          </p>
        </section>

        {/* ── Отзывы ───────────────────────────────────────────────────────── */}
        <section style={{ paddingBottom: 32 }}>
          <SectionTitle>Отзывы резидентов</SectionTitle>
          <HScroll>
            {REVIEWS.map((item, i) => <ReviewCard key={i} item={item} />)}
            <div style={{ minWidth: 1, flexShrink: 0 }} />
          </HScroll>
          <p style={{ fontSize: 11, color: '#555', marginTop: 8, marginBottom: 0 }}>
            * Реальные отзывы будут добавлены позже
          </p>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <section ref={refFaq} style={{ paddingBottom: 48 }}>
          <SectionTitle>Частые вопросы</SectionTitle>
          {FAQ.map((item, i) => <FaqItem key={i} item={item} />)}
        </section>

      </div>
    </div>
  )
}

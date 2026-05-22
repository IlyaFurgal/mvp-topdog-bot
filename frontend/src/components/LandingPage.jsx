import { useEffect, useRef, useState } from 'react'

const DEFAULT_CONFIG = {
  getcourse_plus_url: '#',
  getcourse_pro_url:  '#',
  subscription_plus_1m_price: 990,
  subscription_pro_1m_price:  2990,
}

function fmt(n) {
  return new Intl.NumberFormat('ru-RU').format(n)
}

// ── SVG icons ─────────────────────────────────────────────────────────────────

function IconAI() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M11 2C7.13 2 4 5.13 4 9c0 2.39 1.19 4.5 3 5.74V17h8v-2.26C16.81 13.5 18 11.39 18 9c0-3.87-3.13-7-7-7z" stroke="#000" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M9 17v2h4v-2" stroke="#000" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M11 6v3m0 0l-1.5-1.5M11 9l1.5-1.5" stroke="#000" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function IconChart() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polyline points="3,16 8,10 12,13 19,5" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="16,5 19,5 19,8" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="3" y1="19" x2="19" y2="19" stroke="#000" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function IconPeople() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="7" r="3" stroke="#000" strokeWidth="1.5"/>
      <path d="M2 19c0-3.31 2.69-6 6-6s6 2.69 6 6" stroke="#000" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="16" cy="7" r="2.5" stroke="#000" strokeWidth="1.5"/>
      <path d="M19 19c0-2.76-1.34-5.09-3.5-6" stroke="#000" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function IconBook() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 4h6a3 3 0 013 3v12a3 3 0 00-3-3H4V4z" stroke="#000" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M18 4h-6a3 3 0 00-3 3v12a3 3 0 013-3h6V4z" stroke="#000" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  )
}

// ── Feature card ──────────────────────────────────────────────────────────────

function FeatureCard({ icon, title, desc }) {
  return (
    <div style={{
      background: '#1e1e1e',
      border: '1px solid #2a2a2a',
      borderRadius: 8,
      padding: 16,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 8,
    }}>
      <div style={{
        width: 44, height: 44, minWidth: 44,
        borderRadius: 8,
        background: '#C8FF00',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.04em' }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: '#888888', lineHeight: 1.45 }}>
          {desc}
        </div>
      </div>
    </div>
  )
}

// ── Plans modal ───────────────────────────────────────────────────────────────

function PlansModal({ cfg, onClose }) {
  const overlayRef = useRef(null)

  function handleOverlay(e) {
    if (e.target === overlayRef.current) onClose()
  }

  const plusUrl = cfg.getcourse_plus_url || '#'
  const proUrl  = cfg.getcourse_pro_url  || '#'

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlay}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div style={{
        background: '#1a1a1a',
        borderRadius: '16px 16px 0 0',
        padding: '24px 16px 32px',
        width: '100%',
        maxWidth: 480,
        animation: 'slideUp 250ms ease-out',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 24,
            fontWeight: 700,
            fontStyle: 'italic',
            textTransform: 'uppercase',
            color: '#fff',
            letterSpacing: '0.03em',
          }}>
            ВЫБЕРИ ТАРИФ
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 4, letterSpacing: '0.03em' }}>
            Оплата через защищённую платформу GetCourse
          </div>
        </div>

        {/* Plus card */}
        <div style={{
          background: '#222',
          border: '1px solid #2a2a2a',
          borderRadius: 8,
          padding: 16,
          marginBottom: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{
              background: '#333', color: '#888', fontSize: 10,
              fontWeight: 700, padding: '2px 8px', borderRadius: 2,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>PLUS</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 12 }}>
            от {fmt(cfg.subscription_plus_1m_price)} ₽/мес
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {['Персональный ИИ-ассистент 24/7', 'Трекеры состояния и прогресса'].map((f) => (
              <li key={f} style={{ fontSize: 12, color: '#ccc', display: 'flex', gap: 8 }}>
                <span style={{ color: '#C8FF00', fontWeight: 700 }}>✓</span>{f}
              </li>
            ))}
          </ul>
          <a
            href={plusUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', textAlign: 'center', height: 44, lineHeight: '44px',
              background: '#2a2a2a', color: '#ccc', borderRadius: 4,
              fontWeight: 700, fontSize: 13, letterSpacing: '0.06em',
              textDecoration: 'none', textTransform: 'uppercase',
            }}
          >
            ВЫБРАТЬ PLUS →
          </a>
        </div>

        {/* Pro card */}
        <div style={{
          background: '#1e1e1e',
          border: '2px solid #C8FF00',
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
          position: 'relative',
        }}>
          <span style={{
            position: 'absolute', top: -10, right: 12,
            background: '#C8FF00', color: '#000',
            fontSize: 9, fontWeight: 800,
            padding: '2px 8px', borderRadius: 2,
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            РЕКОМЕНДУЕМ
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{
              background: '#C8FF00', color: '#000', fontSize: 10,
              fontWeight: 700, padding: '2px 8px', borderRadius: 2,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>PRO</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 12 }}>
            от {fmt(cfg.subscription_pro_1m_price)} ₽/мес
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              'Персональный ИИ-ассистент 24/7',
              'Трекеры состояния и прогресса',
              'Закрытый чат резидентов',
              'База знаний (программы, эфиры, нутрициология)',
            ].map((f) => (
              <li key={f} style={{ fontSize: 12, color: '#ccc', display: 'flex', gap: 8 }}>
                <span style={{ color: '#C8FF00', fontWeight: 700 }}>✓</span>{f}
              </li>
            ))}
          </ul>
          <a
            href={proUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', textAlign: 'center', height: 44, lineHeight: '44px',
              background: '#C8FF00', color: '#000', borderRadius: 4,
              fontWeight: 800, fontSize: 13, letterSpacing: '0.06em',
              textDecoration: 'none', textTransform: 'uppercase',
            }}
          >
            ВЫБРАТЬ PRO →
          </a>
        </div>

        {/* Footer note */}
        <p style={{ fontSize: 11, color: '#888', textAlign: 'center', margin: 0 }}>
          После оплаты вернись в бот и нажми /start
        </p>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ── Main landing ──────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [cfg, setCfg] = useState(DEFAULT_CONFIG)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    fetch('/api/config/public')
      .then((r) => r.json())
      .then((data) => setCfg({ ...DEFAULT_CONFIG, ...data }))
      .catch(() => {})
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#111',
      display: 'flex',
      flexDirection: 'column',
      padding: '32px 16px 40px',
      maxWidth: 480,
      margin: '0 auto',
      boxSizing: 'border-box',
    }}>

      {/* ── Logo ─────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 48,
          fontWeight: 700,
          fontStyle: 'italic',
          color: '#fff',
          lineHeight: 1,
          letterSpacing: '-0.01em',
        }}>
          MVP
        </div>
        <div style={{
          fontSize: 11,
          color: '#888888',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          marginTop: 2,
        }}>
          BY TOPDOG
        </div>
        <div style={{
          width: 40,
          height: 2,
          background: '#C8FF00',
          margin: '10px auto 0',
          borderRadius: 1,
        }} />
      </div>

      {/* ── Headline ─────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <h1 style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 32,
          fontWeight: 700,
          fontStyle: 'italic',
          textTransform: 'uppercase',
          color: '#fff',
          margin: 0,
          lineHeight: 1.1,
          letterSpacing: '0.02em',
        }}>
          ЗАКРЫТЫЙ ФИТНЕС-КЛУБ
        </h1>
        <p style={{
          fontSize: 13,
          color: '#888888',
          letterSpacing: '0.05em',
          marginTop: 8,
          marginBottom: 0,
        }}>
          ДЛЯ ТЕХ, КТО ХОЧЕТ РЕЗУЛЬТАТ
        </p>
      </div>

      {/* ── Feature cards ────────────────────────────────── */}
      <div style={{ flex: 1, marginBottom: 24 }}>
        <FeatureCard
          icon={<IconAI />}
          title="ИИ-АССИСТЕНТ"
          desc="Персональный тренер, нутрициолог, врач и мотиватор — 24/7"
        />
        <FeatureCard
          icon={<IconChart />}
          title="ТРЕКЕРЫ И ПРОГРЕСС"
          desc="Контролируй сон, питание, нагрузку и динамику веса"
        />
        <FeatureCard
          icon={<IconPeople />}
          title="СООБЩЕСТВО"
          desc="Закрытый чат резидентов клуба MVP"
        />
        <FeatureCard
          icon={<IconBook />}
          title="БАЗА ЗНАНИЙ"
          desc="Программы тренировок, нутрициология, записи эфиров"
        />
      </div>

      {/* ── CTA button ───────────────────────────────────── */}
      <button
        onClick={() => setModalOpen(true)}
        style={{
          width: '100%',
          height: 52,
          background: '#C8FF00',
          color: '#000',
          border: 'none',
          borderRadius: 4,
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 16,
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        ВСТУПИТЬ В КЛУБ →
      </button>

      {/* ── Plans modal ──────────────────────────────────── */}
      {modalOpen && (
        <PlansModal cfg={cfg} onClose={() => setModalOpen(false)} />
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import client, { setToken } from './api/client'
import BottomNav from './components/BottomNav'
import LandingPage from './components/LandingPage'
import OnboardingModal from './components/OnboardingModal'
import { ProfileProvider, useProfile } from './context/ProfileContext'
import { useTelegram } from './hooks/useTelegram'
import AiPage from './pages/AiPage'
import KnowledgePage from './pages/KnowledgePage'
import ProfilePage from './pages/ProfilePage'
import ProgressPage from './pages/ProgressPage'
import ResidentsChatPage from './pages/ResidentsChatPage'
import TrackersPage from './pages/TrackersPage'

const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true'

// Read once at module load — no re-renders needed
const TZ_ACTION = new URLSearchParams(window.location.search).get('action')

// ── Timezone: detect mode ─────────────────────────────────────────────────────

function DetectTimezone({ tg }) {
  const offset    = -new Date().getTimezoneOffset() / 60
  const utcString = offset >= 0 ? `UTC+${offset}` : `UTC${offset}`

  useEffect(() => {
    tg?.ready()
    tg?.expand()
    const t = setTimeout(() => {
      tg?.sendData(utcString)
      tg?.close()
    }, 500)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#111',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    }}>
      <div style={{ fontSize: 44 }}>🌍</div>
      <div style={{ fontSize: 13, color: '#888', letterSpacing: '0.04em' }}>
        Определяем часовой пояс…
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#C8FF00', letterSpacing: '0.02em' }}>
        {utcString}
      </div>
    </div>
  )
}

// ── Timezone: select mode ─────────────────────────────────────────────────────

const UTC_OFFSETS = Array.from({ length: 25 }, (_, i) => {
  const n = i - 12
  return {
    value: n === 0 ? 'UTC+0' : n > 0 ? `UTC+${n}` : `UTC${n}`,
    label: n === 0 ? 'UTC ±0' : n > 0 ? `UTC +${n}` : `UTC ${n}`,
  }
})

function getLocalUtc() {
  const n = -new Date().getTimezoneOffset() / 60
  return n === 0 ? 'UTC+0' : n > 0 ? `UTC+${n}` : `UTC${n}`
}

function SelectTimezone({ tg }) {
  const [selected, setSelected] = useState(getLocalUtc)
  const selectedRef = useRef(null)

  useEffect(() => {
    tg?.ready()
    tg?.expand()
    selectedRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' })
  }, [])

  function confirm() {
    tg?.sendData(selected)
    tg?.close()
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#111',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{ padding: '22px 16px 12px' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 2 }}>
          🌍 Часовой пояс
        </div>
        <div style={{ fontSize: 12, color: '#666' }}>Выбери свой UTC-offset</div>
      </div>

      {/* Scroll list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0 16px',
        WebkitOverflowScrolling: 'touch',
      }}>
        {UTC_OFFSETS.map(({ value, label }) => {
          const active = selected === value
          return (
            <div
              key={value}
              ref={active ? selectedRef : null}
              onClick={() => setSelected(value)}
              style={{
                padding: '13px 16px',
                marginBottom: 6,
                borderRadius: 8,
                background: active ? '#C8FF00' : '#1e1e1e',
                color:      active ? '#000'    : '#fff',
                fontWeight: active ? 700       : 400,
                fontSize: 15,
                cursor: 'pointer',
                border: active ? 'none' : '1px solid #2a2a2a',
                transition: 'background 100ms',
              }}
            >
              {label}
            </div>
          )
        })}
        <div style={{ height: 90 }} />
      </div>

      {/* Sticky button */}
      <div style={{
        position: 'sticky',
        bottom: 0,
        background: '#111',
        padding: '8px 16px 28px',
      }}>
        <button
          onClick={confirm}
          style={{
            width: '100%',
            height: 52,
            background: '#C8FF00',
            color: '#000',
            border: 'none',
            borderRadius: 4,
            fontSize: 15,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          ПОДТВЕРДИТЬ →
        </button>
      </div>
    </div>
  )
}

// ── Main app ──────────────────────────────────────────────────────────────────

function AppContent() {
  const { subscriptionType, profileLoading } = useProfile()
  const location = useLocation()

  if (!SKIP_AUTH && !profileLoading && subscriptionType === null) {
    return <LandingPage />
  }

  return (
    <>
      <OnboardingModal />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/profile" replace />} />
          <Route path="/ai"        element={<AiPage />} />
          <Route path="/trackers"  element={<TrackersPage />} />
          <Route path="/progress"  element={<ProgressPage />} />
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="/residents" element={<ResidentsChatPage />} />
          <Route path="/profile"   element={<ProfilePage />} />
        </Routes>
      </main>
      <BottomNav />
    </>
  )
}

export default function App() {
  const { tg, initData } = useTelegram()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // For timezone actions — skip auth entirely
    if (TZ_ACTION === 'detect_timezone' || TZ_ACTION === 'select_timezone') return

    tg?.expand()

    if (SKIP_AUTH) {
      setReady(true)
      return
    }

    if (!initData) {
      setError('no-telegram')
      return
    }

    client
      .post('/auth/telegram', { init_data: initData })
      .then(({ data }) => {
        setToken(data.access_token)
        setReady(true)
      })
      .catch(() => setError('auth-failed'))
  }, [])

  // ── Timezone shortcuts — rendered before auth, no ProfileProvider needed ──
  if (TZ_ACTION === 'detect_timezone') return <DetectTimezone tg={tg} />
  if (TZ_ACTION === 'select_timezone') return <SelectTimezone tg={tg} />

  // No Telegram context — show marketing landing
  if (error === 'no-telegram' || error === 'auth-failed') {
    return <LandingPage />
  }

  if (!ready) {
    return (
      <div className="splash">
        <p className="splash-text">Загрузка...</p>
      </div>
    )
  }

  return (
    <ProfileProvider>
      <BrowserRouter>
        <div className="app">
          <AppContent />
        </div>
      </BrowserRouter>
    </ProfileProvider>
  )
}

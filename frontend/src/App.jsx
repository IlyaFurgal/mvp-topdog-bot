import { useEffect, useRef, useState, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import client, { setToken } from './api/client'
import { getLocalUtcStr } from './utils/timezone'
import TopNav from './components/TopNav'
import MvpRibbon from './components/MvpRibbon'
import SwipeNavigator from './components/SwipeNavigator'
import LandingPage from './components/LandingPage'
import { ProfileProvider, useProfile } from './context/ProfileContext'
import { ChatProvider } from './context/ChatContext'
import { lazyWithRetry } from './utils/lazyWithRetry'
import { useTelegram } from './hooks/useTelegram'
import ProfilePage from './pages/ProfilePage'   // стартовая страница — статический импорт

const AiPage   = lazyWithRetry(() => import('./pages/AiPage'))
const ClubPage = lazyWithRetry(() => import('./pages/ClubPage'))

const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true'

// Check pathname at module level — before any routing or auth.
// /tz  → manual timezone picker (React, no auth required)
const IS_TZ_SELECT = window.location.pathname === '/tz'

// ── Manual timezone picker ────────────────────────────────────────────────────

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
      <div style={{ padding: '22px 16px 12px' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 2 }}>
          🌍 Часовой пояс
        </div>
        <div style={{ fontSize: 12, color: '#666' }}>Выбери свой UTC-offset</div>
      </div>

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
      <TopNav />
      <main className="main-content">
        <MvpRibbon />
        <SwipeNavigator>
          <Suspense fallback={
            <div style={{
              minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted, #888)', fontFamily: 'system-ui',
            }}>Загрузка…</div>
          }>
            <Routes>
              <Route path="/" element={<Navigate to={{ pathname: "/profile", search: location.search }} replace />} />
              <Route path="/ai"        element={<AiPage />} />
              <Route path="/profile"   element={<ProfilePage />} />
              <Route path="/club"      element={<ClubPage />} />
            </Routes>
          </Suspense>
        </SwipeNavigator>
      </main>
    </>
  )
}

export default function App() {
  const { tg, initData } = useTelegram()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Manual timezone picker — skip auth entirely
    if (IS_TZ_SELECT) {
      tg?.ready()
      tg?.expand()
      return
    }

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
        client.patch('/profile/me', { timezone_auto: getLocalUtcStr() }).catch(() => {})
      })
      .catch(() => setError('auth-failed'))
  }, [])

  // ── /tz — manual picker, no auth ──────────────────────────────────────────
  if (IS_TZ_SELECT) return <SelectTimezone tg={tg} />

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
      <ChatProvider>
        <BrowserRouter>
          <div className="app">
            <AppContent />
          </div>
        </BrowserRouter>
      </ChatProvider>
    </ProfileProvider>
  )
}

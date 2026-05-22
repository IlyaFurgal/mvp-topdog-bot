import { useEffect, useState } from 'react'
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
import TimezonePage from './pages/TimezonePage'
import TrackersPage from './pages/TrackersPage'

const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true'

function AppContent() {
  const { subscriptionType, profileLoading } = useProfile()
  const location = useLocation()

  // Timezone picker is opened from the bot during registration —
  // bypass subscription check so it always renders.
  if (location.pathname === '/timezone') {
    return <TimezonePage />
  }

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
          <Route path="/timezone"  element={<TimezonePage />} />
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

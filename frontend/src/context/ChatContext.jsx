import { createContext, useContext, useEffect, useRef, useState } from 'react'
import client from '../api/client'
import { useProfile } from './ProfileContext'

const POLL_INTERVAL_MS = 1500
const POLL_MAX_ATTEMPTS = 40

const API_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')
  : ''

function resolveMediaPath(path) {
  if (!path) return null
  if (path.startsWith('http')) return path
  return `${API_BASE}${path}`
}

// Voice recordings are persisted server-side under the same `image_path`
// column as photos (AiMessage has no dedicated audio column) — tell them
// apart by extension so history reload renders an <audio> player instead
// of a broken <img>.
const AUDIO_EXTENSIONS = new Set(['webm', 'ogg', 'oga', 'm4a', 'mp3', 'wav', 'aac'])

function classifyMediaPath(path) {
  if (!path) return { imagePath: null, audioUrl: null }
  const ext = path.split('.').pop()?.toLowerCase()
  const resolved = resolveMediaPath(path)
  return AUDIO_EXTENSIONS.has(ext)
    ? { imagePath: null, audioUrl: resolved }
    : { imagePath: resolved, audioUrl: null }
}

const GREETING = {
  aggressive:
    'Готов работать. В твоём распоряжении:\n\n' +
    '- 🏋️ **ТРЕНЕР** — программы, техника, нагрузка под твои цели\n' +
    '- 🥗 **НУТРИЦИОЛОГ** — питание, калории, восстановление через еду\n' +
    '- 🩺 **ВРАЧ** — здоровье, ограничения, безопасный подход к нагрузкам\n' +
    '- 🔥 **МОТИВАТОР** — когда нужен толчок и фокус\n\n' +
    'Задавай вопросы — отвечу по делу.',
  soft:
    'Привет! Я твой персональный ассистент. Вот кто со мной на связи:\n\n' +
    '- 🏋️ **ТРЕНЕР** — составит программу и подберёт нагрузку под тебя\n' +
    '- 🥗 **НУТРИЦИОЛОГ** — поможет с питанием и восстановлением\n' +
    '- 🩺 **ВРАЧ** — ответит на вопросы по здоровью и ограничениям\n' +
    '- 🔥 **МОТИВАТОР** — поддержит когда тяжело\n\n' +
    'Спрашивай — я здесь 🙌',
}

function buildGreeting(tone, name) {
  const base = GREETING[tone] ?? GREETING.soft
  if (tone === 'soft' && name) return base.replace('Привет!', `Привет, ${name}!`)
  return base
}

const ChatContext = createContext(null)

// Chat state lives above the router (see App.jsx) so it survives tab
// switches — AiPage unmounts on navigation (SwipeNavigator remounts the
// whole subtree via key={pathname}), but the in-flight poll for a pending
// AI reply and the typing indicator must keep running regardless.
export function ChatProvider({ children }) {
  const { tone, profile } = useProfile()
  const name = profile?.preferred_name || ''

  const [messages, setMessages] = useState([])
  const [typing, setTyping] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const pollRef = useRef(null)

  useEffect(() => {
    async function fetchHistory() {
      try {
        const { data } = await client.get('/suvvy/history')
        const history = (data.messages ?? []).filter((m) => m.text?.trim())
        if (history.length > 0) {
          setMessages(history.map((m) => ({
            id: m.id,
            from: m.role,
            text: m.text,
            ...classifyMediaPath(m.image_path),
          })))
        } else {
          setMessages([{ id: 1, from: 'ai', text: buildGreeting(tone, name) }])
        }
      } catch {
        setMessages([{ id: 1, from: 'ai', text: buildGreeting(tone, name) }])
      } finally {
        setHistoryLoaded(true)
      }
    }
    fetchHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function addMessage(from, text, imagePath) {
    if (!text?.trim()) return
    setMessages((m) => [...m, { id: Date.now() + Math.random(), from, text, imagePath }])
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  function startPolling() {
    stopPolling()
    let attempts = 0
    pollRef.current = setInterval(async () => {
      attempts++
      try {
        const { data } = await client.get('/suvvy/messages')
        if (data.messages && data.messages.length > 0) {
          stopPolling()
          setTyping(false)
          data.messages.forEach((text) => { if (text?.trim()) addMessage('ai', text) })
          return
        }
      } catch (_) {}
      if (attempts >= POLL_MAX_ATTEMPTS) {
        stopPolling()
        setTyping(false)
        addMessage('ai', 'Ассистент не ответил. Попробуй ещё раз.')
      }
    }, POLL_INTERVAL_MS)
  }

  // Only stop polling when the whole app tears down, not on page navigation
  useEffect(() => stopPolling, [])

  return (
    <ChatContext.Provider
      value={{ messages, setMessages, typing, setTyping, historyLoaded, addMessage, startPolling, stopPolling }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  return useContext(ChatContext)
}

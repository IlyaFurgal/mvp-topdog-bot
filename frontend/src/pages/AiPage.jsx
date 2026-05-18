import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import client from '../api/client'
import { useProfile } from '../context/ProfileContext'

const GREETING = {
  soft: 'Привет! Я твой личный ИИ-ассистент. Чем могу помочь?',
  aggressive: 'Готов работать. Задавай вопросы — отвечу по делу.',
}

const MAX_MESSAGES = 50
const POLL_INTERVAL_MS = 1500
const POLL_MAX_ATTEMPTS = 13  // ~20 секунд

function storageKey(telegramId) {
  return `topdog_ai_messages_${telegramId}`
}

function loadHistory(telegramId) {
  if (!telegramId) return null
  try {
    const raw = localStorage.getItem(storageKey(telegramId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveHistory(telegramId, messages) {
  if (!telegramId) return
  try {
    const trimmed = messages.slice(-MAX_MESSAGES)
    localStorage.setItem(storageKey(telegramId), JSON.stringify(trimmed))
  } catch {}
}

export default function AiPage() {
  const { tone, profile } = useProfile()
  const telegramId = profile?.telegram_id
  const name = profile?.preferred_name || ''
  const greeting = GREETING[tone] ?? GREETING.soft

  const [messages, setMessages] = useState(() => {
    const history = loadHistory(telegramId)
    if (history && history.length > 0) return history
    return [
      { id: 1, from: 'ai', text: name ? greeting.replace('Привет!', `Привет, ${name}!`) : greeting },
    ]
  })
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const bottomRef = useRef(null)
  const pollRef = useRef(null)

  useEffect(() => {
    saveHistory(telegramId, messages)
  }, [messages, telegramId])

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  function addMessage(from, text) {
    setMessages((m) => [...m, { id: Date.now() + Math.random(), from, text }])
    scrollToBottom()
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  async function startPolling() {
    let attempts = 0

    pollRef.current = setInterval(async () => {
      attempts++
      try {
        const { data } = await client.get('/suvvy/messages')
        if (data.messages && data.messages.length > 0) {
          stopPolling()
          setTyping(false)
          data.messages.forEach((text) => addMessage('ai', text))
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

  async function handleSend() {
    const text = input.trim()
    if (!text || typing) return
    setInput('')
    addMessage('user', text)

    setTyping(true)
    try {
      await client.post('/suvvy/message', { text })
      startPolling()
    } catch (e) {
      setTyping(false)
      const detail = e?.response?.data?.detail
      addMessage('ai', detail === 'Suvvy not configured'
        ? 'ИИ-ассистент ещё не подключён.'
        : 'Не удалось отправить сообщение. Попробуй позже.')
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="ai-page">
      <div className="ai-header">
        <h1 className="page-title" style={{ margin: 0 }}>ИИ-АССИСТЕНТ</h1>
      </div>

      <div className="ai-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`ai-msg ai-msg--${msg.from}`}>
            <div className="ai-msg__bubble">
              {msg.from === 'ai'
                ? <ReactMarkdown>{msg.text}</ReactMarkdown>
                : msg.text}
            </div>
          </div>
        ))}
        {typing && (
          <div className="ai-msg ai-msg--ai">
            <div className="ai-msg__bubble ai-msg__bubble--typing">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="ai-input-bar">
        <textarea
          className="ai-input"
          placeholder="Напиши вопрос..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
        />
        <button className="ai-send" onClick={handleSend} disabled={!input.trim() || typing}>
          ›
        </button>
      </div>
    </div>
  )
}

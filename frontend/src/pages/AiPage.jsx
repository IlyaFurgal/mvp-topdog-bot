import { useRef, useState } from 'react'
import { useProfile } from '../context/ProfileContext'

const GREETING = {
  soft: 'Привет! Я твой личный ИИ-ассистент. Чем могу помочь?',
  aggressive: 'Готов работать. Задавай вопросы — отвечу по делу.',
}

export default function AiPage() {
  const { tone, profile } = useProfile()
  const name = profile?.preferred_name || ''
  const greeting = GREETING[tone] ?? GREETING.soft

  const [messages, setMessages] = useState([
    { id: 1, from: 'ai', text: name ? `${greeting.replace('Привет!', `Привет, ${name}!`)}` : greeting },
  ])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const bottomRef = useRef(null)

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  async function handleSend() {
    const text = input.trim()
    if (!text) return
    setInput('')

    const userMsg = { id: Date.now(), from: 'user', text }
    setMessages((m) => [...m, userMsg])
    scrollToBottom()

    setTyping(true)
    // TODO: replace with real Suvvy API call
    await new Promise((r) => setTimeout(r, 1200))
    setTyping(false)

    const reply = {
      id: Date.now() + 1,
      from: 'ai',
      text: 'ИИ-ассистент скоро будет подключён. Пока отслеживай прогресс в трекерах и не пропускай чекины.',
    }
    setMessages((m) => [...m, reply])
    scrollToBottom()
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
            <div className="ai-msg__bubble">{msg.text}</div>
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

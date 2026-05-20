import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import client from '../api/client'
import { useProfile } from '../context/ProfileContext'

const MAX_IMAGE_BYTES = 15 * 1024 * 1024  // 15 МБ

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
  if (tone === 'soft' && name) {
    return base.replace('Привет!', `Привет, ${name}!`)
  }
  return base
}

const POLL_INTERVAL_MS = 1500
const POLL_MAX_ATTEMPTS = 13  // ~20 секунд

export default function AiPage() {
  const { tone, profile } = useProfile()
  const name = profile?.preferred_name || ''

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [imagePreview, setImagePreview] = useState(null)   // { dataUrl, name }
  const [imageError, setImageError] = useState('')
  const bottomRef = useRef(null)
  const pollRef = useRef(null)
  const fileInputRef = useRef(null)

  // Загружаем историю при монтировании
  useEffect(() => {
    async function fetchHistory() {
      try {
        const { data } = await client.get('/suvvy/history')
        const history = data.messages ?? []
        if (history.length > 0) {
          setMessages(
            history.map((m) => ({
              id: m.id,
              from: m.role,
              text: m.text,
            }))
          )
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
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (historyLoaded) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [historyLoaded])

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  function addMessage(from, text, imageUrl) {
    setMessages((m) => [...m, { id: Date.now() + Math.random(), from, text, imageUrl }])
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

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageError('')

    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('Файл слишком большой. Максимум 15 МБ.')
      e.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview({ dataUrl: ev.target.result, name: file.name })
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function removeImage() {
    setImagePreview(null)
    setImageError('')
  }

  async function handleSend() {
    const text = input.trim()
    if (!text && !imagePreview) return
    if (typing) return

    setInput('')
    addMessage('user', text, imagePreview?.dataUrl)
    setImagePreview(null)
    setImageError('')

    setTyping(true)
    try {
      const body = { text }
      if (imagePreview) {
        body.image_base64 = imagePreview.dataUrl
        body.image_name = imagePreview.name
      }
      await client.post('/suvvy/message', body)
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

  const canSend = (input.trim() || imagePreview) && !typing

  return (
    <div className="ai-page">
      <div className="ai-header">
        <h1 className="page-title" style={{ margin: 0 }}>ИИ-АССИСТЕНТ</h1>
      </div>

      <div className="ai-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`ai-msg ai-msg--${msg.from}`}>
            <div className="ai-msg__bubble">
              {msg.imageUrl && (
                <img src={msg.imageUrl} alt="attachment" className="ai-msg__image" />
              )}
              {msg.text && (
                msg.from === 'ai'
                  ? <ReactMarkdown>{msg.text}</ReactMarkdown>
                  : <span>{msg.text}</span>
              )}
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

      {/* Image preview strip */}
      {imagePreview && (
        <div className="ai-image-preview">
          <img src={imagePreview.dataUrl} alt="preview" />
          <button className="ai-image-remove" onClick={removeImage}>✕</button>
        </div>
      )}
      {imageError && (
        <div className="ai-image-error">{imageError}</div>
      )}

      <div className="ai-input-bar">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button
          className="ai-attach"
          onClick={() => fileInputRef.current?.click()}
          disabled={typing}
          title="Прикрепить изображение"
        >
          📎
        </button>
        <textarea
          className="ai-input"
          placeholder="Напиши вопрос..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
        />
        <button className="ai-send" onClick={handleSend} disabled={!canSend}>
          →
        </button>
      </div>
    </div>
  )
}

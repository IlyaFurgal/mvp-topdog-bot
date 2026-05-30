import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import client from '../api/client'
import { useProfile } from '../context/ProfileContext'

const MAX_FILE_BYTES = 15 * 1024 * 1024  // 15 МБ

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
const POLL_MAX_ATTEMPTS = 40  // ~60 секунд

const API_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')
  : ''

function resolveImagePath(imagePath) {
  if (!imagePath) return null
  if (imagePath.startsWith('http')) return imagePath
  return `${API_BASE}${imagePath}`
}

export default function AiPage() {
  const { tone, profile } = useProfile()
  const name = profile?.preferred_name || ''

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [filePreview, setFilePreview] = useState(null)
  const [fileError, setFileError] = useState('')
  const bottomRef = useRef(null)
  const pollRef = useRef(null)
  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)

  // Всегда загружаем историю при монтировании
  useEffect(() => {
    async function fetchHistory() {
      try {
        const { data } = await client.get('/suvvy/history')
        const history = (data.messages ?? []).filter((m) => m.text?.trim())
        if (history.length > 0) {
          setMessages(
            history.map((m) => ({
              id: m.id,
              from: m.role,
              text: m.text,
              imagePath: resolveImagePath(m.image_path),
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

  function addMessage(from, text, imagePath) {
    if (!text?.trim()) return  // не добавляем пустые сообщения
    setMessages((m) => [...m, { id: Date.now() + Math.random(), from, text, imagePath }])
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
          data.messages.forEach((text) => {
            if (text?.trim()) addMessage('ai', text)
          })
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
    setFileError('')

    if (file.size > MAX_FILE_BYTES) {
      setFileError('Файл слишком большой. Максимум 15 МБ.')
      e.target.value = ''
      return
    }

    const isPdf = file.type === 'application/pdf'
    const reader = new FileReader()
    reader.onload = (ev) =>
      setFilePreview({ dataUrl: ev.target.result, name: file.name, isPdf })
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function removeFile() {
    setFilePreview(null)
    setFileError('')
  }

  function handleTextareaChange(e) {
    setInput(e.target.value)
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
    }
  }

  async function handleSend() {
    const text = input.trim()
    if (!text && !filePreview) return
    if (typing) return

    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = ''

    const previewImageUrl = filePreview && !filePreview.isPdf ? filePreview.dataUrl : null
    const previewText = filePreview?.isPdf
      ? (text ? `${text}\n📄 ${filePreview.name}` : `📄 ${filePreview.name}`)
      : text

    // Добавляем сообщение с уникальным id для обновления статуса
    const msgId = Date.now() + Math.random()
    const isPhotoMsg = !!(filePreview && !filePreview.isPdf)
    setMessages((prev) => [
      ...prev,
      { id: msgId, from: 'user', text: previewText, imagePath: previewImageUrl, retryText: text },
    ])
    scrollToBottom()

    const capturedFile = filePreview
    setFilePreview(null)
    setFileError('')

    setTyping(true)
    try {
      const body = { text }
      if (capturedFile) {
        if (capturedFile.isPdf) {
          const pure = capturedFile.dataUrl.split(',')[1]
          body.pdf_base64 = pure
          body.pdf_name = capturedFile.name
        } else {
          body.image_base64 = capturedFile.dataUrl
          body.image_name = capturedFile.name
        }
      }
      await client.post('/suvvy/message', body)
      startPolling()
    } catch (e) {
      setTyping(false)
      // Помечаем сообщение как неотправленное вместо добавления ошибки ИИ
      setMessages((prev) =>
        prev.map((m) => m.id === msgId ? { ...m, status: 'failed' } : m)
      )
      // Для фото — дополнительная подсказка
      if (isPhotoMsg) {
        setFileError('Не удалось загрузить фото. Попробуй ещё раз.')
      }
      const detail = e?.response?.data?.detail
      if (detail === 'Suvvy not configured') {
        addMessage('ai', 'ИИ-ассистент ещё не подключён.')
      }
    }
  }

  async function handleRetry(msg) {
    if (typing) return
    // Снимаем статус failed, пробуем отправить текст заново
    setMessages((prev) =>
      prev.map((m) => m.id === msg.id ? { ...m, status: 'retrying' } : m)
    )
    setTyping(true)
    try {
      await client.post('/suvvy/message', { text: msg.retryText || msg.text || '' })
      setMessages((prev) =>
        prev.map((m) => m.id === msg.id ? { ...m, status: undefined, retryText: undefined } : m)
      )
      startPolling()
    } catch (_) {
      setTyping(false)
      setMessages((prev) =>
        prev.map((m) => m.id === msg.id ? { ...m, status: 'failed' } : m)
      )
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const canSend = (input.trim() || filePreview) && !typing

  return (
    <div className="ai-page">
      <div className="ai-header">
        <h1 className="page-title" style={{ margin: 0 }}>ИИ-АССИСТЕНТ</h1>
      </div>

      <div className="ai-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`ai-msg ai-msg--${msg.from}`}>
            <div className="ai-msg__bubble">
              {msg.imagePath && (
                <img src={msg.imagePath} alt="attachment" className="ai-msg__image" />
              )}
              {msg.text && (
                msg.from === 'ai'
                  ? <ReactMarkdown>{msg.text}</ReactMarkdown>
                  : <span>{msg.text}</span>
              )}
            </div>
            {msg.status === 'failed' && (
              <div className="ai-msg__failed">
                <span className="ai-msg__failed-label">Не отправлено</span>
                <button
                  className="ai-msg__retry"
                  onClick={() => handleRetry(msg)}
                  disabled={typing}
                >
                  Повторить
                </button>
              </div>
            )}
            {msg.status === 'retrying' && (
              <div className="ai-msg__failed">
                <span className="ai-msg__failed-label">Отправляем...</span>
              </div>
            )}
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

      {/* File preview strip */}
      {filePreview && (
        <div className="ai-image-preview">
          {filePreview.isPdf ? (
            <div className="ai-pdf-preview">
              <span className="ai-pdf-icon">📄</span>
              <span className="ai-pdf-name">{filePreview.name}</span>
            </div>
          ) : (
            <img src={filePreview.dataUrl} alt="preview" />
          )}
          <button className="ai-image-remove" onClick={removeFile}>✕</button>
        </div>
      )}
      {fileError && (
        <div className="ai-image-error">{fileError}</div>
      )}

      <div className="ai-input-bar">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button
          className="ai-attach"
          onClick={() => fileInputRef.current?.click()}
          disabled={typing}
          title="Прикрепить файл"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <textarea
          ref={textareaRef}
          className="ai-input"
          placeholder="Напиши вопрос..."
          value={input}
          onChange={handleTextareaChange}
          onKeyDown={handleKey}
        />
        <button className="ai-send" onClick={handleSend} disabled={!canSend}>
          →
        </button>
      </div>
    </div>
  )
}

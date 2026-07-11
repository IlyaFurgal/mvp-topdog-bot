import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import client from '../api/client'
import { createSavedMessage } from '../api/savedMessages'
import { useChat } from '../context/ChatContext'
import iconCopy from '../assets/Копировать.png'
import iconSave from '../assets/Сохранить.png'

const MAX_FILE_BYTES    = 15 * 1024 * 1024   // 15 МБ — жёсткий лимит
const RESIZE_THRESHOLD  =  5 * 1024 * 1024   // 5 МБ  — порог ресайза изображений
const MAX_DIMENSION     = 1920                // px    — максимальная сторона после ресайза
const MAX_REC_SECONDS   = 120                 // 2 минуты — лимит записи голоса
const MIN_HOLD_MS       = 400                 // короче этого — случайный тап, не запись

async function resizeImageIfNeeded(file) {
  if (file.size <= RESIZE_THRESHOLD) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (ev) =>
        resolve({ dataUrl: ev.target.result, name: file.name, isPdf: false })
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const { width, height } = img
      const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height, 1)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg'
      resolve({ dataUrl, name: newName, isPdf: false })
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('load')) }
    img.src = objectUrl
  })
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function formatRecTime(secs) {
  return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
}

export default function AiPage() {
  const { messages, setMessages, typing, setTyping, historyLoaded, addMessage, startPolling } = useChat()

  // ── Chat state ───────────────────────────────────────
  const [input, setInput] = useState('')
  const [filePreview, setFilePreview] = useState(null)
  const [fileError, setFileError] = useState('')
  const [copiedId, setCopiedId] = useState(null)
  const [savedId, setSavedId] = useState(null)
  const [attachOpen, setAttachOpen] = useState(false)

  // ── Voice recording state ────────────────────────────
  const [recording, setRecording] = useState(false)
  const [recSeconds, setRecSeconds] = useState(0)
  const [voiceError, setVoiceError] = useState('')

  // ── Refs ─────────────────────────────────────────────
  const bottomRef         = useRef(null)
  const fileInputRef      = useRef(null)   // ФАЙЛЫ (image + pdf)
  const cameraInputRef    = useRef(null)   // КАМЕРА (capture)
  const photoInputRef     = useRef(null)   // ФОТО (gallery)
  const textareaRef       = useRef(null)
  const mediaRecorderRef  = useRef(null)
  const audioChunksRef    = useRef([])
  const recTimerRef       = useRef(null)
  const streamRef         = useRef(null)
  const stoppingRef       = useRef(false)   // guard against double stop
  // Synchronous guard against a double-tap firing handleSend/handleRetry
  // twice before the `typing` state re-render lands — `typing` alone has
  // a brief race window since it only updates on the next render.
  const sendingRef        = useRef(false)
  const micHoldRef        = useRef(false)   // true while finger is held on mic
  const micPressStartRef  = useRef(0)       // Date.now() at pointerdown — guards against a plain tap

  // Scroll to bottom on initial load and whenever new messages arrive
  // (including ones appended by the background poll while this page is mounted)
  useEffect(() => {
    if (historyLoaded) scrollToBottom()
  }, [historyLoaded, messages.length])

  // Cleanup on unmount — recording only; chat polling lives in ChatContext
  // and must keep running across tab switches, so it's not stopped here.
  useEffect(() => {
    return () => {
      if (recTimerRef.current) clearInterval(recTimerRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom when attach menu opens so messages aren't hidden behind it
  useEffect(() => {
    if (attachOpen) scrollToBottom()
  }, [attachOpen])

  // Close attach menu on outside click
  useEffect(() => {
    if (!attachOpen) return
    const close = (e) => {
      // не закрывать, если клик по кнопке-триггеру или внутри меню
      if (e.target.closest?.('.ai-attach') || e.target.closest?.('.ai-attach-menu')) return
      setAttachOpen(false)
    }
    // вешаем на следующий тик, чтобы текущий клик-открытие не долетел до listener'а
    const id = setTimeout(() => document.addEventListener('click', close), 0)
    return () => { clearTimeout(id); document.removeEventListener('click', close) }
  }, [attachOpen])

  // ── Helpers ──────────────────────────────────────────
  function handleCopy(id, text) {
    navigator.clipboard?.writeText(text).catch(() => {})
    setCopiedId(id)
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500)
  }

  function handleSaveMessage(id, text) {
    createSavedMessage(text).catch(() => {})
    setSavedId(id)
    setTimeout(() => setSavedId((prev) => (prev === id ? null : prev)), 1500)
  }

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  // ── File/photo handling ───────────────────────────────
  async function processFile(file) {
    setFileError('')

    if (filePreview) {
      setFileError('Можно одно фото за раз.')
      return
    }

    if (file.size > MAX_FILE_BYTES) {
      setFileError('Файл слишком большой. Максимум 15 МБ.')
      return
    }

    if (file.type === 'application/pdf') {
      const reader = new FileReader()
      reader.onload = (ev) =>
        setFilePreview({ dataUrl: ev.target.result, name: file.name, isPdf: true })
      reader.onerror = () => setFileError('Не удалось прочитать PDF.')
      reader.readAsDataURL(file)
      return
    }

    try {
      const result = await resizeImageIfNeeded(file)
      setFilePreview(result)
    } catch (_) {
      setFileError('Не удалось обработать изображение. Попробуй ещё раз.')
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    processFile(file)
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          e.preventDefault()
          processFile(file)
          break
        }
      }
    }
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

  // ── Send text / file ──────────────────────────────────
  async function handleSend() {
    const text = input.trim()
    if (!text && !filePreview) return
    if (typing || sendingRef.current) return
    sendingRef.current = true

    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = ''

    const previewImageUrl = filePreview && !filePreview.isPdf ? filePreview.dataUrl : null
    const previewText = filePreview?.isPdf
      ? (text ? `${text}\n📄 ${filePreview.name}` : `📄 ${filePreview.name}`)
      : text

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
          body.pdf_base64 = capturedFile.dataUrl.split(',')[1]
          body.pdf_name = capturedFile.name
        } else {
          body.image_base64 = capturedFile.dataUrl
          body.image_name = capturedFile.name
        }
      }
      const since = Date.now() / 1000
      await client.post('/suvvy/message', body)
      startPolling(since)
    } catch (e) {
      setTyping(false)
      setMessages((prev) =>
        prev.map((m) => m.id === msgId ? { ...m, status: 'failed' } : m)
      )
      if (isPhotoMsg) setFileError('Не удалось загрузить фото. Попробуй ещё раз.')
      const detail = e?.response?.data?.detail
      if (detail === 'Suvvy not configured') addMessage('ai', 'ИИ-ассистент ещё не подключён.')
    } finally {
      sendingRef.current = false
    }
  }

  async function handleRetry(msg) {
    if (typing || sendingRef.current) return
    sendingRef.current = true
    setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, status: 'retrying' } : m))
    setTyping(true)
    try {
      const since = Date.now() / 1000
      await client.post('/suvvy/message', { text: msg.retryText || msg.text || '' })
      setMessages((prev) =>
        prev.map((m) => m.id === msg.id ? { ...m, status: undefined, retryText: undefined } : m)
      )
      startPolling(since)
    } catch (_) {
      setTyping(false)
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, status: 'failed' } : m))
    } finally {
      sendingRef.current = false
    }
  }

  // ── Hold-to-record handlers ───────────────────────────
  function handleMicPointerDown(e) {
    e.preventDefault()
    if (typing) return
    micHoldRef.current = true
    micPressStartRef.current = Date.now()
    startRecording()
  }

  function handleMicPointerUp() {
    if (!micHoldRef.current) return
    micHoldRef.current = false
    if (!mediaRecorderRef.current) return
    // A plain tap (not a hold) would otherwise capture a near-empty clip
    // that fails on the backend and shows up as an instant error bubble —
    // treat anything shorter than MIN_HOLD_MS as a mis-tap and just cancel.
    if (Date.now() - micPressStartRef.current < MIN_HOLD_MS) {
      cancelRecording()
      return
    }
    stopAndSend()
  }

  function handleMicPointerLeave() {
    if (!micHoldRef.current) return
    micHoldRef.current = false
    if (mediaRecorderRef.current) cancelRecording()
  }

  // ── Voice recording ───────────────────────────────────
  async function startRecording() {
    if (typing || recording) return
    setVoiceError('')

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      setVoiceError(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Разреши доступ к микрофону в настройках'
          : 'Не удалось записать голосовое, попробуй ещё раз'
      )
      return
    }

    // The finger may already be off the button by the time getUserMedia
    // resolves (a quick tap) — don't start an orphaned recording nobody
    // will stop until the 2-minute auto-cutoff.
    if (!micHoldRef.current) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }

    streamRef.current = stream
    audioChunksRef.current = []
    stoppingRef.current = false

    // Выбираем наилучший поддерживаемый формат
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', '']
      .find((m) => !m || MediaRecorder.isTypeSupported(m)) ?? ''

    let recorder
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
    } catch {
      stream.getTracks().forEach((t) => t.stop())
      setVoiceError('Не удалось запустить запись.')
      return
    }

    mediaRecorderRef.current = recorder
    recorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data)
    })
    recorder.start(250)

    setRecording(true)
    setRecSeconds(0)

    recTimerRef.current = setInterval(() => {
      setRecSeconds((prev) => {
        if (prev + 1 >= MAX_REC_SECONDS) {
          // Авто-стоп через 0ms чтобы не вызывать setState внутри setState
          setTimeout(() => stopAndSend(), 0)
          return prev
        }
        return prev + 1
      })
    }, 1000)
  }

  async function stopAndSend() {
    if (stoppingRef.current) return
    stoppingRef.current = true

    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null }
    setRecording(false)
    setRecSeconds(0)

    const recorder = mediaRecorderRef.current
    mediaRecorderRef.current = null

    if (!recorder || recorder.state === 'inactive') {
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null }
      stoppingRef.current = false
      return
    }

    // Ждём финального flush данных
    await new Promise((resolve) => {
      recorder.addEventListener('stop', resolve, { once: true })
      recorder.stop()
    })

    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null }

    const chunks = audioChunksRef.current
    audioChunksRef.current = []
    stoppingRef.current = false

    if (chunks.length === 0) {
      setVoiceError('Не удалось записать голосовое, попробуй ещё раз')
      return
    }

    const mimeType = chunks[0].type || 'audio/webm'
    const blob = new Blob(chunks, { type: mimeType })

    if (blob.size > MAX_FILE_BYTES) {
      setVoiceError('Запись слишком длинная. Максимум 15 МБ.')
      return
    }

    await sendVoiceBlob(blob, mimeType)
  }

  function cancelRecording() {
    if (stoppingRef.current) return
    stoppingRef.current = true

    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null }
    setRecording(false)
    setRecSeconds(0)

    const recorder = mediaRecorderRef.current
    mediaRecorderRef.current = null
    audioChunksRef.current = []

    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop() } catch (_) {}
    }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null }
    stoppingRef.current = false
  }

  async function sendVoiceBlob(blob, mimeType) {
    if (sendingRef.current) return
    sendingRef.current = true

    const dataUrl = await blobToDataUrl(blob)
    const ext = (mimeType.split('/')[1] ?? 'webm').split(';')[0]
    const filename = `voice_${Date.now()}.${ext}`

    const msgId = Date.now() + Math.random()
    setMessages((prev) => [
      ...prev,
      { id: msgId, from: 'user', text: '🎤 Голосовое сообщение', audioUrl: dataUrl, retryText: '' },
    ])
    scrollToBottom()

    setTyping(true)
    try {
      const since = Date.now() / 1000
      await client.post('/suvvy/message', {
        text: '',
        audio_base64: dataUrl,
        audio_name: filename,
      })
      startPolling(since)
    } catch (e) {
      setTyping(false)
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, status: 'failed' } : m))
      const detail = e?.response?.data?.detail
      if (detail === 'Suvvy not configured') {
        addMessage('ai', 'ИИ-ассистент ещё не подключён.')
      } else if (detail?.includes('too large') || e?.response?.status === 413) {
        setVoiceError('Голосовое слишком длинное. Попробуй покороче.')
      } else {
        setVoiceError('Не удалось отправить голосовое. Попробуй ещё раз.')
      }
    } finally {
      sendingRef.current = false
    }
  }

  const canSend = (input.trim() || filePreview) && !typing

  // ── Render ────────────────────────────────────────────
  return (
    <div className="ai-page">
      <div className="ai-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`ai-msg ai-msg--${msg.from}`}>
            <div className="ai-msg__bubble">
              {msg.imagePath && (
                <img src={msg.imagePath} alt="attachment" className="ai-msg__image" />
              )}
              {msg.audioUrl && (
                <audio controls src={msg.audioUrl} className="ai-msg__audio" />
              )}
              {msg.text && (
                msg.from === 'ai'
                  ? <ReactMarkdown>{msg.text}</ReactMarkdown>
                  : <span>{msg.text}</span>
              )}
              {msg.from === 'ai' && msg.text && (
                <div className="ai-msg__actions">
                  <button
                    className="ai-msg__copy"
                    onClick={() => handleCopy(msg.id, msg.text)}
                    title="Копировать"
                  >
                    {copiedId === msg.id ? '✓' : <img src={iconCopy} alt="Копировать" className="ai-msg__icon" />}
                  </button>
                  <button
                    className="ai-msg__save"
                    onClick={() => handleSaveMessage(msg.id, msg.text)}
                    title="Сохранить в программы"
                  >
                    {savedId === msg.id ? '✓' : <img src={iconSave} alt="Сохранить" className="ai-msg__icon" />}
                  </button>
                </div>
              )}
              {msg.from === 'user' && msg.text && (
                <div className="ai-msg__actions">
                  <button
                    className="ai-msg__copy"
                    onClick={() => handleCopy(msg.id, msg.text)}
                    title="Копировать"
                  >
                    {copiedId === msg.id ? '✓' : <img src={iconCopy} alt="Копировать" className="ai-msg__icon" />}
                  </button>
                </div>
              )}
            </div>
            {msg.status === 'failed' && (
              <div className="ai-msg__failed">
                <span className="ai-msg__failed-label">Не отправлено</span>
                <button className="ai-msg__retry" onClick={() => handleRetry(msg)} disabled={typing}>
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
        {messages.length === 1 && messages[0].from === 'ai' && historyLoaded && !typing && (
          <div className="ai-chips">
            {[
              'Как поднять энергию?',
              'Составь план тренировок на неделю',
              'Что приготовить на ужин в рамках КБЖУ',
              'Болит колено после бега — что делать',
            ].map((text) => (
              <button
                key={text}
                className="ai-chip"
                onClick={() => {
                  setInput(text)
                  setTimeout(() => textareaRef.current?.focus(), 0)
                }}
              >
                {text}
              </button>
            ))}
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
      {fileError && <div className="ai-image-error">{fileError}</div>}
      {voiceError && <div className="ai-voice-error">{voiceError}</div>}

      {/* Attach menu — static, pushes input bar down, doesn't overlay messages */}
      {attachOpen && !recording && (
        <div className="ai-attach-menu">
              <button
                className="ai-attach-menu__item"
                onClick={() => { setAttachOpen(false); cameraInputRef.current?.click() }}
              >
                <span className="ai-attach-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </span>
                <span>КАМЕРА</span>
              </button>
              <button
                className="ai-attach-menu__item"
                onClick={() => { setAttachOpen(false); photoInputRef.current?.click() }}
              >
                <span className="ai-attach-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                </span>
                <span>ФОТО</span>
              </button>
              <button
                className="ai-attach-menu__item"
                onClick={() => { setAttachOpen(false); fileInputRef.current?.click() }}
              >
                <span className="ai-attach-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </span>
                <span>ФАЙЛЫ</span>
              </button>
            </div>
          )}

      {/* Recording bar or input bar */}
      {recording ? (
        <div className="ai-record-bar">
          <div className="ai-record-bar__inner">
            <button className="ai-record-cancel" onClick={cancelRecording} title="Отмена">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <div className="ai-record-indicator">
              <span className="ai-record-dot" />
              <span className="ai-record-timer">{formatRecTime(recSeconds)}</span>
              <span className="ai-record-limit">/ {formatRecTime(MAX_REC_SECONDS)}</span>
            </div>
            <button className="ai-record-send" onClick={stopAndSend}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <div className="ai-input-bar">
          {/* three hidden file inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <input
            ref={photoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <div className="ai-input-bar__inner">
            <button
              className="ai-attach"
              onClick={() => setAttachOpen((v) => !v)}
              disabled={typing}
              title="Прикрепить"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <textarea
              ref={textareaRef}
              rows={1}
              className="ai-input"
              placeholder="СПРОСИТЬ ИИ-АССИСТЕНТА"
              value={input}
              onChange={handleTextareaChange}
              onPaste={handlePaste}
            />
            <button
              className="ai-mic"
              onPointerDown={handleMicPointerDown}
              onPointerUp={handleMicPointerUp}
              onPointerLeave={handleMicPointerLeave}
              disabled={typing}
              title="Удержи для записи"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M19 10a7 7 0 0 1-14 0" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="8"  y1="22" x2="16" y2="22" />
              </svg>
            </button>
            <button className="ai-send" onClick={handleSend} disabled={!canSend}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

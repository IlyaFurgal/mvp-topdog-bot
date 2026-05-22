import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

// UTC-12 … UTC+14
const UTC_OFFSETS = []
for (let i = -12; i <= 14; i++) {
  const label = i === 0 ? 'UTC ±0' : i > 0 ? `UTC +${i}` : `UTC ${i}`
  const value = i === 0 ? 'UTC+0' : i > 0 ? `UTC+${i}` : `UTC${i}`
  UTC_OFFSETS.push({ value, label })
}

/** Derive UTC+N string from the browser's current local time. */
function getLocalUtcStr() {
  const offsetMin = -new Date().getTimezoneOffset() // positive = east of UTC
  const offsetH   = offsetMin / 60
  const h         = Math.round(offsetH) // handle half-hour zones gracefully
  if (h === 0) return 'UTC+0'
  return h > 0 ? `UTC+${h}` : `UTC${h}`
}

// ── Detect mode ───────────────────────────────────────────────────────────────

function DetectMode() {
  const tz  = getLocalUtcStr()
  const tg  = window.Telegram?.WebApp

  useEffect(() => {
    tg?.ready()
    tg?.expand()
    const timer = setTimeout(() => {
      tg?.sendData(tz)
      tg?.close()
    }, 600)
    return () => clearTimeout(timer)
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
      <div style={{
        fontSize: 22,
        fontWeight: 800,
        color: '#C8FF00',
        letterSpacing: '0.02em',
        marginTop: 4,
      }}>
        {tz}
      </div>
    </div>
  )
}

// ── Select mode ───────────────────────────────────────────────────────────────

function SelectMode() {
  const tg             = window.Telegram?.WebApp
  const localTz        = getLocalUtcStr()
  const [selected, setSelected] = useState(localTz)
  const selectedRef    = useRef(null)

  useEffect(() => {
    tg?.ready()
    tg?.expand()
    // Scroll selected item into view
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
      padding: '24px 16px 0',
      boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          fontSize: 20,
          fontWeight: 700,
          color: '#fff',
          marginBottom: 4,
        }}>
          🌍 Часовой пояс
        </div>
        <div style={{ fontSize: 12, color: '#888' }}>
          Выбери свой UTC-offset
        </div>
      </div>

      {/* Scroll list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        marginBottom: 16,
        WebkitOverflowScrolling: 'touch',
      }}>
        {UTC_OFFSETS.map(({ value, label }) => {
          const isSelected = selected === value
          return (
            <div
              key={value}
              ref={isSelected ? selectedRef : null}
              onClick={() => setSelected(value)}
              style={{
                padding: '13px 16px',
                borderRadius: 8,
                marginBottom: 6,
                background: isSelected ? '#C8FF00' : '#1e1e1e',
                color:      isSelected ? '#000'    : '#fff',
                fontWeight: isSelected ? 700       : 400,
                fontSize:   15,
                cursor:     'pointer',
                border:     isSelected ? 'none' : '1px solid #2a2a2a',
                transition: 'background 120ms',
              }}
            >
              {label}
            </div>
          )
        })}
        {/* bottom padding so last item clears the button */}
        <div style={{ height: 80 }} />
      </div>

      {/* Sticky confirm button */}
      <div style={{
        position: 'sticky',
        bottom: 0,
        background: '#111',
        paddingBottom: 24,
        paddingTop: 8,
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

// ── Entry point ───────────────────────────────────────────────────────────────

export default function TimezonePage() {
  const [params] = useSearchParams()
  const action   = params.get('action') || 'detect'

  return action === 'detect' ? <DetectMode /> : <SelectMode />
}

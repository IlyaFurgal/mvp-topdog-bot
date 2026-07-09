import { useEffect, useRef, useState } from 'react'
import client from '../api/client'
import { getTodayTrackers } from '../api/trackers'
import mvpLogo from '../assets/mvp-logo-green.png'
import { useProfile } from '../context/ProfileContext'
import { useTelegram } from '../hooks/useTelegram'
import { useUniformChipWidth } from '../hooks/useUniformChipWidth'
import ScrollPicker from './ScrollPicker'
import TrackerModal from './TrackerModal'

const AVATAR_MAX_DIMENSION = 300

function HeightModal({ initialHeight, onClose, onSaved }) {
  const [height, setHeight] = useState(initialHeight ?? 170)
  const [saving, setSaving] = useState(false)
  const overlayRef = useRef(null)

  async function handleSave() {
    setSaving(true)
    try {
      await client.patch('/profile/me', { height })
      onSaved(height)
    } catch (_) {
      setSaving(false)
    }
  }

  function handleOverlay(e) {
    if (saving) return
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={handleOverlay}>
      <div className="modal-sheet">
        <div className="modal-header">
          <span className="modal-title">РОСТ (ДЛЯ ИМТ)</span>
          <button className="modal-close" onClick={onClose} disabled={saving}>✕</button>
        </div>
        <div className="tracker-input">
          <ScrollPicker value={height} onChange={setHeight} min={100} max={230} step={1} decimals={0} unit="см" />
        </div>
        <button className="btn btn-accent" onClick={handleSave} disabled={saving}>
          {saving ? 'СОХРАНЯЕМ...' : 'СОХРАНИТЬ'}
        </button>
      </div>
    </div>
  )
}

function fmtNum(value, decimals) {
  return Math.abs(value % 1) < 0.001 ? value.toFixed(0) : value.toFixed(decimals)
}

function formatValue(type, data) {
  if (!data) return null
  const { value } = data
  if (type === 'weight') return `${fmtNum(value, 1)} КГ`
  if (type === 'water') {
    return value >= 1000 ? `${fmtNum(value / 1000, 1)} Л.` : `${Math.round(value)} МЛ`
  }
  if (type === 'sleep') {
    const h = Math.floor(value)
    const m = Math.round((value - h) * 60)
    return m > 0 ? `${h} Ч. ${m} М.` : `${h} Ч.`
  }
  if (type === 'calories') return new Intl.NumberFormat('ru-RU').format(Math.round(value))
  return null
}

function formatBmi(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null
  const heightM = heightCm / 100
  const bmi = weightKg / (heightM * heightM)
  return fmtNum(bmi, 1)
}

function resizeAvatar(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const { width, height } = img
      const ratio = Math.min(AVATAR_MAX_DIMENSION / width, AVATAR_MAX_DIMENSION / height, 1)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('load')) }
    img.src = objectUrl
  })
}

export default function MyDataCard({ onEditClick, onDataChanged }) {
  const { user } = useTelegram()
  const { profile, subscriptionType, refreshProfile } = useProfile()

  const [customAvatar, setCustomAvatar] = useState(null)  // optimistic preview while the upload is in flight
  const [imgFailed, setImgFailed] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef(null)

  const [trackers, setTrackers] = useState({ weight: null, water: null, sleep: null, calories: null, pulse: null })
  const [activeTracker, setActiveTracker] = useState(null)
  const [heightModalOpen, setHeightModalOpen] = useState(false)
  const [calorieLimit, setCalorieLimit] = useState(null)

  async function load() {
    try {
      const trackData = await getTodayTrackers()
      const { calorie_limit, calories_meals, ...rest } = trackData
      setTrackers(rest)
      setCalorieLimit(calorie_limit ?? null)
    } catch (_) {}
  }

  useEffect(() => { load() }, [])

  const displayName = profile?.preferred_name
    || (user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : 'Пользователь')

  const initials = (() => {
    const words = displayName.trim().split(/\s+/)
    return words.length >= 2
      ? (words[0][0] + words[1][0]).toUpperCase()
      : displayName.slice(0, 2).toUpperCase()
  })()

  const tierLabel = subscriptionType === 'pro' ? 'PRO' : subscriptionType === 'plus' ? 'PLUS' : '—'
  const bmi = formatBmi(trackers.weight?.value ?? profile?.weight, profile?.height)
  const pulseValue = trackers.pulse?.value

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const dataUrl = await resizeAvatar(file)
      setCustomAvatar(dataUrl)  // instant local preview
      setUploadingAvatar(true)
      await client.post('/profile/avatar', { image_base64: dataUrl })
      await refreshProfile()   // pulls the new avatar_url so it's there on every device from now on
    } catch (_) {
    } finally {
      setUploadingAvatar(false)
    }
  }

  const photoSrc = customAvatar || profile?.avatar_url || (!imgFailed ? user?.photo_url : null)

  const chipRef = useUniformChipWidth([
    tierLabel, formatValue('weight', trackers.weight), bmi,
    formatValue('calories', trackers.calories), formatValue('sleep', trackers.sleep),
    pulseValue, formatValue('water', trackers.water),
  ])

  return (
    <div className="my-data-card">
      <button className="my-data-header" onClick={onEditClick}>МОИ ДАННЫЕ</button>

      <div className="my-data-body">
        <div className="my-data-avatar-col">
          <div className="my-data-notch">
            <img src={mvpLogo} alt="MVP by Top Dog" className="my-data-tag" />
          </div>
          <div
            className="my-data-avatar-wrap"
            style={uploadingAvatar ? { opacity: 0.6 } : undefined}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="my-data-avatar-inner">
              {photoSrc ? (
                <img
                  src={photoSrc}
                  alt=""
                  className="my-data-avatar-img"
                  onError={() => setImgFailed(true)}
                />
              ) : (
                <div className="my-data-avatar-fallback">{initials}</div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handlePhotoChange}
            />
          </div>
        </div>

        <div className="my-data-grid" ref={chipRef}>
          <div className="data-row data-row--name skew-chip" onClick={onEditClick}>
            <span className="data-row__label">{displayName.toUpperCase()}</span>
            <span className="data-row__value"><span>{tierLabel}</span></span>
          </div>
          <div className="data-row skew-chip" onClick={() => setActiveTracker('weight')}>
            <span className="data-row__label">ВЕС</span>
            <span className="data-row__value"><span>{formatValue('weight', trackers.weight) ?? '—'}</span></span>
          </div>
          <div className="data-row skew-chip" onClick={() => setHeightModalOpen(true)}>
            <span className="data-row__label">ИМТ</span>
            <span className="data-row__value"><span>{bmi ?? '—'}</span></span>
          </div>
          <div className="data-row skew-chip" onClick={() => setActiveTracker('calories')}>
            <span className="data-row__label">КАЛОРИИ</span>
            <span className="data-row__value"><span>{formatValue('calories', trackers.calories) ?? '—'}</span></span>
          </div>
          <div className="data-row skew-chip" onClick={() => setActiveTracker('sleep')}>
            <span className="data-row__label">СОН</span>
            <span className="data-row__value"><span>{formatValue('sleep', trackers.sleep) ?? '—'}</span></span>
          </div>
          {profile?.resting_pulse_enabled && (
            <div className="data-row skew-chip" onClick={() => setActiveTracker('pulse')}>
              <span className="data-row__label">ПУЛЬС</span>
              <span className="data-row__value"><span>{pulseValue != null ? Math.round(pulseValue) : '—'}</span></span>
            </div>
          )}
          <div className="data-row skew-chip" onClick={() => setActiveTracker('water')}>
            <span className="data-row__label">ВОДА</span>
            <span className="data-row__value"><span>{formatValue('water', trackers.water) ?? '—'}</span></span>
          </div>
        </div>
      </div>

      {activeTracker && (
        <TrackerModal
          type={activeTracker}
          todayData={trackers[activeTracker]}
          calorieLimit={calorieLimit}
          onClose={() => setActiveTracker(null)}
          onSaved={() => { setActiveTracker(null); load(); onDataChanged?.() }}
        />
      )}

      {heightModalOpen && (
        <HeightModal
          initialHeight={profile?.height}
          onClose={() => setHeightModalOpen(false)}
          onSaved={() => { setHeightModalOpen(false); refreshProfile(); onDataChanged?.() }}
        />
      )}
    </div>
  )
}

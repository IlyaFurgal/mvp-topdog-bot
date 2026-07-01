import { useEffect, useRef, useState } from 'react'
import { getTodayCheckins } from '../api/checkins'
import { getTodayTrackers } from '../api/trackers'
import { useProfile } from '../context/ProfileContext'
import { useTelegram } from '../hooks/useTelegram'
import TrackerModal from './TrackerModal'

const AVATAR_STORAGE_KEY = 'topdog_custom_avatar'
const AVATAR_MAX_DIMENSION = 300

function formatValue(type, data) {
  if (!data) return null
  const { value } = data
  if (type === 'weight') return `${value.toFixed(1)} кг`
  if (type === 'water') {
    return value >= 1000 ? `${(value / 1000).toFixed(1)} л` : `${Math.round(value)} мл`
  }
  if (type === 'sleep') {
    const h = Math.floor(value)
    const m = Math.round((value - h) * 60)
    return m > 0 ? `${h}ч ${m}м` : `${h}ч`
  }
  if (type === 'calories') return `${Math.round(value)} ккал`
  return null
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

export default function MyDataCard({ onEditClick }) {
  const { user } = useTelegram()
  const { profile, subscriptionType } = useProfile()

  const [customAvatar, setCustomAvatar] = useState(() => localStorage.getItem(AVATAR_STORAGE_KEY))
  const [imgFailed, setImgFailed] = useState(false)
  const fileInputRef = useRef(null)

  const [trackers, setTrackers] = useState({ weight: null, water: null, sleep: null, calories: null })
  const [pulse, setPulse] = useState(null)
  const [activeTracker, setActiveTracker] = useState(null)

  async function load() {
    try {
      const [trackData, checkData] = await Promise.all([getTodayTrackers(), getTodayCheckins()])
      const { calorie_limit, calories_meals, ...rest } = trackData
      setTrackers(rest)
      setPulse(checkData?.morning?.data?.resting_pulse ?? null)
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

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const dataUrl = await resizeAvatar(file)
      localStorage.setItem(AVATAR_STORAGE_KEY, dataUrl)
      setCustomAvatar(dataUrl)
    } catch (_) {}
  }

  const photoSrc = customAvatar || (!imgFailed ? user?.photo_url : null)

  return (
    <div className="my-data-card">
      <button className="my-data-header" onClick={onEditClick}>МОИ ДАННЫЕ</button>

      <div className="my-data-body">
        <div className="my-data-avatar-wrap" onClick={() => fileInputRef.current?.click()}>
          <span className="my-data-avatar-tag">MVP</span>
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handlePhotoChange}
          />
        </div>

        <div className="my-data-grid">
          <div className="data-row" onClick={onEditClick}>
            <span className="data-row__label">{displayName.toUpperCase()}</span>
            <span className="data-row__value">{tierLabel}</span>
          </div>
          <div className="data-row" onClick={() => setActiveTracker('weight')}>
            <span className="data-row__label">ВЕС</span>
            <span className="data-row__value">{formatValue('weight', trackers.weight) ?? '—'}</span>
          </div>
          <div className="data-row" onClick={() => setActiveTracker('calories')}>
            <span className="data-row__label">КАЛОРИИ</span>
            <span className="data-row__value">{formatValue('calories', trackers.calories) ?? '—'}</span>
          </div>
          <div className="data-row" onClick={() => setActiveTracker('sleep')}>
            <span className="data-row__label">СОН</span>
            <span className="data-row__value">{formatValue('sleep', trackers.sleep) ?? '—'}</span>
          </div>
          <div className="data-row">
            <span className="data-row__label">ПУЛЬС</span>
            <span className="data-row__value">{pulse != null ? pulse : '—'}</span>
          </div>
          <div className="data-row" onClick={() => setActiveTracker('water')}>
            <span className="data-row__label">ВОДА</span>
            <span className="data-row__value">{formatValue('water', trackers.water) ?? '—'}</span>
          </div>
        </div>
      </div>

      {activeTracker && (
        <TrackerModal
          type={activeTracker}
          todayData={trackers[activeTracker]}
          onClose={() => setActiveTracker(null)}
          onSaved={() => { setActiveTracker(null); load() }}
        />
      )}
    </div>
  )
}

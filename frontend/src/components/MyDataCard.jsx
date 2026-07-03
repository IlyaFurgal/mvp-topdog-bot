import { useEffect, useRef, useState } from 'react'
import { getTodayCheckins } from '../api/checkins'
import { getTodayTrackers } from '../api/trackers'
import { useProfile } from '../context/ProfileContext'
import { useTelegram } from '../hooks/useTelegram'
import TrackerModal from './TrackerModal'

const AVATAR_STORAGE_KEY = 'topdog_custom_avatar'
const AVATAR_MAX_DIMENSION = 300

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
  const bmi = formatBmi(trackers.weight?.value ?? profile?.weight, profile?.height)

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
        <div className="my-data-avatar-col">
          <div className="my-data-avatar-wrap" onClick={() => fileInputRef.current?.click()}>
            <span className="my-data-tag"><b>MVP</b><i>BY TOP DOG</i></span>
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
        </div>

        <div className="my-data-grid">
          <div className="data-row data-row--name skew-chip" onClick={onEditClick}>
            <span className="data-row__label">{displayName.toUpperCase()}</span>
            <span className="data-row__value"><span>{tierLabel}</span></span>
          </div>
          <div className="data-row skew-chip" onClick={() => setActiveTracker('weight')}>
            <span className="data-row__label">ВЕС</span>
            <span className="data-row__value"><span>{formatValue('weight', trackers.weight) ?? '—'}</span></span>
          </div>
          <div className="data-row skew-chip">
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
          <div className="data-row skew-chip">
            <span className="data-row__label">ПУЛЬС</span>
            <span className="data-row__value"><span>{pulse != null ? pulse : '—'}</span></span>
          </div>
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
          onClose={() => setActiveTracker(null)}
          onSaved={() => { setActiveTracker(null); load() }}
        />
      )}
    </div>
  )
}

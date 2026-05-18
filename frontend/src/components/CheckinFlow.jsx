import { useState } from 'react'
import { saveCheckin } from '../api/checkins'
import { useProfile } from '../context/ProfileContext'

const STEPS = {
  morning: [
    {
      key: 'body_feeling',
      question: 'Как себя чувствуешь?',
      options: [
        { value: 'fresh', label: 'Свежий' },
        { value: 'slightly_tired', label: 'Немного устал' },
        { value: 'heavy', label: 'Тяжело' },
      ],
    },
    {
      key: 'sleep_quality',
      question: 'Как спал?',
      options: [
        { value: 'great', label: 'Отлично' },
        { value: 'normal', label: 'Нормально' },
        { value: 'bad', label: 'Плохо' },
      ],
    },
    {
      key: 'motivation',
      question: 'Уровень мотивации?',
      options: [
        { value: 'high', label: 'Высокий' },
        { value: 'medium', label: 'Средний' },
        { value: 'low', label: 'Низкий' },
      ],
    },
  ],
  post_workout: [
    {
      key: 'plan_completed',
      question: 'Выполнил план тренировки?',
      options: [
        { value: 'fully', label: 'Полностью' },
        { value: 'partially', label: 'Частично' },
        { value: 'not', label: 'Не выполнил' },
      ],
    },
    {
      key: 'plan_reason',
      question: 'Почему не до конца?',
      condition: (data) => data.plan_completed === 'partially' || data.plan_completed === 'not',
      options: [
        { value: 'tired', label: 'Устал' },
        { value: 'no_time', label: 'Не хватило времени' },
        { value: 'injury', label: 'Травма / боль' },
        { value: 'other', label: 'Другое' },
      ],
    },
    {
      key: 'rpe',
      question: 'Оцени нагрузку (RPE)',
      type: 'rpe',
    },
    {
      key: 'pain',
      question: 'Были боли или дискомфорт?',
      options: [
        { value: 'none', label: 'Нет' },
        { value: 'minor', label: 'Небольшой дискомфорт' },
        { value: 'pain', label: 'Была боль' },
      ],
    },
    {
      key: 'dizziness',
      question: 'Было головокружение?',
      condition: (data) => data.pain === 'pain',
      options: [
        { value: 'yes', label: 'Да' },
        { value: 'no', label: 'Нет' },
      ],
    },
  ],
  evening: [
    {
      key: 'day_rating',
      question: 'Как прошёл день?',
      options: [
        { value: 'good', label: 'Хорошо' },
        { value: 'okay', label: 'Нормально' },
        { value: 'hard', label: 'Тяжело' },
      ],
    },
    {
      key: 'energy',
      question: 'Уровень энергии сейчас?',
      options: [
        { value: 'high', label: 'Высокий' },
        { value: 'medium', label: 'Средний' },
        { value: 'low', label: 'Низкий' },
      ],
    },
    {
      key: 'recovery',
      question: 'Как восстановление?',
      options: [
        { value: 'great', label: 'Отлично' },
        { value: 'normal', label: 'Нормально' },
        { value: 'poor', label: 'Плохо' },
      ],
    },
  ],
}

const COMPLETION_MESSAGES = {
  soft: {
    morning: 'Отличное начало дня! Держись, всё получится.',
    post_workout: 'Тренировка засчитана! Ты молодец.',
    evening: 'Хороший день позади. Отдыхай!',
  },
  hard: {
    morning: 'Подъём принят. В работу!',
    post_workout: 'Чекин закрыт. Результат внесён.',
    evening: 'День закрыт. Восстанавливайся.',
  },
}

export default function CheckinFlow({ type, onClose }) {
  const { tone } = useProfile()
  const allSteps = STEPS[type]
  const [stepIndex, setStepIndex] = useState(0)
  const [data, setData] = useState({})
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [animating, setAnimating] = useState(false)

  const activeSteps = allSteps.filter(
    (s) => !s.condition || s.condition(data)
  )
  const currentStep = activeSteps[stepIndex]
  const totalSteps = activeSteps.length

  function handleSelect(value) {
    if (animating) return
    const newData = { ...data, [currentStep.key]: value }
    setData(newData)

    setAnimating(true)
    setTimeout(() => {
      setAnimating(false)
      if (stepIndex + 1 < activeSteps.length) {
        setStepIndex(stepIndex + 1)
      } else {
        finish(newData)
      }
    }, 250)
  }

  async function finish(finalData) {
    setSaving(true)
    try {
      await saveCheckin(type, finalData)
    } catch (_) {}
    setSaving(false)
    setDone(true)
    setTimeout(() => onClose(), 2000)
  }

  function handleBack() {
    if (stepIndex === 0) {
      onClose()
    } else {
      setStepIndex(stepIndex - 1)
    }
  }

  if (done) {
    const msg = COMPLETION_MESSAGES[tone]?.[type] ?? COMPLETION_MESSAGES.soft[type]
    return (
      <div className="checkin-flow checkin-flow--done">
        <div className="checkin-flow__completion">
          <div className="checkin-flow__check">✓</div>
          <p className="checkin-flow__msg">{msg}</p>
        </div>
      </div>
    )
  }

  if (!currentStep) return null

  return (
    <div className="checkin-flow">
      <div className="checkin-flow__header">
        <button className="checkin-flow__back" onClick={handleBack}>‹</button>
        <div className="checkin-flow__progress">
          {activeSteps.map((_, i) => (
            <div
              key={i}
              className={`checkin-flow__dot ${i <= stepIndex ? 'checkin-flow__dot--active' : ''}`}
            />
          ))}
        </div>
        <span className="checkin-flow__counter">{stepIndex + 1}/{totalSteps}</span>
      </div>

      <div className={`checkin-flow__body ${animating ? 'checkin-flow__body--exit' : ''}`}>
        <p className="checkin-flow__question">{currentStep.question}</p>

        {currentStep.type === 'rpe' ? (
          <div className="checkin-flow__rpe">
            {[1,2,3,4,5,6,7,8,9,10].map((n) => (
              <button
                key={n}
                className={`checkin-flow__rpe-btn ${n >= 8 ? 'checkin-flow__rpe-btn--high' : n >= 5 ? 'checkin-flow__rpe-btn--mid' : ''}`}
                onClick={() => handleSelect(n)}
              >
                {n}
              </button>
            ))}
          </div>
        ) : (
          <div className="checkin-flow__options">
            {currentStep.options.map((opt) => (
              <button
                key={opt.value}
                className="checkin-flow__option"
                onClick={() => handleSelect(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {saving && <div className="checkin-flow__saving">Сохраняем...</div>}
    </div>
  )
}

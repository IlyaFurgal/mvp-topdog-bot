import { useState } from 'react'
import { saveCheckin } from '../api/checkins'
import { useProfile } from '../context/ProfileContext'

const STEPS = {
  morning: [
    {
      key: 'resting_pulse',
      question: 'Пульс покоя (уд/мин)',
      type: 'number',
      hint: 'Измерь лёжа сразу после пробуждения: нащупай пульс, посчитай за 15 сек, умножь на 4',
      placeholder: 'Введи пульс...',
      min: 30,
      max: 200,
    },
    {
      key: 'body_feeling',
      question: 'Ощущение тела после сна',
      options: [
        { value: 'fresh',         label: 'Свежий' },
        { value: 'slightly_tired', label: 'Немного устал' },
        { value: 'heavy',         label: 'Тяжело' },
        { value: 'sick',          label: 'Болею' },
      ],
    },
    {
      key: 'sleep_quality',
      question: 'Качество сна',
      options: [
        { value: 'great',  label: 'Выспался' },
        { value: 'normal', label: 'Средне' },
        { value: 'bad',    label: 'Плохо' },
      ],
    },
    {
      key: 'mood',
      question: 'Настроение прямо сейчас',
      options: [
        { value: 'good',    label: 'Хорошее' },
        { value: 'neutral', label: 'Нейтральное' },
        { value: 'bad',     label: 'Плохое' },
      ],
    },
    {
      key: 'training_desire',
      question: 'Желание тренироваться сегодня',
      options: [
        { value: 'want',       label: 'Хочу' },
        { value: 'okay',       label: 'Нормально' },
        { value: 'no_desire',  label: 'Совсем не хочу' },
        { value: 'no_chance',  label: 'Нет возможности' },
      ],
    },
    {
      key: 'note',
      question: 'Хочешь чем-то поделиться?',
      type: 'text_optional',
      placeholder: 'Напиши заметку (необязательно)...',
    },
  ],

  post_workout: [
    {
      key: 'plan_completed',
      question: 'Выполнил план тренировки?',
      options: [
        { value: 'fully',     label: 'Полностью' },
        { value: 'partially', label: 'Частично' },
        { value: 'not',       label: 'Не выполнил' },
      ],
    },
    {
      key: 'plan_reason',
      question: 'Почему не до конца?',
      condition: (data) => data.plan_completed !== 'fully',
      options: [
        { value: 'no_time',   label: 'Не хватило времени' },
        { value: 'no_energy', label: 'Не хватило сил' },
        { value: 'sick',      label: 'Заболело' },
        { value: 'boring',    label: 'Скучно' },
        { value: 'other',     label: 'Другое' },
      ],
    },
    {
      key: 'rpe',
      question: 'Оцени нагрузку (RPE)',
      type: 'rpe',
    },
    {
      key: 'comparison',
      question: 'Сравнение с прошлой тренировкой',
      options: [
        { value: 'easier', label: 'Легче' },
        { value: 'same',   label: 'Так же' },
        { value: 'harder', label: 'Тяжелее' },
      ],
    },
    {
      key: 'pain',
      question: 'Болело что-то во время тренировки?',
      options: [
        { value: 'no',  label: 'Нет' },
        { value: 'yes', label: 'Да' },
      ],
    },
    {
      key: 'dizziness',
      question: 'Было головокружение, одышка не по нагрузке?',
      condition: (data) => data.pain === 'yes',
      options: [
        { value: 'no',  label: 'Нет' },
        { value: 'yes', label: 'Да' },
      ],
    },
    {
      key: 'satisfaction',
      question: 'Доволен тренировкой?',
      options: [
        { value: 'yes',    label: 'Да' },
        { value: 'mostly', label: 'В целом да' },
        { value: 'no',     label: 'Нет' },
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
        { value: 'high',   label: 'Высокий' },
        { value: 'medium', label: 'Средний' },
        { value: 'low',    label: 'Низкий' },
      ],
    },
    {
      key: 'recovery',
      question: 'Как восстановление?',
      options: [
        { value: 'great',  label: 'Отлично' },
        { value: 'normal', label: 'Нормально' },
        { value: 'poor',   label: 'Плохо' },
      ],
    },
  ],
}

const COMPLETION_MESSAGES = {
  soft: {
    morning:      'Отличное начало дня! Держись, всё получится.',
    post_workout: 'Тренировка засчитана! Ты молодец.',
    evening:      'Хороший день позади. Отдыхай!',
  },
  hard: {
    morning:      'Подъём принят. В работу!',
    post_workout: 'Чекин закрыт. Результат внесён.',
    evening:      'День закрыт. Восстанавливайся.',
  },
}

const MESSAGES = {
  soft: {
    morning: {
      care:    'Вижу, тебе сейчас непросто. Сегодня главное — поберечь себя и восстановиться, без геройства 💛',
      neutral: 'Принято! День только начинается — двигайся в своём темпе.',
      praise:  'Отличный настрой с утра! Используй эту энергию по полной 💪',
    },
    post_workout: {
      care:    'Ты прислушался к телу — это правильно. Если что-то беспокоит, не игнорируй и дай себе восстановиться.',
      neutral: 'Тренировка засчитана. Каждый шаг важен, даже если сегодня было тяжело.',
      praise:  'Сильная работа! Ты выложился и довёл до конца — так и растёт результат 🔥',
    },
    evening: {
      care:    'День выдался тяжёлым. Дай себе отдых и восстановись — завтра будет легче 💛',
      neutral: 'День позади. Отдохни как следует.',
      praise:  'Отличный день! Хорошее восстановление — залог завтрашнего прогресса.',
    },
  },
  hard: {
    morning: {
      care:    'Тело просит паузы — услышь это. Сегодня восстановление, не нагрузка.',
      neutral: 'Подъём принят. В работу.',
      praise:  'Готов к бою. Используй этот настрой.',
    },
    post_workout: {
      care:    'Боль — сигнал, не игнорируй. Восстановись прежде чем грузить дальше.',
      neutral: 'Чекин закрыт. Результат внесён.',
      praise:  'План выполнен. Так держать — без поблажек.',
    },
    evening: {
      care:    'Тяжёлый день. Восстановление обязательно — это часть работы.',
      neutral: 'День закрыт. Восстанавливайся.',
      praise:  'День отработан чисто. Восстановление — и завтра снова в бой.',
    },
  },
}

function getCheckinMood(type, data) {
  if (type === 'morning') {
    if (
      data.body_feeling === 'sick' ||
      (data.body_feeling === 'heavy' && data.sleep_quality === 'bad') ||
      data.training_desire === 'no_desire' ||
      data.mood === 'bad' ||
      data.motivation === 'low'
    ) return 'care'
    if (
      data.body_feeling === 'fresh' &&
      (data.sleep_quality === 'great' || data.sleep_quality === 'normal') &&
      (data.mood === 'good' || data.motivation === 'high' || data.training_desire === 'want')
    ) return 'praise'
    return 'neutral'
  }

  if (type === 'post_workout') {
    if (
      data.pain === 'pain' ||
      data.dizziness === 'yes' ||
      (data.plan_completed === 'not' && data.plan_reason === 'injury')
    ) return 'care'
    if (
      data.plan_completed === 'fully' &&
      (data.satisfaction === 'yes' || data.satisfaction === 'mostly') &&
      data.pain !== 'pain'
    ) return 'praise'
    return 'neutral'
  }

  if (type === 'evening') {
    if (
      (data.recovery === 'poor' && data.energy === 'low') ||
      data.day_rating === 'hard'
    ) return 'care'
    if (
      data.day_rating === 'good' &&
      data.energy === 'high' &&
      data.recovery === 'great'
    ) return 'praise'
    return 'neutral'
  }

  return 'neutral'
}

function getCompletionMessage(type, data, tone) {
  const safeTone = tone === 'hard' ? 'hard' : 'soft'
  const mood = getCheckinMood(type, data) ?? 'neutral'
  return (
    MESSAGES[safeTone]?.[type]?.[mood] ??
    COMPLETION_MESSAGES[safeTone]?.[type] ??
    COMPLETION_MESSAGES.soft[type]
  )
}

export default function CheckinFlow({ type, onClose }) {
  const { tone } = useProfile()
  const allSteps = STEPS[type]
  const [stepIndex, setStepIndex] = useState(0)
  const [data, setData] = useState({})
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [inputVal, setInputVal] = useState('')

  const activeSteps = allSteps.filter((s) => !s.condition || s.condition(data))
  const currentStep = activeSteps[stepIndex]
  const totalSteps = activeSteps.length

  function advance(value, skipKey = false) {
    if (animating) return
    const newData = skipKey
      ? { ...data }
      : { ...data, [currentStep.key]: value }
    setData(newData)

    setAnimating(true)
    setTimeout(() => {
      setAnimating(false)
      setInputVal('')
      if (stepIndex + 1 < activeSteps.length) {
        setStepIndex(stepIndex + 1)
      } else {
        finish(newData)
      }
    }, 250)
  }

  function handleSelect(value) { advance(value) }

  function handleNumberSubmit() {
    const num = parseInt(inputVal, 10)
    const min = currentStep.min ?? 1
    const max = currentStep.max ?? 300
    if (isNaN(num) || num < min || num > max) return
    advance(num)
  }

  function handleTextSubmit() {
    const val = inputVal.trim()
    val ? advance(val) : advance(null, true)
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
      setInputVal('')
    }
  }

  if (done) {
    const msg = getCompletionMessage(type, data, tone)
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

        {currentStep.type === 'rpe' && (
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
        )}

        {currentStep.type === 'number' && (
          <div className="checkin-flow__number-wrap">
            {currentStep.hint && (
              <p className="checkin-flow__hint">{currentStep.hint}</p>
            )}
            <input
              type="number"
              className="checkin-flow__numfield"
              placeholder={currentStep.placeholder ?? ''}
              value={inputVal}
              min={currentStep.min}
              max={currentStep.max}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNumberSubmit()}
              autoFocus
            />
            <button
              className="btn btn-accent checkin-flow__number-submit"
              onClick={handleNumberSubmit}
              disabled={!inputVal}
            >
              Продолжить →
            </button>
          </div>
        )}

        {currentStep.type === 'text_optional' && (
          <div className="checkin-flow__text-wrap">
            <textarea
              className="checkin-flow__textfield"
              placeholder={currentStep.placeholder ?? ''}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              rows={4}
            />
            <div className="checkin-flow__text-actions">
              <button className="checkin-flow__text-skip" onClick={() => advance(null, true)}>
                Пропустить
              </button>
              <button className="btn btn-accent checkin-flow__text-submit" onClick={handleTextSubmit}>
                Сохранить →
              </button>
            </div>
          </div>
        )}

        {!currentStep.type && (
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

      {saving && (
        <div className="checkin-flow__saving-overlay">
          <div className="checkin-flow__spinner" />
          <p className="checkin-flow__saving-text">Сохраняем...</p>
        </div>
      )}
    </div>
  )
}

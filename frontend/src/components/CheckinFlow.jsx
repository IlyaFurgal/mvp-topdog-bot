import { useEffect, useState } from 'react'
import { patchCheckin, saveCheckin } from '../api/checkins'
import { useProfile } from '../context/ProfileContext'

const STEPS = {
  morning: [
    {
      key: 'resting_pulse',
      question: 'Пульс покоя (уд/мин)',
      type: 'number',
      hint: 'Измерь лёжа сразу после пробуждения: нащупай пульс, посчитай за 15 секунд количество ударов, умножь на 4. Это твой пульс покоя.',
      placeholder: 'Введи пульс...',
      min: 30,
      max: 200,
    },
    {
      key: 'feeling',
      question: 'Как твоё самочувствие?',
      options: [
        { value: 'excellent', label: 'Отличное', sentiment: 'positive' },
        { value: 'okay',      label: 'Удовлетворительное', sentiment: 'neutral' },
        { value: 'broken',    label: 'Разбитое', sentiment: 'negative' },
        { value: 'custom',    label: 'Свой вариант', custom: true },
      ],
    },
    {
      key: 'sleep_quality',
      question: 'Качество сна?',
      options: [
        { value: 'great',  label: 'Выспался', labelF: 'Выспалась', sentiment: 'positive' },
        { value: 'normal', label: 'Среднее', sentiment: 'neutral' },
        { value: 'bad',    label: 'Плохое', sentiment: 'negative' },
      ],
    },
    {
      key: 'sleep_hours',
      question: 'Сколько часов спал?',
      questionF: 'Сколько часов спала?',
      type: 'number',
      float: true,
      min: 0,
      max: 24,
      step: 0.5,
      hint: 'Например: 7.5 = 7 ч 30 мин',
      placeholder: 'Часы сна...',
    },
    {
      key: 'training_today',
      question: 'У тебя сегодня тренировка, или день восстановления?',
      options: [
        { value: 'train', label: 'Сегодня тренируюсь' },
        { value: 'rest',  label: 'Сегодня восстанавливаюсь' },
      ],
    },
    {
      key: 'training_time',
      question: 'Во сколько тренировка?',
      type: 'time',
      condition: (data) => data.training_today === 'train',
    },
    {
      key: 'note',
      question: 'Есть что добавить?',
      type: 'text_optional',
      placeholder: 'Напиши заметку (необязательно)...',
    },
  ],

  post_workout: [
    {
      key: 'plan_completed',
      question: 'Выполнил(а) план тренировки?',
      options: [
        { value: 'full',    label: 'Выполнил полностью',  labelF: 'Выполнила полностью', sentiment: 'positive' },
        { value: 'partial', label: 'Выполнил частично',    labelF: 'Выполнила частично', sentiment: 'neutral' },
        { value: 'skipped', label: 'Не тренировался',      labelF: 'Не тренировалась', sentiment: 'negative' },
        { value: 'custom',  label: 'Свой вариант', custom: true },
      ],
    },
    {
      key: 'not_completed_reason',
      question: 'Почему не выполнил(а) план?',
      condition: (data) => data.plan_completed === 'partial' || data.plan_completed === 'custom',
      options: [
        { value: 'no_time',    label: 'Не хватило времени на все упражнения' },
        { value: 'tired',      label: 'Устал(а)' },
        { value: 'discomfort', label: 'Дискомфорт в теле' },
        { value: 'other',      label: 'Другое', custom: true },
      ],
    },
    {
      key: 'not_trained_reason',
      question: 'Почему не тренировался?',
      questionF: 'Почему не тренировалась?',
      condition: (data) => data.plan_completed === 'skipped',
      options: [
        { value: 'no_time',     label: 'Не хватило времени' },
        { value: 'no_motiv',    label: 'Не было мотивации' },
        { value: 'feeling_bad', label: 'Плохое самочувствие' },
        { value: 'injury',      label: 'Получил травму',          labelF: 'Получила травму' },
        { value: 'recovery',    label: 'Сегодня восстанавливаюсь' },
      ],
    },
    {
      key: 'rpe',
      question: 'Оцени нагрузку (RPE)',
      type: 'rpe',
      scaleHint: '1 — очень легко, 10 — максимально тяжело',
      condition: (data) => data.plan_completed !== 'skipped',
    },
    {
      key: 'prev_comparison',
      question: 'Сравнение с прошлой тренировкой',
      condition: (data) => data.plan_completed !== 'skipped',
      options: [
        { value: 'easier', label: 'Легче' },
        { value: 'same',   label: 'Так же' },
        { value: 'harder', label: 'Тяжелее' },
      ],
    },
    {
      key: 'pain',
      question: 'Болело что-то во время тренировки?',
      condition: (data) => data.plan_completed !== 'skipped',
      options: [
        { value: 'muscle', label: 'Мышечная боль', sentiment: 'negative' },
        { value: 'joint',  label: 'Суставная боль', sentiment: 'negative' },
        { value: 'bad',    label: 'Стало плохо', sentiment: 'negative' },
        { value: 'none',   label: 'Ничего не болело', sentiment: 'positive' },
        { value: 'custom', label: 'Свой вариант', custom: true },
      ],
    },
    {
      key: 'satisfaction',
      question: 'Доволен своей результативностью?',
      questionF: 'Довольна своей результативностью?',
      condition: (data) => data.plan_completed !== 'skipped',
      options: [
        { value: 'yes',    label: 'Да', sentiment: 'positive' },
        { value: 'better', label: 'Мог лучше',         labelF: 'Могла лучше', sentiment: 'neutral' },
        { value: 'no',     label: 'Нет, пожалел себя', labelF: 'Нет, пожалела себя', sentiment: 'negative' },
        { value: 'custom', label: 'Свой вариант', custom: true },
      ],
    },
  ],

  evening: [
    {
      key: 'productivity',
      question: 'Оцени продуктивность в течение дня',
      options: [
        { value: 'high',   label: 'Бодрый весь день',     labelF: 'Бодрая весь день', sentiment: 'positive' },
        { value: 'medium', label: 'Средний уровень энергии', sentiment: 'neutral' },
        { value: 'low',    label: 'Разбит весь день',      labelF: 'Разбита весь день', sentiment: 'negative' },
      ],
    },
    {
      key: 'stress',
      question: 'Уровень стресса за день',
      type: 'rpe',
      scaleHint: '1 — очень мало, 10 — максимальный',
    },
    {
      key: 'recovery',
      question: 'Как прошло восстановление?',
      hint: '(Пропустить при наличии тренировки)',
      options: [
        { value: 'passive', label: 'Восстанавливался пассивно (без нагрузки)', labelF: 'Восстанавливалась пассивно (без нагрузки)' },
        { value: 'active',  label: 'Восстанавливался активно (кардио)',         labelF: 'Восстанавливалась активно (кардио)' },
        { value: 'skip',    label: 'Пропустить' },
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
  aggressive: {
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
      skipped: 'Понял, сегодня без тренировки. Отметил — учту в рекомендациях.',
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
  aggressive: {
    morning: {
      care:    'Тело просит паузы — услышь это. Сегодня восстановление, не нагрузка.',
      neutral: 'Подъём принят. В работу.',
      praise:  'Готов к бою. Используй этот настрой.',
    },
    post_workout: {
      skipped: 'Принято. Сегодня без тренировки — зафиксировал.',
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
    if (data.feeling === 'broken' || (data.feeling === 'okay' && data.sleep_quality === 'bad')) return 'care'
    if (data.feeling === 'excellent' && (data.sleep_quality === 'great' || data.sleep_quality === 'normal')) return 'praise'
    return 'neutral'
  }

  if (type === 'post_workout') {
    if (data.plan_completed === 'skipped') return 'skipped'
    if (data.pain === 'bad' || data.pain === 'joint') return 'care'
    if (data.plan_completed === 'full' && data.satisfaction === 'yes' && data.pain === 'none') return 'praise'
    return 'neutral'
  }

  if (type === 'evening') {
    if (data.productivity === 'low') return 'care'
    if (data.productivity === 'high') return 'praise'
    return 'neutral'
  }

  return 'neutral'
}

function getCompletionMessage(type, data, tone) {
  const safeTone = tone === 'aggressive' ? 'aggressive' : 'soft'
  const mood = getCheckinMood(type, data) ?? 'neutral'
  return (
    MESSAGES[safeTone]?.[type]?.[mood] ??
    COMPLETION_MESSAGES[safeTone]?.[type] ??
    COMPLETION_MESSAGES.soft[type]
  )
}

export default function CheckinFlow({ type, onClose, ctx = {}, editMode = false, checkinId = null, initialData = {} }) {
  const { tone, profile } = useProfile()
  const isFemale = profile?.gender === 'female'
  const allSteps = STEPS[type]
  const [stepIndex, setStepIndex] = useState(0)
  const [data, setData] = useState(editMode ? { ...initialData } : {})
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [customMode, setCustomMode] = useState(false)

  // Pre-fill text/number inputs when navigating in edit mode
  useEffect(() => {
    if (!editMode || !currentStep) return
    const cur = data[currentStep.key]
    if (cur == null) return
    if (currentStep.type === 'number' || currentStep.type === 'number_optional' || currentStep.type === 'time') {
      setInputVal(String(cur))
    } else if (currentStep.type === 'text_optional' && typeof cur === 'string') {
      setInputVal(cur)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex])

  const activeSteps = allSteps.filter((s) => !s.condition || s.condition(data, ctx))
  const currentStep = activeSteps[stepIndex]
  const totalSteps = activeSteps.length

  function advance(value, skipKey = false) {
    if (animating) return
    const newData = skipKey
      ? { ...data }
      : { ...data, [currentStep.key]: value }
    setData(newData)
    setCustomMode(false)

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
    const num = currentStep.float ? parseFloat(inputVal) : parseInt(inputVal, 10)
    const min = currentStep.min ?? 1
    const max = currentStep.max ?? 300
    if (isNaN(num) || num < min || num > max) return
    advance(num)
  }

  function handleNumberOptionalSubmit() {
    const num = currentStep.float ? parseFloat(inputVal) : parseInt(inputVal, 10)
    const max = currentStep.max ?? 9999
    if (isNaN(num) || num < 0 || num > max) return
    advance(num)
  }

  function handleTimeSubmit() {
    if (!inputVal) return
    advance(inputVal)
  }

  function handleTextSubmit() {
    const val = inputVal.trim()
    val ? advance(val) : advance(null, true)
  }

  function handleCustomSubmit() {
    const val = inputVal.trim()
    if (!val) return
    advance(val)
  }

  async function finish(finalData) {
    setSaving(true)
    try {
      if (editMode && checkinId) {
        const diff = {}
        for (const [k, v] of Object.entries(finalData)) {
          if (v !== initialData[k]) diff[k] = v
        }
        if (Object.keys(diff).length > 0) {
          await patchCheckin(checkinId, diff)
        }
      } else {
        await saveCheckin(type, finalData)
      }
    } catch (_) {}
    setSaving(false)
    setDone(true)
    setTimeout(() => onClose(), editMode ? 1500 : 2000)
  }

  function skipStep() {
    if (animating) return
    setAnimating(true)
    setTimeout(() => {
      setAnimating(false)
      setInputVal('')
      if (stepIndex + 1 < activeSteps.length) {
        setStepIndex(stepIndex + 1)
      } else {
        finish(data)
      }
    }, 250)
  }

  function handleBack() {
    if (customMode) {
      setCustomMode(false)
      setInputVal('')
      return
    }
    if (stepIndex === 0) {
      onClose()
    } else {
      setStepIndex(stepIndex - 1)
      setInputVal('')
    }
  }

  if (done) {
    const msg = editMode ? 'Изменения сохранены' : getCompletionMessage(type, data, tone)
    return (
      <div className="checkin-flow checkin-flow--done">
        <div className="checkin-flow__completion">
          <div className="checkin-flow__completion-row">
            <p className="checkin-flow__msg">{msg}</p>
            <span className="checkin-flow__check">✓</span>
          </div>
          <div className="checkin-flow__stripes">
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i} className="checkin-flow__stripe" />
            ))}
          </div>
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
        <p className="checkin-flow__question">
          {isFemale && currentStep.questionF ? currentStep.questionF : currentStep.question}
        </p>

        {currentStep.type === 'rpe' && (
          <div className="checkin-flow__rpe-wrap">
            {currentStep.scaleHint && (
              <p className="checkin-flow__hint">{currentStep.scaleHint}</p>
            )}
            <div className="checkin-flow__rpe">
            {[1,2,3,4,5,6,7,8,9,10].map((n) => (
              <button
                key={n}
                className={`checkin-flow__rpe-btn ${n >= 8 ? 'checkin-flow__rpe-btn--high' : n >= 5 ? 'checkin-flow__rpe-btn--mid' : ''}${editMode && data[currentStep.key] === n ? ' checkin-flow__rpe-btn--selected' : ''}`}
                onClick={() => handleSelect(n)}
              >
                {n}
              </button>
            ))}
            </div>
            {editMode
              ? <button className="checkin-flow__keep-btn" onClick={skipStep}>Оставить →</button>
              : <button className="checkin-flow__text-skip" style={{ marginTop: 8 }} onClick={() => advance(null)}>Пропустить</button>
            }
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
              step={currentStep.step ?? 1}
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
            {editMode
              ? <button className="checkin-flow__keep-btn" onClick={skipStep}>Оставить →</button>
              : <button className="checkin-flow__text-skip" onClick={() => advance(null)}>Пропустить</button>
            }
          </div>
        )}

        {currentStep.type === 'time' && (
          <div className="checkin-flow__number-wrap">
            <input
              type="time"
              className="checkin-flow__numfield"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              autoFocus
            />
            <button
              className="btn btn-accent checkin-flow__number-submit"
              onClick={handleTimeSubmit}
              disabled={!inputVal}
            >
              Продолжить →
            </button>
            {editMode
              ? <button className="checkin-flow__keep-btn" onClick={skipStep}>Оставить →</button>
              : <button className="checkin-flow__text-skip" onClick={() => advance(null)}>Пропустить</button>
            }
          </div>
        )}

        {currentStep.type === 'number_optional' && (
          <div className="checkin-flow__number-wrap">
            {currentStep.hint && (
              <p className="checkin-flow__hint">{currentStep.hint}</p>
            )}
            <input
              type="number"
              className="checkin-flow__numfield"
              placeholder={currentStep.placeholder ?? ''}
              value={inputVal}
              min={0}
              max={currentStep.max}
              step={currentStep.step ?? 1}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNumberOptionalSubmit()}
              autoFocus
            />
            <div className="checkin-flow__text-actions">
              <button className="checkin-flow__text-skip" onClick={() => advance(null, true)}>
                Пропустить
              </button>
              <button
                className="btn btn-accent checkin-flow__text-submit"
                onClick={handleNumberOptionalSubmit}
                disabled={!inputVal}
              >
                Сохранить →
              </button>
            </div>
            {editMode && (
              <button className="checkin-flow__keep-btn" onClick={skipStep}>
                Оставить →
              </button>
            )}
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

        {!currentStep.type && !customMode && (
          <div className="checkin-flow__options-wrap">
            {currentStep.hint && (
              <p className="checkin-flow__hint checkin-flow__hint--options">{currentStep.hint}</p>
            )}
          <div className="checkin-flow__options">
            {currentStep.options.map((opt) => (
              <button
                key={opt.value}
                className={`checkin-flow__option${opt.sentiment ? ` checkin-flow__option--${opt.sentiment}` : ''}${editMode && data[currentStep.key] === opt.value ? ' checkin-flow__option--selected' : ''}`}
                onClick={() => {
                  if (opt.custom) {
                    setCustomMode(true)
                    setInputVal('')
                  } else {
                    handleSelect(opt.value)
                  }
                }}
              >
                {isFemale && opt.labelF ? opt.labelF : opt.label}
              </button>
            ))}
          </div>
          {editMode
            ? <button className="checkin-flow__keep-btn" onClick={skipStep}>Оставить →</button>
            : <button className="checkin-flow__text-skip" style={{ marginTop: 8 }} onClick={() => advance(null)}>Пропустить</button>
          }
          </div>
        )}

        {!currentStep.type && customMode && (
          <div className="checkin-flow__text-wrap">
            <textarea
              className="checkin-flow__textfield"
              placeholder="Напиши свой вариант..."
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              rows={3}
              autoFocus
            />
            <div className="checkin-flow__text-actions">
              <button className="checkin-flow__text-skip" onClick={() => { setCustomMode(false); setInputVal('') }}>
                Назад
              </button>
              <button
                className="btn btn-accent checkin-flow__text-submit"
                onClick={handleCustomSubmit}
                disabled={!inputVal.trim()}
              >
                Продолжить →
              </button>
            </div>
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

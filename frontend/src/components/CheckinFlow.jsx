import { useEffect, useState } from 'react'
import { patchCheckin, saveCheckin } from '../api/checkins'
import stripesImg from '../assets/5.png'
import { CHECKIN_TYPE_INFO } from './CheckinCard'
import { useProfile } from '../context/ProfileContext'

const STEPS = {
  // Порядок и состав — ТЗ «переработка структуры чекинов» (2026-07-09).
  // Убраны: resting_pulse (→ тумблер в Профиле), training_today/training_time
  // (→ карточка плана тренировки, вне чекина), вопрос про цикл (убран без замены).
  morning: [
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
      key: 'sleep_quality',
      question: 'Качество сна?',
      options: [
        { value: 'great',  label: 'Выспался', labelF: 'Выспалась', sentiment: 'positive' },
        { value: 'normal', label: 'Средне', sentiment: 'neutral' },
        { value: 'bad',    label: 'Плохо', sentiment: 'negative' },
      ],
    },
    {
      // Раньше был options-вопрос (отличное/удовлетворительное/разбитое) —
      // заменён на шкалу 1-10 по ТЗ, ключ data оставлен прежним ('feeling')
      // ради непрерывности истории вместо переименования в data.
      key: 'feeling',
      question: 'Как твоё самочувствие?',
      type: 'rpe',
      scaleHint: '1 — очень плохо, 10 — отлично',
      // Only this scale is "higher = better" (10 = отлично) — stress/RPE
      // elsewhere on the same 1-10 buttons mean "higher = worse/harder",
      // so they keep the default color scheme. See ТЗ «дизайн-правки»,
      // 2026-07-13, «RPE color scheme... only for самочувствие».
      colorScheme: 'wellbeing',
    },
    {
      key: 'recovered',
      question: 'Восстановился ли?',
      questionF: 'Восстановилась ли?',
      options: [
        { value: 'yes',    label: 'Да', sentiment: 'positive' },
        { value: 'medium', label: 'Средне', sentiment: 'neutral' },
        { value: 'no',     label: 'Нет', sentiment: 'negative' },
      ],
    },
    {
      key: 'stress',
      question: 'Уровень стресса',
      type: 'rpe',
      scaleHint: '1 — очень мало, 10 — максимальный',
    },
    {
      key: 'note',
      question: 'Есть что добавить?',
      type: 'text_optional',
      placeholder: 'Напиши заметку (необязательно)...',
    },
  ],

  // Убраны: prev_comparison, satisfaction, pain (структурированный вопрос —
  // источник теперь диалог с ИИ). При plan_completed==='skipped' чекин
  // заканчивается сразу после plan_completed (rpe/feeling_after/note
  // условны на !=='skipped', поэтому activeSteps естественно обрывается там).
  post_workout: [
    {
      key: 'plan_completed',
      question: 'Выполнил план тренировки?',
      questionF: 'Выполнила план тренировки?',
      options: [
        { value: 'full',    label: 'Выполнил полностью',  labelF: 'Выполнила полностью', sentiment: 'positive' },
        { value: 'partial', label: 'Выполнил частично',    labelF: 'Выполнила частично', sentiment: 'neutral' },
        { value: 'skipped', label: 'Не тренировался',      labelF: 'Не тренировалась', sentiment: 'negative' },
        { value: 'custom',  label: 'Свой вариант', custom: true },
      ],
    },
    {
      key: 'not_completed_reason',
      question: 'Почему не выполнил план?',
      questionF: 'Почему не выполнила план?',
      condition: (data) => data.plan_completed === 'partial' || data.plan_completed === 'custom',
      options: [
        { value: 'no_time',    label: 'Не хватило времени на все упражнения' },
        { value: 'tired',      label: 'Устал', labelF: 'Устала' },
        { value: 'discomfort', label: 'Дискомфорт в теле' },
        { value: 'other',      label: 'Другое', custom: true },
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
      key: 'feeling_after',
      question: 'Самочувствие после',
      condition: (data) => data.plan_completed !== 'skipped',
      options: [
        { value: 'excellent', label: 'Отличное', sentiment: 'positive' },
        { value: 'okay',      label: 'Удовлетворительное', sentiment: 'neutral' },
        { value: 'broken',    label: 'Разбитое', sentiment: 'negative' },
      ],
    },
    {
      key: 'note',
      question: 'Есть что добавить?',
      type: 'text_optional',
      placeholder: 'Напиши заметку (необязательно)...',
      condition: (data) => data.plan_completed !== 'skipped',
    },
  ],

  // Убраны: recovery (пассивно/активно/пропустить), симптомы дня, вопрос
  // про цикл (не возвращать — цикл ведётся резиденткой отдельно в блоке
  // Здоровье, вне чекинов).
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
      key: 'appetite',
      question: 'Аппетит',
      options: [
        { value: 'low',    label: 'Низкий' },
        { value: 'normal', label: 'Нормальный' },
        { value: 'high',   label: 'Высокий' },
      ],
    },
    {
      key: 'mood',
      question: 'Настроение',
      type: 'rpe',
      scaleHint: '1 — очень плохое, 10 — отличное',
    },
    {
      key: 'note',
      question: 'Есть что добавить?',
      type: 'text_optional',
      placeholder: 'Напиши заметку (необязательно)...',
    },
  ],
}

const COMPLETION_MESSAGE = 'Результат внесён'

export default function CheckinFlow({ type, onClose, ctx = {}, editMode = false, checkinId = null, initialData = {} }) {
  const { profile } = useProfile()
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
    const currentKey = currentStep.key
    setData(newData)
    setCustomMode(false)

    setAnimating(true)
    setTimeout(() => {
      setAnimating(false)
      setInputVal('')
      // Recompute against newData, not the stale `activeSteps` from this
      // render's closure — answering a question can hide later steps
      // (e.g. plan_completed==='skipped' drops rpe/feeling_after/note), and
      // comparing stepIndex+1 to the OLD (pre-answer) length let it advance
      // past the end of the NEW, shorter list. currentStep then read as
      // undefined and the component rendered a blank screen instead of
      // finishing. Locating the next step by key instead of raw index
      // stays correct regardless of how many steps just got hidden.
      const newActiveSteps = allSteps.filter((s) => !s.condition || s.condition(newData, ctx))
      const currentPos = newActiveSteps.findIndex((s) => s.key === currentKey)
      const nextPos = currentPos + 1
      if (nextPos < newActiveSteps.length) {
        setStepIndex(nextPos)
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
    return (
      <div className="checkin-flow checkin-flow--done">
        <div className="checkin-flow__completion">
          <div className="checkin-flow__completion-row">
            <p className="checkin-flow__msg">{COMPLETION_MESSAGE}</p>
            <span className="checkin-flow__check">✓</span>
          </div>
          <img src={stripesImg} alt="" className="checkin-flow__stripes-img" />
        </div>
      </div>
    )
  }

  if (!currentStep) return null

  const typeInfo = CHECKIN_TYPE_INFO[type]

  return (
    <div className="checkin-flow">
      <div className="checkin-card skew-chip checkin-flow__type-banner">
        <div className="checkin-card__title">{typeInfo.title}</div>
        <div className="checkin-card__subtitle">{typeInfo.subtitle}</div>
      </div>

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
            {[1,2,3,4,5,6,7,8,9,10].map((n) => {
              // wellbeing (самочувствие): 10 = отлично, so high numbers read
              // as good (green) and low as bad (red) — the inverse of the
              // default scale used by RPE-difficulty/stress, where high
              // numbers mean harder/worse and stay red.
              const colorClass = currentStep.colorScheme === 'wellbeing'
                ? (n >= 8 ? 'checkin-flow__rpe-btn--good' : n <= 3 ? 'checkin-flow__rpe-btn--bad' : '')
                : (n >= 8 ? 'checkin-flow__rpe-btn--high' : n >= 5 ? 'checkin-flow__rpe-btn--mid' : '')
              return (
              <button
                key={n}
                className={`checkin-flow__rpe-btn ${colorClass}${editMode && data[currentStep.key] === n ? ' checkin-flow__rpe-btn--selected' : ''}`}
                onClick={() => handleSelect(n)}
              >
                {n}
              </button>
              )
            })}
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

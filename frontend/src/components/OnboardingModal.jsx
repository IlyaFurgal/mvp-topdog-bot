import { useState } from 'react'

const SLIDES = [
  {
    icon: '📊',
    title: 'ТРЕКЕР',
    desc: 'Заполняй каждый день — утро, тренировка, вечер. ИИ будет знать твоё состояние и давать точные рекомендации.',
  },
  {
    icon: '🤖',
    title: 'ИИ-АССИСТЕНТ',
    desc: 'Задавай любые вопросы. Получай персональные рекомендации по тренировкам и питанию на основе твоих данных.',
  },
  {
    icon: '📈',
    title: 'ПРОГРЕСС',
    desc: 'Следи за динамикой — вес, сон, вода. Видь результат своей работы в графиках и статистике.',
  },
]

const KEY = 'mvp_onboarding_done'

export default function OnboardingModal() {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(() => !localStorage.getItem(KEY))

  if (!visible) return null

  const slide = SLIDES[step]
  const isLast = step === SLIDES.length - 1

  function handleNext() {
    if (isLast) {
      localStorage.setItem(KEY, '1')
      setVisible(false)
    } else {
      setStep((s) => s + 1)
    }
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">
        <div className="onboarding-icon">{slide.icon}</div>
        <h2 className="onboarding-title">{slide.title}</h2>
        <p className="onboarding-desc">{slide.desc}</p>

        <div className="onboarding-dots">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`onboarding-dot${i === step ? ' onboarding-dot--active' : ''}`}
            />
          ))}
        </div>

        <button className="btn btn-accent onboarding-btn" onClick={handleNext}>
          {isLast ? 'НАЧАТЬ' : 'ДАЛЕЕ'}
        </button>
      </div>
    </div>
  )
}

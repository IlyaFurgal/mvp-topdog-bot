import { useEffect, useState } from 'react'
import {
  Bar, BarChart, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { getCheckinHistory } from '../api/checkins'
import { getTrackerHistory, getTrackerStats, getWeeklyInsight } from '../api/trackers'

const PERIODS = [
  { label: '30 ДНЕЙ', days: 30 },
  { label: '90 ДНЕЙ', days: 90 },
  { label: 'ВСЁ ВРЕМЯ', days: 3650 },
]

const TOOLTIP_STYLE = {
  background: '#2a2a2a',
  border: 'none',
  borderRadius: 8,
  color: '#fff',
  fontFamily: 'Barlow Condensed',
}

function fmtDate(str) {
  const d = new Date(str)
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

function EmptyChart() {
  return <p className="chart-empty">Данных пока нет — начни заполнять трекеры</p>
}

function StatRow({ items }) {
  return (
    <div className="chart-stats">
      {items.map(({ label, value }) => (
        <div key={label} className="chart-stat">
          <span className="chart-stat-label">{label}</span>
          <span className="chart-stat-value">{value ?? '—'}</span>
        </div>
      ))}
    </div>
  )
}

function disciplineColor(pct) {
  if (pct == null) return '#888'
  if (pct >= 80) return 'var(--accent)'
  if (pct >= 50) return '#fff'
  return 'var(--danger)'
}

const RPE_LABELS = {
  1: 'почти нет нагрузки',
  2: 'очень легко',
  3: 'легко',
  4: 'умеренно',
  5: 'средне',
  6: 'тяжело, но контролируемо',
  7: 'очень тяжело',
  8: 'почти максимум',
  9: 'предельная нагрузка',
  10: 'максимум',
}

function rpeColor(rpe) {
  if (!rpe) return '#888'
  const n = parseFloat(rpe)
  if (n <= 3) return 'var(--accent)'
  if (n <= 6) return '#f59e0b'
  return 'var(--danger)'
}

function rpeLabel(rpe) {
  if (!rpe) return ''
  return RPE_LABELS[Math.round(parseFloat(rpe))] ?? ''
}

const SCORE_MAP = {
  // body_feeling
  fresh: 100, slightly_tired: 67, heavy: 33, sick: 10,
  // sleep_quality / general quality
  great: 100, good: 100, normal: 67, bad: 33, poor: 33,
  // energy / mood level
  high: 100, medium: 67, low: 33,
  // mood (explicit)
  neutral: 67,
  // training_desire
  want: 100, okay: 67, no_desire: 33, no_chance: 33,
  // day ratings
  hard: 33,
}

function calcRecoveryPct(checkins) {
  if (!Array.isArray(checkins)) return null
  const scores = []

  for (const c of checkins) {
    if (c.type === 'morning') {
      if (c.data?.sleep_quality != null)    scores.push(SCORE_MAP[c.data.sleep_quality]    ?? 67)
      if (c.data?.body_feeling != null)     scores.push(SCORE_MAP[c.data.body_feeling]     ?? 67)
      if (c.data?.motivation != null)       scores.push(SCORE_MAP[c.data.motivation]       ?? 67)
      if (c.data?.mood != null)             scores.push(SCORE_MAP[c.data.mood]             ?? 67)
      if (c.data?.training_desire != null)  scores.push(SCORE_MAP[c.data.training_desire]  ?? 67)
    }
    if (c.type === 'evening') {
      if (c.data?.energy != null)    scores.push(SCORE_MAP[c.data.energy]    ?? 67)
      if (c.data?.recovery != null)  scores.push(SCORE_MAP[c.data.recovery]  ?? 67)
    }
  }

  if (scores.length === 0) return null

  const base = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)

  // Resting pulse penalty: if latest pulse is 10+ bpm above personal min → -20
  const pulseVals = checkins
    .filter((c) => c.type === 'morning' && c.data?.resting_pulse != null)
    .map((c) => Number(c.data.resting_pulse))
    .filter((n) => !isNaN(n) && n > 0)
  // checkins are returned newest-first from API
  let pulsePenalty = 0
  if (pulseVals.length >= 2) {
    const minPulse = Math.min(...pulseVals)
    const latestPulse = pulseVals[0]
    if (latestPulse - minPulse >= 10) pulsePenalty = 20
  }

  return Math.max(0, base - pulsePenalty)
}

function recoveryGrade(pct) {
  if (pct === null) return { label: 'Нет данных', color: '#888', sub: '' }
  if (pct >= 85) return { label: 'Отличное', color: '#22c55e', sub: 'Организм восстановлен. Можно работать.' }
  if (pct >= 70) return { label: 'Хорошее', color: '#86efac', sub: 'Режим стабильный. Нагрузка допустима.' }
  if (pct >= 55) return { label: 'Среднее', color: '#f59e0b', sub: 'Есть признаки усталости. Не перегружайся.' }
  if (pct >= 40) return { label: 'Нестабильное', color: '#f97316', sub: 'Нужен режим. Выровняй сон и нагрузку.' }
  if (pct >= 25) return { label: 'Слабое', color: '#ef4444', sub: 'Организм не успевает восстановиться.' }
  return { label: 'Критическое', color: '#7f1d1d', sub: 'Снизь нагрузку и восстановись.' }
}

export default function ProgressPage() {
  const [periodIdx, setPeriodIdx] = useState(0)
  const [weightData, setWeightData] = useState([])
  const [waterData, setWaterData] = useState([])
  const [sleepData, setSleepData] = useState([])
  const [caloriesData, setCaloriesData] = useState([])
  const [stats, setStats] = useState(null)
  const [checkins, setCheckins] = useState([])
  const [insight, setInsight] = useState(null)
  const [loading, setLoading] = useState(true)

  const days = PERIODS[periodIdx].days

  useEffect(() => {
    setLoading(true)
    Promise.allSettled([
      getTrackerHistory('weight', days),
      getTrackerHistory('water', days),
      getTrackerHistory('sleep', days),
      getTrackerHistory('calories', days),
      getTrackerStats(days),
      getCheckinHistory(500),
      getWeeklyInsight(),
    ])
      .then(([wt, wa, sl, cal, st, ch, ins]) => {
        if (wt.status === 'fulfilled') setWeightData(wt.value)
        if (wa.status === 'fulfilled') setWaterData(wa.value)
        if (sl.status === 'fulfilled') setSleepData(sl.value)
        if (cal.status === 'fulfilled') setCaloriesData(cal.value)
        if (st.status === 'fulfilled') setStats(st.value)
        if (ch.status === 'fulfilled' && Array.isArray(ch.value)) setCheckins(ch.value)
        if (ins.status === 'fulfilled') setInsight(ins.value)
      })
      .finally(() => setLoading(false))
  }, [periodIdx])

  const postWorkouts = checkins.filter((c) => c.type === 'post_workout')
  const discipline =
    postWorkouts.length > 0
      ? Math.round(
          (postWorkouts.filter((c) => c.data?.plan_completed === 'fully').length /
            postWorkouts.length) *
            100
        )
      : null

  const rpeVals = postWorkouts.map((c) => c.data?.rpe).filter((v) => v != null)
  const avgRpe =
    rpeVals.length > 0
      ? (rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length).toFixed(1)
      : null

  const recoveryPct = calcRecoveryPct(checkins)
  const rec = recoveryGrade(recoveryPct)

  const hasMetrics = discipline !== null || avgRpe !== null || recoveryPct !== null

  return (
    <div className="page">
      <h1 className="page-title">ПРОГРЕСС</h1>

      <div className="period-tabs">
        {PERIODS.map((p, i) => (
          <button
            key={p.label}
            className={`period-tab ${periodIdx === i ? 'active' : ''}`}
            onClick={() => setPeriodIdx(i)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card"><p className="card-muted">Загрузка...</p></div>
      ) : (
        <>
          {/* ── Insight ─────────────────────────────────── */}
          {insight && (
            <div className="insight-block">
              <span className="insight-label">ИНСАЙТ НЕДЕЛИ</span>
              <p className="insight-text">"{insight.text}"</p>
            </div>
          )}

          {/* ── Metrics ─────────────────────────────────── */}
          {hasMetrics && (
            <div className="metrics-cards">
              <div className="metric-card">
                <span className="metric-label">DISCIPLINE</span>
                <span className="metric-value" style={{ color: disciplineColor(discipline) }}>
                  {discipline !== null ? `${discipline}%` : '—'}
                </span>
                <span className="metric-sub">
                  {discipline !== null
                    ? (discipline >= 80 ? 'отлично' : discipline >= 50 ? 'стабильно' : 'нужно больше')
                    : ''}
                </span>
              </div>
              <div className="metric-card">
                <span className="metric-label">ТРЕНИРОВОЧНАЯ НАГРУЗКА (RPE)</span>
                <span className="metric-value" style={{ color: rpeColor(avgRpe) }}>
                  {avgRpe ?? 'Нет данных'}
                </span>
                <span className="metric-sub">{rpeLabel(avgRpe)}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">ВОССТАНОВЛЕНИЕ</span>
                <span className="metric-value" style={{ color: rec.color }}>
                  {recoveryPct !== null ? `${recoveryPct}%` : 'Нет данных'}
                </span>
                <span className="metric-sub">{rec.label !== 'Нет данных' ? rec.label : ''}</span>
              </div>
            </div>
          )}

          {/* Recovery details */}
          {rec.sub && (
            <p className="recovery-detail" style={{ color: rec.color }}>{rec.sub}</p>
          )}

          {/* ── Weight ──────────────────────────────────── */}
          <div className="card chart-card">
            <div className="chart-header">
              <span className="chart-title">ВЕС</span>
              {stats?.weight && (
                <span className="chart-current">{stats.weight.current} кг</span>
              )}
            </div>
            {weightData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={weightData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="created_at"
                    tickFormatter={fmtDate}
                    tick={{ fill: '#666', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fill: '#666', fontSize: 10 }}
                    width={36}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v) => [`${v} кг`, 'Вес']}
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={fmtDate}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#aaff00"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#aaff00' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
            {stats?.weight && (
              <StatRow
                items={[
                  { label: 'МИН', value: `${stats.weight.min} кг` },
                  { label: 'МАКС', value: `${stats.weight.max} кг` },
                  { label: 'СРЕДНЕЕ', value: `${stats.weight.avg} кг` },
                ]}
              />
            )}
          </div>

          {/* ── Water ───────────────────────────────────── */}
          <div className="card chart-card">
            <div className="chart-header">
              <span className="chart-title">ВОДА</span>
              {stats?.water && (
                <span className="chart-current">{Math.round(stats.water.avg_7days)} мл/день</span>
              )}
            </div>
            {waterData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={waterData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="created_at"
                    tickFormatter={fmtDate}
                    tick={{ fill: '#666', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#666', fontSize: 10 }}
                    width={44}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v) => [`${Math.round(v)} мл`, 'Вода']}
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={fmtDate}
                  />
                  <ReferenceLine y={2000} stroke="#444" strokeDasharray="4 4" />
                  <Bar dataKey="value" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            {stats?.water && (
              <StatRow
                items={[
                  { label: 'СРЕДНЕЕ 7 ДНЕЙ', value: `${Math.round(stats.water.avg_7days)} мл` },
                  { label: 'СЕГОДНЯ', value: `${Math.round(stats.water.today)} мл` },
                  { label: 'ЦЕЛЬ', value: `${stats.water.goal} мл` },
                ]}
              />
            )}
          </div>

          {/* ── Calories ────────────────────────────────── */}
          <div className="card chart-card">
            <div className="chart-header">
              <span className="chart-title">КАЛОРИИ</span>
              {stats?.calories && (
                <span className="chart-current">{Math.round(stats.calories.avg_7days)} ккал/день</span>
              )}
            </div>
            {caloriesData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={caloriesData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="created_at"
                    tickFormatter={fmtDate}
                    tick={{ fill: '#666', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fill: '#666', fontSize: 10 }}
                    width={44}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v) => [`${Math.round(v)} ккал`, 'Калории']}
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={fmtDate}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#C8FF00"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#C8FF00', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#C8FF00' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
            {stats?.calories && (
              <StatRow
                items={[
                  { label: 'МИН', value: caloriesData.length ? `${Math.round(Math.min(...caloriesData.map(d => d.value)))} ккал` : null },
                  { label: 'МАКС', value: caloriesData.length ? `${Math.round(Math.max(...caloriesData.map(d => d.value)))} ккал` : null },
                  { label: 'СРЕДНЕЕ', value: `${Math.round(stats.calories.avg_7days)} ккал` },
                ]}
              />
            )}
          </div>

          {/* ── Sleep ───────────────────────────────────── */}
          <div className="card chart-card">
            <div className="chart-header">
              <span className="chart-title">СОН</span>
              {stats?.sleep?.avg_7days && (
                <span className="chart-current">{stats.sleep.avg_7days}ч ср.</span>
              )}
            </div>
            {sleepData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={sleepData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="created_at"
                    tickFormatter={fmtDate}
                    tick={{ fill: '#666', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 12]}
                    tick={{ fill: '#666', fontSize: 10 }}
                    width={30}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v) => [`${v}ч`, 'Сон']}
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={fmtDate}
                  />
                  <ReferenceLine y={8} stroke="#444" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#8b5cf6' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
            {stats?.sleep && (
              <StatRow
                items={[
                  { label: 'ПРОШЛАЯ НОЧЬ', value: stats.sleep.last_night ? `${stats.sleep.last_night}ч` : null },
                  { label: 'СРЕДНЕЕ 7 ДНЕЙ', value: stats.sleep.avg_7days ? `${stats.sleep.avg_7days}ч` : null },
                  { label: 'ЦЕЛЬ', value: `${stats.sleep.goal}ч` },
                ]}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}

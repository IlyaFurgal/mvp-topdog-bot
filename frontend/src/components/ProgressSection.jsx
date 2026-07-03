import { useEffect, useState } from 'react'
import {
  Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { getCheckinHistory } from '../api/checkins'
import { getTrackerHistory, getTrackerStats, getWeeklyInsight } from '../api/trackers'
import weightTitle from '../assets/13.png'
import waterTitle from '../assets/14.png'
import caloriesTitle from '../assets/15.png'
import sleepTitle from '../assets/16.png'
import WorkoutCalendar from './WorkoutCalendar'

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

const CHART_GREEN = '#B0F326'
const AXIS_TICK = { fill: CHART_GREEN, fontSize: 10 }

function SquareDot({ cx, cy, r = 7, fill = CHART_GREEN }) {
  if (cx == null || cy == null) return null
  const s = r * 2
  return <rect x={cx - r} y={cy - r} width={s} height={s} fill={fill} />
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

export default function ProgressSection({ refreshKey }) {
  const [view, setView]           = useState('state')  // 'state' | 'workouts'
  const [periodIdx, setPeriodIdx] = useState(0)

  // State tab data
  const [weightData, setWeightData]     = useState([])
  const [waterData, setWaterData]       = useState([])
  const [sleepData, setSleepData]       = useState([])
  const [caloriesData, setCaloriesData] = useState([])
  const [stats, setStats]               = useState(null)
  const [checkins, setCheckins]         = useState([])
  const [insight, setInsight]           = useState(null)
  const [loading, setLoading]           = useState(true)

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
  }, [periodIdx, refreshKey])

  const postWorkouts = checkins.filter((c) => c.type === 'post_workout')
  const discipline =
    postWorkouts.length > 0
      ? Math.round(
          (postWorkouts.filter((c) => c.data?.plan_completed === 'full').length /
            postWorkouts.length) *
            100
        )
      : null

  const rpeVals = postWorkouts
    .map((c) => Number(c.data?.rpe))
    .filter((v) => Number.isFinite(v) && v >= 1 && v <= 10)
  const avgRpe =
    rpeVals.length > 0
      ? (() => {
          const rounded = Math.round((rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length) * 10) / 10
          return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
        })()
      : null

  const recoveryPct = calcRecoveryPct(checkins)

  // Prefer insight's discipline_pct (7-day window) so the % and the insight text always agree
  const displayedDiscipline = insight?.discipline_pct != null ? insight.discipline_pct : discipline

  const hasMetrics = displayedDiscipline !== null || avgRpe !== null || recoveryPct !== null

  return (
    <>
      {/* ── View tabs ────────────────────────────────────── */}
      <div className="progress-views">
        <button
          className={`progress-view ${view === 'state'    ? 'active' : ''}`}
          onClick={() => setView('state')}
        ><span>СОСТОЯНИЕ</span></button>
        <button
          className={`progress-view ${view === 'workouts' ? 'active' : ''}`}
          onClick={() => setView('workouts')}
        ><span>ТРЕНИРОВКИ</span></button>
      </div>

      {/* ── Workouts tab ─────────────────────────────────── */}
      {view === 'workouts' && (
        <WorkoutCalendar />
      )}

      {/* ── State tab ────────────────────────────────────── */}
      {view === 'state' && (
      <>
      <div className="period-tabs">
        {PERIODS.map((p, i) => (
          <button
            key={p.label}
            className={`period-tab ${periodIdx === i ? 'active' : ''}`}
            onClick={() => setPeriodIdx(i)}
          >
            <span>{p.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card"><p className="card-muted">Загрузка...</p></div>
      ) : (
        <>
          {/* ── Metrics ─────────────────────────────────── */}
          {hasMetrics && (
            <div className="metrics-cards">
              <div className="metric-card">
                <span className="metric-label">НАГРУЗКА</span>
                <span className="metric-value">
                  {avgRpe ?? 'Нет данных'}
                </span>
              </div>
              <div className="metric-card">
                <span className="metric-label">ДИСЦИПЛИНА</span>
                <span className="metric-value">
                  {displayedDiscipline !== null ? `${displayedDiscipline}%` : '—'}
                </span>
              </div>
              <div className="metric-card">
                <span className="metric-label">ВОССТАНОВЛЕНИЕ</span>
                <span className="metric-value">
                  {recoveryPct !== null ? `${recoveryPct}%` : 'Нет данных'}
                </span>
              </div>
            </div>
          )}

          {/* ── Insight ─────────────────────────────────── */}
          {insight && (
            <div className="insight-block">
              <span className="insight-label">ИНСАЙТ НЕДЕЛИ</span>
              <p className="insight-text">"{insight.text}"</p>
            </div>
          )}

          {/* ── Weight ──────────────────────────────────── */}
          <div className="card chart-card">
            <div className="chart-header">
              <img src={weightTitle} alt="ВЕС" className="chart-title-img" />
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
                    tick={AXIS_TICK}
                    axisLine={{ stroke: CHART_GREEN }}
                    tickLine={{ stroke: CHART_GREEN }}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={AXIS_TICK}
                    width={36}
                    axisLine={{ stroke: CHART_GREEN }}
                    tickLine={{ stroke: CHART_GREEN }}
                  />
                  <Tooltip
                    formatter={(v) => [`${v} кг`, 'Вес']}
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={fmtDate}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={CHART_GREEN}
                    strokeWidth={2}
                    dot={<SquareDot />}
                    activeDot={<SquareDot r={9} />}
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
              <img src={waterTitle} alt="ВОДА" className="chart-title-img" />
              {stats?.water && (
                <span className="chart-current">{Math.round(stats.water.avg_7days)} мл/день</span>
              )}
            </div>
            {waterData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={waterData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="created_at"
                    tickFormatter={fmtDate}
                    tick={AXIS_TICK}
                    axisLine={{ stroke: CHART_GREEN }}
                    tickLine={{ stroke: CHART_GREEN }}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    width={44}
                    axisLine={{ stroke: CHART_GREEN }}
                    tickLine={{ stroke: CHART_GREEN }}
                  />
                  <Tooltip
                    formatter={(v) => [`${Math.round(v)} мл`, 'Вода']}
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={fmtDate}
                  />
                  <ReferenceLine y={2000} stroke="#444" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={CHART_GREEN}
                    strokeWidth={2}
                    dot={<SquareDot />}
                    activeDot={<SquareDot r={9} />}
                  />
                </LineChart>
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
              <img src={caloriesTitle} alt="КАЛОРИИ" className="chart-title-img" />
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
                    tick={AXIS_TICK}
                    axisLine={{ stroke: CHART_GREEN }}
                    tickLine={{ stroke: CHART_GREEN }}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={AXIS_TICK}
                    width={44}
                    axisLine={{ stroke: CHART_GREEN }}
                    tickLine={{ stroke: CHART_GREEN }}
                  />
                  <Tooltip
                    formatter={(v) => [`${Math.round(v)} ккал`, 'Калории']}
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={fmtDate}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={CHART_GREEN}
                    strokeWidth={2}
                    dot={<SquareDot />}
                    activeDot={<SquareDot r={9} />}
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
              <img src={sleepTitle} alt="СОН" className="chart-title-img" />
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
                    tick={AXIS_TICK}
                    axisLine={{ stroke: CHART_GREEN }}
                    tickLine={{ stroke: CHART_GREEN }}
                  />
                  <YAxis
                    domain={[0, 12]}
                    tick={AXIS_TICK}
                    width={30}
                    axisLine={{ stroke: CHART_GREEN }}
                    tickLine={{ stroke: CHART_GREEN }}
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
                    stroke={CHART_GREEN}
                    strokeWidth={2}
                    dot={<SquareDot />}
                    activeDot={<SquareDot r={9} />}
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
      </>
      )}
    </>
  )
}

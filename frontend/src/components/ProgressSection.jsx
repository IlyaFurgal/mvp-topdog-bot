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
import loadTitle from '../assets/Нагрузка.png'
import { useProfile } from '../context/ProfileContext'
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

const CHART_GREEN = '#B2F526'
const CHART_YELLOW = '#FFD900'
const CHART_RED = '#E30000'
const AXIS_TICK = { fill: CHART_GREEN, fontSize: 10 }

function SquareDot({ cx, cy, r = 7, fill = CHART_GREEN }) {
  if (cx == null || cy == null) return null
  const s = r * 2
  return <rect x={cx - r} y={cy - r} width={s} height={s} fill={fill} />
}

// ── Traffic-light zone coloring (ТЗ «дизайн-правки», п.13) ──────────────────
// Each point computes its own zone independently — both undershoot and
// overshoot of a target can be "bad", not just one direction.

function zoneColorByPct(pct, greenLo, greenHi, yellowLo, yellowHi) {
  if (pct == null) return CHART_GREEN
  if (pct >= greenLo && pct <= greenHi) return CHART_GREEN
  if (pct >= yellowLo && pct <= yellowHi) return CHART_YELLOW
  return CHART_RED
}

function zoneColorWater(value, goal = 2000) {
  if (value == null || !goal) return CHART_GREEN
  return zoneColorByPct((value / goal) * 100, 90, 115, 70, 130)
}

function zoneColorSleep(hours) {
  if (hours == null) return CHART_GREEN
  return zoneColorByPct(hours, 7, 9, 6, 10)
}

// No dedicated КБЖУ corridor (min/max) is exposed via the trackers API yet —
// only a single daily `goal` number. Approximating the corridor as goal ±10%
// (green), extending to ±25% (yellow) until that field ships as its own
// backend ticket (per the ТЗ's own note on this point).
function zoneColorCalories(value, goal) {
  if (value == null || !goal) return CHART_GREEN
  const diffPct = (Math.abs(value - goal) / goal) * 100
  if (diffPct <= 10) return CHART_GREEN
  if (diffPct <= 25) return CHART_YELLOW
  return CHART_RED
}

// Simplified to day-over-day change (not a full weekly rolling average —
// not otherwise computed on the frontend today) relative to the profile's
// goal direction. Movement toward the goal is always green regardless of
// magnitude; only movement against it is graded by size.
function zoneColorWeight(value, prevValue, goalDirection) {
  if (value == null || prevValue == null || !prevValue) return CHART_GREEN
  const diffPct = ((value - prevValue) / prevValue) * 100
  if (Math.abs(diffPct) <= 1) return CHART_GREEN
  const movingAgainstGoal =
    goalDirection === 'loss' ? diffPct > 0 :
    goalDirection === 'gain' ? diffPct < 0 :
    false
  if (!movingAgainstGoal) return CHART_GREEN
  return Math.abs(diffPct) <= 3 ? CHART_YELLOW : CHART_RED
}

function weightGoalDirection(profile) {
  const goals = profile?.goals ?? (profile?.goal ? [profile.goal] : [])
  if (goals.includes('weight_loss')) return 'loss'
  if (goals.includes('muscle_gain')) return 'gain'
  return null
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

// Формула восстановления (ТЗ «переработка структуры чекинов», 2026-07-09):
// Сон 30% + Восстановился ли (утро) 20% + RPE (после тренировки, если была)
// 20% + Продуктивность (вечер) 15% + Стресс (среднее утро/вечер) 15%.
//
// RPE отсутствует в дни без тренировки — вес перераспределяется
// пропорционально между доступными компонентами того дня, а не штрафует
// счёт (открытый вопрос ТЗ, ждёт подтверждения методолога).
const RECOVERY_WEIGHTS = { sleep: 0.30, recovered: 0.20, rpe: 0.20, productivity: 0.15, stress: 0.15 }

// 3-вариантные options-вопросы (sleep_quality/recovered/productivity) на
// общей шкале 100/67/33 — общий средний вариант везде назван либо
// "medium", либо "normal", поэтому один плоский словарь на все три поля.
const OPTION_SCORE = { great: 100, normal: 67, bad: 33, yes: 100, medium: 67, no: 33, high: 100, low: 33 }

function scaleScore(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 && n <= 10 ? ((n - 1) / 9) * 100 : null
}

function invertedScaleScore(value) {
  const s = scaleScore(value)
  return s == null ? null : 100 - s
}

function localDateKey(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function calcRecoveryPct(checkins) {
  if (!Array.isArray(checkins) || checkins.length === 0) return null

  // Группируем по календарному дню, чтобы усреднить утренний и вечерний
  // стресс ОДНОГО дня и сопоставить RPE с днём тренировки.
  const byDate = {}
  for (const c of checkins) {
    const key = localDateKey(c.created_at)
    if (!byDate[key]) byDate[key] = {}
    byDate[key][c.type] = c
  }

  const dayScores = []
  for (const day of Object.values(byDate)) {
    const components = []

    const sleepScore = OPTION_SCORE[day.morning?.data?.sleep_quality]
    if (sleepScore != null) components.push({ weight: RECOVERY_WEIGHTS.sleep, score: sleepScore })

    const recoveredScore = OPTION_SCORE[day.morning?.data?.recovered]
    if (recoveredScore != null) components.push({ weight: RECOVERY_WEIGHTS.recovered, score: recoveredScore })

    const rpeScore = scaleScore(day.post_workout?.data?.rpe)
    if (rpeScore != null) components.push({ weight: RECOVERY_WEIGHTS.rpe, score: rpeScore })

    const productivityScore = OPTION_SCORE[day.evening?.data?.productivity]
    if (productivityScore != null) components.push({ weight: RECOVERY_WEIGHTS.productivity, score: productivityScore })

    const stressScores = [invertedScaleScore(day.morning?.data?.stress), invertedScaleScore(day.evening?.data?.stress)]
      .filter((v) => v != null)
    if (stressScores.length > 0) {
      const avgStress = stressScores.reduce((a, b) => a + b, 0) / stressScores.length
      components.push({ weight: RECOVERY_WEIGHTS.stress, score: avgStress })
    }

    if (components.length === 0) continue

    const totalWeight = components.reduce((sum, c) => sum + c.weight, 0)
    dayScores.push(components.reduce((sum, c) => sum + (c.score * c.weight) / totalWeight, 0))
  }

  if (dayScores.length === 0) return null
  return Math.round(dayScores.reduce((a, b) => a + b, 0) / dayScores.length)
}

export default function ProgressSection({ refreshKey }) {
  const { profile } = useProfile()
  const goalDirection = weightGoalDirection(profile)
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
  // Only the very first load shows the "Загрузка..." placeholder in place
  // of the whole state-tab content. Re-fetching on a period switch used to
  // re-trigger that same collapse — the page height dropped to one short
  // line, the browser clamped scrollY to fit, and restoring the real
  // content afterwards didn't bring the scroll position back, which read
  // as "jumps to the top" when switching to 90 дней / Всё время.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

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
      .finally(() => { setLoading(false); setHasLoadedOnce(true) })
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

  // Нагрузка — RPE (1-10) с post_workout чекинов, один пункт на чекин
  // (как самочувствие/настроение раньше), не агрегируется по дням.
  const loadData = postWorkouts
    .map((c) => ({ created_at: c.created_at, value: Number(c.data?.rpe) }))
    .filter((d) => Number.isFinite(d.value) && d.value >= 1 && d.value <= 10)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

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

      {loading && !hasLoadedOnce ? (
        <div className="card"><p className="card-muted">Загрузка...</p></div>
      ) : (
        <>
          {/* ── Metrics ─────────────────────────────────── */}
          {/* Always rendered — each card already falls back to "Нет
              данных"/"—" on its own; hiding the whole row whenever all
              three happen to be null at once made the cards seem to
              "disappear" instead of showing an empty state. */}
          <div className="metrics-cards">
            <div className="metric-card">
              <span className="metric-label">НАГРУЗКА</span>
              <span className="metric-value">
                {avgRpe ?? '—'}
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
                {recoveryPct !== null ? `${recoveryPct}%` : '—'}
              </span>
            </div>
          </div>

          {/* ── Insight ─────────────────────────────────── */}
          {insight && (
            <div className="insight-block">
              <span className="insight-label">ИНСАЙТ НЕДЕЛИ</span>
              <p className="insight-text">«{insight.text}»</p>
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
                    type="linear"
                    dataKey="value"
                    stroke={CHART_GREEN}
                    strokeWidth={2}
                    dot={(props) => (
                      <SquareDot
                        {...props}
                        fill={zoneColorWeight(props.payload?.value, weightData[props.index - 1]?.value, goalDirection)}
                      />
                    )}
                    activeDot={(props) => (
                      <SquareDot
                        {...props}
                        r={9}
                        fill={zoneColorWeight(props.payload?.value, weightData[props.index - 1]?.value, goalDirection)}
                      />
                    )}
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
                  <ReferenceLine y={stats?.water?.goal ?? 2000} stroke="#444" strokeDasharray="4 4" />
                  <Line
                    type="linear"
                    dataKey="value"
                    stroke={CHART_GREEN}
                    strokeWidth={2}
                    dot={(props) => (
                      <SquareDot {...props} fill={zoneColorWater(props.payload?.value, stats?.water?.goal)} />
                    )}
                    activeDot={(props) => (
                      <SquareDot {...props} r={9} fill={zoneColorWater(props.payload?.value, stats?.water?.goal)} />
                    )}
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
                  {stats?.calories?.goal && (
                    <ReferenceLine y={stats.calories.goal} stroke="#444" strokeDasharray="4 4" />
                  )}
                  <Line
                    type="linear"
                    dataKey="value"
                    stroke={CHART_GREEN}
                    strokeWidth={2}
                    dot={(props) => (
                      <SquareDot {...props} fill={zoneColorCalories(props.payload?.value, stats?.calories?.goal)} />
                    )}
                    activeDot={(props) => (
                      <SquareDot {...props} r={9} fill={zoneColorCalories(props.payload?.value, stats?.calories?.goal)} />
                    )}
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
                    domain={[
                      (dataMin) => Math.max(0, Math.floor(Math.min(dataMin, 8) - 1)),
                      (dataMax) => Math.ceil(Math.max(dataMax, 8) + 1),
                    ]}
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
                    type="linear"
                    dataKey="value"
                    stroke={CHART_GREEN}
                    strokeWidth={2}
                    dot={(props) => (
                      <SquareDot {...props} fill={zoneColorSleep(props.payload?.value)} />
                    )}
                    activeDot={(props) => (
                      <SquareDot {...props} r={9} fill={zoneColorSleep(props.payload?.value)} />
                    )}
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

          {/* ── Нагрузка (RPE, post_workout чекины) ──────── */}
          <div className="card chart-card">
            <div className="chart-header">
              <img src={loadTitle} alt="НАГРУЗКА" className="chart-title-img" />
              {avgRpe != null && (
                <span className="chart-current">{avgRpe} RPE/день</span>
              )}
            </div>
            {loadData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={loadData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="created_at"
                    tickFormatter={fmtDate}
                    tick={AXIS_TICK}
                    axisLine={{ stroke: CHART_GREEN }}
                    tickLine={{ stroke: CHART_GREEN }}
                  />
                  <YAxis
                    domain={[
                      (dataMin) => Math.max(1, Math.floor(dataMin) - 1),
                      (dataMax) => Math.min(10, Math.ceil(dataMax) + 1),
                    ]}
                    tick={AXIS_TICK}
                    width={24}
                    axisLine={{ stroke: CHART_GREEN }}
                    tickLine={{ stroke: CHART_GREEN }}
                  />
                  <Tooltip
                    formatter={(v) => [v, 'Нагрузка']}
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={fmtDate}
                  />
                  <Line
                    type="linear"
                    dataKey="value"
                    stroke={CHART_GREEN}
                    strokeWidth={2}
                    dot={<SquareDot />}
                    activeDot={<SquareDot r={9} />}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
            {loadData.length > 0 && (
              <StatRow
                items={[
                  { label: 'МИН', value: Math.min(...loadData.map((d) => d.value)) },
                  { label: 'МАКС', value: Math.max(...loadData.map((d) => d.value)) },
                  { label: 'СРЕДНЕЕ 7 ДНЕЙ', value: avgRpe },
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

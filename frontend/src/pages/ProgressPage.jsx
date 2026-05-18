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

function recoveryInfo(avgScore) {
  if (avgScore == null) return { label: '—', color: '#888', sub: '' }
  if (avgScore >= 2.5) return { label: 'ХОРОШЕЕ', color: 'var(--accent)', sub: 'ритм держишь' }
  if (avgScore >= 1.5) return { label: 'СРЕДНЕЕ', color: '#fff', sub: 'нестабильно' }
  return { label: 'СКАЧКИ', color: 'var(--danger)', sub: 'нужен режим' }
}

export default function ProgressPage() {
  const [periodIdx, setPeriodIdx] = useState(0)
  const [weightData, setWeightData] = useState([])
  const [waterData, setWaterData] = useState([])
  const [sleepData, setSleepData] = useState([])
  const [stats, setStats] = useState(null)
  const [checkins, setCheckins] = useState([])
  const [insight, setInsight] = useState(null)
  const [loading, setLoading] = useState(true)

  const days = PERIODS[periodIdx].days

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getTrackerHistory('weight', days),
      getTrackerHistory('water', days),
      getTrackerHistory('sleep', days),
      getTrackerStats(days),
      getCheckinHistory(500),
      getWeeklyInsight(),
    ])
      .then(([wt, wa, sl, st, ch, ins]) => {
        setWeightData(wt)
        setWaterData(wa)
        setSleepData(sl)
        setStats(st)
        setCheckins(ch)
        setInsight(ins)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [periodIdx])

  // Metrics computed from checkin history
  const postWorkouts = checkins.filter((c) => c.type === 'post_workout')
  const discipline =
    postWorkouts.length > 0
      ? Math.round(
          (postWorkouts.filter((c) => c.data?.plan_completed === 'fully').length /
            postWorkouts.length) *
            100
        )
      : null

  const rpeVals = postWorkouts.map((c) => c.data?.rpe).filter(Boolean)
  const avgRpe =
    rpeVals.length > 0
      ? (rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length).toFixed(1)
      : null

  const sleepMap = { great: 3, normal: 2, bad: 1 }
  const sleepScores = checkins
    .filter((c) => c.type === 'morning')
    .map((c) => sleepMap[c.data?.sleep_quality])
    .filter(Boolean)
  const avgSleepScore =
    sleepScores.length > 0
      ? sleepScores.reduce((a, b) => a + b, 0) / sleepScores.length
      : null

  const rec = recoveryInfo(avgSleepScore)
  const hasMetrics = discipline !== null || avgRpe !== null || avgSleepScore !== null

  return (
    <div className="page">
      <h1 className="page-title">PROGRESS</h1>

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

          {/* ── Metrics ─────────────────────────────────── */}
          {hasMetrics && (
            <div className="metrics-cards">
              <div className="metric-card">
                <span className="metric-label">DISCIPLINE</span>
                <span className="metric-value" style={{ color: disciplineColor(discipline) }}>
                  {discipline !== null ? `${discipline}%` : '—'}
                </span>
                <span className="metric-sub">
                  {discipline >= 80 ? 'отлично' : discipline >= 50 ? 'стабильно' : 'нужно больше'}
                </span>
              </div>
              <div className="metric-card">
                <span className="metric-label">НАГРУЗКА</span>
                <span className="metric-value" style={{ color: '#fff' }}>
                  {avgRpe ? `RPE ${avgRpe}` : '—'}
                </span>
                <span className="metric-sub">среднее</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">ВОССТАНОВ.</span>
                <span className="metric-value" style={{ color: rec.color }}>
                  {rec.label}
                </span>
                <span className="metric-sub">{rec.sub}</span>
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
        </>
      )}
    </div>
  )
}

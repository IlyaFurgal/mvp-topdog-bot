import { useState } from 'react'
import {
  Bar, BarChart,
  ComposedChart,
  Line, LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis, YAxis,
} from 'recharts'

const TOOLTIP_STYLE = {
  background: '#2a2a2a',
  border: 'none',
  borderRadius: 8,
  color: '#fff',
  fontFamily: 'Barlow Condensed',
}

const MONTHS_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']

const CAT_COLORS = {
  gym:          '#aaff00',
  bodybuilding: '#c5f000',
  running:      '#3b82f6',
  swimming:     '#06b6d4',
  combat:       '#f97316',
  team_sports:  '#a855f7',
  cycling:      '#f59e0b',
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  const mon = new Date(d)
  mon.setDate(d.getDate() + diff)
  return mon.toISOString().split('T')[0]
}

function fmtDate(str) {
  const d = new Date(str + 'T00:00:00')
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

function fmtPace(val) {
  if (!val) return null
  const m = Math.floor(val)
  const s = Math.round((val - m) * 60)
  return `${m}:${String(s).padStart(2, '0')}/км`
}

// ── Data builders ────────────────────────────────────────────────────────────

function buildFrequency(workouts, categories) {
  const catMap   = Object.fromEntries(categories.map(c => [c.id, c]))
  const weeks    = {}
  const catCodes = new Set()

  for (const w of workouts) {
    const wk   = getMonday(w.date)
    const code = catMap[w.category_id]?.code ?? 'other'
    catCodes.add(code)
    if (!weeks[wk]) weeks[wk] = { date: wk }
    weeks[wk][code] = (weeks[wk][code] ?? 0) + 1
  }

  return {
    data:     Object.values(weeks).sort((a, b) => a.date.localeCompare(b.date)),
    catCodes: [...catCodes],
  }
}

function buildStrengthExercises(workouts) {
  const byEx = {}
  for (const w of workouts) {
    for (const e of w.entries ?? []) {
      if (!e.item_name || e.weight_kg == null) continue
      if (!byEx[e.item_name]) byEx[e.item_name] = {}
      const prev = byEx[e.item_name][w.date]
      if (prev == null || e.weight_kg > prev) byEx[e.item_name][w.date] = parseFloat(e.weight_kg)
    }
  }
  const result = {}
  for (const [name, dates] of Object.entries(byEx)) {
    if (Object.keys(dates).length >= 2) {
      result[name] = Object.entries(dates)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, weight]) => ({ date, weight }))
    }
  }
  return result
}

function buildCardio(workouts, categories) {
  const catMap = Object.fromEntries(categories.map(c => [c.id, c]))
  const weeks  = {}
  let   hasAny = false

  for (const w of workouts) {
    const cat = catMap[w.category_id]
    if (cat?.metric_type !== 'distance_time') continue
    const dist = (w.entries ?? []).reduce((s, e) => s + (e.distance_m ?? 0), 0)
    if (!dist) continue
    hasAny = true
    const time = (w.entries ?? []).reduce((s, e) => s + (e.time_sec ?? 0), 0)
    const wk   = getMonday(w.date)
    if (!weeks[wk]) weeks[wk] = { date: wk, dist: 0, time: 0 }
    weeks[wk].dist += dist
    weeks[wk].time += time
  }

  if (!hasAny) return null

  return Object.values(weeks)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(wk => ({
      date: wk.date,
      км:   parseFloat((wk.dist / 1000).toFixed(1)),
      темп: wk.dist > 0 && wk.time > 0
        ? parseFloat((wk.time / 60 / (wk.dist / 1000)).toFixed(2))
        : null,
    }))
}

// ── Component ────────────────────────────────────────────────────────────────

export default function WorkoutCharts({ workouts, categories }) {
  const [selectedEx, setSelectedEx] = useState('')

  if (!workouts.length) return null

  const { data: freqData, catCodes }  = buildFrequency(workouts, categories)
  const strengthExercises             = buildStrengthExercises(workouts)
  const exerciseNames                 = Object.keys(strengthExercises)
  const cardioData                    = buildCardio(workouts, categories)
  const catNameMap                    = Object.fromEntries(categories.map(c => [c.code, c.name]))

  const effectiveEx   = (selectedEx && strengthExercises[selectedEx]) ? selectedEx : (exerciseNames[0] ?? '')
  const strengthData  = effectiveEx ? strengthExercises[effectiveEx] : []

  return (
    <>
      {/* ── Frequency ─────────────────────────────────────── */}
      {freqData.length > 0 && (
        <div className="card chart-card">
          <div className="chart-header">
            <span className="chart-title">ЧАСТОТА ТРЕНИРОВОК</span>
            <span className="chart-current">{workouts.length} всего</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={freqData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{ fill: '#666', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: '#666', fontSize: 10 }}
                width={24}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={fmtDate}
              />
              {catCodes.map((code, idx) => (
                <Bar
                  key={code}
                  dataKey={code}
                  name={catNameMap[code] ?? code}
                  stackId="a"
                  fill={CAT_COLORS[code] ?? '#888'}
                  radius={idx === catCodes.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Strength progress ──────────────────────────────── */}
      {exerciseNames.length > 0 && (
        <div className="card chart-card">
          <div className="chart-header">
            <span className="chart-title">СИЛОВОЙ ПРОГРЕСС</span>
          </div>
          <select
            className="wo-exercise-select"
            value={effectiveEx}
            onChange={e => setSelectedEx(e.target.value)}
          >
            {exerciseNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {strengthData.length > 0 && (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={strengthData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDate}
                  tick={{ fill: '#666', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fill: '#666', fontSize: 10 }}
                  width={40}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => `${v}кг`}
                />
                <Tooltip
                  formatter={v => [`${v} кг`, 'Макс вес']}
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={fmtDate}
                />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="#aaff00"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#aaff00', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#aaff00' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* ── Cardio ────────────────────────────────────────── */}
      {cardioData && cardioData.length > 0 && (
        <div className="card chart-card">
          <div className="chart-header">
            <span className="chart-title">КАРДИО</span>
            <span className="chart-current">
              {cardioData.reduce((s, d) => s + d.км, 0).toFixed(1)} км
            </span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={cardioData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{ fill: '#666', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="dist"
                tick={{ fill: '#666', fontSize: 10 }}
                width={36}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `${v}км`}
              />
              <YAxis
                yAxisId="pace"
                orientation="right"
                hide
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={fmtDate}
                formatter={(val, name) => {
                  if (name === 'км')   return [`${val} км`, 'Дистанция']
                  if (name === 'темп') return [fmtPace(val), 'Темп']
                  return [val, name]
                }}
              />
              <Bar
                yAxisId="dist"
                dataKey="км"
                fill="#3b82f6"
                radius={[3, 3, 0, 0]}
              />
              <Line
                yAxisId="pace"
                type="monotone"
                dataKey="темп"
                stroke="#06b6d4"
                strokeWidth={2}
                dot={{ r: 3, fill: '#06b6d4', strokeWidth: 0 }}
                activeDot={{ r: 4 }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="wo-cardio-legend">
            <span style={{ color: '#3b82f6' }}>█</span> дистанция (км) &nbsp;
            <span style={{ color: '#06b6d4' }}>—</span> темп (мин/км)
          </p>
        </div>
      )}
    </>
  )
}

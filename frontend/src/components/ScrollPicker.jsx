import { useEffect, useMemo, useRef, useState } from 'react'

const ITEM_HEIGHT = 44
const VISIBLE_PAD = 2  // empty rows above/below so the first/last value can reach center

// Vertical swipe/scroll number picker — snaps to each step, highlights the
// value sitting in the center band. Used for weight/pulse instead of
// tap-to-adjust buttons.
export default function ScrollPicker({ value, onChange, min, max, step, decimals = 0, unit }) {
  const listRef = useRef(null)
  const rafRef = useRef(null)
  const inputRef = useRef(null)
  const [centerIdx, setCenterIdx] = useState(0)
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState('')

  const values = useMemo(() => {
    const arr = []
    const count = Math.round((max - min) / step)
    for (let i = 0; i <= count; i++) {
      arr.push(parseFloat((min + i * step).toFixed(decimals)))
    }
    return arr
  }, [min, max, step, decimals])

  function closestIndex(v) {
    let best = 0
    let bestDiff = Infinity
    values.forEach((candidate, i) => {
      const diff = Math.abs(candidate - v)
      if (diff < bestDiff) { bestDiff = diff; best = i }
    })
    return best
  }

  // Scroll to the current value once on mount
  useEffect(() => {
    const idx = closestIndex(value)
    setCenterIdx(idx)
    if (listRef.current) listRef.current.scrollTop = idx * ITEM_HEIGHT
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleScroll() {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const el = listRef.current
      if (!el) return
      const idx = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ITEM_HEIGHT)))
      setCenterIdx(idx)
      onChange(values[idx])
    })
  }

  function startEditing() {
    const current = values[centerIdx]
    setEditDraft(decimals > 0 ? current.toFixed(decimals) : String(current))
    setEditing(true)
    // Focus after the input mounts
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function commitEdit() {
    const n = parseFloat(editDraft.replace(',', '.'))
    if (!isNaN(n)) {
      const clamped = Math.min(max, Math.max(min, n))
      const idx = closestIndex(clamped)
      setCenterIdx(idx)
      onChange(values[idx])
    }
    // The list is unmounted while editing (conditional render below), so
    // listRef.current is null here — scrolling it to the new position has
    // to wait until it remounts. See the effect below.
    setEditing(false)
  }

  // Re-sync scroll position after the list remounts (edit -> scroll view).
  // Skipped on the very first render (mount effect above already handles
  // that) via the ref guard.
  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return }
    if (!editing && listRef.current) {
      listRef.current.scrollTop = centerIdx * ITEM_HEIGHT
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  return (
    <div className="scroll-picker">
      <div className="scroll-picker__highlight" />
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          inputMode="decimal"
          className="scroll-picker__edit-input"
          value={editDraft}
          step={step}
          onChange={(e) => setEditDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.target.blur() } }}
        />
      ) : (
        <div className="scroll-picker__list" ref={listRef} onScroll={handleScroll}>
          <div style={{ height: ITEM_HEIGHT * VISIBLE_PAD }} />
          {values.map((v, i) => (
            <div
              key={v}
              className={`scroll-picker__item${i === centerIdx ? ' scroll-picker__item--active' : ''}`}
              style={{ height: ITEM_HEIGHT }}
              onClick={i === centerIdx ? startEditing : undefined}
            >
              {decimals > 0 ? v.toFixed(decimals) : v}
            </div>
          ))}
          <div style={{ height: ITEM_HEIGHT * VISIBLE_PAD }} />
        </div>
      )}
      {unit && <span className="scroll-picker__unit">{unit}</span>}
    </div>
  )
}

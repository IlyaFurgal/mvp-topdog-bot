import { useLayoutEffect, useRef } from 'react'

// Measures every `.data-row__value` chip inside the returned ref and pins
// them all to the width of the widest one via a CSS custom property, so
// chip width stays driven by real content but ends up uniform across rows.
export function useUniformChipWidth(deps = []) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const container = ref.current
    if (!container) return
    const chips = container.querySelectorAll('.data-row__value')
    if (chips.length === 0) return

    container.style.removeProperty('--chip-w')
    let max = 0
    chips.forEach((el) => {
      const w = el.getBoundingClientRect().width
      if (w > max) max = w
    })
    container.style.setProperty('--chip-w', `${Math.ceil(max)}px`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return ref
}

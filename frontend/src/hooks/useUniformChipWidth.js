import { useLayoutEffect, useRef } from 'react'

// Measures every `.data-row__value` chip inside the returned ref and pins
// them all to the width of the widest one via a CSS custom property, so
// chip width stays driven by real content but ends up uniform across rows.
export function useUniformChipWidth(deps = []) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const container = ref.current
    if (!container) return

    function measure() {
      const chips = container.querySelectorAll('.data-row__value')
      if (chips.length === 0) return
      container.style.removeProperty('--chip-w')
      let max = 0
      chips.forEach((el) => {
        const w = el.getBoundingClientRect().width
        if (w > max) max = w
      })
      container.style.setProperty('--chip-w', `${Math.ceil(max)}px`)
    }

    measure()

    // font-display:swap shows chip text in a fallback font first, so this
    // effect's initial measurement can lock in fallback-font metrics —
    // once the real webfont (Gramatika) finishes loading, text reflows to
    // a different width but --chip-w never got updated, so chips ended up
    // inconsistently sized/misaligned between a fresh load and a warm
    // cache. Re-measure once fonts are actually ready. See ТЗ
    // «дизайн-правки», 2026-07-13, п.8.
    if (document.fonts?.ready) {
      document.fonts.ready.then(measure)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return ref
}

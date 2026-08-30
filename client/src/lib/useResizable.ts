import { useCallback, useState } from 'react'

interface Options {
  min: number
  max: number
  axis: 'x' | 'y'
  /** Dragging toward the origin grows the panel (right/bottom-anchored panels). */
  invert?: boolean
}

/**
 * Pointer-drag resizing for a panel. Returns the current size plus a handler for the
 * grip element. Listeners go on `window` so the drag survives crossing Monaco/xterm.
 */
export function useResizable(initial: number, { min, max, axis, invert = false }: Options) {
  const [size, setSize] = useState(initial)
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const origin = axis === 'x' ? e.clientX : e.clientY
    const start = size
    const move = (ev: PointerEvent) => {
      const delta = (axis === 'x' ? ev.clientX : ev.clientY) - origin
      setSize(Math.min(max, Math.max(min, start + (invert ? -delta : delta))))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [size, min, max, axis, invert])
  return { size, setSize, onPointerDown }
}

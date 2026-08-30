/** Brand mark: an orange rounded square carrying a cream caret — the one place orange is decorative. */
export function LogoMark({ size = 14 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="relative inline-block shrink-0 rounded-[28%] bg-primary"
      style={{ width: size, height: size }}
    >
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-on-primary" style={{ width: Math.max(1.5, size * 0.13), height: size * 0.55 }} />
    </span>
  )
}

export function Wordmark({ size = 14 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2 font-medium tracking-[-0.01em] text-ink" style={{ fontSize: size }}>
      <LogoMark size={size * 1.05} />
      ColCode
    </span>
  )
}

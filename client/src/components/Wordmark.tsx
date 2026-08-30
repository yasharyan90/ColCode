export function Wordmark({ size = 14 }: { size?: number }) {
  return (
    <span className="flex items-center gap-1.5 font-medium text-ink" style={{ fontSize: size }}>
      <span className="inline-block rounded-full bg-primary" style={{ width: size * 0.55, height: size * 0.55 }} aria-hidden />
      ColCode
    </span>
  )
}

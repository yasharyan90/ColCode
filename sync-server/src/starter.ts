export const STARTER_FILES: Record<string, string> = {
  'main.ts': `// Welcome to ColCode — a real-time collaborative editor.
// Milestone 1: single-user Monaco with the cursor-dark theme.

type Stage = 'thinking' | 'reading' | 'editing' | 'grepping' | 'done'

interface TimelineEvent {
  stage: Stage
  label: string
  at: number
}

const PRIORITY: Record<Stage, number> = {
  thinking: 0,
  reading: 1,
  grepping: 2,
  editing: 3,
  done: 4,
}

export function summarize(events: TimelineEvent[]): string {
  const sorted = [...events].sort((a, b) => PRIORITY[a.stage] - PRIORITY[b.stage])
  const last = sorted.at(-1)
  if (!last) return 'no events'
  return \`\${sorted.length} events, last stage: \${last.stage} (\${last.label})\`
}

console.log(summarize([
  { stage: 'thinking', label: 'plan edit', at: Date.now() },
  { stage: 'editing',  label: 'src/theme/cursorDark.ts', at: Date.now() + 120 },
]))
`,
  'fib.py': `# Python: syntax highlighting check
from functools import lru_cache


@lru_cache(maxsize=None)
def fib(n: int) -> int:
    """Return the n-th Fibonacci number."""
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)


if __name__ == "__main__":
    print([fib(i) for i in range(20)])
`,
  'README.md': `# ColCode

Real-time collaborative code editor.

- Milestone 1 — themed single-user editor  ✅
- Milestone 2 — Yjs + y-websocket sync
- Milestone 3 — awareness cursors
`,
}

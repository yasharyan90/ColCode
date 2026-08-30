/**
 * Language table for the sandbox. Each entry is an OCI image, the source file
 * name, and the command that runs it. The source arrives in the container via
 * the CODE env var and is written to the tmpfs by a sh wrapper (see sandbox.ts)
 * — the rootfs itself is read-only, so nothing can be copied into it.
 *
 * `limits` override the defaults for languages that need more room (Go must
 * compile first: more RAM, more time, and an exec-able tmpfs for its binary).
 */
export interface LanguageLimits {
  wallMs?: number
  memory?: string
  cpus?: string
  pids?: number
  tmpfsSize?: string
  /** Allow executing files from the tmpfs (compiled languages). */
  tmpfsExec?: boolean
}

export interface LanguageSpec {
  image: string
  file: string
  /** Command to run `/tmp/<file>`. */
  cmd: string[]
  env?: Record<string, string>
  limits?: LanguageLimits
  /** Shown in the UI banner. */
  note?: string
}

export const LANGUAGES: Record<string, LanguageSpec> = {
  python:     { image: 'python:3.12-alpine', file: 'main.py', cmd: ['python', '-u', '/tmp/main.py'], env: { PYTHONDONTWRITEBYTECODE: '1' } },
  javascript: { image: 'node:24-alpine',     file: 'main.js', cmd: ['node', '/tmp/main.js'] },
  typescript: { image: 'node:24-alpine',     file: 'main.ts', cmd: ['node', '/tmp/main.ts'], note: 'types are stripped, not checked' },
  ruby:       { image: 'ruby:3.3-alpine',    file: 'main.rb', cmd: ['ruby', '/tmp/main.rb'] },
  go: {
    image: 'golang:1.23-alpine', file: 'main.go', cmd: ['go', 'run', '/tmp/main.go'],
    env: { HOME: '/tmp', GOCACHE: '/tmp/gocache', GOPATH: '/tmp/go', GOFLAGS: '-buildvcs=false', GOTOOLCHAIN: 'local' },
    // tmpfs pages count against the memory cgroup, so memory must cover the build cache too.
    limits: { wallMs: 20000, memory: '512m', cpus: '1', pids: 128, tmpfsSize: '256m', tmpfsExec: true },
    note: 'compiles on every run (~6–10 s)',
  },
}

export const SUPPORTED = Object.keys(LANGUAGES)

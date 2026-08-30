import { colors } from '../theme/tokens'

/**
 * Presence identity carried over Yjs awareness. Everything a peer needs to
 * render us — name, color — lives in the awareness `user` field; the cursor
 * and selection are written by y-monaco into the `selection` field; the file
 * we're looking at goes in `file` (for the file-tree dots).
 */
export interface PresenceUser {
  name: string
  color: string        // DESIGN.md timeline pastel — the cursor/selection color
  colorText: string    // ink-on-pastel label text
  avatar?: string | null
}

export interface Peer {
  clientId: number
  user: PresenceUser
  file: string | null
  /** 1-based line of the peer's cursor head, when known (resolved by useProject). */
  line: number | null
  isSelf: boolean
}

/** The five DESIGN.md timeline pastels, scoped to in-product presence. */
export const PRESENCE_COLORS: readonly string[] = colors.presence
const LABEL_TEXT = '#26251e' // DESIGN.md ink — readable on every pastel

const STORAGE_KEY = 'colcode.user.name'

const ADJECTIVES = ['Amber', 'Quiet', 'Brisk', 'Velvet', 'Nimble', 'Lucid', 'Mellow', 'Rapid', 'Sable', 'Vivid']
const ANIMALS = ['Fox', 'Heron', 'Otter', 'Lynx', 'Falcon', 'Marten', 'Ibis', 'Badger', 'Kestrel', 'Newt']

function randomName(): string {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`
}

/** Name from ?name=, else localStorage, else a generated one (persisted). */
export function loadUserName(): string {
  const fromUrl = new URLSearchParams(location.search).get('name')
  if (fromUrl) return fromUrl.slice(0, 32)
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return stored
  } catch { /* private mode etc. */ }
  const name = randomName()
  saveUserName(name)
  return name
}

export function saveUserName(name: string) {
  try { localStorage.setItem(STORAGE_KEY, name) } catch { /* ignore */ }
}

/**
 * Pick the pastel least used by the peers already in the room, so the first
 * five collaborators are always distinct. Ties break by clientId so two people
 * joining at once don't both pick the same "least used" color.
 */
export function pickColor(clientId: number, taken: string[]): PresenceUser['color'] {
  const counts = new Map(PRESENCE_COLORS.map((c) => [c, 0]))
  for (const c of taken) counts.set(c, (counts.get(c) ?? 0) + 1)
  const min = Math.min(...counts.values())
  const candidates = PRESENCE_COLORS.filter((c) => counts.get(c) === min)
  return candidates[clientId % candidates.length]
}

export function makeUser(name: string, color: string, avatar?: string | null): PresenceUser {
  return { name, color, colorText: LABEL_TEXT, avatar: avatar ?? null }
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')
}

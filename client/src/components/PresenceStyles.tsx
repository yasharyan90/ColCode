import type { Peer } from '../collab/presence'

/**
 * Generates the CSS that colors y-monaco's remote decorations per peer.
 * y-monaco emits `.yRemoteSelection-<clientId>` (selection range) and
 * `.yRemoteSelectionHead-<clientId>` (caret); the name tag is a ::after on the
 * caret. Base geometry lives in index.css; only color + name vary per peer.
 */
export function PresenceStyles({ peers }: { peers: Peer[] }) {
  const css = peers
    .filter((p) => !p.isSelf)
    .map(({ clientId, user }) => {
      const name = user.name.replace(/["\\]/g, '')
      return [
        `.yRemoteSelection-${clientId}{background:${user.color}40}`,
        `.yRemoteSelectionHead-${clientId}{border-color:${user.color}}`,
        `.yRemoteSelectionHead-${clientId}::after{content:"${name}";background:${user.color};color:${user.colorText}}`,
      ].join('')
    })
    .join('\n')
  return <style data-presence>{css}</style>
}

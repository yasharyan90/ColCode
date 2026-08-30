import { strToU8, zipSync } from 'fflate'
import type * as Y from 'yjs'

/** Filesystem-safe archive name from the project title. */
export function zipFileName(projectName: string) {
  const slug = projectName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug || 'project'}.zip`
}

/**
 * Bundle every file in the shared document into a .zip and hand it to the browser.
 * Runs entirely client-side: the Y.Map already holds the full, current text of each file,
 * so any member (viewers included) can export without a round-trip to the API.
 */
export function downloadProjectZip(projectName: string, files: Y.Map<Y.Text>): number {
  const entries: Record<string, Uint8Array> = {}
  files.forEach((text, path) => { entries[path] = strToU8(text.toString()) })
  const count = Object.keys(entries).length
  if (count === 0) return 0

  const bytes = zipSync(entries, { level: 6, mtime: new Date() })
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = zipFileName(projectName)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return count
}

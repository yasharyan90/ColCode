import { useEffect, useState } from 'react'

export type Route = { name: 'dashboard' } | { name: 'login' } | { name: 'project'; id: string } | { name: 'notfound' }

/** History-API router for our three pages; a library would be more than we need. */
export function parseRoute(pathname: string): Route {
  if (pathname === '/' || pathname === '') return { name: 'dashboard' }
  if (pathname === '/login') return { name: 'login' }
  const m = pathname.match(/^\/p\/([a-zA-Z0-9_-]{1,64})\/?$/)
  if (m) return { name: 'project', id: m[1] }
  return { name: 'notfound' }
}

const listeners = new Set<() => void>()

export function navigate(path: string, replace = false) {
  if (replace) history.replaceState(null, '', path); else history.pushState(null, '', path)
  listeners.forEach((l) => l())
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.pathname))
  useEffect(() => {
    const update = () => setRoute(parseRoute(location.pathname))
    listeners.add(update)
    window.addEventListener('popstate', update)
    return () => { listeners.delete(update); window.removeEventListener('popstate', update) }
  }, [])
  return route
}

/** Anchor click handler that keeps navigation client-side. */
export function onLinkClick(e: React.MouseEvent<HTMLAnchorElement>) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
  e.preventDefault()
  navigate(e.currentTarget.getAttribute('href') ?? '/')
}

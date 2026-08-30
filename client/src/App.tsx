import { useEffect } from 'react'
import { useAuth } from './auth/useAuth'
import { useRoute, navigate } from './router'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { EditorPage } from './pages/EditorPage'

export default function App() {
  const auth = useAuth()
  const route = useRoute()

  // Auth gate: everything except /login needs a session.
  useEffect(() => {
    if (auth.loading) return
    if (!auth.user && route.name !== 'login') navigate('/login', true)
    if (auth.user && route.name === 'login') navigate('/', true)
  }, [auth.loading, auth.user, route.name])

  if (auth.loading) return <div className="h-full bg-canvas" />
  if (!auth.user) return <LoginPage auth={auth} />

  switch (route.name) {
    case 'dashboard': return <DashboardPage auth={auth} />
    case 'project': return <EditorPage key={route.id} projectId={route.id} auth={auth} />
    case 'login': return <DashboardPage auth={auth} />
    default: return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-canvas">
        <p className="display text-2xl text-muted">Not found</p>
        <a href="/" className="text-[13px] text-body underline">Back to projects</a>
      </div>
    )
  }
}

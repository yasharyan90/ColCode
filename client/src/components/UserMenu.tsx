import type { AuthState } from '../auth/useAuth'
import { initials } from '../collab/presence'
import { navigate } from '../router'

export function UserMenu({ auth }: { auth: AuthState }) {
  const u = auth.user
  if (!u) return null
  return (
    <div className="flex items-center gap-2" data-user-menu>
      {u.avatarUrl
        ? <img src={u.avatarUrl} alt="" className="h-6 w-6 rounded-full border border-hairline-strong" />
        : <span className="grid h-6 w-6 place-items-center rounded-full bg-strong text-[10px] font-semibold text-ink">{initials(u.name)}</span>}
      <span className="text-[13px] text-body">{u.name}</span>
      <button
        type="button"
        onClick={() => auth.logout().then(() => navigate('/login'))}
        className="caption-upper rounded-sm border border-hairline-strong px-2 py-1 text-muted transition-colors hover:bg-raised hover:text-body"
      >
        Sign out
      </button>
    </div>
  )
}

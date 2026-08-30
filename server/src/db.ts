import pg from 'pg'

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

/**
 * Schema is applied idempotently at boot. Small enough that a migrations tool
 * would be ceremony; switch to one (e.g. node-pg-migrate) when it grows.
 *
 * Note what is NOT here: file contents. Those live in the project's Yjs doc,
 * which the sync server snapshots into project_docs. One source of truth.
 */
const SCHEMA = `
create table if not exists users (
  id          uuid primary key default gen_random_uuid(),
  provider    text not null,
  provider_id text not null,
  handle      text not null,
  name        text not null,
  avatar_url  text,
  email       text,
  created_at  timestamptz not null default now(),
  unique (provider, provider_id)
);
create index if not exists users_handle_idx on users (lower(handle));

create table if not exists projects (
  id         text primary key,
  name       text not null,
  owner_id   uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_members (
  project_id text not null references projects(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  role       text not null check (role in ('owner', 'editor', 'viewer')),
  added_at   timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists project_members_user_idx on project_members (user_id);

create table if not exists project_docs (
  project_id text primary key references projects(id) on delete cascade,
  state      bytea not null,
  updated_at timestamptz not null default now()
);
`

export async function migrate() {
  await pool.query(SCHEMA)
}

export interface User {
  id: string
  provider: string
  handle: string
  name: string
  avatar_url: string | null
  email: string | null
}

export async function upsertUser(u: { provider: string; providerId: string; handle: string; name: string; avatarUrl?: string | null; email?: string | null }): Promise<User> {
  const { rows } = await pool.query<User>(
    `insert into users (provider, provider_id, handle, name, avatar_url, email)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (provider, provider_id) do update
       set handle = excluded.handle, name = excluded.name, avatar_url = excluded.avatar_url, email = excluded.email
     returning id, provider, handle, name, avatar_url, email`,
    [u.provider, u.providerId, u.handle, u.name, u.avatarUrl ?? null, u.email ?? null],
  )
  return rows[0]
}

export async function getUser(id: string): Promise<User | null> {
  const { rows } = await pool.query<User>('select id, provider, handle, name, avatar_url, email from users where id = $1', [id])
  return rows[0] ?? null
}

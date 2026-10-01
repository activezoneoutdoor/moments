// Test harness: a real Postgres (PGlite) with Supabase's roles and auth helpers recreated as they behave in
// production, and every migration in supabase/migrations applied in order.
import { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { pgcrypto } from "npm:@electric-sql/pglite@0.5.8/contrib/pgcrypto";

const MIGRATIONS = new URL("../migrations/", import.meta.url);

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create role supabase_auth_admin nologin;
  create schema extensions;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt()->>'sub', '')::uuid $$;
  grant usage on schema auth, public, extensions to anon, authenticated;
  create schema storage;
  create table storage.objects (id uuid primary key);
  alter table storage.objects enable row level security;
`;

export type User = { id: string; email: string; name?: string };

/**
 * A database with every migration applied. `beforeMigrations` runs first, e.g. to create accounts that existed
 * before a migration (the roles migration keeps them as staff).
 */
export async function migratedDb(beforeMigrations?: (db: PGlite) => Promise<void>): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  await beforeMigrations?.(db);
  await applyMigrations(db);
  return db;
}

/** Applies the migrations whose file names sort at or after `from` and before `until` (all by default). */
export async function applyMigrations(db: PGlite, { from = "", until = "\uffff" } = {}): Promise<void> {
  const files = [];
  for await (const f of Deno.readDir(MIGRATIONS)) if (f.name.endsWith(".sql")) files.push(f.name);
  for (const name of files.sort()) {
    if (name >= from && name < until) await db.exec(await Deno.readTextFile(new URL(name, MIGRATIONS)));
  }
}

/** A database with the Supabase stubs and no migrations, for testing a migration against older data. */
export async function emptyDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  return db;
}

export async function addUsers(db: PGlite, ...users: User[]): Promise<void> {
  for (const u of users) await db.query("insert into auth.users (id, email) values ($1, $2)", [u.id, u.email]);
}

/** Runs SQL as a signed-in user (or anonymously with null), like PostgREST does, in its own transaction. */
export function runAs(db: PGlite) {
  return async <T = Record<string, unknown>>(user: User | null, sql: string, params: unknown[] = []) =>
    await db.transaction(async (tx) => {
      const claims = user
        ? JSON.stringify({
          sub: user.id,
          email: user.email,
          role: "authenticated",
          user_metadata: { full_name: user.name },
        })
        : "";
      await tx.query("select set_config('request.jwt.claims', $1, true)", [claims]);
      await tx.exec(`set local role ${user ? "authenticated" : "anon"}`);
      return (await tx.query<T>(sql, params)).rows;
    });
}

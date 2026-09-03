-- Cartographer — Supabase schema.
--
-- Paste this whole file into the Supabase SQL editor once, on a new project.
-- It is idempotent: running it again is safe.
--
-- Design notes:
--   * The hierarchy is project -> area -> board -> page, enforced by NOT NULL
--     foreign keys: a board cannot exist outside an area, nor a page off a board,
--     and deleting a parent cascades to everything under it.
--   * Ids are the client's own strings (p1, a3, nabc12…), not uuids. The client
--     generates them offline, so the database must accept them as given.
--   * A project's schema (block types and their order) lives on the project row.
--     It is 1:1 with the project and always travels with it.
--   * Only 'manual' edges are stored. Wiki and field edges are derived from page
--     bodies and ref values, so storing them would mean writing a handful of rows
--     on every keystroke and re-deriving them on read anyway.
--   * `updated` is the client's own millisecond timestamp, and is what last-write-
--     wins compares. `updated_at` is server-side and only for debugging.

create extension if not exists "pgcrypto";

/* ---------- tables ---------- */

create table if not exists public.projects (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default 'Untitled',
  system      text not null default '',
  accent      text not null default '#8fa5c9',
  -- ProjectSchema: { types: Record<key, BlockType>, typeOrder: string[] }
  types       jsonb not null default '{}'::jsonb,
  type_order  jsonb not null default '[]'::jsonb,
  updated     bigint not null default 0,
  updated_at  timestamptz not null default now()
);

create table if not exists public.areas (
  id           text primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id   text not null references public.projects (id) on delete cascade,
  name         text not null default 'New area',
  default_type text not null default 'note',
  updated      bigint not null default 0,
  updated_at   timestamptz not null default now()
);

create table if not exists public.boards (
  id         text primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  area_id    text not null references public.areas (id) on delete cascade,
  name       text not null default 'New board',
  updated    bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.pages (
  id         text primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  board_id   text not null references public.boards (id) on delete cascade,
  type       text not null default 'note',
  title      text not null default 'Untitled',
  x          integer not null default 0,
  y          integer not null default 0,
  w          integer not null default 244,
  h          integer not null default 116,
  fields     jsonb not null default '{}'::jsonb,
  -- null = follow the block type's schema; [] = a blank page with no elements yet.
  custom     jsonb,
  cols       smallint not null default 0 check (cols between 0 and 4),
  body       text not null default '',
  updated    bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.edges (
  id         text primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  from_page  text not null references public.pages (id) on delete cascade,
  to_page    text not null references public.pages (id) on delete cascade,
  -- Only 'manual' is ever stored; the column exists so the row round-trips whole.
  kind       text not null default 'manual' check (kind in ('wiki', 'manual', 'field')),
  updated    bigint not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists areas_project_idx  on public.areas  (user_id, project_id);
create index if not exists boards_project_idx on public.boards (user_id, project_id);
create index if not exists boards_area_idx    on public.boards (user_id, area_id);
create index if not exists pages_project_idx  on public.pages  (user_id, project_id);
create index if not exists pages_board_idx    on public.pages  (user_id, board_id);
create index if not exists edges_project_idx  on public.edges  (user_id, project_id);

/* ---------- grants ---------- */
-- Supabase grants these by default on new public tables, but saying so explicitly
-- means the schema does not depend on that default staying in place. `anon` is
-- deliberately left out: signed-out visitors get nothing.

grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.projects, public.areas, public.boards, public.pages, public.edges
  to authenticated;

/* ---------- row level security ---------- */
-- Every table is owner-only. Without these policies the anon key would expose
-- every row to every visitor, so they are not optional.

alter table public.projects enable row level security;
alter table public.areas    enable row level security;
alter table public.boards   enable row level security;
alter table public.pages    enable row level security;
alter table public.edges    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['projects', 'areas', 'boards', 'pages', 'edges'] loop
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format(
      'create policy owner_all on public.%I
         for all
         using (user_id = auth.uid())
         with check (user_id = auth.uid())', t);
  end loop;
end $$;

/* ---------- server-side updated_at ---------- */

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['projects', 'areas', 'boards', 'pages', 'edges'] loop
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format(
      'create trigger touch_updated_at before insert or update on public.%I
         for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

/* ---------- realtime ---------- */
-- Lets the other machine hear about a change without polling.

do $$
declare t text;
begin
  foreach t in array array['projects', 'areas', 'boards', 'pages', 'edges'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
exception
  when undefined_object then
    raise notice 'publication supabase_realtime not found — skipping realtime setup';
end $$;

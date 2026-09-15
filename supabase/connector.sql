-- Cartographer — storage for the hosted MCP connector.
--
-- Paste this into the Supabase SQL editor once, alongside schema.sql, if you want
-- to connect Cartographer to Claude in the browser. The desktop connector needs
-- none of this.
--
-- These three tables are the connector's own bookkeeping: which Claude
-- installation registered itself, which authorisation codes are outstanding, and
-- which access tokens are live. Nothing here is part of a project.
--
-- All three are service-role only. Row-level security is enabled with no policy at
-- all, which denies every request made with the anon key — the Edge Function
-- reaches them with the service role, and nothing else can reach them.

create extension if not exists "pgcrypto";

/* ---------- registered clients ---------- */
-- Claude registers itself dynamically (RFC 7591) the first time you add the
-- connector, and is handed a client id and secret of its own.

create table if not exists public.mcp_clients (
  client_id     text primary key,
  client_secret text not null,
  client_name   text not null default 'MCP client',
  redirect_uris text[] not null,
  created_at    timestamptz not null default now()
);

/* ---------- authorisation codes ---------- */
-- Single use, short lived, and bound to the PKCE challenge the client sent, so a
-- stolen code is useless without the verifier that only that client holds.

create table if not exists public.mcp_codes (
  code            text primary key,
  client_id       text not null references public.mcp_clients (client_id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  redirect_uri    text not null,
  code_challenge  text not null,
  -- The Supabase session this authorisation stands for. Moved to the token row on
  -- exchange and deleted with the code.
  refresh_token   text not null,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);

/* ---------- live access tokens ---------- */
-- Only a hash of the bearer token is stored, so a copy of this table does not hand
-- anyone a working token. The Supabase refresh token beside it is what lets the
-- connector act as you, under your own row-level security — it is the reason these
-- tables are service-role only.

create table if not exists public.mcp_tokens (
  token_hash    text primary key,
  client_id     text not null references public.mcp_clients (client_id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  refresh_token text not null,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists mcp_tokens_user_idx on public.mcp_tokens (user_id);
create index if not exists mcp_codes_expiry_idx on public.mcp_codes (expires_at);

/* ---------- lock them down ---------- */
-- Enabled with no policies: every anon-key request is refused. The Edge Function
-- uses the service role, which bypasses RLS by design.

alter table public.mcp_clients enable row level security;
alter table public.mcp_codes   enable row level security;
alter table public.mcp_tokens  enable row level security;

revoke all on public.mcp_clients from anon, authenticated;
revoke all on public.mcp_codes   from anon, authenticated;
revoke all on public.mcp_tokens  from anon, authenticated;

/* ---------- housekeeping ---------- */
-- Called by the function on each authorisation, so expired rows do not pile up
-- without anyone scheduling anything.

create or replace function public.mcp_sweep_expired()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.mcp_codes where expires_at < now();
  delete from public.mcp_tokens where expires_at < now();
$$;

revoke all on function public.mcp_sweep_expired() from anon, authenticated;

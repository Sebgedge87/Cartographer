import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  CODE_TTL_SECONDS, TOKEN_TTL_SECONDS, authorizationServerMetadata, pkceMatches,
  protectedResourceMetadata, randomToken, redirectAllowed, redirectWithCode,
  redirectWithError, sha256Base64Url,
} from './oauth.js';
import { handleRpc, type RpcRequest } from './rpc.js';
import { signInPage } from './signin.js';

/**
 * The hosted connector, as one web handler.
 *
 * Web-standard Request in, Response out, and nothing platform-specific inside, so
 * the same code is a Supabase Edge Function, a Worker, or a Node server under test.
 * Whatever hosts it supplies the environment.
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  /** Service role: reaches the connector's own three tables, which nothing else can. */
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Public URL this is served at, e.g. https://ref.supabase.co/functions/v1/mcp. */
  MCP_PUBLIC_URL?: string;
  /** '1' to publish only the reading tools. */
  CARTOGRAPHER_READ_ONLY?: string;
}

const JSON_HEADERS = { 'content-type': 'application/json' };

/** Discovery and the token endpoint are fetched cross-origin by the client. */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-max-age': '86400',
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...CORS, ...extra } });

const oauthError = (error: string, description: string, status = 400) =>
  json({ error, error_description: description }, status);

/**
 * Where this server lives, as the outside world sees it.
 *
 * Configured, never guessed. Deriving it from the request looks reasonable and is
 * not: mounted at /functions/v1/mcp, the MCP endpoint *is* the function root, so
 * stripping a trailing "/mcp" yields /functions/v1 and every URL in the discovery
 * documents points at nothing. Every one of them has to be right for the handshake
 * to start at all, so a missing value is an error worth saying out loud rather than
 * a default worth inventing.
 */
function publicBase(env: Env): string | null {
  return env.MCP_PUBLIC_URL ? env.MCP_PUBLIC_URL.replace(/\/+$/, '') : null;
}

/** The path within this function, whatever prefix it happens to be mounted at. */
function route(request: Request): string {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  const known = ['/.well-known/oauth-protected-resource', '/.well-known/oauth-authorization-server',
    '/register', '/authorize', '/token', '/mcp'];
  for (const candidate of known) {
    if (path === candidate || path.endsWith(candidate)) return candidate;
  }
  return path;
}

function admin(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function formOrJson(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      out[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    return out;
  }
  const form = await request.formData().catch(() => new FormData());
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) out[k] = typeof v === 'string' ? v : '';
  return out;
}

/* ---------- the handler ---------- */

export async function handler(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const base = publicBase(env);
  if (!base) {
    return json({
      error: 'server_misconfigured',
      error_description:
        'MCP_PUBLIC_URL is not set. It must be the full public URL of this function, e.g. '
        + 'https://YOUR-PROJECT.supabase.co/functions/v1/mcp — every address in the OAuth '
        + 'discovery documents is built from it. Set it with: supabase secrets set MCP_PUBLIC_URL=...',
    }, 500);
  }
  const path = route(request);

  switch (path) {
    case '/.well-known/oauth-protected-resource':
      return json(protectedResourceMetadata(base));
    case '/.well-known/oauth-authorization-server':
      return json(authorizationServerMetadata(base));
    case '/register':
      return register(request, env);
    case '/authorize':
      return authorize(request, env, base);
    case '/token':
      return token(request, env);
    case '/mcp':
      return mcp(request, env, base);
    default:
      return json({ error: 'not_found', endpoints: ['/mcp', '/authorize', '/token', '/register'] }, 404);
  }
}

/* ---------- RFC 7591: dynamic client registration ---------- */

async function register(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return oauthError('invalid_request', 'POST required.', 405);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const uris = Array.isArray(body?.['redirect_uris'])
    ? (body!['redirect_uris'] as unknown[]).filter((u): u is string => typeof u === 'string')
    : [];
  if (!uris.length) return oauthError('invalid_client_metadata', 'redirect_uris is required.');
  for (const uri of uris) {
    try {
      const parsed = new URL(uri);
      // Anything but https would carry the code in the clear. Localhost is the
      // documented exception, for a client running on the same machine.
      if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        return oauthError('invalid_redirect_uri', `${uri} is not https.`);
      }
    } catch {
      return oauthError('invalid_redirect_uri', `${uri} is not a URL.`);
    }
  }

  const client = {
    client_id: randomToken(16),
    client_secret: randomToken(32),
    client_name: typeof body?.['client_name'] === 'string' ? (body['client_name'] as string).slice(0, 120) : 'MCP client',
    redirect_uris: uris,
  };
  const { error } = await admin(env).from('mcp_clients').insert(client);
  if (error) return oauthError('server_error', error.message, 500);

  return json({
    client_id: client.client_id,
    client_secret: client.client_secret,
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    token_endpoint_auth_method: 'client_secret_post',
    grant_types: ['authorization_code'],
    response_types: ['code'],
  }, 201);
}

/* ---------- /authorize ---------- */

async function authorize(request: Request, env: Env, base: string): Promise<Response> {
  const params = request.method === 'POST'
    ? await formOrJson(request)
    : Object.fromEntries(new URL(request.url).searchParams);

  const clientId = params['client_id'] ?? '';
  const redirectUri = params['redirect_uri'] ?? '';
  const challenge = params['code_challenge'] ?? '';
  const method = params['code_challenge_method'] ?? '';
  const state = params['state'] ?? null;

  const db = admin(env);
  const { data: client } = await db.from('mcp_clients').select('*').eq('client_id', clientId).maybeSingle();
  // A bad client or redirect must never be bounced back to the given URI — that is
  // how an open redirector is built. Show it here instead.
  if (!client) return oauthError('invalid_client', 'Unknown client. Remove the connector and add it again.');
  if (!redirectAllowed(client.redirect_uris as string[], redirectUri)) {
    return oauthError('invalid_request', 'That redirect URI is not registered to this client.');
  }
  if (params['response_type'] !== 'code') {
    return Response.redirect(redirectWithError(redirectUri, 'unsupported_response_type', state), 302);
  }
  if (method !== 'S256' || !challenge) {
    return Response.redirect(redirectWithError(redirectUri, 'invalid_request', state), 302);
  }

  // Everything the POST has to arrive with. The form is the only thing carrying it
  // back, so anything left out here is simply missing on submission — which is how
  // response_type went astray and turned every sign-in into an error redirect.
  const carry = {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: method,
    ...(state ? { state } : {}),
  };
  const page = (error?: string) => new Response(
    signInPage({
      action: `${base}/authorize`,
      hidden: carry,
      clientName: (client.client_name as string) ?? 'Claude',
      ...(error ? { error } : {}),
    }),
    // 200 even when re-showing with an error: this is a form to fill in again, not
    // an API refusal, and nothing should be prompted for credentials by the browser.
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );

  if (request.method !== 'POST') return page();

  const email = params['email'] ?? '';
  const password = params['password'] ?? '';
  if (!email || !password) return page('Enter your email and password.');

  // Sign in with the anon key, exactly as the app does — this server never sees a
  // password it did not just forward, and stores none.
  const auth = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !session.session) return page(error?.message ?? 'Could not sign in.');

  // Housekeeping, not the point of this request: a failure here must not stop
  // someone signing in.
  try {
    await db.rpc('mcp_sweep_expired');
  } catch {
    /* the next authorisation tries again */
  }

  const code = randomToken(32);
  const { error: saveError } = await db.from('mcp_codes').insert({
    code,
    client_id: clientId,
    user_id: session.session.user.id,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    refresh_token: session.session.refresh_token,
    access_token: session.session.access_token,
    access_expires: new Date((session.session.expires_at ?? 0) * 1000).toISOString(),
    expires_at: new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString(),
  });
  if (saveError) return page(saveError.message);

  return Response.redirect(redirectWithCode(redirectUri, code, state), 302);
}

/* ---------- /token ---------- */

async function token(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return oauthError('invalid_request', 'POST required.', 405);
  const params = await formOrJson(request);
  if (params['grant_type'] !== 'authorization_code') {
    return oauthError('unsupported_grant_type', 'Only authorization_code is supported.');
  }

  const db = admin(env);
  const code = params['code'] ?? '';
  const { data: row } = await db.from('mcp_codes').select('*').eq('code', code).maybeSingle();
  if (!row) return oauthError('invalid_grant', 'That code is not valid.');

  // PKCE is what binds this exchange to the client that started it, so a secret is
  // not required — but a client that sends one is asserting something, and an
  // assertion that is never checked is worse than one never made.
  const secret = params['client_secret'];
  if (secret) {
    const { data: client } = await db.from('mcp_clients').select('client_secret')
      .eq('client_id', row.client_id).maybeSingle();
    if (!client || client.client_secret !== secret) {
      await db.from('mcp_codes').delete().eq('code', code);
      return oauthError('invalid_client', 'Client authentication failed.');
    }
  }

  // Single use, whatever happens next: delete before deciding, so a code cannot be
  // replayed by racing two exchanges.
  await db.from('mcp_codes').delete().eq('code', code);

  if (new Date(row.expires_at as string).getTime() < Date.now()) {
    return oauthError('invalid_grant', 'That code has expired.');
  }
  if ((params['client_id'] ?? '') !== row.client_id) {
    return oauthError('invalid_grant', 'That code was issued to another client.');
  }
  if ((params['redirect_uri'] ?? '') !== row.redirect_uri) {
    return oauthError('invalid_grant', 'Redirect URI does not match the one the code was issued for.');
  }
  if (!(await pkceMatches(row.code_challenge as string, params['code_verifier'] ?? ''))) {
    return oauthError('invalid_grant', 'PKCE verification failed.');
  }

  const access = randomToken(32);
  const { error } = await db.from('mcp_tokens').insert({
    token_hash: await sha256Base64Url(access),
    client_id: row.client_id,
    user_id: row.user_id,
    refresh_token: row.refresh_token,
    access_token: row.access_token ?? '',
    access_expires: row.access_expires ?? new Date(0).toISOString(),
    expires_at: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) return oauthError('server_error', error.message, 500);

  return json({
    access_token: access,
    token_type: 'Bearer',
    expires_in: TOKEN_TTL_SECONDS,
    scope: 'cartographer',
  }, 200, { 'cache-control': 'no-store' });
}

/* ---------- /mcp ---------- */

/** 401 with the pointer that starts the OAuth dance (RFC 9728 §5.1). */
function unauthorized(base: string): Response {
  return json({ error: 'unauthorized' }, 401, {
    'www-authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`,
  });
}

/** Refresh a little before the token actually runs out, so a slow call is not caught out. */
const REFRESH_MARGIN_MS = 60_000;

/**
 * A live Supabase access token for this connector token, or null.
 *
 * Supabase invalidates a refresh token as it is used and issues another. Refreshing
 * on every call therefore cannot survive Claude doing what Claude does — issuing
 * several tool calls at once — because the second would present a token the first
 * had already spent. Worse, treating that failure as revocation deleted the row and
 * locked the connector out for good.
 *
 * So the access token is held until it expires, and only then refreshed. A refresh
 * that loses a race re-reads the row, where the winner has just left a fresh token.
 */
async function userSession(
  env: Env,
  db: SupabaseClient,
  row: Record<string, unknown>,
): Promise<string | null> {
  /*
   * Two different questions, and conflating them is a trap. "Should I refresh?"
   * wants a margin, so a call that takes a moment is not caught out mid-flight.
   * "Can I use what is here?" does not: a token someone else just minted may be
   * shorter-lived than the margin, and demanding the margin of it would refuse a
   * perfectly good token and refresh for ever without ever being satisfied.
   */
  const token = (r: Record<string, unknown>) =>
    typeof r['access_token'] === 'string' && r['access_token'] ? r['access_token'] : null;
  const expiresAt = (r: Record<string, unknown>) => new Date(String(r['access_expires'])).getTime();
  const fresh = (r: Record<string, unknown>) => token(r) && expiresAt(r) - REFRESH_MARGIN_MS > Date.now();
  const usable = (r: Record<string, unknown>) => token(r) && expiresAt(r) > Date.now();

  if (fresh(row)) return token(row);

  const refreshed = await refresh(env, db, row);
  if (refreshed) return refreshed;

  /*
   * The refresh failed. Nearly always that means another call got there first and
   * spent the token — so wait for the winner's write and take what it left, rather
   * than reporting a dead grant. Two short backoffs is enough for a write that is
   * already in flight, and bounded so a genuinely revoked grant still fails
   * promptly rather than hanging.
   *
   * Real Supabase has a reuse window in which the same refresh token returns the
   * same session, which alone would cover most of this. Not relying on it: it is a
   * configurable server setting, and a connector that quietly depends on a default
   * is a connector that breaks when someone changes it.
   */
  for (const wait of [120, 300]) {
    await new Promise((resolve) => setTimeout(resolve, wait));
    const { data: latest } = await db.from('mcp_tokens').select('*')
      .eq('token_hash', row['token_hash']).maybeSingle();
    if (latest && usable(latest)) return token(latest);
  }
  return null;
}

async function refresh(
  env: Env,
  db: SupabaseClient,
  row: Record<string, unknown>,
): Promise<string | null> {
  const auth = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await auth.auth.refreshSession({
    refresh_token: row['refresh_token'] as string,
  });
  if (error || !data.session) return null;

  // Never deleted on failure: a lost race is not a revoked grant, and throwing the
  // row away would have meant re-adding the connector by hand.
  await db.from('mcp_tokens').update({
    refresh_token: data.session.refresh_token,
    access_token: data.session.access_token,
    access_expires: new Date((data.session.expires_at ?? 0) * 1000).toISOString(),
  }).eq('token_hash', row['token_hash']);

  return data.session.access_token;
}

async function mcp(request: Request, env: Env, base: string): Promise<Response> {
  // No server-initiated stream, so there is nothing to open a GET on.
  if (request.method === 'GET') return json({ error: 'method_not_allowed' }, 405);
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!bearer) return unauthorized(base);

  const db = admin(env);
  const { data: row } = await db.from('mcp_tokens').select('*')
    .eq('token_hash', await sha256Base64Url(bearer)).maybeSingle();
  if (!row) return unauthorized(base);
  if (new Date(row.expires_at as string).getTime() < Date.now()) {
    await db.from('mcp_tokens').delete().eq('token_hash', row.token_hash);
    return unauthorized(base);
  }

  // Act as the user, with their own row-level security deciding what is reachable.
  // The service role never touches a project table.
  const session = await userSession(env, db, row);
  if (!session) return unauthorized(base);
  const asUser = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session}` } },
  });

  const body = await request.json().catch(() => null);
  if (!body) return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error.' } });

  const allowWrites = env.CARTOGRAPHER_READ_ONLY !== '1';
  const messages: RpcRequest[] = Array.isArray(body) ? body : [body];
  const replies = [];
  for (const message of messages) {
    const reply = await handleRpc(message, asUser, { allowWrites });
    if (reply) replies.push(reply);
  }

  // Nothing but notifications: 202 with no body, as the spec asks.
  if (!replies.length) return new Response(null, { status: 202, headers: CORS });
  return json(Array.isArray(body) ? replies : replies[0]);
}

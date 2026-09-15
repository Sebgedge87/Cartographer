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
 * Behind a proxy the request URL is not necessarily the public one, so a
 * configured value wins; the forwarded headers are the fallback, and the request's
 * own URL the last resort.
 */
function publicBase(request: Request, env: Env): string {
  if (env.MCP_PUBLIC_URL) return env.MCP_PUBLIC_URL.replace(/\/+$/, '');
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') ?? url.host;
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const path = url.pathname.replace(/\/(authorize|token|register|mcp)$/, '').replace(/\/+$/, '');
  return `${proto}://${host}${path}`;
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

  const base = publicBase(request, env);
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
  const asUser = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error } = await asUser.auth.refreshSession({
    refresh_token: row.refresh_token as string,
  });
  if (error || !session.session) {
    // The session behind this token is gone — signed out elsewhere, or revoked.
    await db.from('mcp_tokens').delete().eq('token_hash', row.token_hash);
    return unauthorized(base);
  }
  // Supabase rotates refresh tokens on use, so keep the new one or the next call
  // would present one that has already been spent.
  await db.from('mcp_tokens')
    .update({ refresh_token: session.session.refresh_token })
    .eq('token_hash', row.token_hash);

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

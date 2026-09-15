/**
 * The OAuth 2.1 bits a remote MCP server has to be.
 *
 * Claude will not talk to a connector that is not a protected resource, so this
 * implements exactly what the handshake needs and nothing else: the two discovery
 * documents, dynamic client registration, an authorisation endpoint that signs the
 * user in against Supabase, and a token endpoint that checks PKCE.
 *
 * Pure functions and web-standard types only — no Deno, no Node — so the same code
 * runs on an Edge Function and under a test harness here.
 */

export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
export const CODE_TTL_SECONDS = 60 * 5;

/** RFC 9728 — what a protected resource says about who guards it. */
export function protectedResourceMetadata(base: string) {
  return {
    resource: base,
    authorization_servers: [base],
    bearer_methods_supported: ['header'],
    scopes_supported: ['cartographer'],
  };
}

/** RFC 8414 — what an authorization server says about its own endpoints. */
export function authorizationServerMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    scopes_supported: ['cartographer'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    // PKCE is not optional here: it is the only thing binding the code to the
    // client that asked for it.
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
  };
}

const B64URL = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** A URL-safe random string, from the platform's own CSPRNG. */
export function randomToken(bytes = 32): string {
  return B64URL(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return B64URL(new Uint8Array(digest));
}

/**
 * Does this verifier match the challenge the client committed to?
 *
 * S256 only. The spec allows "plain", which offers no protection at all, so it is
 * not advertised and not accepted.
 */
export async function pkceMatches(challenge: string, verifier: string): Promise<boolean> {
  if (!challenge || !verifier) return false;
  return (await sha256Base64Url(verifier)) === challenge;
}

/**
 * A redirect URI is acceptable only if the client registered it, exactly.
 *
 * Prefix matching is the classic way this goes wrong: a client that registered
 * https://claude.ai/callback would otherwise accept
 * https://claude.ai/callback.attacker.example and hand over the code.
 */
export function redirectAllowed(registered: readonly string[], wanted: string): boolean {
  return registered.includes(wanted);
}

/** Send the browser back to the client with the code, preserving their state. */
export function redirectWithCode(redirectUri: string, code: string, state: string | null): string {
  const url = new URL(redirectUri);
  url.searchParams.set('code', code);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

export function redirectWithError(redirectUri: string, error: string, state: string | null): string {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { handler } from './handler.js';

const env = {
  SUPABASE_URL: 'http://localhost:4188',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  MCP_PUBLIC_URL: 'https://x.supabase.co/functions/v1/mcp',
};
const get = (path: string) => handler(new Request(`https://x.supabase.co${path}`), env);

test('the path-appended discovery form is answered', async () => {
  const r = await get('/functions/v1/mcp/.well-known/oauth-authorization-server');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).issuer, env.MCP_PUBLIC_URL);
});

/*
 * RFC 8414 inserts the well-known segment before the issuer's path, so this URL
 * ends in "/mcp" and used to be answered as the MCP endpoint — a 401 challenge in
 * reply to a discovery probe, which is a handshake that never begins.
 */
test('the path-aware discovery form is not mistaken for the MCP endpoint', async () => {
  const r = await get('/.well-known/oauth-authorization-server/functions/v1/mcp');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).token_endpoint, `${env.MCP_PUBLIC_URL}/token`);
});

test('the same holds for the protected-resource document', async () => {
  const r = await get('/.well-known/oauth-protected-resource/functions/v1/mcp');
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).authorization_servers, [env.MCP_PUBLIC_URL]);
});

test('the OIDC spelling is answered too', async () => {
  const r = await get('/functions/v1/mcp/.well-known/openid-configuration');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).issuer, env.MCP_PUBLIC_URL);
});

test('the function root is still the MCP endpoint', async () => {
  const r = await handler(
    new Request('https://x.supabase.co/functions/v1/mcp', { method: 'POST', body: '{}' }),
    env,
  );
  assert.equal(r.status, 401);
  assert.match(r.headers.get('www-authenticate') ?? '', /resource_metadata=/);
});

test('the challenge names the document outright, so discovery never has to guess', async () => {
  const r = await handler(
    new Request('https://x.supabase.co/functions/v1/mcp', { method: 'POST', body: '{}' }),
    env,
  );
  assert.equal(
    r.headers.get('www-authenticate'),
    `Bearer resource_metadata="${env.MCP_PUBLIC_URL}/.well-known/oauth-protected-resource"`,
  );
});

test('the other endpoints still route', async () => {
  const r = await handler(
    new Request('https://x.supabase.co/functions/v1/mcp/token', { method: 'GET' }),
    env,
  );
  // GET is refused by the token endpoint, which proves it routed there.
  assert.equal(r.status, 405);
});

test('an unknown path is a 404 naming what does exist', async () => {
  const r = await get('/functions/v1/mcp/nonsense');
  assert.equal(r.status, 404);
  assert.ok((await r.json()).endpoints.includes('/mcp'));
});

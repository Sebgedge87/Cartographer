import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizationServerMetadata, pkceMatches, protectedResourceMetadata,
  randomToken, redirectAllowed, redirectWithCode, redirectWithError, sha256Base64Url,
} from './oauth.js';

test('the resource points at itself as its own authorization server', () => {
  const m = protectedResourceMetadata('https://x.example/functions/v1/mcp');
  assert.equal(m.resource, 'https://x.example/functions/v1/mcp');
  assert.deepEqual(m.authorization_servers, ['https://x.example/functions/v1/mcp']);
});

test('the endpoints hang off the same base', () => {
  const m = authorizationServerMetadata('https://x.example/fn/mcp');
  assert.equal(m.authorization_endpoint, 'https://x.example/fn/mcp/authorize');
  assert.equal(m.token_endpoint, 'https://x.example/fn/mcp/token');
  assert.equal(m.registration_endpoint, 'https://x.example/fn/mcp/register');
});

test('only S256 is advertised — plain PKCE protects nothing', () => {
  assert.deepEqual(authorizationServerMetadata('https://x').code_challenge_methods_supported, ['S256']);
});

test('a verifier matching its challenge is accepted', async () => {
  const verifier = randomToken();
  const challenge = await sha256Base64Url(verifier);
  assert.equal(await pkceMatches(challenge, verifier), true);
});

test('a different verifier is refused', async () => {
  const challenge = await sha256Base64Url(randomToken());
  assert.equal(await pkceMatches(challenge, randomToken()), false);
});

test('an empty verifier or challenge is refused rather than trivially matching', async () => {
  assert.equal(await pkceMatches('', ''), false);
  assert.equal(await pkceMatches(await sha256Base64Url('a'), ''), false);
});

test('a plain verifier offered against its own value does not pass', async () => {
  // Guards against ever accidentally supporting the "plain" method.
  const verifier = 'abc123';
  assert.equal(await pkceMatches(verifier, verifier), false);
});

test('tokens are url-safe and not obviously guessable', () => {
  const a = randomToken();
  assert.match(a, /^[A-Za-z0-9_-]+$/);
  assert.ok(a.length >= 40);
  assert.notEqual(a, randomToken());
});

test('a redirect must have been registered exactly', () => {
  const registered = ['https://claude.ai/api/mcp/auth_callback'];
  assert.equal(redirectAllowed(registered, 'https://claude.ai/api/mcp/auth_callback'), true);
});

test('a lookalike redirect is refused', () => {
  const registered = ['https://claude.ai/api/mcp/auth_callback'];
  assert.equal(redirectAllowed(registered, 'https://claude.ai/api/mcp/auth_callback.evil.example'), false);
  assert.equal(redirectAllowed(registered, 'https://claude.ai/api/mcp/auth_callback?x=1'), false);
  assert.equal(redirectAllowed(registered, 'https://evil.example/cb'), false);
});

test('the code and the client state both come back', () => {
  const to = redirectWithCode('https://claude.ai/cb', 'CODE', 'STATE');
  const url = new URL(to);
  assert.equal(url.searchParams.get('code'), 'CODE');
  assert.equal(url.searchParams.get('state'), 'STATE');
});

test('a redirect that already carries a query keeps it', () => {
  const to = redirectWithCode('https://claude.ai/cb?flow=1', 'CODE', null);
  const url = new URL(to);
  assert.equal(url.searchParams.get('flow'), '1');
  assert.equal(url.searchParams.get('code'), 'CODE');
  assert.equal(url.searchParams.get('state'), null);
});

test('an error goes back the same way, not as a blank page', () => {
  const url = new URL(redirectWithError('https://claude.ai/cb', 'access_denied', 'S'));
  assert.equal(url.searchParams.get('error'), 'access_denied');
  assert.equal(url.searchParams.get('state'), 'S');
});

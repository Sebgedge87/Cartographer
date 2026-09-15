/**
 * Who this server says it is.
 *
 * Its own module so the HTTP connector can name itself without importing the MCP
 * SDK — the stdio transport needs the SDK, the hosted one speaks JSON-RPC directly,
 * and bundling a client library into an Edge Function for one constant would be
 * absurd.
 */
export const SERVER_INFO = { name: 'cartographer', version: '0.1.0' } as const;

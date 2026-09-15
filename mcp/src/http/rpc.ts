import type { SupabaseClient } from '@supabase/supabase-js';
import { TOOLS, ToolError } from '../tools.js';
import { SERVER_INFO } from '../info.js';

/**
 * MCP over Streamable HTTP, stateless.
 *
 * Each POST carries one JSON-RPC message and gets one JSON response. The spec
 * allows a server to answer with either application/json or an SSE stream; nothing
 * here pushes anything at the client unprompted, so a plain JSON reply is both
 * correct and far less to go wrong. There is no session to keep, which means no
 * session to lose when an Edge Function instance is recycled mid-conversation.
 */

/** The version this speaks. Clients asking for another are answered with this one. */
const PROTOCOL_VERSION = '2025-06-18';

export interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

type RpcResult = { jsonrpc: '2.0'; id: string | number | null; result: unknown };
type RpcError = { jsonrpc: '2.0'; id: string | number | null; error: { code: number; message: string } };

const ok = (id: string | number | null, result: unknown): RpcResult => ({ jsonrpc: '2.0', id, result });
const fail = (id: string | number | null, code: number, message: string): RpcError =>
  ({ jsonrpc: '2.0', id, error: { code, message } });

/**
 * Handle one message. Returns null for a notification, which by JSON-RPC takes no
 * reply at all — answering one is a protocol error, not a courtesy.
 */
export async function handleRpc(
  message: RpcRequest,
  db: SupabaseClient,
  options: { allowWrites: boolean },
): Promise<RpcResult | RpcError | null> {
  const id = message.id ?? null;
  const tools = TOOLS.filter((t) => options.allowWrites || !t.writes);

  switch (message.method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          'Cartographer holds a tabletop or board-game project as areas, boards and pages. '
          + 'Call describe_project first: it returns the areas, the boards inside them, the block types '
          + 'with the fields each defines, and the tags in use, which is everything the other tools need. '
          + 'Name pages by title and fields by their labels.',
      });

    // Notifications: acknowledged by saying nothing, which is what the spec asks.
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;

    case 'ping':
      return ok(id, {});

    case 'tools/list':
      return ok(id, {
        tools: tools.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: !t.writes },
        })),
      });

    case 'tools/call': {
      const name = String(message.params?.['name'] ?? '');
      const tool = tools.find((t) => t.name === name);
      if (!tool) {
        return ok(id, {
          isError: true,
          content: [{ type: 'text', text: `No tool called "${name}".` }],
        });
      }
      try {
        const args = (message.params?.['arguments'] ?? {}) as Record<string, unknown>;
        const result = await tool.run(db, args);
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      } catch (e) {
        // A tool that could not do what was asked is a result, not a transport
        // failure: the caller can read it and try something else.
        const text = e instanceof ToolError ? e.message : e instanceof Error ? e.message : String(e);
        return ok(id, { isError: true, content: [{ type: 'text', text }] });
      }
    }

    default:
      return fail(id, -32601, `Unknown method "${message.method}".`);
  }
}

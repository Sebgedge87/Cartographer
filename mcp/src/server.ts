import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TOOLS, ToolError } from './tools.js';
import { SERVER_INFO } from './info.js';

export { SERVER_INFO };

/**
 * An MCP server bound to one signed-in Supabase session.
 *
 * The transport is not its business: the same server is driven over stdio by a
 * desktop client and over HTTP by the hosted connector. What it does know is that
 * every call runs as one user, under that user's row-level security.
 */
export function buildServer(db: SupabaseClient, options: { allowWrites?: boolean } = {}): Server {
  const allowWrites = options.allowWrites !== false;
  const available = TOOLS.filter((t) => allowWrites || !t.writes);

  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: available.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: { readOnlyHint: !t.writes },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = available.find((t) => t.name === request.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `No tool called "${request.params.name}".` }],
      };
    }
    try {
      const result = await tool.run(db, (request.params.arguments ?? {}) as Record<string, unknown>);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      // A tool error is something the caller can act on — a name that matched
      // nothing, a field that does not exist — so it comes back as a readable
      // message rather than a protocol failure.
      const message = e instanceof ToolError ? e.message
        : e instanceof Error ? e.message
        : String(e);
      return { isError: true, content: [{ type: 'text' as const, text: message }] };
    }
  });

  return server;
}

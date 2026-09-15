#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient } from '@supabase/supabase-js';
import { buildServer } from './server.js';

/**
 * The desktop connector: one process, talking MCP over stdin and stdout.
 *
 * Credentials come from the environment rather than a config file of its own, so
 * the password never sits on disk in this repo. It signs in as you, which means
 * row-level security is doing the access control — this process holds no key that
 * could reach anyone else's projects.
 */
async function main(): Promise<void> {
  const url = process.env['SUPABASE_URL'];
  const anonKey = process.env['SUPABASE_ANON_KEY'];
  const email = process.env['CARTOGRAPHER_EMAIL'];
  const password = process.env['CARTOGRAPHER_PASSWORD'];

  const missing = [
    !url && 'SUPABASE_URL',
    !anonKey && 'SUPABASE_ANON_KEY',
    !email && 'CARTOGRAPHER_EMAIL',
    !password && 'CARTOGRAPHER_PASSWORD',
  ].filter(Boolean);
  if (missing.length) {
    // stderr, never stdout: stdout is the protocol channel and anything else on it
    // is a parse error at the other end.
    process.stderr.write(`cartographer-mcp: missing ${missing.join(', ')}\n`);
    process.exit(1);
  }

  const db = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: true },
  });
  const { error } = await db.auth.signInWithPassword({ email: email!, password: password! });
  if (error) {
    process.stderr.write(`cartographer-mcp: could not sign in — ${error.message}\n`);
    process.exit(1);
  }

  const server = buildServer(db, { allowWrites: process.env['CARTOGRAPHER_READ_ONLY'] !== '1' });
  await server.connect(new StdioServerTransport());
}

main().catch((e: unknown) => {
  process.stderr.write(`cartographer-mcp: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});

# Cartographer MCP server

Lets Claude read and write a Cartographer project, so you can work through a game
by talking about it and have what you decide land on the board.

Everything goes through your own Supabase session. Row-level security is what
decides what is visible, so the server holds no key that could reach anyone else's
projects — and no key at all beyond the public anon key your deployed app already
uses.

## What Claude can do

| Tool | |
| --- | --- |
| `list_projects` | Every project, and how much is in each |
| `describe_project` | Areas, boards, block types with their fields, tags in use |
| `list_pages` | Pages, narrowed by board, block type or tag |
| `read_page` | One page in full, with its links both ways |
| `search` | Any text on any page — title, tags, fields, body |
| `create_page` | A new page on a board, with fields and tags |
| `update_page` | Change a title, body, fields or tags |
| `link_pages` | Draw a link between two pages |
| `create_board` | A new board in an area |
| `create_area` | A new area, with its first board |

Pages are named by title where a title is unambiguous, and fields by their labels
rather than the opaque keys they are stored under — so "set Emberhold's Ruler to
Mara Vell" works without anyone looking up an id. Where a name matches nothing, or
matches several things, the tool says so and lists what it found.

Set `CARTOGRAPHER_READ_ONLY=1` to publish only the reading tools.

## claude.ai in the browser

The hosted connector is a Supabase Edge Function in your own project, so there is
no new account and nothing else to pay for.

**1. Add the tables.** Paste `supabase/connector.sql` into the Supabase SQL editor,
alongside `schema.sql`. It creates three small tables for the connector's own
bookkeeping — which Claude installation registered itself, which authorisation
codes are outstanding, which tokens are live. All three are service-role only:
row-level security is on with no policy at all, so the anon key cannot touch them.

**2. Build and deploy.**

```sh
cd mcp && npm install && npm run build
cd .. && supabase functions deploy mcp --no-verify-jwt
```

`--no-verify-jwt` is not optional. The function is its own OAuth authorization
server, and its discovery, registration and token endpoints have to answer before
any token exists — the platform's built-in JWT gate would refuse them.

**3. Tell it where it lives.**

```sh
supabase secrets set MCP_PUBLIC_URL=https://YOUR-PROJECT.supabase.co/functions/v1/mcp
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are set for
you by the platform. Add `CARTOGRAPHER_READ_ONLY=1` if you want Claude to look but
not touch.

**4. Add it in claude.ai.** Settings → Connectors → Add custom connector, with that
same URL. Claude registers itself, sends you to a Cartographer sign-in page, and
you are connected.

Sign-in there is by email and password. If your account only has Google, set a
password first: Supabase → Authentication → Users → your user → Send password
recovery.

### What it does with your session

Signing in at that page gets a normal Supabase session. The connector keeps the
refresh token so it can act as you on later calls, and every project query then
runs under your own row-level security — the service role never touches a project
table, only the three bookkeeping ones. Only a hash of the bearer token is stored,
so a copy of that table hands nobody a working token. Removing the connector in
claude.ai stops it being used; deleting the row in `mcp_tokens` revokes it outright.

## Claude Desktop, or Claude Code

Build it once:

```sh
cd mcp
npm install
npm run build
```

Then add it to your Claude Desktop config — on macOS
`~/Library/Application Support/Claude/claude_desktop_config.json`, on Windows
`%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cartographer": {
      "command": "node",
      "args": ["/absolute/path/to/Cartographer/mcp/dist/stdio.js"],
      "env": {
        "SUPABASE_URL": "https://YOUR-PROJECT.supabase.co",
        "SUPABASE_ANON_KEY": "your-anon-key",
        "CARTOGRAPHER_EMAIL": "you@example.com",
        "CARTOGRAPHER_PASSWORD": "your-password"
      }
    }
  }
}
```

Restart Claude Desktop and Cartographer appears under the connectors icon.

For Claude Code, the same thing in one line:

```sh
claude mcp add cartographer \
  --env SUPABASE_URL=https://YOUR-PROJECT.supabase.co \
  --env SUPABASE_ANON_KEY=your-anon-key \
  --env CARTOGRAPHER_EMAIL=you@example.com \
  --env CARTOGRAPHER_PASSWORD=your-password \
  -- node /absolute/path/to/Cartographer/mcp/dist/stdio.js
```

Sign-in is by email and password because that is what a process with no browser
can do. If your account only has Google sign-in, set a password on it in Supabase
first — Authentication → Users → your user → Send password recovery.

## Changes made here appear in the app

Writes go to the same tables the app syncs, stamped with the moment they were made,
so the app picks them up on its next pull — immediately if it is open, otherwise
when you next open it. Nothing needs restarting.

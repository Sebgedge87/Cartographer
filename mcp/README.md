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

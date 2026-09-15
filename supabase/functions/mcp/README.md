# Hosted connector

This function is what claude.ai talks to. See `mcp/README.md` for what to run and
which secrets to set.

`--no-verify-jwt` is required on deploy. The function is its own OAuth
authorization server, and the discovery, registration and token endpoints have to
answer before any token exists — the platform's built-in JWT gate would refuse
them.

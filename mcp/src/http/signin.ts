/** The page someone actually sees when Claude sends them here to approve access. */
export function signInPage(options: {
  action: string;
  hidden: Record<string, string>;
  clientName: string;
  error?: string;
}): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const hidden = Object.entries(options.hidden)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect Cartographer</title>
<style>
  :root { color-scheme: dark light; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #0d1117; color: #e6edf3;
    font: 400 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .card { width: min(380px, calc(100vw - 32px)); padding: 28px; }
  .kicker {
    font: 600 10px ui-monospace, SFMono-Regular, monospace; letter-spacing: .18em;
    text-transform: uppercase; color: #7d8590; margin-bottom: 10px;
  }
  h1 { margin: 0 0 6px; font-size: 21px; font-weight: 600; }
  p { margin: 0 0 20px; color: #9198a1; font-size: 13.5px; }
  label { display: block; margin-bottom: 14px; font: 600 10px ui-monospace, monospace;
          letter-spacing: .1em; text-transform: uppercase; color: #7d8590; }
  input[type=email], input[type=password] {
    display: block; width: 100%; box-sizing: border-box; margin-top: 6px;
    padding: 9px 11px; border: 1px solid rgba(255,255,255,.14); border-radius: 6px;
    background: #161b23; color: #e6edf3; font-size: 14.5px;
  }
  input:focus { outline: 2px solid #d9a441; outline-offset: 1px; border-color: transparent; }
  button {
    width: 100%; margin-top: 4px; padding: 10px; border: none; border-radius: 6px;
    background: #d9a441; color: #14100a; cursor: pointer;
    font: 600 11px ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase;
  }
  button:hover { filter: brightness(1.08); }
  .error {
    margin: 0 0 16px; padding: 9px 11px; border-radius: 6px; font-size: 13px;
    background: rgba(220,80,80,.12); border: 1px solid rgba(220,80,80,.35); color: #ffb4ad;
  }
  .foot { margin: 18px 0 0; font-size: 12px; color: #6e7681; }
  @media (prefers-color-scheme: light) {
    body { background: #f6f7f9; color: #10141a; }
    input[type=email], input[type=password] { background: #fff; border-color: rgba(0,0,0,.15); color: #10141a; }
    p, label, .foot { color: #5c6570; }
  }
</style>
</head><body>
<main class="card">
  <div class="kicker">Cartographer</div>
  <h1>Connect to ${esc(options.clientName)}</h1>
  <p>Sign in to let it read and edit your projects. It sees only what your account can.</p>
  ${options.error ? `<div class="error">${esc(options.error)}</div>` : ''}
  <form method="post" action="${esc(options.action)}">
    ${hidden}
    <label>Email
      <input type="email" name="email" autocomplete="username" required autofocus>
    </label>
    <label>Password
      <input type="password" name="password" autocomplete="current-password" required>
    </label>
    <button type="submit">Allow access</button>
  </form>
  <p class="foot">
    If you only ever sign in with Google, set a password first:
    Supabase → Authentication → Users → your user → Send password recovery.
  </p>
</main>
</body></html>`;
}

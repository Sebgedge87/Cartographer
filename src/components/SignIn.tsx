import { useState } from 'react';
import { useSync } from '../state/syncStore';
import { signIn, signInWithGoogle, signUp } from '../state/sync/auth';

/**
 * Shown when sync is configured but nobody is signed in. There is no way past it:
 * the app is behind the login.
 *
 * The one exception is an unreachable server. This machine's projects are already
 * local, and refusing to open them because someone else's service is down would be
 * the wrong trade — so that offer appears only once a sign-in has actually failed
 * to connect, and lasts for the session rather than being remembered.
 */
export function SignIn({ onSkip }: { onSkip: () => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** Set when an attempt could not reach the server, as opposed to being refused. */
  const [unreachable, setUnreachable] = useState(false);
  const error = useSync((s) => s.error);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = mode === 'in' ? await signIn(email, password) : await signUp(email, password);
    setMessage(result);
    // The wording comes from auth.ts, which is the one place that decides what a
    // connection failure looks like.
    if (result?.startsWith('Could not reach the sync server')) setUnreachable(true);
    setBusy(false);
  };

  return (
    <div className="home">
      <div className="signin">
        <div className="home__kicker">CARTOGRAPHER</div>
        <h1 className="signin__title">{mode === 'in' ? 'Sign in' : 'Create an account'}</h1>
        <p className="signin__desc">
          Your projects live in your account, and follow you to every machine you
          sign in on.
        </p>

        <button
          className="btn signin__google"
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMessage(null);
            // On success the page navigates away, so `busy` is only ever cleared
            // when something went wrong and we are still here.
            const failure = await signInWithGoogle();
            if (failure) {
              setMessage(failure);
              if (failure.startsWith('Could not reach the sync server')) setUnreachable(true);
              setBusy(false);
            }
          }}
        >
          <svg viewBox="0 0 18 18" width="15" height="15" aria-hidden focusable="false">
            <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.3-.2-1.9H9v3.5h4.8a4.1 4.1 0 0 1-1.8 2.7v2.3h2.9c1.7-1.6 2.7-3.9 2.7-6.6z" />
            <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.3c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.9 10.6a5.4 5.4 0 0 1 0-3.4V4.9H.9a9 9 0 0 0 0 8.1l3-2.4z" />
            <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 4.9l3 2.3C4.6 5.1 6.6 3.6 9 3.6z" />
          </svg>
          CONTINUE WITH GOOGLE
        </button>

        <div className="signin__or"><span>OR</span></div>

        <form className="signin__form" onSubmit={submit}>
          <label className="signin__label">
            EMAIL
            <input
              className="field"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="signin__label">
            PASSWORD
            <input
              className="field"
              type="password"
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {(message ?? error) && <div className="signin__error">{message ?? error}</div>}

          <button className="btn btn--fill" type="submit" disabled={busy} style={{ justifyContent: 'center' }}>
            {busy ? 'WORKING…' : mode === 'in' ? 'SIGN IN' : 'CREATE ACCOUNT'}
          </button>
        </form>

        <div className="signin__foot">
          <button className="linkish" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMessage(null); }}>
            {mode === 'in' ? 'Create an account' : 'I already have an account'}
          </button>
          {unreachable && (
            <button className="linkish" onClick={onSkip}>
              Work offline until the server is back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

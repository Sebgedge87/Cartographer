import { useState } from 'react';
import { useSync } from '../state/syncStore';
import { signIn, signUp } from '../state/sync/auth';

/**
 * Shown when sync is configured but nobody is signed in. Working offline stays
 * available — this machine's projects are already local, and refusing to open them
 * because a server is unreachable would be the wrong trade.
 */
export function SignIn({ onSkip }: { onSkip: () => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const error = useSync((s) => s.error);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = mode === 'in' ? await signIn(email, password) : await signUp(email, password);
    setMessage(result);
    setBusy(false);
  };

  return (
    <div className="home">
      <div className="signin">
        <div className="home__kicker">CARTOGRAPHER</div>
        <h1 className="signin__title">{mode === 'in' ? 'Sign in' : 'Create an account'}</h1>
        <p className="signin__desc">
          Signing in keeps your projects on every machine you use. Without it,
          Cartographer still works — projects just stay in this browser.
        </p>

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
          <button className="linkish" onClick={onSkip}>Work offline on this device</button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Droplets, Lock } from 'lucide-react';
import { api, setToken } from '../api';

export default function Login({ onDone }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { const { token } = await api('/auth/login', { method: 'POST', body: { password } }); setToken(token); onDone(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-sky-500 via-indigo-600 to-violet-700 p-4">
      <form onSubmit={submit} className="pop w-full max-w-sm rounded-3xl bg-white/95 p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-600 text-white shadow-glow"><Droplets /></div>
          <div><h1 className="text-xl font-bold text-slate-900">LaundryFlow</h1><p className="text-sm text-slate-500">Sign in to your workspace</p></div>
        </div>
        <label className="label">Admin password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input type="password" autoFocus className="input pl-10" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
        <button className="btn-primary mt-5 w-full justify-center" disabled={busy || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { UserPlus, Phone, Mail, MapPin } from 'lucide-react';
import { api } from '../api';

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ name: '', phone: '', email: '', address: '' });
  const [err, setErr] = useState('');
  const load = () => api('/customers').then(setRows);
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault(); setErr('');
    try { await api('/customers', { method: 'POST', body: f }); setF({ name: '', phone: '', email: '', address: '' }); load(); }
    catch (e2) { setErr(e2.message); }
  }
  const field = (k, label, ph) => (
    <div><label className="label">{label}</label><input className="input" placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <form onSubmit={add} className="card h-fit space-y-4 p-5">
        <h3 className="flex items-center gap-2 font-semibold text-slate-800"><UserPlus className="h-5 w-5 text-sky-500" /> Add customer</h3>
        {field('name', 'Name', 'Ada Lovelace')}{field('phone', 'Phone', '+1 555 0100')}
        {field('email', 'Email', 'ada@example.com')}{field('address', 'Address', '12 Pickup Street')}
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <button className="btn-primary w-full justify-center" disabled={!f.name}>Save customer</button>
      </form>
      <div className="grid content-start gap-4 sm:grid-cols-2 lg:col-span-2">
        {rows.map((c) => (
          <div key={c.id} className="card pop p-5">
            <div className="mb-3 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 font-bold text-white">{c.name[0]?.toUpperCase()}</div>
              <div><p className="font-semibold text-slate-900">{c.name}</p><p className="text-xs text-slate-500">{c.orders} orders</p></div>
            </div>
            <div className="space-y-1 text-sm text-slate-600">
              {c.phone && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" />{c.phone}</p>}
              {c.email && <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" />{c.email}</p>}
              {c.address && <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" />{c.address}</p>}
            </div>
          </div>
        ))}
        {!rows.length && <p className="text-slate-400">No customers yet.</p>}
      </div>
    </div>
  );
}

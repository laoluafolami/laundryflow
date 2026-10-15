import { useEffect, useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { api, money, STATUS } from '../api';
import NewOrder from './NewOrder';

export default function Orders() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    const p = new URLSearchParams(); if (q) p.set('q', q); if (status) p.set('status', status);
    api(`/orders?${p}`).then((r) => { setRows(r); setErr(''); }).catch((e) => setErr(e.message));
  };
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q, status]); // debounce search

  async function change(id, s) { await api(`/orders/${id}/status`, { method: 'PATCH', body: { status: s } }); load(); }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input className="input pl-10" placeholder="Search by customer, phone or order #" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New order</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {['', ...Object.keys(STATUS)].map((k) => (
          <button key={k} onClick={() => setStatus(k)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition ${status === k ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>
            {k ? STATUS[k].label : 'All'}
          </button>
        ))}
      </div>
      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="p-4">Order</th><th>Customer</th><th>Total</th><th>Created</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-b border-slate-50 last:border-0 hover:bg-sky-50/40">
                <td className="p-4 font-semibold text-slate-900">#{o.id}</td>
                <td><div className="font-medium text-slate-800">{o.customer_name}</div><div className="text-xs text-slate-500">{o.customer_phone}</div></td>
                <td className="font-medium">{money(o.total)}</td>
                <td className="text-slate-500">{new Date(o.created_at).toLocaleDateString()}</td>
                <td>
                  <select value={o.status} onChange={(e) => change(o.id, e.target.value)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 outline-none ${STATUS[o.status].cls}`}>
                    {Object.keys(STATUS).map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="5" className="p-10 text-center text-slate-400">No orders yet — create your first one.</td></tr>}
          </tbody>
        </table>
      </div>
      {open && <NewOrder onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
    </div>
  );
}

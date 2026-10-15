import { useEffect, useState } from 'react';
import { X, Trash2, Plus } from 'lucide-react';
import { api, money } from '../api';

export default function NewOrder({ onClose, onSaved }) {
  const [customers, setCustomers] = useState([]);
  const [services, setServices] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState([{ service_id: '', quantity: 1 }]);
  const [notes, setNotes] = useState('');
  const [pickup, setPickup] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/customers').then(setCustomers); api('/services').then(setServices);
  }, []);

  const price = (id) => services.find((s) => s.id === Number(id))?.price || 0;
  const total = lines.reduce((a, l) => a + price(l.service_id) * Number(l.quantity || 0), 0);
  const setLine = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save() {
    setBusy(true); setErr('');
    try {
      await api('/orders', { method: 'POST', body: {
        customer_id: Number(customerId), notes, pickup_date: pickup || null,
        items: lines.filter((l) => l.service_id).map((l) => ({ service_id: Number(l.service_id), quantity: Number(l.quantity) })),
      } });
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="pop w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">New order</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">Customer</label>
            <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select a customer…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
            </select>
            {!customers.length && <p className="mt-1 text-xs text-slate-500">Add a customer first on the Customers page.</p>}
          </div>
          <div>
            <label className="label">Services</label>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <select className="input" value={l.service_id} onChange={(e) => setLine(i, { service_id: e.target.value })}>
                    <option value="">Service…</option>
                    {services.map((s) => <option key={s.id} value={s.id}>{s.name} — {money(s.price)}/{s.unit}</option>)}
                  </select>
                  <input type="number" min="0.5" step="0.5" className="input w-24" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                  <button className="rounded-xl px-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500" onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={lines.length === 1}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <button className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-sky-600" onClick={() => setLines([...lines, { service_id: '', quantity: 1 }])}><Plus className="h-4 w-4" /> Add service</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Pickup date</label><input type="date" className="input" value={pickup} onChange={(e) => setPickup(e.target.value)} /></div>
            <div><label className="label">Notes</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Stains, fragile…" /></div>
          </div>
          {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}
          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <div><p className="text-xs text-slate-500">Estimated total</p><p className="text-2xl font-bold text-slate-900">{money(total)}</p></div>
            <button className="btn-primary" onClick={save} disabled={busy || !customerId || !lines.some((l) => l.service_id)}>{busy ? 'Saving…' : 'Create order'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Wallet, Shirt, Users, Activity } from 'lucide-react';
import { api, money, STATUS } from '../api';

function Stat({ icon: Icon, label, value, tint }) {
  return (
    <div className="card pop p-5">
      <div className={`mb-3 grid h-10 w-10 place-items-center rounded-xl ${tint}`}><Icon className="h-5 w-5" /></div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/stats').then(setS).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="text-rose-600">{err}</p>;
  if (!s) return <p className="text-slate-500">Loading…</p>;
  const total = s.byStatus.reduce((a, b) => a + b.count, 0) || 1;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Wallet} label="Revenue today" value={money(s.revenue_today)} tint="bg-emerald-100 text-emerald-600" />
        <Stat icon={Activity} label="Active orders" value={s.active_orders} tint="bg-sky-100 text-sky-600" />
        <Stat icon={Users} label="Customers" value={s.customers} tint="bg-violet-100 text-violet-600" />
        <Stat icon={Shirt} label="Total orders" value={total === 1 && !s.byStatus.length ? 0 : total} tint="bg-amber-100 text-amber-600" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h3 className="mb-4 font-semibold text-slate-800">Revenue — last 7 days</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={s.week}>
                <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.5} /><stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={45} />
                <Tooltip formatter={(v) => money(v)} />
                <Area type="monotone" dataKey="revenue" stroke="#0284c7" strokeWidth={3} fill="url(#g)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-5">
          <h3 className="mb-4 font-semibold text-slate-800">Orders by status</h3>
          <div className="space-y-3">
            {Object.keys(STATUS).map((k) => {
              const c = s.byStatus.find((x) => x.status === k)?.count || 0;
              return (
                <div key={k}>
                  <div className="mb-1 flex justify-between text-sm"><span className="text-slate-600">{STATUS[k].label}</span><span className="font-semibold">{c}</span></div>
                  <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-gradient-to-r from-sky-400 to-indigo-500" style={{ width: `${(c / total) * 100}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

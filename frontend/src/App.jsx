import { useState } from 'react';
import { LayoutDashboard, ClipboardList, Users, Droplets, LogOut } from 'lucide-react';
import { hasToken, setToken } from './api';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Orders from './components/Orders';
import Customers from './components/Customers';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, view: Dashboard },
  { id: 'orders', label: 'Orders', icon: ClipboardList, view: Orders },
  { id: 'customers', label: 'Customers', icon: Users, view: Customers },
];

export default function App() {
  const [authed, setAuthed] = useState(hasToken());
  const [tab, setTab] = useState('dashboard');
  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  const Current = TABS.find((t) => t.id === tab).view;
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950 p-5 text-slate-300 md:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-glow"><Droplets className="h-5 w-5" /></div>
          <span className="text-lg font-bold text-white">LaundryFlow</span>
        </div>
        <nav className="space-y-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${tab === id ? 'bg-white/10 text-white' : 'hover:bg-white/5'}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </nav>
        <button onClick={() => { setToken(''); setAuthed(false); }} className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-white/5"><LogOut className="h-4 w-4" /> Sign out</button>
      </aside>
      <main className="flex-1 p-4 pb-24 md:p-8">
        <h1 className="mb-6 text-2xl font-bold capitalize text-slate-900">{tab}</h1>
        <Current />
      </main>
      <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t border-slate-200 bg-white/90 p-2 backdrop-blur md:hidden">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={`flex flex-col items-center gap-0.5 rounded-lg px-4 py-1 text-xs ${tab === id ? 'text-sky-600' : 'text-slate-500'}`}><Icon className="h-5 w-5" />{label}</button>
        ))}
      </nav>
    </div>
  );
}

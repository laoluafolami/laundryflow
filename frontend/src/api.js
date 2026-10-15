// Tiny fetch wrapper: adds the login token and turns errors into exceptions.
let token = localStorage.getItem('lf_token') || '';
export const setToken = (t) => { token = t; t ? localStorage.setItem('lf_token', t) : localStorage.removeItem('lf_token'); };
export const hasToken = () => !!token;

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && path !== '/auth/login') { setToken(''); window.location.reload(); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const CURRENCY = 'USD'; // change to 'NGN', 'GBP', ... to localise
export const money = (n) => new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY }).format(n || 0);
export const STATUS = {
  received:  { label: 'Received',  cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
  washing:   { label: 'Washing',   cls: 'bg-sky-100 text-sky-700 ring-sky-200' },
  drying:    { label: 'Drying',    cls: 'bg-amber-100 text-amber-700 ring-amber-200' },
  ready:     { label: 'Ready',     cls: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  delivered: { label: 'Delivered', cls: 'bg-indigo-100 text-indigo-700 ring-indigo-200' },
  cancelled: { label: 'Cancelled', cls: 'bg-rose-100 text-rose-700 ring-rose-200' },
};

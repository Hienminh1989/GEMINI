import { apiFetch } from './api';

export const db = null;

export const collection = (db: any, name: string) => name;
export const doc = (...args: any[]) => {
  if (args.length === 1) return args[0];
  if (args.length === 2) return `${args[0]}/${args[1]}`;
  if (args.length === 3) return `${args[1]}/${args[2]}`;
  return args[0];
};

export const getDoc = async (path: string) => {
  const res = await apiFetch(`/api/${path}?_t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
  if (!res.ok || !res.data) return { exists: () => false, data: () => null };
  return { exists: () => true, data: () => res.data };
};

export const setDoc = async (path: string, data: any) => {
  await apiFetch(`/api/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
};

export const addDoc = async (colName: string, data: any) => {
  const res = await apiFetch(`/api/${colName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return { id: res.data?.id || '' };
};

export const updateDoc = setDoc;

export const deleteDoc = async (path: string) => {
  const res = await apiFetch(`/api/${path}`, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error('Delete failed: ' + (res.error || res.status));
  }
};

export const query = (colName: string, ...args: any[]) => {
  return colName;
};

export const getDocs = async (queryObj: string) => {
  const res = await apiFetch(`/api/${queryObj}${queryObj.includes('?') ? '&' : '?'}_t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
  if (!res.ok || !Array.isArray(res.data)) return { empty: true, docs: [], forEach: function(cb: any){ this.docs.forEach(cb); } };
  const docs = res.data.map((d: any) => ({ id: d.id, data: () => d, ref: d.id }));
  return { empty: docs.length === 0, docs, forEach: function(cb: any){ this.docs.forEach(cb); } };
};

export const orderBy = (...args: any[]) => args;
export const where = (...args: any[]) => args;
export const limit = (...args: any[]) => args;

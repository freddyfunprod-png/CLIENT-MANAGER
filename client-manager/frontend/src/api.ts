import type { Client, ClientStatus, Goals } from './types'

const BASE = '/api'

async function req<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

// ── Stats ─────────────────────────────────────────────────────────────────────
export const getStats = () => req<any>(`${BASE}/stats`)

export const getTodayStats = () =>
  req<{ new_clients_today: number; plan_done_today: number; proposals_today: number; closures_today: number }>(
    `${BASE}/stats/today`
  )

// ── Scraper ───────────────────────────────────────────────────────────────────
export const getCategories = () => req<{ categories: { key: string; label: string; source_type: string }[] }>(`${BASE}/scrape/categories`)

export const startScrape = (body: {
  category_key: string
  city: string
  country: string
  timezone: string
  limit: number
}) => req<{ status: string }>(`${BASE}/scrape/start`, { method: 'POST', body: JSON.stringify(body) })

export const stopScrape = () => req<{ status: string }>(`${BASE}/scrape/stop`, { method: 'POST' })

export const extractFromMapsUrl = (maps_url: string) =>
  req<any>(`${BASE}/scrape/extract-single`, {
    method: 'POST',
    body: JSON.stringify({ maps_url }),
  })

export const extractFromUrl = (url: string) =>
  req<any>(`${BASE}/scrape/extract-from-url`, {
    method: 'POST',
    body: JSON.stringify({ url }),
  })

// ── Leads ─────────────────────────────────────────────────────────────────────
export const getLeads = (converted?: boolean) => {
  const q = converted !== undefined ? `?converted=${converted}` : ''
  return req<{ leads: any[] }>(`${BASE}/leads${q}`)
}

export const convertLeads = (lead_ids: number[]) =>
  req<{ created: number; client_ids: number[] }>(`${BASE}/clients/convert-leads`, {
    method: 'POST',
    body: JSON.stringify({ lead_ids }),
  })

// ── Clients ───────────────────────────────────────────────────────────────────
export const getClients = () => req<{ clients: Client[] }>(`${BASE}/clients`)

export const createClient = (data: Partial<Client>) =>
  req<Client>(`${BASE}/clients`, { method: 'POST', body: JSON.stringify(data) })

export const updateClient = (id: number, data: Partial<Client>) =>
  req<Client>(`${BASE}/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) })

export const deleteClient = (id: number) =>
  fetch(`${BASE}/clients/${id}`, { method: 'DELETE' })

// ── Checklist ─────────────────────────────────────────────────────────────────
export const getChecklist = (clientId: number) =>
  req<{ checklist: any[] }>(`${BASE}/clients/${clientId}/checklist`)

export const toggleChecklist = (clientId: number, stepId: number, completed: boolean, completedBy?: string) => {
  const by = completedBy ? `&completed_by=${encodeURIComponent(completedBy)}` : ''
  return req<{ ok: boolean }>(`${BASE}/clients/${clientId}/checklist/${stepId}?completed=${completed}${by}`, { method: 'PATCH' })
}

// ── Daily Plan ─────────────────────────────────────────────────────────────────
export const getPlan = (date: string) => req<{ plan: any[] }>(`${BASE}/plan/${date}`)

export const addToPlan = (client_id: number, date: string) =>
  req<{ ok: boolean }>(`${BASE}/plan`, { method: 'POST', body: JSON.stringify({ client_id, date }) })

export const removeFromPlan = (plan_id: number) =>
  fetch(`${BASE}/plan/${plan_id}`, { method: 'DELETE' })

export const togglePlanComplete = (plan_id: number, completed: boolean) =>
  req<{ ok: boolean }>(`${BASE}/plan/${plan_id}/complete?completed=${completed}`, { method: 'PATCH' })

// ── Goals ──────────────────────────────────────────────────────────────────────
export const getGoals = (date: string) => req<Goals>(`${BASE}/goals/${date}`)

export const upsertGoals = (date: string, data: Partial<Goals>) =>
  req<Goals>(`${BASE}/goals/${date}`, { method: 'POST', body: JSON.stringify(data) })

// ── Vendors ────────────────────────────────────────────────────────────────────
export type Vendor = { id: number; name: string; color: string; initial: string; whatsapp: string | null }

export const getVendors = () => req<{ vendors: Vendor[] }>(`${BASE}/vendors`)

export const createVendor = (data: { name: string; color: string; initial: string; whatsapp?: string }) =>
  req<Vendor>(`${BASE}/vendors`, { method: 'POST', body: JSON.stringify(data) })

export const updateVendor = (id: number, data: { whatsapp?: string; color?: string }) =>
  req<Vendor>(`${BASE}/vendors/${id}`, { method: 'PATCH', body: JSON.stringify(data) })

export const deleteVendor = (id: number) =>
  fetch(`${BASE}/vendors/${id}`, { method: 'DELETE' })

// ── AI ─────────────────────────────────────────────────────────────────────────
export const getMessageTypes = () =>
  req<{ types: { key: string; label: string }[] }>(`${BASE}/ai/message-types`)

export async function addCategory(key: string, label: string, sourceType: 'maps' | 'instagram' = 'maps') {
  const r = await fetch('/api/scrape/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, label, source_type: sourceType }),
  })
  if (!r.ok) throw new Error('Error adding category')
  return r.json()
}

export async function setCategorySourceType(key: string, sourceType: 'maps' | 'instagram') {
  const r = await fetch(`/api/scrape/categories/${key}/source-type`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_type: sourceType }),
  })
  if (!r.ok) throw new Error('Error updating category')
  return r.json()
}

export async function deleteCategory(key: string) {
  await fetch(`/api/scrape/categories/${key}`, { method: 'DELETE' })
}

export const generateMessage = (client_id: number, message_type: string, extra_context?: string, language?: string, base_message?: string) =>
  req<{ message: string; client: Client }>(`${BASE}/ai/message`, {
    method: 'POST',
    body: JSON.stringify({ client_id, message_type, extra_context, language, base_message }),
  })

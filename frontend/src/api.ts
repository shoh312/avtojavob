export class ApiError extends Error {
  constructor(public code: string, public status: number) { super(code) }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'X-ChatFlow': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  let data: any = null
  try { data = await res.json() } catch { /* bo'sh javob */ }
  if (!res.ok) throw new ApiError(data?.error || 'error', res.status)
  return data as T
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body ?? {}),
  del: <T>(url: string) => request<T>('DELETE', url),
}

// ---- turlar
export type User = { id: number; email: string; name: string; lang: string; is_admin: boolean }
export type Account = { id: number; username: string; name: string; picture_url: string; active: boolean; token_expires_at: string | null }
export type TriggerKind = 'comment' | 'dm' | 'story_reply' | 'story_mention'
export type FlowSummary = {
  id: number; account_id: number; name: string; active: boolean; runs: number; nodes: number
  trigger: { kind: TriggerKind | null; keywords: string; match: string; media_caption: string }
  updated_at: string; created_at: string
}
export type ValidationError = { node: string | null; code: string }
export type GraphNode = { id: string; type: string; position: { x: number; y: number }; data: Record<string, any> }
export type GraphEdge = { id: string; source: string; target: string; sourceHandle: string }
export type FlowFull = FlowSummary & { graph: { nodes: GraphNode[]; edges: GraphEdge[] }; errors: ValidationError[] }
export type Template = { key: string; icon: string; name: string; description: string }
export type Contact = {
  id: number; igsid: string; username: string; name: string; tags: string[]; fields: Record<string, string>
  follows: boolean | null; last_seen_at: string; created_at: string
}
export type Media = { id: string; caption: string; thumbnail: string | null; type: string; timestamp: string }
export type Stats = { sent_24h: number; sent_7d: number; contacts: number; contacts_7d: number; flows_active: number; flows_total: number; runs_total: number }
export type Activity = { id: number; kind: string; username: string; incoming: string; detail: string; flow_id: number | null; flow_name: string; created_at: string }

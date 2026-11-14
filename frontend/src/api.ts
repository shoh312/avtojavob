export class ApiError extends Error {
  constructor(public code: string, public status: number, public detail?: string) { super(code) }
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
  if (!res.ok) throw new ApiError(data?.error || 'error', res.status, data?.detail)
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
export type PlanKey = 'trial' | 'pro' | 'business'
export type PlanInfo = { plan: PlanKey; active: boolean; expires_at: string; days_left: number; accounts_limit: number; unlimited: boolean }
export type User = { id: number; email: string; name: string; lang: string; is_admin: boolean; plan: PlanInfo; email_verified: boolean; role: 'owner' | 'manager'; avatar_url?: string; google?: boolean; created_at?: string }
export type Plans = { currency: string; trial_days: number; telegram: string; plans: { key: PlanKey; price: number; accounts: number }[]; current: PlanInfo }
export type SeriesPoint = { date: string; value: number }
export type AdminUser = User & {
  is_blocked: boolean; status: 'trial' | 'pro' | 'business' | 'expired' | 'blocked'; created_at: string; last_login_at: string | null
  accounts: string[]; flows: number; sent_30d: number
}
export type AdminUserDetail = AdminUser & { grants: { id: number; plan: PlanKey; days: number; amount: number; note: string; created_at: string; expires_at: string | null }[] }
export type AdminOverview = {
  users_total: number; users_7d: number; status: Record<string, number>; mrr: number; revenue_month: number; revenue_total: number
  ig_accounts: number; flows_active: number; contacts: number; sent_24h: number; currency: string
  series: { signups: SeriesPoint[]; sent: SeriesPoint[]; revenue: SeriesPoint[] }
}
export type Account = { id: number; username: string; name: string; picture_url: string; followers?: number; active: boolean; token_expires_at: string | null }
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
  stage?: string | null; deal_value?: number; last_message_preview?: string; last_message_at?: string | null
  avatar_url?: string
}
export type Media = { id: string; caption: string; thumbnail: string | null; type: string; timestamp: string }
export type Stats = { sent_24h: number; sent_7d: number; contacts: number; contacts_7d: number; flows_active: number; flows_total: number; runs_total: number }
export type Activity = { id: number; kind: string; username: string; incoming: string; detail: string; flow_id: number | null; flow_name: string; created_at: string }

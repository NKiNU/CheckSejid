import { call } from '../identity/api.ts'

// ADR-022 / ADR-011. Amounts travel as integer minor units (sen); the UI converts only for display/input.
export type Kind = 'income' | 'expense' | 'budget'
export type FinanceState = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'VOIDED'
export type FinanceRecord = {
  id: string
  state: FinanceState
  amount: number
  currency: string
  categoryId: string
  description: string
  createdById: string
  voidRequested: boolean
  voidReason: string | null
  copiedFromId: string | null
  used?: number
  remaining?: number
  name?: string
} & Record<string, unknown>
export type Category = { id: string; name: string; kind: 'INCOME' | 'EXPENSE'; active: boolean }
export type Collection = { id: string; purpose: string; targetAmount: number | null; currency: string; status: 'OPEN' | 'CLOSED'; collected: number; percent: number | null }

const base = (orgId: string) => `/orgs/${encodeURIComponent(orgId)}/finance`
const plural = (k: Kind) => (k === 'income' ? 'incomes' : `${k}s`)
const json = (method: string, data?: unknown): RequestInit => ({ method, body: data === undefined ? undefined : JSON.stringify(data) })

// "12.34" → 1234. Rejects negatives, more than 2 decimals and non-numbers (the server re-validates).
export function toMinor(input: string): number | null {
  const m = /^\s*(\d{1,11})(?:\.(\d{1,2}))?\s*$/.exec(input)
  if (!m) return null
  const minor = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return minor > 0 ? minor : null
}
// 1234 → "RM 12.34" for MYR; integer arithmetic only.
export function formatMoney(minor: number, currency = 'MYR') {
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  const major = Math.trunc(abs / 100).toLocaleString('en-MY')
  const label = currency === 'MYR' ? 'RM' : currency
  return `${sign}${label} ${major}.${String(abs % 100).padStart(2, '0')}`
}

export const listCategories = async (orgId: string) => (await call<{ categories: Category[] }>(`${base(orgId)}/categories`)).categories
export const createCategory = async (orgId: string, data: { name: string; kind: Category['kind'] }) =>
  (await call<{ category: Category }>(`${base(orgId)}/categories`, json('POST', data))).category
export const listRecords = async (orgId: string, kind: Kind) => (await call<{ records: FinanceRecord[] }>(`${base(orgId)}/${plural(kind)}`)).records
export const createRecord = async (orgId: string, kind: Kind, data: Record<string, unknown>) =>
  (await call<{ record: FinanceRecord }>(`${base(orgId)}/${plural(kind)}`, json('POST', data))).record
export type Action = 'submit' | 'approve' | 'reject' | 'void' | 'void-request' | 'void-approve' | 'void-reject' | 'copy'
export const act = async (orgId: string, kind: Kind, id: string, action: Action, reason?: string) =>
  (await call<{ record: FinanceRecord }>(`${base(orgId)}/${plural(kind)}/${encodeURIComponent(id)}/${action}`, json('POST', reason ? { reason } : {}))).record
export const listCollections = async (orgId: string) => (await call<{ collections: Collection[] }>(`${base(orgId)}/collections`)).collections
export const createCollection = async (orgId: string, data: { purpose: string; targetAmount: number | null }) =>
  (await call<{ collection: Collection }>(`${base(orgId)}/collections`, json('POST', data))).collection
export const uploadEvidence = (orgId: string, expenseId: string, file: Blob) =>
  call<{ attachment: { id: string } }>(`${base(orgId)}/expenses/${encodeURIComponent(expenseId)}/attachments`, { method: 'POST', body: file })

// ADR-022 §2: which actions to offer. Buttons only; the server enforces state, keys, creator and ADR-013.
const CREATE_KEY: Record<Kind, string> = { income: 'finance.income.create', expense: 'finance.expense.create', budget: 'finance.budget.manage' }
export function availableActions(kind: Kind, r: FinanceRecord, myUserId: string, perms: Set<string>): Action[] {
  const creator = r.createdById === myUserId && perms.has(CREATE_KEY[kind])
  const out: Action[] = []
  if (r.state === 'DRAFT' && creator) out.push('submit')
  if (r.state === 'PENDING_APPROVAL' && perms.has('finance.approve')) out.push('approve', 'reject')
  if ((r.state === 'DRAFT' || r.state === 'PENDING_APPROVAL') && (creator || perms.has('finance.void'))) out.push('void')
  if (r.state === 'APPROVED' && !r.voidRequested && perms.has('finance.void')) out.push('void-request')
  if (r.state === 'APPROVED' && r.voidRequested && perms.has('finance.approve')) out.push('void-approve', 'void-reject')
  if ((r.state === 'REJECTED' || r.state === 'VOIDED') && perms.has(CREATE_KEY[kind])) out.push('copy')
  return out
}
export const needsReason = (a: Action) => a === 'void' || a === 'void-request'

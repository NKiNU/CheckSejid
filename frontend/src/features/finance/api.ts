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
// 1234 → "RM1,234.00"-style text. Amounts stay integer sen everywhere else (ADR-011); only this display
// step divides by 100 (exact for any amount toMinor accepts, and Intl rounds to 2 decimals).
export const formatMoney = (minor: number, currency = 'MYR', locale = 'en-MY') =>
  new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100)

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
export function availableActions(kind: Kind, r: FinanceRecord, myUserId: string, perms: ReadonlySet<string>): Action[] {
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

// ADR-020: expense evidence is JPEG, PNG, WebP or PDF up to 5 MB (the server re-checks by content).
export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024
export const receiptOk = (f: Blob) => (f.type === '' || RECEIPT_TYPES.includes(f.type)) && f.size <= RECEIPT_MAX_BYTES

// Same payload shapes as before the redesign (ADR-022); null means the amount was invalid.
export function parseTransaction(kind: Kind, f: FormData): Record<string, unknown> | null {
  const amount = toMinor(String(f.get('amount')))
  if (amount === null) return null
  const s = (k: string) => String(f.get(k) ?? '').trim()
  const common = { amount, categoryId: s('categoryId'), description: s('description') }
  return kind === 'income'
    ? { ...common, receivedOn: s('date'), collectionId: s('collectionId') || null }
    : kind === 'expense'
      ? { ...common, spentOn: s('date'), payee: s('payee') || null }
      : { ...common, name: s('name'), periodStart: s('periodStart'), periodEnd: s('periodEnd') }
}

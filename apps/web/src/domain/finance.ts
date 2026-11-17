import type { Sen } from './money';
import { can } from './rbac';
import type { Role } from './types';

export type FinStatus = 'DRAFT' | 'SUBMITTED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'VOIDED';
export type FinKind = 'income' | 'expense' | 'collection';

export interface AuditEntry {
  action: string;
  actorId: string;
  actorName: string;
  at: string;
  from?: FinStatus;
  to?: FinStatus;
  reason?: string;
}

export interface FinancialRecord {
  id: string;
  orgId: string;
  kind: FinKind;
  amount: Sen;
  currency: 'MYR';
  date: string;
  category: string;
  description: string;
  status: FinStatus;
  createdBy: string;
  createdByName: string;
  audit: AuditEntry[];
}

export interface Actor {
  id: string;
  name: string;
  role: Role;
}

export const STATUS_LABEL: Record<FinStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  VOIDED: 'Voided',
};

/** finance/FINANCIAL_STATE_MACHINE.md */
const TRANSITIONS: Record<FinStatus, readonly FinStatus[]> = {
  DRAFT: ['SUBMITTED', 'VOIDED'],
  SUBMITTED: ['PENDING_APPROVAL', 'VOIDED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'VOIDED'],
  APPROVED: [],
  REJECTED: [],
  VOIDED: [],
};

export const LOCKED: readonly FinStatus[] = ['APPROVED', 'REJECTED', 'VOIDED'];

export type TransitionError = 'INVALID_TRANSITION' | 'FORBIDDEN' | 'SELF_APPROVAL' | 'WRONG_TENANT';
export type TransitionResult = { ok: true; record: FinancialRecord } | { ok: false; error: TransitionError };

export interface TransitionOptions {
  reason?: string;
  now?: Date;
  /** Organisation policy: may the creator approve their own record? MVP default: no. */
  allowSelfApproval?: boolean;
  /** Tenant of the acting user's workspace. */
  orgId: string;
}

const ACTION: Record<FinStatus, string> = {
  DRAFT: 'Created as draft',
  SUBMITTED: 'Submitted',
  PENDING_APPROVAL: 'Sent for approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  VOIDED: 'Voided',
};

export function canTransition(from: FinStatus, to: FinStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transition(record: FinancialRecord, to: FinStatus, actor: Actor, opts: TransitionOptions): TransitionResult {
  if (record.orgId !== opts.orgId) return { ok: false, error: 'WRONG_TENANT' };
  if (!canTransition(record.status, to)) return { ok: false, error: 'INVALID_TRANSITION' };
  if (to === 'APPROVED' || to === 'REJECTED') {
    if (!can(actor.role, 'finance.approve')) return { ok: false, error: 'FORBIDDEN' };
    if (!opts.allowSelfApproval && record.createdBy === actor.id) return { ok: false, error: 'SELF_APPROVAL' };
  } else if (to === 'VOIDED') {
    if (!can(actor.role, 'finance.approve') && record.createdBy !== actor.id) return { ok: false, error: 'FORBIDDEN' };
  } else {
    const perm = record.kind === 'expense' ? 'finance.expense.create' : 'finance.income.create';
    if (!can(actor.role, perm)) return { ok: false, error: 'FORBIDDEN' };
  }
  const entry: AuditEntry = {
    action: ACTION[to],
    actorId: actor.id,
    actorName: actor.name,
    at: (opts.now ?? new Date()).toISOString(),
    from: record.status,
    to,
    ...(opts.reason?.trim() ? { reason: opts.reason.trim() } : {}),
  };
  return { ok: true, record: { ...record, status: to, audit: [...record.audit, entry] } };
}

/** Submitting moves a draft straight into the approval queue. */
export function submitForApproval(record: FinancialRecord, actor: Actor, opts: TransitionOptions): TransitionResult {
  const first = transition(record, 'SUBMITTED', actor, opts);
  if (!first.ok) return first;
  return transition(first.record, 'PENDING_APPROVAL', { ...actor, name: `${actor.name} (system queue)` }, opts);
}

export const ERROR_MESSAGE: Record<TransitionError, string> = {
  INVALID_TRANSITION: 'This record can no longer change to that status.',
  FORBIDDEN: 'Your role does not allow this action.',
  SELF_APPROVAL: 'You created this record, so someone else must approve it.',
  WRONG_TENANT: 'This record belongs to another organisation.',
};

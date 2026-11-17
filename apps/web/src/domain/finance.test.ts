import { canTransition, submitForApproval, transition, type FinancialRecord } from './finance';

const base: FinancialRecord = {
  id: 'EXP-1', orgId: 'org-a', kind: 'expense', amount: 1000, currency: 'MYR', date: '2026-11-16',
  category: 'Maintenance', description: 'Repair', status: 'DRAFT', createdBy: 'u-hafiz', createdByName: 'Hafiz', audit: [],
};
const hafiz = { id: 'u-hafiz', name: 'Hafiz', role: 'committee' as const };
const aisyah = { id: 'u-aisyah', name: 'Aisyah', role: 'treasurer' as const };
const opts = { orgId: 'org-a', now: new Date('2026-11-17T01:00:00Z') };

describe('financial state machine', () => {
  it('follows DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED with audit entries', () => {
    const sub = submitForApproval(base, hafiz, opts);
    expect(sub.ok && sub.record.status).toBe('PENDING_APPROVAL');
    if (!sub.ok) return;
    const appr = transition(sub.record, 'APPROVED', aisyah, opts);
    expect(appr.ok).toBe(true);
    if (!appr.ok) return;
    expect(appr.record.audit.map((a) => a.to)).toEqual(['SUBMITTED', 'PENDING_APPROVAL', 'APPROVED']);
    expect(appr.record.audit[2]).toMatchObject({ actorId: 'u-aisyah', at: '2026-11-17T01:00:00.000Z' });
  });

  it('rejects invalid transitions and edits after approval', () => {
    expect(transition(base, 'APPROVED', aisyah, opts)).toEqual({ ok: false, error: 'INVALID_TRANSITION' });
    const approved = { ...base, status: 'APPROVED' as const };
    expect(transition(approved, 'VOIDED', aisyah, opts)).toEqual({ ok: false, error: 'INVALID_TRANSITION' });
    expect(canTransition('REJECTED', 'APPROVED')).toBe(false);
  });

  it('blocks self-approval unless the organisation allows it', () => {
    const pending = { ...base, status: 'PENDING_APPROVAL' as const, createdBy: 'u-aisyah' };
    expect(transition(pending, 'APPROVED', aisyah, opts)).toEqual({ ok: false, error: 'SELF_APPROVAL' });
    expect(transition(pending, 'APPROVED', aisyah, { ...opts, allowSelfApproval: true }).ok).toBe(true);
  });

  it('requires finance.approve to approve or reject', () => {
    const pending = { ...base, status: 'PENDING_APPROVAL' as const, createdBy: 'u-other' };
    expect(transition(pending, 'REJECTED', hafiz, opts)).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('records an optional rejection reason', () => {
    const pending = { ...base, status: 'PENDING_APPROVAL' as const };
    const r = transition(pending, 'REJECTED', aisyah, { ...opts, reason: '  Need a second quote ' });
    expect(r.ok && r.record.audit.at(-1)?.reason).toBe('Need a second quote');
    const r2 = transition(pending, 'REJECTED', aisyah, opts);
    expect(r2.ok && 'reason' in (r2.record.audit.at(-1) ?? {})).toBe(false);
  });

  it('lets the creator or an approver void earlier states only', () => {
    expect(transition(base, 'VOIDED', hafiz, opts).ok).toBe(true);
    expect(transition(base, 'VOIDED', { id: 'u-x', name: 'X', role: 'staff' }, opts)).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(transition(base, 'VOIDED', aisyah, opts).ok).toBe(true);
  });

  it('rejects records from another tenant', () => {
    expect(transition(base, 'SUBMITTED', hafiz, { ...opts, orgId: 'org-b' })).toEqual({ ok: false, error: 'WRONG_TENANT' });
  });

  it('requires the create permission to submit', () => {
    const income = { ...base, kind: 'income' as const };
    expect(submitForApproval(income, { id: 'u-t', name: 'T', role: 'treasurer' }, opts).ok).toBe(true);
    expect(submitForApproval(base, { id: 'u-t', name: 'T', role: 'treasurer' }, opts).ok).toBe(true);
    expect(transition(base, 'SUBMITTED', { id: 'u-s', name: 'S', role: 'staff' }, opts).ok).toBe(true);
  });
});

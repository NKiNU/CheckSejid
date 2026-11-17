import type { Role } from './types';

export type Permission =
  | 'organisation.read'
  | 'organisation.update'
  | 'bulletin.publish'
  | 'event.manage'
  | 'operations.manage'
  | 'finance.income.create'
  | 'finance.expense.create'
  | 'finance.approve'
  | 'finance.audit.read';

const ALL: Permission[] = [
  'organisation.read', 'organisation.update', 'bulletin.publish', 'event.manage', 'operations.manage',
  'finance.income.create', 'finance.expense.create', 'finance.approve', 'finance.audit.read',
];

/** Roles are collections of permissions (architecture/ROLE_PERMISSION_MATRIX.md). Enforced server-side later; the UI mirrors it. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: ALL,
  admin: ALL,
  treasurer: ['organisation.read', 'finance.income.create', 'finance.expense.create', 'finance.approve', 'finance.audit.read'],
  committee: ['organisation.read', 'bulletin.publish', 'event.manage', 'operations.manage', 'finance.income.create', 'finance.expense.create'],
  staff: ['organisation.read', 'operations.manage', 'finance.income.create', 'finance.expense.create'],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

import { call } from '../identity/api.ts'

// ADR-024. Duties are free text, never Masjid-specific enums (OPS-004).
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'
export const TASK_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']
export type Task = {
  id: string
  title: string
  description: string | null
  programmeId: string | null
  assigneeUserId: string | null
  dueDate: string | null
  status: TaskStatus
}
export type RosterEntry = { id: string; userId: string; duty: string; startsAt: string; endsAt: string; notes: string | null }

const base = (orgId: string) => `/orgs/${encodeURIComponent(orgId)}/operations`
const json = (method: string, data?: unknown): RequestInit => ({ method, body: data === undefined ? undefined : JSON.stringify(data) })

export const listTasks = async (orgId: string) => (await call<{ tasks: Task[] }>(`${base(orgId)}/tasks`)).tasks
export const createTask = async (orgId: string, data: { title: string; assigneeUserId: string | null; dueDate: string | null }) =>
  (await call<{ task: Task }>(`${base(orgId)}/tasks`, json('POST', data))).task
export const setTaskStatus = async (orgId: string, id: string, status: TaskStatus) =>
  (await call<{ task: Task }>(`${base(orgId)}/tasks/${encodeURIComponent(id)}/status`, json('POST', { status }))).task
export const listRoster = async (orgId: string) => (await call<{ roster: RosterEntry[] }>(`${base(orgId)}/roster`)).roster
export const createRosterEntry = async (orgId: string, data: { userId: string; duty: string; startsAt: string; endsAt: string }) =>
  (await call<{ entry: RosterEntry }>(`${base(orgId)}/roster`, json('POST', data))).entry

// The assignee or a manager may change status (ADR-015 rule); used only to show controls.
export const canChangeStatus = (task: Task, myUserId: string, perms: Set<string>) =>
  perms.has('operations.manage') || task.assigneeUserId === myUserId

import { afterEach, describe, expect, it, vi } from 'vitest'
import { canChangeStatus, setTaskStatus, type Task } from './api.ts'

afterEach(() => vi.unstubAllGlobals())
const task: Task = { id: 't1', title: 'Clean', description: null, programmeId: null, assigneeUserId: 'u1', dueDate: null, status: 'TODO' }

describe('operations api', () => {
  it('lets the assignee or a manager change status (ADR-015 rule)', () => {
    expect(canChangeStatus(task, 'u1', new Set())).toBe(true)
    expect(canChangeStatus(task, 'u2', new Set(['operations.read']))).toBe(false)
    expect(canChangeStatus(task, 'u2', new Set(['operations.manage']))).toBe(true)
  })

  it('changes status through the dedicated endpoint', async () => {
    const fn = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ task }), { status: 200 }))
    vi.stubGlobal('fetch', fn)
    await setTaskStatus('o1', 't1', 'DONE')
    expect([fn.mock.calls[0]![0], fn.mock.calls[0]![1]!.body]).toEqual(['/orgs/o1/operations/tasks/t1/status', '{"status":"DONE"}'])
  })
})

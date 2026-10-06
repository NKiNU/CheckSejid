import { useEffect, useState, type FormEvent } from 'react'
import * as api from './api.ts'

// Phase 06: bulletin posts and events with their lifecycle. Controls follow the caller's keys; the
// server enforces them (AUTH-003).
export function HubPanel({ orgId, perms }: { orgId: string; perms: Set<string> }) {
  const [posts, setPosts] = useState<api.Post[]>([])
  const [events, setEvents] = useState<api.HubEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = () =>
    Promise.all([api.listPosts(orgId), api.listEvents(orgId)]).then(
      ([p, e]) => (setPosts(p), setEvents(e)),
      (e) => setError(e instanceof Error ? e.message : 'Something went wrong'),
    )
  useEffect(() => {
    Promise.all([api.listPosts(orgId), api.listEvents(orgId)]).then(
      ([p, e]) => (setPosts(p), setEvents(e)),
      (e) => setError(e instanceof Error ? e.message : 'Something went wrong'),
    )
  }, [orgId])

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  function addPost(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    run(() => api.createPost(orgId, { title: String(f.get('title')), body: String(f.get('body')) })).then(() => form.reset())
  }
  function addEvent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    run(() =>
      api.createEvent(orgId, {
        title: String(f.get('title')),
        description: String(f.get('description') ?? ''),
        startsAt: api.localInputToIso(String(f.get('startsAt'))),
        endsAt: api.localInputToIso(String(f.get('endsAt'))),
        location: String(f.get('location') ?? '').trim() || null,
      }),
    ).then(() => form.reset())
  }

  const row = (kind: api.Kind, item: api.Post | api.HubEvent) => (
    <li key={item.id}>
      {item.title} [{item.status}]
      {perms.has(kind === 'post' ? 'bulletin.publish' : 'event.publish') &&
        api.nextActions(item.status).map((a) => (
          <button key={a} type="button" onClick={() => run(() => api.transition(orgId, kind, item.id, a))}>
            {item.status === 'ARCHIVED' ? 'Republish' : a}
          </button>
        ))}
      {item.status === 'DRAFT' && perms.has(kind === 'post' ? 'bulletin.manage' : 'event.manage') && (
        <button type="button" onClick={() => run(() => api.removeDraft(orgId, kind, item.id))}>
          Delete draft
        </button>
      )}
    </li>
  )

  return (
    <section>
      <h3>Announcements</h3>
      <ul>{posts.map((p) => row('post', p))}</ul>
      {perms.has('bulletin.manage') && (
        <form onSubmit={addPost}>
          <input name="title" placeholder="Title" required maxLength={200} />
          <textarea name="body" placeholder="Text" required maxLength={20000} />
          <button type="submit">Save draft</button>
        </form>
      )}
      <h3>Events</h3>
      <ul>{events.map((e) => row('event', e))}</ul>
      {perms.has('event.manage') && (
        <form onSubmit={addEvent}>
          <input name="title" placeholder="Title" required maxLength={200} />
          <input name="description" placeholder="Description" maxLength={20000} />
          <label>
            Starts <input name="startsAt" type="datetime-local" required />
          </label>
          <label>
            Ends <input name="endsAt" type="datetime-local" required />
          </label>
          <input name="location" placeholder="Location (optional)" maxLength={300} />
          <button type="submit">Save draft</button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

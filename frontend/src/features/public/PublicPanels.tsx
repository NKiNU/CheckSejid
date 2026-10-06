import { useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '../identity/api.ts'
import { myFeed, publicEvents, publicPosts, type FeedItem, type HubEvent, type Post } from '../hub/api.ts'
import * as api from './api.ts'

const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')

// Phase 05: discovery (PUB-001/002) and a public organisation page with follow (PUB-005, ADR-019).
export function DiscoverPanel() {
  const [result, setResult] = useState<api.PublicOrganisation[]>([])
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(location.search).get('org'))
  const [error, setError] = useState<string | null>(null)

  async function search(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault()
    const f = e ? new FormData(e.currentTarget) : new FormData()
    setError(null)
    try {
      setResult((await api.discover({ q: String(f.get('q') ?? ''), type: String(f.get('type') ?? ''), state: String(f.get('state') ?? '') })).organisations)
    } catch (err) {
      setError(message(err))
    }
  }
  useEffect(() => {
    api.discover({}).then((r) => setResult(r.organisations), (e) => setError(message(e)))
  }, [])

  return (
    <section>
      <h2>Discover organisations</h2>
      <form onSubmit={search}>
        <input name="q" placeholder="Name" maxLength={100} />
        <select name="type" defaultValue="">
          <option value="">Any type</option>
          {['masjid', 'surau', 'madrasah', 'school', 'ngo', 'other'].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input name="state" placeholder="State" maxLength={100} />
        <button type="submit">Search</button>
      </form>
      <ul>
        {result.map((o) => (
          <li key={o.id}>
            <button type="button" onClick={() => setSelected(o.id)}>
              {o.name}
            </button>{' '}
            {o.type} {o.state && `· ${o.state}`}
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
      {selected && <PublicOrgPage key={selected} id={selected} />}
    </section>
  )
}

function PublicOrgPage({ id }: { id: string }) {
  const [org, setOrg] = useState<api.PublicOrganisation | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [events, setEvents] = useState<HubEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    Promise.all([api.getPublicOrganisation(id), publicPosts(id), publicEvents(id)]).then(
      ([o, p, e]) => (setOrg(o), setPosts(p), setEvents(e)),
      (e) => setError(e instanceof ApiError && e.code === 'LOGIN_REQUIRED' ? 'Log in to view this organisation.' : message(e)),
    )
  }, [id])
  if (error) return <p role="alert">{error}</p>
  if (!org) return null

  async function toggle() {
    try {
      if (org!.following) await api.unfollow(id)
      else await api.follow(id)
      setOrg({ ...org!, following: !org!.following })
    } catch (e) {
      setError(message(e))
    }
  }

  return (
    <article>
      {org.coverUrl && <img src={org.coverUrl} alt="" style={{ maxWidth: '100%' }} />}
      <h3>
        {org.logoUrl && <img src={org.logoUrl} alt="" width={48} height={48} />} {org.name}
      </h3>
      <p>{org.description}</p>
      <p>
        {[org.addressLine, org.state, org.country].filter(Boolean).join(', ')} {org.contactPhone} {org.contactEmail}
      </p>
      {org.followable && (
        <button type="button" onClick={toggle}>
          {org.following ? 'Unfollow' : 'Follow'}
        </button>
      )}
      <h4>Upcoming events</h4>
      <ul>
        {events.map((e) => (
          <li key={e.id}>
            {e.title} — {new Date(e.startsAt).toLocaleString()} {e.location && `@ ${e.location}`}
          </li>
        ))}
      </ul>
      <h4>Announcements</h4>
      <ul>
        {posts.map((p) => (
          <li key={p.id}>
            <strong>{p.title}</strong> {p.body}
          </li>
        ))}
      </ul>
    </article>
  )
}

// ADR-019 §3: following only adds published content to the user's own feed.
export function FeedPanel() {
  const [feed, setFeed] = useState<{ posts: FeedItem<Post>[]; events: FeedItem<HubEvent>[] } | null>(null)
  useEffect(() => {
    myFeed().then(setFeed, () => setFeed(null))
  }, [])
  if (!feed || (feed.posts.length === 0 && feed.events.length === 0)) return null
  return (
    <section>
      <h2>From organisations you follow</h2>
      <ul>
        {feed.events.map((e) => (
          <li key={e.id}>
            {e.organisation.name}: {e.title} — {new Date(e.startsAt).toLocaleString()}
          </li>
        ))}
        {feed.posts.map((p) => (
          <li key={p.id}>
            {p.organisation.name}: <strong>{p.title}</strong>
          </li>
        ))}
      </ul>
    </section>
  )
}

// Organisation side: visibility (organisation.update) and logo/cover uploads (ADR-020).
export function VisibilityPanel({ orgId, visibility, canEdit }: { orgId: string; visibility: api.Visibility; canEdit: boolean }) {
  const [current, setCurrent] = useState(visibility)
  const [status, setStatus] = useState<string | null>(null)
  if (!canEdit) return <p>Visibility: {current}</p>

  const change = async (v: api.Visibility) => {
    try {
      setCurrent((await api.setVisibility(orgId, v)).organisation.visibility)
    } catch (e) {
      setStatus(message(e))
    }
  }
  const upload = async (which: 'logo' | 'cover', file: File | undefined) => {
    if (!file) return
    if (file.size > api.IMAGE_MAX_BYTES) return setStatus('Images must be 2 MB or smaller')
    try {
      await api.uploadProfileImage(orgId, which, file)
      setStatus(`${which} updated`)
    } catch (e) {
      setStatus(message(e))
    }
  }

  return (
    <div>
      <h3>Public profile</h3>
      <label>
        Visibility{' '}
        <select value={current} onChange={(e) => change(e.target.value as api.Visibility)}>
          <option value="PUBLIC">Public — anyone can find and view it</option>
          <option value="UNLISTED">Unlisted — logged-in users with the link</option>
          <option value="PRIVATE">Private — internal only</option>
        </select>
      </label>
      {current === 'UNLISTED' && <p>Share link: {api.shareLink(location.origin, orgId)}</p>}
      <label>
        Logo <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => upload('logo', e.target.files?.[0])} />
      </label>
      <label>
        Cover <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => upload('cover', e.target.files?.[0])} />
      </label>
      {status && <p role="status">{status}</p>}
    </div>
  )
}

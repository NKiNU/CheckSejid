import { buildFeed, changePostStatus, discoverable, orgBulletin, pinPost } from './bulletin';
import type { Organisation, Post } from './types';

const org = (id: string, visibility: Organisation['visibility'], type: Organisation['type'] = 'Masjid'): Organisation => ({
  id, slug: id, name: `Org ${id}`, initials: 'O', type, area: 'Setapak', address: '', description: '', visibility, plan: 'STARTER', tone: 'brand',
});
const post = (id: string, orgId: string, over: Partial<Post> = {}): Post => ({
  id, orgId, kind: 'announcement', status: 'PUBLISHED', title: id, body: '', pinned: false, createdBy: 'u', createdAt: '2026-11-01T00:00:00Z',
  publishedAt: `2026-11-${id.padStart(2, '0')}T00:00:00Z`, ...over,
});

const orgs = [org('a', 'PUBLIC'), org('b', 'UNLISTED'), org('c', 'PRIVATE'), org('d', 'PUBLIC', 'Surau')];
const posts = [
  post('1', 'a'), post('2', 'a', { status: 'DRAFT' }), post('3', 'a', { status: 'ARCHIVED' }), post('4', 'b'),
  post('5', 'c'), post('6', 'd'), post('7', 'a', { pinned: true }), post('8', 'a', { kind: 'event' }),
];

describe('bulletin feed (HUB-002..004)', () => {
  it('shows only published posts of followed, visible organisations, newest first', () => {
    const feed = buildFeed(posts, orgs, new Set(['a', 'b', 'c']));
    expect(feed.featured?.id).toBe('7');
    expect(feed.posts.map((p) => p.id)).toEqual(['8', '4', '1']);
  });
  it('filters by kind and has no featured post when nothing is pinned', () => {
    const feed = buildFeed(posts, orgs, new Set(['a']), 'event');
    expect(feed).toEqual({ featured: null, posts: [expect.objectContaining({ id: '8' })] });
  });
  it('shows unlisted organisations only to followers', () => {
    expect(orgBulletin(posts, orgs[1], false)).toEqual([]);
    expect(orgBulletin(posts, orgs[1], true).map((p) => p.id)).toEqual(['4']);
    expect(orgBulletin(posts, orgs[2], true)).toEqual([]);
    expect(orgBulletin(posts, orgs[0], false).map((p) => p.id)).toEqual(['7', '8', '1']);
  });
});

describe('post lifecycle (HUB-001)', () => {
  const now = new Date('2026-11-17T00:00:00Z');
  it('publishes and archives with the right permission', () => {
    const draft = post('9', 'a', { status: 'DRAFT', publishedAt: undefined });
    const pub = changePostStatus(draft, 'PUBLISHED', 'committee', now);
    expect(pub.ok && pub.post.publishedAt).toBe(now.toISOString());
    if (!pub.ok) return;
    const arch = changePostStatus({ ...pub.post, pinned: true }, 'ARCHIVED', 'admin');
    expect(arch.ok && arch.post).toMatchObject({ status: 'ARCHIVED', pinned: false });
  });
  it('rejects invalid transitions and roles without permission', () => {
    expect(changePostStatus(post('1', 'a'), 'DRAFT', 'admin')).toEqual({ ok: false, error: 'INVALID_TRANSITION' });
    expect(changePostStatus(post('1', 'a'), 'ARCHIVED', 'treasurer')).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(changePostStatus(post('8', 'a', { kind: 'event' }), 'ARCHIVED', 'staff')).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
  it('keeps one pin per organisation and only pins published posts', () => {
    const r = pinPost(posts, '1', 'admin');
    expect(r.ok && r.posts.filter((p) => p.orgId === 'a' && p.pinned).map((p) => p.id)).toEqual(['1']);
    const unpin = pinPost(posts, '7', 'admin');
    expect(unpin.ok && unpin.posts.some((p) => p.pinned)).toBe(false);
    expect(pinPost(posts, '2', 'admin')).toEqual({ ok: false, error: 'PIN_NOT_PUBLISHED' });
    expect(pinPost(posts, '1', 'treasurer')).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});

describe('discovery (PUB-001)', () => {
  it('lists public organisations only, with type and keyword filters', () => {
    expect(discoverable(orgs, '', 'All').map((o) => o.id)).toEqual(['a', 'd']);
    expect(discoverable(orgs, '', 'Surau').map((o) => o.id)).toEqual(['d']);
    expect(discoverable(orgs, 'org a', 'All').map((o) => o.id)).toEqual(['a']);
  });
});

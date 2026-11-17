import { can } from './rbac';
import type { Organisation, Post, PostStatus, Role } from './types';

const NEXT: Record<PostStatus, readonly PostStatus[]> = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: [],
};

export type PostError = 'INVALID_TRANSITION' | 'FORBIDDEN' | 'PIN_NOT_PUBLISHED';

/** HUB-001 */
export function canManage(role: Role, post: Pick<Post, 'kind'>): boolean {
  return can(role, post.kind === 'announcement' ? 'bulletin.publish' : 'event.manage');
}

export function changePostStatus(post: Post, to: PostStatus, role: Role, now = new Date()): { ok: true; post: Post } | { ok: false; error: PostError } {
  if (!canManage(role, post)) return { ok: false, error: 'FORBIDDEN' };
  if (!NEXT[post.status].includes(to)) return { ok: false, error: 'INVALID_TRANSITION' };
  return {
    ok: true,
    post: {
      ...post,
      status: to,
      pinned: to === 'ARCHIVED' ? false : post.pinned,
      publishedAt: to === 'PUBLISHED' ? now.toISOString() : post.publishedAt,
    },
  };
}

/** HUB-004: at most one pinned post per organisation. Returns the organisation's posts with the pin moved. */
export function pinPost(posts: Post[], postId: string, role: Role): { ok: true; posts: Post[] } | { ok: false; error: PostError } {
  const target = posts.find((p) => p.id === postId);
  if (!target || !canManage(role, target)) return { ok: false, error: 'FORBIDDEN' };
  if (target.status !== 'PUBLISHED') return { ok: false, error: 'PIN_NOT_PUBLISHED' };
  const pinOn = !target.pinned;
  return {
    ok: true,
    posts: posts.map((p) =>
      p.orgId !== target.orgId ? p : { ...p, pinned: p.id === postId ? pinOn : pinOn ? false : p.pinned },
    ),
  };
}

/** HUB-003: may this post be shown publicly to a viewer? */
export function isVisibleTo(post: Post, org: Organisation, viewerFollows: boolean): boolean {
  if (post.status !== 'PUBLISHED' || post.orgId !== org.id) return false;
  if (org.visibility === 'PRIVATE') return false;
  if (org.visibility === 'UNLISTED') return viewerFollows;
  return true;
}

const byPublishedDesc = (a: Post, b: Post) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');

export interface Feed {
  featured: Post | null;
  posts: Post[];
}

/** HUB-002 / HUB-004: the community home feed. */
export function buildFeed(posts: Post[], orgs: Organisation[], followed: ReadonlySet<string>, kind?: Post['kind']): Feed {
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const visible = posts
    .filter((p) => followed.has(p.orgId))
    .filter((p) => {
      const org = orgById.get(p.orgId);
      return org ? isVisibleTo(p, org, true) : false;
    })
    .filter((p) => !kind || p.kind === kind)
    .sort(byPublishedDesc);
  const featured = visible.find((p) => p.pinned) ?? null;
  return { featured, posts: visible.filter((p) => p !== featured) };
}

/** Public organisation page: published posts, pinned first. */
export function orgBulletin(posts: Post[], org: Organisation, viewerFollows: boolean): Post[] {
  return posts
    .filter((p) => isVisibleTo(p, org, viewerFollows))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || byPublishedDesc(a, b));
}

/** Discovery lists Public organisations only (PUB-001). */
export function discoverable(orgs: Organisation[], query: string, type: Organisation['type'] | 'All'): Organisation[] {
  const q = query.trim().toLowerCase();
  return orgs
    .filter((o) => o.visibility === 'PUBLIC')
    .filter((o) => type === 'All' || o.type === type)
    .filter((o) => !q || `${o.name} ${o.area} ${o.type}`.toLowerCase().includes(q));
}

export type Visibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
export type OrgType = 'Masjid' | 'Surau' | 'Madrasah' | 'NGO';
export type Plan = 'FREE' | 'STARTER' | 'PROFESSIONAL';

export interface Organisation {
  id: string;
  slug: string;
  name: string;
  initials: string;
  type: OrgType;
  area: string;
  address: string;
  description: string;
  visibility: Visibility;
  plan: Plan;
  trialEndsAt?: string;
  tone: 'brand' | 'gold' | 'info' | 'plum';
}

export type Role = 'owner' | 'admin' | 'treasurer' | 'committee' | 'staff';

export interface User {
  id: string;
  name: string;
}

export type PostKind = 'announcement' | 'event' | 'class';
export type PostStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface Post {
  id: string;
  orgId: string;
  kind: PostKind;
  status: PostStatus;
  title: string;
  body: string;
  pinned: boolean;
  createdBy: string;
  createdAt: string;
  publishedAt?: string;
  /** Events and classes only. ISO timestamp. */
  startsAt?: string;
}

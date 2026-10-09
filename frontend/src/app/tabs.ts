import { Bell, ClipboardList, Clock, Compass, Ellipsis, House, Megaphone, Newspaper, Wallet, type LucideIcon } from 'lucide-react'
import type { Key } from '@/i18n/en.ts'

export type Tab = { to: string; label: Key; icon: LucideIcon; end?: boolean; also?: string[] }

// Hiding a tab is display only; the API enforces permissions.
export const communityTabs = (signedIn: boolean): Tab[] => [
  { to: '/', label: 'nav.discover', icon: Compass, end: true },
  ...(signedIn ? [{ to: '/feed', label: 'nav.feed', icon: Newspaper } as Tab] : []),
  { to: '/#prayer', label: 'nav.prayer', icon: Clock },
  ...(signedIn ? [{ to: '/notifications', label: 'nav.alerts', icon: Bell } as Tab] : []),
]

export const orgTabs = (orgId: string, perms: ReadonlySet<string>, usable: boolean): Tab[] => {
  const b = `/org/${orgId}`
  return [
    { to: b, label: 'nav.home', icon: House, end: true },
    ...(usable ? [{ to: `${b}/hub`, label: 'nav.hub', icon: Megaphone } as Tab] : []),
    ...(usable && perms.has('finance.read') ? [{ to: `${b}/finance`, label: 'nav.finance', icon: Wallet } as Tab] : []),
    ...(usable && perms.has('operations.read') ? [{ to: `${b}/operations`, label: 'nav.ops', icon: ClipboardList } as Tab] : []),
    { to: `${b}/more`, label: 'nav.more', icon: Ellipsis, also: [`${b}/members`, `${b}/settings`] },
  ]
}

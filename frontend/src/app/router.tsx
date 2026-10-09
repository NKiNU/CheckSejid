import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router'
import { useT } from '@/i18n/index.tsx'
import { DiscoverPanel, FeedPanel } from '@/features/public/PublicPanels.tsx'
import { IslamicPanel } from '@/features/islamic/IslamicPanel.tsx'
import { NotificationsPanel } from '@/features/notifications/NotificationsPanel.tsx'
import { AuthPage } from './AuthPage.tsx'
import { NotFound } from './NotFound.tsx'
import { OrgLayout } from './OrgLayout.tsx'
import { MyOrganisations, OrgFinance, OrgHome, OrgHub, OrgMembers, OrgMore, OrgOperations, OrgSettings } from './OrgPages.tsx'
import { Shell } from './Shell.tsx'
import { useSession } from './session.tsx'
import { communityTabs } from './tabs.ts'

export function RequireAuth() {
  const { status } = useSession()
  const { pathname, search } = useLocation()
  const { t } = useT()
  if (status === 'loading') return <p className="py-12 text-center">{t('common.loading')}</p>
  if (status === 'out') return <Navigate to={'/login?next=' + encodeURIComponent(pathname + search)} replace />
  return <Outlet />
}

function CommunityShell() {
  const { status } = useSession()
  const { t } = useT()
  return <Shell tabs={communityTabs(status === 'in')} title={t('app.name')} />
}

export const router = createBrowserRouter([
  { path: '/login', element: <AuthPage mode="login" /> },
  { path: '/register', element: <AuthPage mode="register" /> },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/org/:orgId',
        element: <OrgLayout />,
        children: [
          { index: true, element: <OrgHome /> },
          { path: 'hub', element: <OrgHub /> },
          { path: 'finance', element: <OrgFinance /> },
          { path: 'operations', element: <OrgOperations /> },
          { path: 'members', element: <OrgMembers /> },
          { path: 'settings', element: <OrgSettings /> },
          { path: 'more', element: <OrgMore /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
  {
    element: <CommunityShell />,
    children: [
      {
        path: '/',
        element: (
          <>
            <DiscoverPanel />
            <div id="prayer" className="scroll-mt-20"><IslamicPanel /></div>
          </>
        ),
      },
      {
        element: <RequireAuth />,
        children: [
          { path: '/feed', element: <><MyOrganisations /><FeedPanel /></> },
          { path: '/notifications', element: <NotificationsPanel /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
])

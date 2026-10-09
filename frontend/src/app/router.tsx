import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router'
import { useT } from '@/i18n/index.tsx'
import { AuthPage } from './AuthPage.tsx'
import { useSession } from './session.tsx'

export function RequireAuth() {
  const { status } = useSession()
  const { pathname, search } = useLocation()
  const { t } = useT()
  if (status === 'loading') return <p className="grid min-h-dvh place-items-center">{t('common.loading')}</p>
  if (status === 'out') return <Navigate to={'/login?next=' + encodeURIComponent(pathname + search)} replace />
  return <Outlet />
}

// Tasks 3-4 nest authenticated routes under <RequireAuth />.
export const router = createBrowserRouter([
  { path: '/login', element: <AuthPage mode="login" /> },
  { path: '/register', element: <AuthPage mode="register" /> },
  { element: <RequireAuth />, children: [] },
])

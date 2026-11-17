import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { CommunityLayout } from './components/CommunityLayout';
import { BulletinHome } from './pages/community/BulletinHome';
import { Discover } from './pages/community/Discover';
import { Me } from './pages/community/Me';
import { OrgProfile } from './pages/community/OrgProfile';
import { Prayer } from './pages/community/Prayer';
import { BulletinManager } from './pages/workspace/BulletinManager';
import { Finance } from './pages/workspace/Finance';
import { Overview } from './pages/workspace/Overview';
import { NotBuilt, WorkspaceLayout } from './pages/workspace/WorkspaceLayout';
import { AppProvider } from './store';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<CommunityLayout />}>
        <Route index element={<BulletinHome />} />
        <Route path="discover" element={<Discover />} />
        <Route path="o/:slug" element={<OrgProfile />} />
        <Route path="prayer" element={<Prayer />} />
        <Route path="me" element={<Me />} />
      </Route>
      <Route path="workspace" element={<WorkspaceLayout />}>
        <Route index element={<Overview />} />
        <Route path="bulletin" element={<BulletinManager />} />
        <Route path="finance" element={<Finance />} />
        <Route path="profile" element={<NotBuilt title="Profile & visibility" phase="Phase 05" />} />
        <Route path="operations" element={<NotBuilt title="Operations" phase="Phase 07" />} />
        <Route path="members" element={<NotBuilt title="Members & roles" phase="Phase 03" />} />
        <Route path="subscription" element={<NotBuilt title="Subscription" phase="Phase 11" />} />
        <Route path="settings" element={<NotBuilt title="Settings" phase="Phase 02" />} />
      </Route>
      <Route path="*" element={<p className="p-8 text-center">Page not found.</p>} />
    </Routes>
  );
}

export function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  );
}

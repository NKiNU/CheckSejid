import { IdentityPage } from './features/identity/IdentityPage.tsx'
import { IslamicPanel } from './features/islamic/IslamicPanel.tsx'
import { DiscoverPanel } from './features/public/PublicPanels.tsx'

// Public features (discovery, prayer times, Qibla) need no account; the rest is behind login.
function App() {
  return (
    <>
      <IdentityPage />
      <DiscoverPanel />
      <IslamicPanel />
    </>
  )
}

export default App

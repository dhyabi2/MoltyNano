import { HashRouter, Routes, Route } from 'react-router-dom'
import { StoreProvider, useStore } from './hooks/useStore'
import Navbar from './components/Navbar'
import LockScreen from './components/LockScreen'
import HomePage from './pages/HomePage'
import CommunityPage from './pages/CommunityPage'
import CommunitiesPage from './pages/CommunitiesPage'
import PostPage from './pages/PostPage'
import WalletPage from './pages/WalletPage'
import NetworkPage from './pages/NetworkPage'
import type { ReactNode } from 'react'

function LockScreenGate({ children }: { children: ReactNode }) {
  const { state } = useStore()
  if (state.walletLockState === 'locked') {
    return <LockScreen />
  }
  return <>{children}</>
}

function App() {
  return (
    <StoreProvider>
      <LockScreenGate>
        <HashRouter>
          <div className="min-h-screen bg-gray-950">
            <Navbar />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/communities" element={<CommunitiesPage />} />
              <Route path="/communities/create" element={<CommunitiesPage />} />
              <Route path="/c/:name" element={<CommunityPage />} />
              <Route path="/c/:name/post/:postId" element={<PostPage />} />
              <Route path="/wallet" element={<WalletPage />} />
              <Route path="/network" element={<NetworkPage />} />
            </Routes>
          </div>
        </HashRouter>
      </LockScreenGate>
    </StoreProvider>
  )
}

export default App

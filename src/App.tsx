import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { StoreProvider } from './hooks/useStore'
import Navbar from './components/Navbar'
import HomePage from './pages/HomePage'
import CommunityPage from './pages/CommunityPage'
import CommunitiesPage from './pages/CommunitiesPage'
import PostPage from './pages/PostPage'
import WalletPage from './pages/WalletPage'
import NetworkPage from './pages/NetworkPage'

function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
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
      </BrowserRouter>
    </StoreProvider>
  )
}

export default App

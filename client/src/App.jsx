import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import Navbar from './components/Navbar.jsx';
import { Spinner } from './components/States.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Matches from './pages/Matches.jsx';
import Discover from './pages/Discover.jsx';
import Swaps from './pages/Swaps.jsx';
import SwapDetail from './pages/SwapDetail.jsx';
import MyProfile from './pages/MyProfile.jsx';
import UserProfile from './pages/UserProfile.jsx';

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function GuestOnly() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Checking your session…" />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function Layout() {
  return (
    <>
      <Navbar />
      <main className="container">
        <Outlet />
      </main>
      <footer className="footer">
        <span>SkillSwap — trade skills, not money.</span>
      </footer>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route element={<GuestOnly />}>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
            </Route>

            <Route element={<Protected />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/matches" element={<Matches />} />
              <Route path="/discover" element={<Discover />} />
              <Route path="/swaps" element={<Swaps />} />
              <Route path="/swaps/:id" element={<SwapDetail />} />
              <Route path="/profile" element={<MyProfile />} />
              <Route path="/u/:id" element={<UserProfile />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

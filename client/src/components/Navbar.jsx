import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="navbar">
      <Link to="/" className="brand">
        <span className="brand-mark">⇄</span> SkillSwap
      </Link>

      {user && (
        <nav className="nav-links" aria-label="Main">
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/matches">Matches</NavLink>
          <NavLink to="/discover">Discover</NavLink>
          <NavLink to="/swaps">Swaps</NavLink>
        </nav>
      )}

      <div className="nav-right">
        {user ? (
          <>
            <Link to="/profile" className="nav-user">
              <span className="avatar">{user.name.charAt(0).toUpperCase()}</span>
              <span className="hide-sm">{user.name.split(' ')[0]}</span>
            </Link>
            <button type="button" className="btn btn-ghost" onClick={handleLogout}>
              Log out
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="btn btn-ghost">
              Log in
            </Link>
            <Link to="/register" className="btn btn-primary">
              Join
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

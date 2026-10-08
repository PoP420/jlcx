import { useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const links = [
  { to: "/", label: "Amortization" },
  { to: "/daily-loan", label: "Daily Loan" },
] as const;

export function NavBar() {
  const { user, loading, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
  };

  return (
    <nav className="navbar" aria-label="Main navigation">
      <div className="navbar-inner">
        <div className="nav-brand">
          <NavLink to="/" className="nav-brand-link">
            Jamo Lending Corp
          </NavLink>
        </div>

        <div className="nav-links">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        <div className="nav-auth">
          {loading ? (
            <span className="nav-auth-status">...</span>
          ) : user ? (
            <div className="nav-user-menu">
              <button
                className="nav-user-button"
                type="button"
                aria-expanded={menuOpen}
                aria-haspopup="true"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span className="nav-user-avatar">
                  {(user.email ?? "U").charAt(0).toUpperCase()}
                </span>
                <span className="nav-user-email">{user.email ?? "Staff"}</span>
                <span className="nav-user-chevron" aria-hidden="true">
                  {menuOpen ? "▲" : "▼"}
                </span>
              </button>
              {menuOpen && (
                <div className="nav-user-dropdown" role="menu">
                  <button
                    className="nav-user-item"
                    type="button"
                    role="menuitem"
                    onClick={handleSignOut}
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" className="nav-link nav-login">
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
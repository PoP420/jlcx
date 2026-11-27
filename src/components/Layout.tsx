import { useEffect, useState } from "react";
import { NavLink, Link, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { fetchMyProfile } from "../lib/cashService";

const sidebarItems = [
  { to: "/dashboard", label: "Dashboard", icon: "▦" },
  { to: "/amortization", label: "Amortization", icon: "◐" },
  { to: "/daily-loan", label: "Daily Loan", icon: "◑" },
  { to: "/cash-count", label: "Cash Count", icon: "₱" },
  { to: "/daily-cash-position", label: "Daily Cash Position", icon: "▤" },
  { to: "/collectors", label: "Collectors", icon: "◉" },
  { to: "/borrowers", label: "Borrowers", icon: "♧" },
  { to: "/loans", label: "Loans", icon: "₱" },
  { to: "/sms", label: "SMS Reminders", icon: "✉" },
  { to: "/sms-activity", label: "SMS Activity", icon: "◷" },
] as const;

export function AppShell() {
  const { user, loading, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchMyProfile().then((result) => {
      if (active && !result.error && result.data) {
        setRole(result.data.role);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const handleSignOut = async () => {
    setSidebarOpen(false);
    await signOut();
  };

  return (
    <div className="app-shell">
      <button
        className="app-shell-toggle"
        type="button"
        aria-label="Toggle menu"
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen((open) => !open)}
      >
        <span className="app-shell-toggle-bar" />
        <span className="app-shell-toggle-bar" />
        <span className="app-shell-toggle-bar" />
      </button>

      {sidebarOpen && (
        <button
          className="app-shell-backdrop"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`sidebar${sidebarOpen ? " sidebar-open" : ""}`}
        aria-label="Main menu"
      >
        <div className="sidebar-header">
          <Link to="/dashboard" className="sidebar-brand" onClick={() => setSidebarOpen(false)}>
            <span className="sidebar-brand-mark">J</span>
            <span className="sidebar-brand-name">Jamo Lending Corp</span>
          </Link>
        </div>

        <nav className="sidebar-nav">
          <p className="sidebar-section">Menu</p>
          <ul className="sidebar-list">
            {sidebarItems.map((item) => (
              <li key={item.to} className="sidebar-item">
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    isActive ? "sidebar-link sidebar-link-active" : "sidebar-link"
                  }
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="sidebar-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="sidebar-label">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
          {role === "admin" && (
            <>
              <p className="sidebar-section">Administration</p>
              <ul className="sidebar-list">
                <li className="sidebar-item">
                  <NavLink to="/sms-templates" className={({ isActive }) => isActive ? "sidebar-link sidebar-link-active" : "sidebar-link"} onClick={() => setSidebarOpen(false)}>
                    <span className="sidebar-icon" aria-hidden="true">✎</span>
                    <span className="sidebar-label">SMS Templates</span>
                  </NavLink>
                </li>
                <li className="sidebar-item">
                  <NavLink to="/jamo-nh-import" className={({ isActive }) => isActive ? "sidebar-link sidebar-link-active" : "sidebar-link"} onClick={() => setSidebarOpen(false)}>
                    <span className="sidebar-icon" aria-hidden="true">▧</span>
                    <span className="sidebar-label">In-House Account Import</span>
                  </NavLink>
                </li>
              </ul>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {(user?.email ?? "U").charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user-meta">
              <span className="sidebar-user-name">
                {loading ? "..." : user?.email ?? "Staff"}
              </span>
              <span className="sidebar-user-role">
                {role ? role.charAt(0).toUpperCase() + role.slice(1) : "Staff"}
              </span>
            </div>
          </div>
          <button
            className="sidebar-signout"
            type="button"
            onClick={handleSignOut}
          >
            Sign Out
          </button>
        </div>
      </aside>

      <main className="app-shell-main">
        <Outlet />
      </main>
    </div>
  );
}


import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Amortization" },
  { to: "/daily-loan", label: "Daily Loan" },
] as const;

export function NavBar() {
  return (
    <nav className="navbar" aria-label="Main navigation">
      <div className="navbar-inner">
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
    </nav>
  );
}

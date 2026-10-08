import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatCurrency, todayIso } from "../lib/calculator";
import { useAuth } from "../context/AuthContext";
import {
  fetchDashboardStats,
  fetchMyProfile,
  type DashboardStats,
} from "../lib/cashService";

interface DashboardStat {
  label: string;
  value: string;
  hint: string;
  tone?: "primary" | "neutral" | "warning";
}

export function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [statsResult, profileResult] = await Promise.all([
        fetchDashboardStats(todayIso()),
        fetchMyProfile(),
      ]);
      if (!active) return;

      if (statsResult.error) {
        setError(statsResult.error);
      } else {
        setError(null);
        setStats(statsResult.data);
      }

      if (!profileResult.error && profileResult.data) {
        setDisplayName(profileResult.data.full_name);
      }

      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const greeting = displayName ?? user?.email ?? "Staff";

  const statsList: DashboardStat[] = [
    {
      label: "Cash on Hand",
      value: stats ? formatCurrency(stats.cashOnHand) : "—",
      hint: "Opening cash minus releases plus collections",
      tone: "primary",
    },
    {
      label: "Active Loans",
      value: stats ? `${stats.activeLoans}` : "—",
      hint: "Loans currently being collected",
    },
    {
      label: "Outstanding Balance",
      value: stats ? formatCurrency(stats.outstandingBalance) : "—",
      hint: "Active principal minus collections received",
      tone: "warning",
    },
    {
      label: "Collections Today",
      value: stats ? formatCurrency(stats.collectionsToday) : "—",
      hint: "Payments received today",
    },
  ];

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <p className="brand">Jamo Lending Corp</p>
        <h1 className="dashboard-title">Dashboard</h1>
        <p className="dashboard-subtitle">
          Welcome back, {greeting}. Use the sidebar to navigate between
          modules.
        </p>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
      </header>

      <section className="dashboard-stats">
        {statsList.map((stat) => (
          <div
            key={stat.label}
            className={`dashboard-card ${
              stat.tone === "primary"
                ? "dashboard-card-primary"
                : stat.tone === "warning"
                  ? "dashboard-card-warning"
                  : ""
            }`}
          >
            <span className="dashboard-card-label">
              {loading && !stats ? "Loading..." : stat.label}
            </span>
            <span className="dashboard-card-value">{stat.value}</span>
            <span className="dashboard-card-hint">{stat.hint}</span>
          </div>
        ))}
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>Quick Actions</h2>
          </div>
          <div className="dashboard-actions">
            <Link className="dashboard-action" to="/amortization">
              <span className="dashboard-action-icon" aria-hidden="true">
                ◐
              </span>
              <span className="dashboard-action-text">
                <strong>Amortization</strong>
                <span>Diminishing &amp; flat rate schedules</span>
              </span>
            </Link>
            <Link className="dashboard-action" to="/daily-loan">
              <span className="dashboard-action-icon" aria-hidden="true">
                ◑
              </span>
              <span className="dashboard-action-text">
                <strong>Daily Loan</strong>
                <span>Short-term daily payment loans</span>
              </span>
            </Link>
            <Link className="dashboard-action" to="/cash-count">
              <span className="dashboard-action-icon" aria-hidden="true">
                ₱
              </span>
              <span className="dashboard-action-text">
                <strong>Cash Count</strong>
                <span>Manage cash on hand &amp; releases</span>
              </span>
            </Link>
            <Link className="dashboard-action" to="/collectors">
              <span className="dashboard-action-icon" aria-hidden="true">
                ◉
              </span>
              <span className="dashboard-action-text">
                <strong>Collectors</strong>
                <span>Manage collectors who hold cash</span>
              </span>
            </Link>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Module Overview</h2>
          </div>
          <ul className="dashboard-overview">
            <li className="dashboard-overview-item">
              <span className="dashboard-overview-name">
                Amortization Calculator
              </span>
              <span className="dashboard-overview-desc">
                Estimate schedules with overdue penalties
              </span>
            </li>
            <li className="dashboard-overview-item">
              <span className="dashboard-overview-name">
                Daily Loan Calculator
              </span>
              <span className="dashboard-overview-desc">
                Fee, rebate, and daily payment handling
              </span>
            </li>
            <li className="dashboard-overview-item">
              <span className="dashboard-overview-name">Cash Count</span>
              <span className="dashboard-overview-desc">
                Track cash on hand and releases
              </span>
            </li>
            <li className="dashboard-overview-item">
              <span className="dashboard-overview-name">Collectors</span>
              <span className="dashboard-overview-desc">
                Register the staff who handle cash
              </span>
            </li>
          </ul>
        </div>
      </section>

      <footer className="footer">
        Figures are estimates in Philippine pesos (PHP) and follow the
        documented Jamo Lending Corp formulas.
      </footer>
    </div>
  );
}

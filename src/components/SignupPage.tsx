import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function SignupPage() {
  const { user, loading, acceptInvite } = useAuth();
  const [searchParams] = useSearchParams();

  const inviteHash = searchParams.get("invite_hash");
  const type = searchParams.get("type");
  const email = searchParams.get("email") ?? "";
  const isInvite = type === "invite" && Boolean(inviteHash);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="auth-loading">Checking invite...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!isInvite) {
      setError("A valid invitation is required to create an account.");
      return;
    }

    const hash = inviteHash;
    if (!hash) {
      setError("Invitation token is missing.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const { error: inviteError } = await acceptInvite(email, hash, password);
    setSubmitting(false);
    if (inviteError) {
      setError(inviteError.message);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="brand">Jamo Lending Corp</p>

        {isInvite ? (
          <>
            <h1 className="auth-title">Create your account</h1>
            <p className="auth-subtitle">
              Accept your Jamo Lending Corp invitation and set your password.
            </p>

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="field">
                <label className="field-label" htmlFor="email">
                  Email address
                </label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  required
                  readOnly
                  value={email}
                  placeholder="you@jamo.ph"
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="confirm-password">
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="alert" role="alert">
                  {error}
                </div>
              )}

              <button
                className="button-primary"
                type="submit"
                disabled={submitting}
              >
                {submitting ? "Creating account..." : "Create account"}
              </button>
            </form>

            <p className="auth-footer">
              Already have an account?{" "}
              <Link to="/login">Sign in</Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="auth-title">Account creation</h1>
            <p className="auth-subtitle">
              New accounts are created by invitation only. Open your invitation
              email and follow the link to set your password.
            </p>

            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}

            <p className="auth-footer">
              Already have an account?{" "}
              <Link to="/login">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

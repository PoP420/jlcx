import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { formatDate, toIsoDate } from "../lib/calculator";
import {
  createCollector,
  deleteCollector,
  fetchCollectors,
  updateCollector,
  type Collector,
} from "../lib/cashService";

export function CollectorsPage() {
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [active, setActive] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const result = await fetchCollectors();
      if (!alive) return;
      if (result.error) {
        setError(result.error);
      } else {
        setCollectors(result.data ?? []);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [revision]);

  const reset = () => {
    setEditingId(null);
    setName("");
    setPhone("");
    setSmsEnabled(false);
    setActive(true);
    setError(null);
    setNotice(null);
  };

  const beginEdit = (collector: Collector) => {
    setEditingId(collector.id);
    setName(collector.name);
    setPhone(collector.phone ?? "");
    setSmsEnabled(collector.sms_enabled);
    setActive(collector.active);
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);

    const result = editingId
      ? await updateCollector(editingId, name.trim(), phone.trim(), smsEnabled, active)
      : await createCollector(name.trim(), phone.trim(), smsEnabled);

    if (result.error) {
      setError(result.error);
    } else {
      setNotice(editingId ? "Collector updated." : "Collector added.");
      reset();
      setRevision((current) => current + 1);
    }

    setSubmitting(false);
  };

  const handleDelete = async (collector: Collector) => {
    if (
      !window.confirm(
        `Delete ${collector.name}? This removes the collector and unassigns any linked loans and cash entries.`,
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    setDeletingId(collector.id);
    const result = await deleteCollector(collector.id);
    if (result.error) {
      setError(result.error);
    } else {
      setNotice(`${collector.name} deleted.`);
      if (editingId === collector.id) reset();
      setRevision((current) => current + 1);
    }
    setDeletingId(null);
  };

  return (
    <div className="page">
      <header className="page-header">
        <p className="brand">Jamo Lending Corp</p>
        <h1 className="page-title">Collectors</h1>
        <p className="page-subtitle">
          Manage the collectors who hold and disburse cash on hand.
        </p>
      </header>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="sms-result" role="status">
          {notice}
        </div>
      )}

      <main className="page-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>{editingId ? "Edit Collector" : "Add Collector"}</h2>
          </div>
          <form className="collector-form" onSubmit={handleSubmit}>
            <div className="field">
              <label className="field-label" htmlFor="collector-name">
                Full name
              </label>
              <input
                id="collector-name"
                className="input"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Aisa Macabangon"
                required
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="collector-phone">
                Phone <span className="field-hint">(optional)</span>
              </label>
              <input
                id="collector-phone"
                className="input"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+63 9XX XXX XXXX"
              />
            </div>

            <label className="sms-active-toggle">
              <input
                type="checkbox"
                checked={smsEnabled}
                onChange={(event) => setSmsEnabled(event.target.checked)}
              />
              Collector agreed to receive SMS follow-up alerts
            </label>

            {editingId && (
              <label className="sms-active-toggle">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(event) => setActive(event.target.checked)}
                />
                Active (available for cash counts and loan assignments)
              </label>
            )}

            <div className="sms-button-row">
              <button
                className="button-primary"
                type="submit"
                disabled={submitting || name.trim().length === 0}
              >
                {submitting
                  ? "Saving..."
                  : editingId
                    ? "Save Changes"
                    : "Add Collector"}
              </button>
              {editingId && (
                <button
                  className="button-secondary"
                  type="button"
                  onClick={reset}
                  disabled={submitting}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Collector List</h2>
          </div>

          {loading ? (
            <p className="page-status">Loading collectors...</p>
          ) : (
            <ul className="collector-list">
              {collectors.map((collector) => (
                <li key={collector.id} className="collector-item">
                  <div className="collector-item-main">
                    <span className="collector-item-name">
                      {collector.name}
                    </span>
                    <span
                      className={`tag ${
                        collector.active ? "tag-active" : "tag-inactive"
                      }`}
                    >
                      {collector.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="collector-item-details">
                    <span>
                      {collector.phone ?? "No phone on file"}
                      {collector.sms_enabled ? " · SMS enabled" : ""}
                    </span>
                    <span>
                      Added{" "}
                      {formatDate(toIsoDate(new Date(collector.created_at)))}
                    </span>
                  </div>
                  <div className="workspace-actions">
                    <Link
                      className="button-secondary collector-item-action"
                      to={`/cash-count?collector=${collector.id}`}
                    >
                      Cash Count
                    </Link>
                    <button
                      className="button-secondary"
                      type="button"
                      onClick={() => beginEdit(collector)}
                      disabled={deletingId === collector.id}
                    >
                      Edit
                    </button>
                    <button
                      className="button-danger"
                      type="button"
                      onClick={() => void handleDelete(collector)}
                      disabled={deletingId === collector.id}
                    >
                      {deletingId === collector.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </li>
              ))}
              {collectors.length === 0 && (
                <p className="page-empty">
                  No collectors yet. Add your first collector using the form.
                </p>
              )}
            </ul>
          )}
        </section>
      </main>

      <footer className="footer">
        Figures are estimates in Philippine pesos (PHP) and follow the
        documented Jamo Lending Corp formulas.
      </footer>
    </div>
  );
}
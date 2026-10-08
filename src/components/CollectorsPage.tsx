import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { formatDate, toIsoDate } from "../lib/calculator";
import {
  createCollector,
  fetchCollectors,
  type Collector,
} from "../lib/cashService";

export function CollectorsPage() {
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await fetchCollectors();
      if (!active) return;
      if (result.error) {
        setError(result.error);
      } else {
        setCollectors(result.data ?? []);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [revision]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await createCollector(name.trim(), phone.trim());
    if (result.error) {
      setError(result.error);
    } else {
      setName("");
      setPhone("");
      setRevision((current) => current + 1);
    }

    setSubmitting(false);
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

      <main className="page-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Add Collector</h2>
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

            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}

            <button
              className="button-primary"
              type="submit"
              disabled={submitting || name.trim().length === 0}
            >
              {submitting ? "Saving..." : "Add Collector"}
            </button>
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
                    <span>{collector.phone ?? "No phone on file"}</span>
                    <span>
                      Added{" "}
                      {formatDate(toIsoDate(new Date(collector.created_at)))}
                    </span>
                  </div>
                  <Link
                    className="button-secondary collector-item-action"
                    to={`/cash-count?collector=${collector.id}`}
                  >
                    Cash Count
                  </Link>
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

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  formatCurrency,
  formatDate,
  todayIso,
} from "../lib/calculator";
import {
  DENOMINATIONS,
  emptyDenominationCounts,
  formatDenominations,
  segregateAmount,
  type DenominationCounts,
} from "../lib/denominations";
import {
  fetchCollectors,
  fetchLedger,
  fetchOpening,
  fetchOpeningTotal,
  recordCashCollection,
  recordCashRelease,
  setCashOpening,
  type CashLedgerEntry,
  type Collector,
} from "../lib/cashService";

const ALL_COLLECTORS = "all";

function emptyDraft(): Record<string, string> {
  return Object.fromEntries(
    DENOMINATIONS.map((denom) => [String(denom), "0"]),
  );
}

function parseWholeAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return parsed > 0 ? parsed : null;
}

export function CashCountPage() {
  const [searchParams] = useSearchParams();

  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [collectorId, setCollectorId] = useState<string>(() => {
    const preset = searchParams.get("collector");
    return preset && preset !== ALL_COLLECTORS ? preset : ALL_COLLECTORS;
  });
  const [openingTotal, setOpeningTotal] = useState(0);
  const [openingCounts, setOpeningCounts] = useState<DenominationCounts>(
    emptyDenominationCounts(),
  );
  const [openingDraft, setOpeningDraft] = useState<Record<string, string>>(
    emptyDraft(),
  );
  const [entries, setEntries] = useState<CashLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const [openingSaving, setOpeningSaving] = useState(false);

  const [borrower, setBorrower] = useState("");
  const [reference, setReference] = useState("");
  const [releaseAmount, setReleaseAmount] = useState("");
  const [releaseNote, setReleaseNote] = useState("");
  const [releaseSaving, setReleaseSaving] = useState(false);

  const [payer, setPayer] = useState("");
  const [collectionAmount, setCollectionAmount] = useState("");
  const [collectionNote, setCollectionNote] = useState("");
  const [collectionSaving, setCollectionSaving] = useState(false);

  const isAll = collectorId === ALL_COLLECTORS;
  // Cash count only reflects the current day; when the day
  // ends, a new day starts with fresh starting cash and an
  // empty ledger.
  const date = todayIso();

  useEffect(() => {
    (async () => {
      const result = await fetchCollectors();
      if (!result.error) setCollectors(result.data ?? []);
    })();
  }, []);

  // The starting cash is the shared pool for the day, so the
  // opening and every entry are always loaded globally; the
  // collector selector only filters the ledger view.
  useEffect(() => {
    let active = true;
    (async () => {
      const [openingResult, openingTotalResult, ledgerResult] =
        await Promise.all([
          fetchOpening(null, date),
          fetchOpeningTotal(null, date),
          fetchLedger(null, date),
        ]);
      if (!active) return;

      setLoading(false);
      setError(null);

      if (openingResult.error) {
        setError(openingResult.error);
      } else if (openingTotalResult.error) {
        setError(openingTotalResult.error);
      } else if (ledgerResult.error) {
        setError(ledgerResult.error);
      } else {
        setOpeningTotal(openingTotalResult.data ?? 0);
        setEntries(ledgerResult.data ?? []);

        const counts =
          openingResult.data?.denominations ?? emptyDenominationCounts();
        setOpeningCounts(counts);
        setOpeningDraft(
          Object.fromEntries(
            DENOMINATIONS.map((denom) => [
              String(denom),
              String(counts[String(denom)] ?? 0),
            ]),
          ),
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [date, revision]);

  // Totals always describe the shared pool across all collectors.
  const totals = useMemo(() => {
    const released = entries
      .filter((entry) => entry.type === "release")
      .reduce((sum, entry) => sum + entry.amount, 0);
    const collected = entries
      .filter((entry) => entry.type === "collection")
      .reduce((sum, entry) => sum + entry.amount, 0);
    return {
      released,
      collected,
      cashOnHand: openingTotal - released + collected,
    };
  }, [entries, openingTotal]);

  // Bills remaining in the shared pool: starting cash minus
  // every release recorded by any collector.
  const availableCounts = useMemo<DenominationCounts>(() => {
    const available = { ...openingCounts };
    for (const entry of entries) {
      if (entry.type !== "release" || !entry.denominations) continue;
      for (const [denom, count] of Object.entries(entry.denominations)) {
        available[denom] = (available[denom] ?? 0) - count;
      }
    }
    return available;
  }, [openingCounts, entries]);

  const availableTotal = useMemo(
    () =>
      DENOMINATIONS.reduce(
        (sum, denom) => sum + (availableCounts[String(denom)] ?? 0) * denom,
        0,
      ),
    [availableCounts],
  );

  const releasePreview = useMemo(() => {
    const amount = parseWholeAmount(releaseAmount);
    if (amount === null) return null;
    return segregateAmount(amount, availableCounts);
  }, [releaseAmount, availableCounts]);

  const displayEntries = useMemo(
    () =>
      isAll
        ? entries
        : entries.filter((entry) => entry.collector_id === collectorId),
    [entries, isAll, collectorId],
  );

  // The shared pool shows the running balance from the opening
  // cash; a single collector shows their net movement for the day.
  const balanceRows = useMemo(() => {
    const startBalance = isAll ? openingTotal : 0;
    return displayEntries.reduce<Array<{ entry: CashLedgerEntry; balance: number }>>(
      (rows, entry) => {
        const previous =
          rows.length > 0 ? rows[rows.length - 1].balance : startBalance;
        const balance =
          entry.type === "release"
            ? previous - entry.amount
            : previous + entry.amount;
        return [...rows, { entry, balance }];
      },
      [],
    );
  }, [displayEntries, openingTotal, isAll]);

  const draftTotal = useMemo(
    () =>
      DENOMINATIONS.reduce(
        (sum, denom) =>
          sum + (Number.parseInt(openingDraft[String(denom)] ?? "0", 10) || 0) *
            denom,
        0,
      ),
    [openingDraft],
  );

  const handleSetOpening = async (event: FormEvent) => {
    event.preventDefault();

    const counts: DenominationCounts = {};
    for (const denom of DENOMINATIONS) {
      const raw = openingDraft[String(denom)]?.trim() ?? "";
      if (!/^\d+$/.test(raw)) {
        setError(
          `Enter a whole number of ₱${denom.toLocaleString("en-PH")} bills.`,
        );
        return;
      }
      counts[String(denom)] = Number.parseInt(raw, 10);
    }

    setOpeningSaving(true);
    setError(null);
    const result = await setCashOpening(date, counts);
    if (result.error) {
      setError(result.error);
    } else {
      setRevision((current) => current + 1);
    }
    setOpeningSaving(false);
  };

  const handleRelease = async (event: FormEvent) => {
    event.preventDefault();
    if (isAll) return;

    const amount = parseWholeAmount(releaseAmount);
    if (amount === null) {
      setError("Enter a whole-peso release amount greater than zero.");
      return;
    }
    if (borrower.trim().length === 0) {
      setError("Enter the borrower name for the release.");
      return;
    }

    const breakdown = segregateAmount(amount, availableCounts);
    if (breakdown === null) {
      setError(
        "This amount cannot be given with the bills remaining in the starting cash.",
      );
      return;
    }

    setReleaseSaving(true);
    setError(null);
    const result = await recordCashRelease(
      collectorId,
      borrower.trim(),
      amount,
      reference.trim(),
      releaseNote.trim(),
      date,
      breakdown,
    );
    if (result.error) {
      setError(result.error);
    } else {
      setBorrower("");
      setReference("");
      setReleaseAmount("");
      setReleaseNote("");
      setRevision((current) => current + 1);
    }
    setReleaseSaving(false);
  };

  const handleCollection = async (event: FormEvent) => {
    event.preventDefault();
    if (isAll) return;

    const trimmed = collectionAmount.trim();
    const amount = Number.parseFloat(trimmed);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a collection amount greater than zero.");
      return;
    }

    setCollectionSaving(true);
    setError(null);
    const result = await recordCashCollection(
      collectorId,
      Math.round(amount * 100) / 100,
      payer.trim(),
      collectionNote.trim(),
      date,
    );
    if (result.error) {
      setError(result.error);
    } else {
      setPayer("");
      setCollectionAmount("");
      setCollectionNote("");
      setRevision((current) => current + 1);
    }
    setCollectionSaving(false);
  };

  return (
    <div className="page">
      <header className="page-header">
        <p className="brand">Jamo Lending Corp</p>
        <h1 className="page-title">Cash Count</h1>
        <p className="page-subtitle">
          Shared starting cash for the day, releases to borrowers,
          and collections received.
        </p>
      </header>

      <div className="cash-controls panel">
        <div className="field">
          <label className="field-label" htmlFor="cash-collector">
            Collector
          </label>
          <select
            id="cash-collector"
            className="input"
            value={collectorId}
            onChange={(event) => setCollectorId(event.target.value)}
          >
            <option value={ALL_COLLECTORS}>All collectors</option>
            {collectors.map((collector) => (
              <option key={collector.id} value={collector.id}>
                {collector.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      <section className="cards cash-summary">
        <div className="card">
          <span className="card-label">Starting Cash</span>
          <span className="card-value">{formatCurrency(openingTotal)}</span>
          <span className="card-hint">
            Shared opening balance for the day
          </span>
        </div>
        <div className="card card-warning">
          <span className="card-label">Releases</span>
          <span className="card-value">
            {formatCurrency(-totals.released)}
          </span>
          <span className="card-hint">
            Cash released to borrowers by all collectors
          </span>
        </div>
        <div className="card">
          <span className="card-label">Collections</span>
          <span className="card-value">
            {formatCurrency(totals.collected)}
          </span>
          <span className="card-hint">
            Payments received by all collectors
          </span>
        </div>
        <div className="card card-primary">
          <span className="card-label">Cash on Hand</span>
          <span className="card-value">
            {formatCurrency(totals.cashOnHand)}
          </span>
          <span className="card-hint">
            {formatDate(date)} · shared pool
          </span>
        </div>
      </section>

      <section className="panel cash-available">
        <div className="panel-header">
          <h2>Available Bills</h2>
          <span className="panel-note">
            starting cash minus releases ·{" "}
            <strong className="mono">{formatCurrency(availableTotal)}</strong>
          </span>
        </div>
        <div className="denom-chips">
          {DENOMINATIONS.map((denom) => (
            <span
              key={denom}
              className={`denom-chip ${
                (availableCounts[String(denom)] ?? 0) <= 0
                  ? "denom-chip-empty"
                  : ""
              }`}
              title={`₱${denom.toLocaleString("en-PH")} bills`}
            >
              ₱{denom.toLocaleString("en-PH")} ×{" "}
              {availableCounts[String(denom)] ?? 0}
            </span>
          ))}
        </div>
      </section>

      <section className="panel panel-large">
        <div className="panel-header">
          <h2>Set Starting Cash</h2>
          <span className="panel-note">
            shared by all collectors · count bills per denomination
          </span>
        </div>
        <form className="cash-form" onSubmit={handleSetOpening}>
          <div className="denom-grid">
            {DENOMINATIONS.map((denom) => (
              <div className="denom-field" key={denom}>
                <label className="denom-label" htmlFor={`opening-${denom}`}>
                  ₱{denom.toLocaleString("en-PH")}
                </label>
                <input
                  id={`opening-${denom}`}
                  className="denom-input"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={openingDraft[String(denom)] ?? "0"}
                  onChange={(event) =>
                    setOpeningDraft((current) => ({
                      ...current,
                      [String(denom)]: event.target.value,
                    }))
                  }
                />
                <span className="denom-piece">bills</span>
              </div>
            ))}
          </div>

          <div className="denom-total">
            <span>Total starting cash</span>
            <strong className="mono">{formatCurrency(draftTotal)}</strong>
          </div>

          <div className="cash-form-actions">
            <button
              className="button-primary"
              type="submit"
              disabled={openingSaving}
            >
              {openingSaving ? "Saving..." : "Save Starting Cash"}
            </button>
          </div>
        </form>
      </section>

      <div className="cash-forms">
        <section className="panel">
          <div className="panel-header">
            <h2>Release to Borrower</h2>
          </div>
          <form className="cash-form" onSubmit={handleRelease}>
            <div className="field">
              <label className="field-label" htmlFor="release-borrower">
                Borrower name
              </label>
              <input
                id="release-borrower"
                className="input"
                type="text"
                placeholder="e.g. Jona Mae Sinsuat"
                value={borrower}
                onChange={(event) => setBorrower(event.target.value)}
                disabled={isAll}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="release-reference">
                Loan reference <span className="field-hint">(optional)</span>
              </label>
              <input
                id="release-reference"
                className="input"
                type="text"
                placeholder="e.g. JLC-2026-0001"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                disabled={isAll}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="release-amount">
                Amount (PHP, whole pesos)
              </label>
              <input
                id="release-amount"
                className="input"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                placeholder="0"
                value={releaseAmount}
                onChange={(event) => setReleaseAmount(event.target.value)}
                disabled={isAll}
              />
              <p className="field-hint">
                Segregated automatically from the available bills.
              </p>
              {releaseAmount.trim() !== "" && (
                <div className="denom-preview">
                  {releasePreview ? (
                    <div className="denom-chips">
                      {DENOMINATIONS.filter(
                        (denom) => (releasePreview[String(denom)] ?? 0) > 0,
                      ).map((denom) => (
                        <span className="denom-chip" key={denom}>
                          {releasePreview[String(denom)]}×₱
                          {denom.toLocaleString("en-PH")}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="field-error">
                      Cannot break this amount with the available bills.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="release-note">
                Note <span className="field-hint">(optional)</span>
              </label>
              <input
                id="release-note"
                className="input"
                type="text"
                placeholder="e.g. Cash disbursed at counter"
                value={releaseNote}
                onChange={(event) => setReleaseNote(event.target.value)}
                disabled={isAll}
              />
            </div>

            <button
              className="button-primary"
              type="submit"
              disabled={isAll || releaseSaving}
            >
              {releaseSaving ? "Recording..." : "Record Release"}
            </button>
            {isAll && (
              <p className="field-hint">
                Select a specific collector to record a release.
              </p>
            )}
          </form>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Record Collection</h2>
          </div>
          <form className="cash-form" onSubmit={handleCollection}>
            <div className="field">
              <label className="field-label" htmlFor="collection-payer">
                Payer name <span className="field-hint">(optional)</span>
              </label>
              <input
                id="collection-payer"
                className="input"
                type="text"
                placeholder="e.g. Jona Mae Sinsuat"
                value={payer}
                onChange={(event) => setPayer(event.target.value)}
                disabled={isAll}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="collection-amount">
                Amount (PHP)
              </label>
              <input
                id="collection-amount"
                className="input"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={collectionAmount}
                onChange={(event) => setCollectionAmount(event.target.value)}
                disabled={isAll}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="collection-note">
                Note <span className="field-hint">(optional)</span>
              </label>
              <input
                id="collection-note"
                className="input"
                type="text"
                placeholder="e.g. Weekly payment"
                value={collectionNote}
                onChange={(event) => setCollectionNote(event.target.value)}
                disabled={isAll}
              />
            </div>

            <button
              className="button-primary"
              type="submit"
              disabled={isAll || collectionSaving}
            >
              {collectionSaving ? "Recording..." : "Record Collection"}
            </button>
            {isAll && (
              <p className="field-hint">
                Select a specific collector to record a collection.
              </p>
            )}
          </form>
        </section>
      </div>

      <section className="panel table-panel">
        <div className="panel-header">
          <h2>Ledger</h2>
          <span className="panel-note">
            {formatDate(date)} ·{" "}
            {isAll ? "running balance" : "collector net movement"}
          </span>
        </div>

        {loading ? (
          <p className="page-status">Loading ledger...</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">Details</th>
                  <th scope="col">Bills</th>
                  <th scope="col" className="col-amount">
                    Amount
                  </th>
                  <th scope="col" className="col-amount">
                    {isAll ? "Balance" : "Net"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {balanceRows.map(({ entry, balance }) => (
                  <tr key={entry.id}>
                    <td>
                      <span
                        className={`tag ${
                          entry.type === "release"
                            ? "tag-warning"
                            : "tag-active"
                        }`}
                      >
                        {entry.type === "release" ? "Release" : "Collection"}
                      </span>
                    </td>
                    <td>{entry.note ?? "—"}</td>
                    <td className="denom-cell">
                      {entry.type === "release" && entry.denominations
                        ? formatDenominations(entry.denominations)
                        : "—"}
                    </td>
                    <td
                      className={`col-amount mono ${
                        entry.type === "release"
                          ? "amount-negative"
                          : "amount-positive"
                      }`}
                    >
                      {entry.type === "release" ? "−" : "+"}
                      {formatCurrency(entry.amount)}
                    </td>
                    <td className="col-amount mono">
                      {formatCurrency(balance)}
                    </td>
                  </tr>
                ))}
                {balanceRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="table-empty">
                      No entries recorded for this selection.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="footer">
        Figures are estimates in Philippine pesos (PHP) and follow the
        documented Jamo Lending Corp formulas.
      </footer>
    </div>
  );
}

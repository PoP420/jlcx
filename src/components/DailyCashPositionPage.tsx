import { useEffect, useMemo, useState, type FormEvent } from "react";
import { formatCurrency, formatDate, todayIso } from "../lib/calculator";
import {
  countsTotal,
  DENOMINATIONS,
  emptyDenominationCounts,
  type DenominationCounts,
} from "../lib/denominations";
import {
  fetchLedger,
  fetchOpening,
  fetchPhysicalCashCount,
  fetchPositionData,
  recordCashExpense,
  recordPositionEntry,
  setPhysicalCashCount,
  setPositionOpening,
  type CashLedgerEntry,
  type PositionAccount,
  type PositionDirection,
  type PositionEntry,
  type PositionMode,
} from "../lib/cashService";

const accounts: Array<{
  code: PositionAccount;
  label: string;
  mode: PositionMode;
  categories: string[];
}> = [
  { code: "metrobank", label: "Metrobank", mode: "bank", categories: ["Cash deposit", "Cash withdrawal", "Bank fee", "Other"] },
  { code: "eastwest", label: "EastWest Bank", mode: "bank", categories: ["Cash deposit", "Cash withdrawal", "Bank fee", "Other"] },
  { code: "jamo_savings", label: "Jamo Lending Savings", mode: "bank", categories: ["Cash deposit", "Cash withdrawal", "Savings adjustment", "Other"] },
  { code: "gcash", label: "GCash", mode: "digital", categories: ["Cash deposit", "Cash withdrawal", "GCash sent", "GCash received", "Other"] },
  { code: "cebuana", label: "Cebuana Lhuillier", mode: "digital", categories: ["Cash deposit", "Cash withdrawal", "Cebuana sent", "Cebuana received", "Other"] },
];

const expenseCategories = ["Office supplies", "Transportation", "Utilities", "Salaries", "Loan operations", "Other"];
const emptyOpenings = (): Record<PositionAccount, number> => ({ metrobank: 0, eastwest: 0, jamo_savings: 0, gcash: 0, cebuana: 0 });
const emptyOpeningDrafts = (): Record<PositionAccount, string> => ({ metrobank: "0", eastwest: "0", jamo_savings: "0", gcash: "0", cebuana: "0" });

interface PositionLine {
  key: string;
  label: string;
  opening: number;
  inflows: number;
  outflows: number;
  closing: number;
}

export function DailyCashPositionPage() {
  const [date, setDate] = useState(todayIso());
  const [cashOpening, setCashOpening] = useState(0);
  const [cashCount, setCashCount] = useState(0);
  const [countDraft, setCountDraft] = useState<DenominationCounts>(emptyDenominationCounts());
  const [cashEntries, setCashEntries] = useState<CashLedgerEntry[]>([]);
  const [positionEntries, setPositionEntries] = useState<PositionEntry[]>([]);
  const [openings, setOpenings] = useState<Record<PositionAccount, number>>(emptyOpenings());
  const [openingDrafts, setOpeningDrafts] = useState<Record<PositionAccount, string>>(emptyOpeningDrafts());
  const [accountCode, setAccountCode] = useState<PositionAccount>("metrobank");
  const [direction, setDirection] = useState<PositionDirection>("inflow");
  const [category, setCategory] = useState("Deposit");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [note, setNote] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState(expenseCategories[0]);
  const [expensePayee, setExpensePayee] = useState("");
  const [expenseReference, setExpenseReference] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetchOpening(null, date), fetchLedger(null, date),
      fetchPositionData(date), fetchPhysicalCashCount(date),
    ]).then(([openingResult, ledgerResult, positionResult, countResult]) => {
      if (!active) return;
      const problem = openingResult.error ?? ledgerResult.error ?? positionResult.error ?? countResult.error;
      setError(problem);
      if (!problem) {
        const nonCash = positionResult.data!;
        const nextOpenings = emptyOpenings();
        for (const row of nonCash.openings) nextOpenings[row.account_code] += row.amount;
        setCashOpening(openingResult.data?.amount ?? 0);
        setCashEntries(ledgerResult.data ?? []);
        setPositionEntries(nonCash.entries);
        setOpenings(nextOpenings);
        setOpeningDrafts(Object.fromEntries(accounts.map((account) => [account.code, String(nonCash.ownOpenings[account.code] ?? 0)])) as Record<PositionAccount, string>);
        setCashCount(countResult.data?.amount ?? 0);
        setCountDraft(countResult.data?.ownDenominations ?? emptyDenominationCounts());
      }
      setLoading(false);
    }).catch((reason: unknown) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : "Could not load the report.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [date, revision]);

  const cashCollections = cashEntries.filter((entry) => entry.type === "collection").reduce((sum, entry) => sum + entry.amount, 0);
  const cashInflows = cashEntries.filter((entry) => entry.type === "collection" || entry.type === "transfer_in").reduce((sum, entry) => sum + entry.amount, 0);
  const loanDisbursements = cashEntries.filter((entry) => entry.type === "release").reduce((sum, entry) => sum + entry.amount, 0);
  const cashExpenses = cashEntries.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + entry.amount, 0);
  const cashOutflows = cashEntries.filter((entry) => entry.type === "release" || entry.type === "expense" || entry.type === "transfer_out").reduce((sum, entry) => sum + entry.amount, 0);
  const lines = useMemo<PositionLine[]>(() => {
    const cash = { key: "cash", label: "Cash on hand", opening: cashOpening, inflows: cashInflows, outflows: cashOutflows, closing: cashOpening + cashInflows - cashOutflows };
    const accountLines = accounts.map((account) => {
      const entries = positionEntries.filter((entry) => entry.account_code === account.code);
      const inflows = entries.filter((entry) => entry.direction === "inflow").reduce((sum, entry) => sum + entry.amount, 0);
      const outflows = entries.filter((entry) => entry.direction === "outflow").reduce((sum, entry) => sum + entry.amount, 0);
      return { key: account.code, label: account.label, opening: openings[account.code], inflows, outflows, closing: openings[account.code] + inflows - outflows };
    });
    return [cash, ...accountLines];
  }, [cashOpening, cashInflows, cashOutflows, positionEntries, openings]);
  const totals = lines.reduce((total, line) => ({
    opening: total.opening + line.opening, inflows: total.inflows + line.inflows,
    outflows: total.outflows + line.outflows, closing: total.closing + line.closing,
  }), { opening: 0, inflows: 0, outflows: 0, closing: 0 });
  const selectedAccount = accounts.find((account) => account.code === accountCode)!;

  const saveOpening = async (code: PositionAccount) => {
    const parsed = Number(openingDrafts[code]);
    if (!Number.isFinite(parsed) || parsed < 0) { setError("Enter a valid non-negative opening balance."); return; }
    setSaving(true); setError(null);
    const account = accounts.find((item) => item.code === code)!;
    const result = await setPositionOpening(account.mode, code, date, Math.round(parsed * 100) / 100);
    if (result.error) setError(result.error);
    else { setLoading(true); setRevision((value) => value + 1); }
    setSaving(false);
  };

  const saveCashCount = async (event: FormEvent) => {
    event.preventDefault();
    if (DENOMINATIONS.some((denom) => !Number.isInteger(countDraft[String(denom)]) || countDraft[String(denom)] < 0)) {
      setError("Enter a whole, non-negative count for each denomination."); return;
    }
    setSaving(true); setError(null);
    const result = await setPhysicalCashCount(date, countDraft);
    if (result.error) setError(result.error);
    else { setLoading(true); setRevision((value) => value + 1); }
    setSaving(false);
  };

  const submitPositionEntry = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) { setError("Enter an amount greater than zero."); return; }
    setSaving(true); setError(null);
    const result = await recordPositionEntry(selectedAccount.mode, accountCode, direction, Math.round(parsed * 100) / 100, date, category, note, reference, counterparty);
    if (result.error) setError(result.error);
    else { setAmount(""); setNote(""); setReference(""); setCounterparty(""); setLoading(true); setRevision((value) => value + 1); }
    setSaving(false);
  };

  const submitExpense = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = Number(expenseAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) { setError("Enter an expense amount greater than zero."); return; }
    setSaving(true); setError(null);
    const result = await recordCashExpense(Math.round(parsed * 100) / 100, date, expenseCategory, expensePayee, expenseReference, expenseNote);
    if (result.error) setError(result.error);
    else { setExpenseAmount(""); setExpensePayee(""); setExpenseReference(""); setExpenseNote(""); setLoading(true); setRevision((value) => value + 1); }
    setSaving(false);
  };

  return <div className="page dcrp-page">
    <header className="page-header">
      <p className="brand">Jamo Lending Corp</p>
      <div className="dcrp-heading"><div><h1 className="page-title">Daily Cash Position Report</h1>
        <p className="page-subtitle">Daily collections, disbursements, expenses, account activity, balances, and cash reconciliation.</p></div>
        <button type="button" className="button-secondary dcrp-print" onClick={() => window.print()}>Print report</button>
      </div>
    </header>

    <section className="panel dcrp-toolbar"><div className="field"><label className="field-label" htmlFor="dcrp-date">Report date</label>
      <input id="dcrp-date" className="input" type="date" value={date} onChange={(event) => { setLoading(true); setDate(event.target.value); }} /></div>
      <p className="panel-note">{formatDate(date)} · Philippine pesos</p></section>
    {error && <div className="alert" role="alert">{error}</div>}

    {loading ? <p className="page-status">Loading report…</p> : <>
      <section className="cards dcrp-summary-cards">
        <div className="card"><span className="card-label">Cash collections</span><span className="card-value">{formatCurrency(cashCollections)}</span><span className="card-hint">Payments received</span></div>
        <div className="card card-warning"><span className="card-label">Loan disbursements</span><span className="card-value">{formatCurrency(loanDisbursements)}</span><span className="card-hint">Cash released to borrowers</span></div>
        <div className="card card-warning"><span className="card-label">Cash expenses</span><span className="card-value">{formatCurrency(cashExpenses)}</span><span className="card-hint">Operating expenses</span></div>
        <div className="card card-primary"><span className="card-label">Cash book closing</span><span className="card-value">{formatCurrency(lines[0].closing)}</span><span className="card-hint">Opening + collections − disbursements − expenses</span></div>
      </section>

      <section className="panel table-panel dcrp-report-table"><div className="panel-header"><h2>Cash and account position</h2></div><div className="table-scroll"><table className="table"><thead><tr><th>Cash / account</th><th className="col-amount">Opening</th><th className="col-amount">Inflows</th><th className="col-amount">Outflows</th><th className="col-amount">Closing</th></tr></thead><tbody>
        {lines.map((line) => <tr key={line.key}><td className="dcrp-mode">{line.label}</td><td className="col-amount mono">{formatCurrency(line.opening)}</td><td className="col-amount mono">{formatCurrency(line.inflows)}</td><td className="col-amount mono">{formatCurrency(line.outflows)}</td><td className="col-amount mono">{formatCurrency(line.closing)}</td></tr>)}
        <tr className="dcrp-total"><th>Total liquid position</th><td className="col-amount mono">{formatCurrency(totals.opening)}</td><td className="col-amount mono">{formatCurrency(totals.inflows)}</td><td className="col-amount mono">{formatCurrency(totals.outflows)}</td><td className="col-amount mono">{formatCurrency(totals.closing)}</td></tr>
      </tbody></table></div></section>

      <section className="panel dcrp-reconciliation"><div><h2>Physical cash reconciliation</h2><p className="panel-note">Actual bills and coins compared with the cash book closing balance.</p></div><dl>
        <div><dt>Cash book closing</dt><dd>{formatCurrency(lines[0].closing)}</dd></div><div><dt>Physical cash counted</dt><dd>{formatCurrency(cashCount)}</dd></div><div><dt>Over / (short)</dt><dd className={cashCount - lines[0].closing === 0 ? "" : "dcrp-variance"}>{formatCurrency(cashCount - lines[0].closing)}</dd></div>
      </dl></section>

      <section className="panel dcrp-count-panel"><div className="panel-header"><h2>End-of-day physical cash count</h2><span className="panel-note">Enter the number of bills and coins on hand</span></div><form onSubmit={saveCashCount}>
        <div className="denom-grid">{DENOMINATIONS.map((denom) => <div className="denom-field" key={denom}><label className="denom-label" htmlFor={`count-${denom}`}>₱{denom.toLocaleString("en-PH")}</label><input id={`count-${denom}`} className="denom-input" type="number" min="0" step="1" value={countDraft[String(denom)] ?? 0} onChange={(event) => setCountDraft((current) => ({ ...current, [String(denom)]: Number(event.target.value) }))} /><span className="denom-piece">pieces</span></div>)}</div>
        <div className="denom-total"><span>Physical cash counted</span><strong className="mono">{formatCurrency(countsTotal(countDraft))}</strong></div><button className="button-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save cash count"}</button>
      </form></section>

      <section className="dcrp-entry-grid">
        <div className="panel"><div className="panel-header"><h2>Account opening balances</h2></div>{accounts.map((account) => <div className="dcrp-opening-row" key={account.code}><label className="field-label" htmlFor={`opening-${account.code}`}>{account.label}</label><input id={`opening-${account.code}`} className="input" type="number" min="0" step="0.01" value={openingDrafts[account.code]} onChange={(event) => setOpeningDrafts((current) => ({ ...current, [account.code]: event.target.value }))} /><button className="button-secondary" type="button" disabled={saving} onClick={() => void saveOpening(account.code)}>Save</button></div>)}</div>
        <div className="panel"><div className="panel-header"><h2>Record account transaction</h2></div><form className="cash-form" onSubmit={submitPositionEntry}>
          <div className="field"><label className="field-label" htmlFor="dcrp-account">Account</label><select id="dcrp-account" className="input" value={accountCode} onChange={(event) => { const next = event.target.value as PositionAccount; setAccountCode(next); setCategory(accounts.find((item) => item.code === next)!.categories[0]); }}>
            {accounts.map((account) => <option key={account.code} value={account.code}>{account.label}</option>)}</select></div>
          <div className="field"><label className="field-label" htmlFor="dcrp-category">Transaction category</label><select id="dcrp-category" className="input" value={category} onChange={(event) => setCategory(event.target.value)}>{selectedAccount.categories.map((item) => <option key={item}>{item}</option>)}</select></div>
          <div className="field"><label className="field-label" htmlFor="dcrp-direction">Direction</label><select id="dcrp-direction" className="input" value={direction} onChange={(event) => setDirection(event.target.value as PositionDirection)}><option value="inflow">Inflow / received</option><option value="outflow">Outflow / sent</option></select></div>
          <div className="field"><label className="field-label" htmlFor="dcrp-amount">Amount (PHP)</label><input id="dcrp-amount" className="input" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
          <div className="field"><label className="field-label" htmlFor="dcrp-reference">Reference / OR / voucher</label><input id="dcrp-reference" className="input" value={reference} onChange={(event) => setReference(event.target.value)} /></div>
          <div className="field"><label className="field-label" htmlFor="dcrp-counterparty">Payor / payee</label><input id="dcrp-counterparty" className="input" value={counterparty} onChange={(event) => setCounterparty(event.target.value)} /></div>
          <div className="field"><label className="field-label" htmlFor="dcrp-note">Particulars</label><input id="dcrp-note" className="input" value={note} onChange={(event) => setNote(event.target.value)} /></div>
          <button className="button-primary" disabled={saving} type="submit">{saving ? "Saving…" : "Record account transaction"}</button>
        </form></div>
      </section>

      <section className="panel dcrp-expense-panel"><div className="panel-header"><h2>Record cash expense</h2></div><form className="cash-form dcrp-expense-form" onSubmit={submitExpense}>
        <div className="field"><label className="field-label" htmlFor="expense-category">Expense category</label><select id="expense-category" className="input" value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)}>{expenseCategories.map((item) => <option key={item}>{item}</option>)}</select></div>
        <div className="field"><label className="field-label" htmlFor="expense-amount">Amount (PHP)</label><input id="expense-amount" className="input" type="number" min="0.01" step="0.01" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} /></div>
        <div className="field"><label className="field-label" htmlFor="expense-reference">Voucher / reference</label><input id="expense-reference" className="input" value={expenseReference} onChange={(event) => setExpenseReference(event.target.value)} /></div>
        <div className="field"><label className="field-label" htmlFor="expense-payee">Payee</label><input id="expense-payee" className="input" value={expensePayee} onChange={(event) => setExpensePayee(event.target.value)} /></div>
        <div className="field"><label className="field-label" htmlFor="expense-particulars">Particulars</label><input id="expense-particulars" className="input" value={expenseNote} onChange={(event) => setExpenseNote(event.target.value)} /></div>
        <button className="button-primary" disabled={saving} type="submit">{saving ? "Saving…" : "Record expense"}</button>
      </form></section>

      <section className="panel table-panel dcrp-transactions"><div className="panel-header"><h2>Daily transaction register</h2></div><div className="table-scroll"><table className="table"><thead><tr><th>Account</th><th>Type / category</th><th>Reference</th><th>Payor / payee</th><th>Particulars</th><th className="col-amount">Amount</th></tr></thead><tbody>
        {cashEntries.map((entry) => <tr key={`cash-${entry.id}`}><td>Cash</td><td>{entry.category ?? (entry.type === "collection" ? "Cash collection" : entry.type === "release" ? "Loan disbursement" : entry.type === "expense" ? "Cash expense" : entry.type === "transfer_in" ? "Account withdrawal" : "Account deposit")}</td><td>{entry.reference ?? "—"}</td><td>{entry.counterparty ?? "—"}</td><td>{entry.note ?? "—"}</td><td className="col-amount mono">{entry.type === "collection" || entry.type === "transfer_in" ? "+" : "−"}{formatCurrency(entry.amount)}</td></tr>)}
        {positionEntries.map((entry) => <tr key={entry.id}><td>{accounts.find((account) => account.code === entry.account_code)?.label ?? entry.account_code}</td><td>{entry.category} · {entry.direction === "inflow" ? "Received" : "Sent"}</td><td>{entry.reference ?? "—"}</td><td>{entry.counterparty ?? "—"}</td><td>{entry.note ?? "—"}</td><td className="col-amount mono">{entry.direction === "inflow" ? "+" : "−"}{formatCurrency(entry.amount)}</td></tr>)}
        {cashEntries.length + positionEntries.length === 0 && <tr><td colSpan={6} className="table-empty">No transactions recorded for this date.</td></tr>}
      </tbody></table></div></section>
    </>}
    <footer className="footer">Jamo Lending Corp · DCPR · {formatDate(date)}</footer>
  </div>;
}

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { calculateAmortization, formatCurrency, formatDate, parseIsoDate, toIsoDate, todayIso } from "../lib/calculator";
import { calculateDailyLoan } from "../lib/dailyLoanCalculator";
import { fetchCollectors, type Collector } from "../lib/cashService";
import {
  createManagedLoan, editManagedLoan, fetchBorrower, fetchBorrowers,
  fetchLoanHistory, fetchLoans, removeBorrower, removeLoan, saveBorrower,
  updateLoanStatus, type Borrower, type BorrowerInput, type InstallmentInput,
  type LoanInput, type LoanProduct, type LoanStatus, type ManagedLoan,
} from "../lib/borrowerLoanService";
import { supabase } from "../lib/supabase";

const emptyBorrower: BorrowerInput = { full_name: "", phone: "", address: "", collateral: "", referral: "" };

function ErrorNotice({ message }: { message: string }) {
  return <div className="alert" role="alert">{message}</div>;
}

export function BorrowersPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [loans, setLoans] = useState<ManagedLoan[]>([]);
  const [profile, setProfile] = useState<Borrower | null>(null);
  const [form, setForm] = useState<BorrowerInput>(emptyBorrower);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all([fetchBorrowers(), fetchLoans(), id ? fetchBorrower(id) : Promise.resolve({ data: null, error: null })]).then(([people, accounts, one]) => {
      if (!active) return;
      setError(people.error ?? accounts.error ?? one.error);
      setBorrowers(people.data ?? []);
      setLoans(accounts.data ?? []);
      setProfile(one.data);
      setLoading(false);
    });
    return () => { active = false; };
  }, [id, revision]);

  const filtered = useMemo(() => borrowers.filter((person) =>
    `${person.full_name} ${person.phone ?? ""} ${person.source_borrower_code ?? ""}`.toLowerCase().includes(search.toLowerCase())), [borrowers, search]);
  const borrowerLoans = profile ? loans.filter((loan) => loan.borrower_id === profile.id) : [];

  const beginEdit = (person: Borrower) => {
    setEditingId(person.id);
    setForm({ full_name: person.full_name, phone: person.phone ?? "", address: person.address ?? "", collateral: person.collateral ?? "", referral: person.referral ?? "" });
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const clearForm = () => { setEditingId(undefined); setForm(emptyBorrower); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    const saved = await saveBorrower(form, editingId);
    setBusy(false);
    if (saved.error) { setError(saved.error); return; }
    clearForm(); setRevision((n) => n + 1); setNotice(editingId ? "Borrower profile updated." : "Borrower added to the portfolio.");
    if (!id && saved.data) navigate(`/borrowers/${saved.data.id}`);
  };
  const deletePerson = async (person: Borrower) => {
    if (!window.confirm(`Delete ${person.full_name}? This is only available when they have no linked loans.`)) return;
    setError(null);
    const result = await removeBorrower(person.id);
    if (result.error) { setError(result.error); return; }
    if (id === person.id) navigate("/borrowers");
    setRevision((n) => n + 1);
  };

  return <div className="page borrower-workspace">
    <header className="page-header workspace-heading">
      <div><p className="brand">Jamo Lending Corp · Portfolio</p><h1 className="page-title">{profile ? profile.full_name : "Borrowers"}</h1><p className="page-subtitle">{profile ? "Borrower profile and linked accounts" : "A clear view of every client relationship."}</p></div>
      <div className="workspace-actions"><Link className="button-secondary" to="/loans">Loan portfolio</Link><Link className="button-primary button-link" to={`/loans/new${profile ? `?borrower=${profile.id}` : ""}`}>＋ Create loan</Link></div>
    </header>
    {error && <ErrorNotice message={error} />}{notice && <p className="workspace-notice" role="status">{notice}</p>}
    {profile ? <>
      <div className="workspace-back"><Link to="/borrowers">← All borrowers</Link></div>
      <section className="workspace-grid borrower-profile-grid">
        <article className="panel profile-card"><div className="profile-avatar">{profile.full_name.slice(0, 1).toUpperCase()}</div><div><p className="eyebrow">Borrower since {formatDate(profile.created_at.slice(0, 10))}</p><h2>{profile.full_name}</h2><p>{profile.phone || "No phone added"}</p></div>
          <dl className="profile-facts"><div><dt>Address</dt><dd>{profile.address || "—"}</dd></div><div><dt>Collateral</dt><dd>{profile.collateral || "—"}</dd></div><div><dt>Referral</dt><dd>{profile.referral || "—"}</dd></div><div><dt>Source</dt><dd>{profile.source_system === "jamo_nh" ? "Jamo In-House import" : "Manually entered"}</dd></div></dl>
          <div className="workspace-actions"><button className="button-secondary" type="button" onClick={() => beginEdit(profile)}>Edit profile</button><button className="button-danger" type="button" onClick={() => void deletePerson(profile)}>Delete</button></div>
        </article>
        <section className="panel"><div className="panel-header"><div><p className="eyebrow">Account history</p><h2>Linked loans <span className="count-pill">{borrowerLoans.length}</span></h2></div></div>
          {borrowerLoans.length ? <div className="portfolio-list">{borrowerLoans.map((loan) => <Link className="portfolio-row" to={`/loans/${loan.id}`} key={loan.id}><span><strong>{loan.account_type === "daily" ? "Daily loan" : "In-house loan"}</strong><small>{loan.issued_on ? formatDate(loan.issued_on) : formatDate(loan.created_at.slice(0, 10))} · {loan.contract_months ?? "—"} months</small></span><span className="portfolio-row-end"><strong>{formatCurrency(loan.principal)}</strong><span className={`status-chip status-${loan.status}`}>{loan.status.replace("_", " ")}</span></span></Link>)}</div> : <div className="workspace-empty"><span>✧</span><h3>No loans yet</h3><p>Create the first loan for this borrower to start their account history.</p><Link className="button-primary button-link" to={`/loans/new?borrower=${profile.id}`}>Create first loan</Link></div>}
        </section>
      </section>
      {editingId && <BorrowerEditor form={form} setForm={setForm} busy={busy} error={error} onSubmit={submit} onCancel={clearForm} />}
    </> : <div className="borrower-directory-layout">
      <section className="panel borrower-editor-panel"><div className="panel-header"><div><p className="eyebrow">Client intake</p><h2>{editingId ? "Edit borrower" : "Add a borrower"}</h2></div><span className="step-counter">01 / 01</span></div>
        <BorrowerEditor form={form} setForm={setForm} busy={busy} error={null} onSubmit={submit} onCancel={clearForm} />
      </section>
      <section className="panel borrower-directory"><div className="panel-header"><div><p className="eyebrow">People</p><h2>Borrower directory <span className="count-pill">{borrowers.length}</span></h2></div><input className="input directory-search" aria-label="Search borrowers" placeholder="Search name, phone or code" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        {loading ? <div className="workspace-loading">Loading borrower portfolio…</div> : filtered.length ? <div className="borrower-list">{filtered.map((person) => { const count = loans.filter((loan) => loan.borrower_id === person.id).length; return <div className="borrower-row" key={person.id}><Link className="borrower-identity" to={`/borrowers/${person.id}`}><span className="profile-avatar profile-avatar-small">{person.full_name.slice(0, 1).toUpperCase()}</span><span><strong>{person.full_name}</strong><small>{person.phone || "No phone number"}</small></span></Link><span className="borrower-loan-count">{count} {count === 1 ? "loan" : "loans"}</span><Link className="row-open" to={`/borrowers/${person.id}`} aria-label={`Open ${person.full_name}`}>↗</Link></div>; })}</div> : <div className="workspace-empty"><span>♧</span><h3>{search ? "No matches" : "Start your borrower list"}</h3><p>{search ? "Try another name, phone number, or source code." : "Add a borrower to create a connected profile and loan history."}</p></div>}
      </section>
    </div>}
  </div>;
}

interface BorrowerEditorProps { form: BorrowerInput; setForm: (value: BorrowerInput) => void; busy: boolean; error: string | null; onSubmit: (event: FormEvent) => void; onCancel: () => void; }
function BorrowerEditor({ form, setForm, busy, error, onSubmit, onCancel }: BorrowerEditorProps) {
  const set = (key: keyof BorrowerInput, value: string) => setForm({ ...form, [key]: value });
  return <form className="borrower-form" onSubmit={onSubmit}>
    <label className="field"><span className="field-label">Full name <b>*</b></span><input className="input" autoComplete="name" required maxLength={160} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Borrower's complete name" /></label>
    <label className="field"><span className="field-label">Mobile number</span><input className="input" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="09XX XXX XXXX" /></label>
    <label className="field"><span className="field-label">Address</span><textarea className="input textarea" rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Current home or business address" /></label>
    <div className="form-pair"><label className="field"><span className="field-label">Collateral</span><input className="input" value={form.collateral} onChange={(e) => set("collateral", e.target.value)} placeholder="Optional" /></label><label className="field"><span className="field-label">Referral</span><input className="input" value={form.referral} onChange={(e) => set("referral", e.target.value)} placeholder="Referred by" /></label></div>
    {error && <ErrorNotice message={error} />}<div className="workspace-actions">{onCancel !== undefined && form.full_name && <button className="button-secondary" type="button" onClick={onCancel}>Cancel</button>}<button className="button-primary" disabled={busy || !form.full_name.trim()}>{busy ? "Saving…" : "Save borrower"}</button></div>
  </form>;
}

interface Draft { borrowerId: string; accountType: LoanProduct; principal: string; term: string; rate: string; method: "flat" | "diminishing"; collectorId: string; issuedOn: string; processingFee: string; insuranceFee: string; notarialFee: string; remarks: string; disburse: boolean; }
const blankDraft: Draft = { borrowerId: "", accountType: "in_house", principal: "", term: "6", rate: "5", method: "flat", collectorId: "", issuedOn: todayIso(), processingFee: "", insuranceFee: "0", notarialFee: "0", remarks: "", disburse: true };

export function LoansPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [loans, setLoans] = useState<ManagedLoan[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [repayments, setRepayments] = useState<Map<string, number>>(new Map());
  const [installments, setInstallments] = useState<Record<string, unknown>[]>([]);
  const [detailPayments, setDetailPayments] = useState<Record<string, unknown>[]>([]);
  const [hasRelease, setHasRelease] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => ({ ...blankDraft, borrowerId: new URLSearchParams(window.location.search).get("borrower") ?? "" }));
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const isForm = id === "new";
  const selectedLoan = id && id !== "new" ? loans.find((loan) => loan.id === id) : undefined;

  useEffect(() => {
    let active = true;
    void Promise.all([fetchBorrowers(), fetchLoans(), fetchCollectors(), fetchLoanHistory()]).then(([people, accounts, team, history]) => {
      if (!active) return;
      setError(people.error ?? accounts.error ?? team.error ?? history.error);
      setBorrowers(people.data ?? []); setLoans(accounts.data ?? []); setCollectors(team.data ?? []);
      setRepayments(new Map((history.data ?? []).map((item) => [item.loan_id, item.total])));
      setLoading(false);
    });
    return () => { active = false; };
  }, [revision]);
  useEffect(() => {
    if (!id || id === "new") return;
    let active = true;
    void Promise.all([
      supabase.from("loan_installments").select("*").eq("loan_id", id).order("installment_no"),
      supabase.from("loan_repayments").select("*").eq("loan_id", id).order("paid_on", { ascending: false }),
      supabase.from("cash_ledger").select("id", { head: true, count: "exact" }).eq("loan_id", id).eq("type", "release"),
    ]).then(([schedule, payments, release]) => {
      if (!active) return;
      setError(schedule.error?.message ?? payments.error?.message ?? release.error?.message ?? null);
      setInstallments((schedule.data ?? []) as Record<string, unknown>[]);
      setDetailPayments((payments.data ?? []) as Record<string, unknown>[]);
      setHasRelease((release.count ?? 0) > 0);
    });
    return () => { active = false; };
  }, [id, revision]);
  const borrower = borrowers.find((person) => person.id === draft.borrowerId);
  const principal = Number(draft.principal) || 0;
  const termMonths = Number(draft.term) || 0;
  const interestRate = (Number(draft.rate) || 0) / 100;
  const releaseDate = parseIsoDate(draft.issuedOn);
  const dailyResult = draft.accountType === "daily" && principal > 0 && termMonths > 0 && releaseDate
    ? calculateDailyLoan({ fullName: borrower?.full_name ?? "", collectorName: "", principal, termMonths, releaseDate: draft.issuedOn, rebateAmount: 0, prevBalance: 0, advPayment: 0, passbookFee: 0 }) : null;
  const monthlyResult = draft.accountType === "in_house" && principal > 0 && termMonths > 0 && interestRate <= 1
    ? calculateAmortization({ principal, termMonths, monthlyRate: interestRate, penaltyRate: 0, method: draft.method, overdueMonths: [], startDate: draft.issuedOn, firstDueOffsetMonths: 1 }) : null;
  const totalInterest = dailyResult?.interest ?? monthlyResult?.totalInterest ?? 0;
  const defaultProcessing = dailyResult?.processingFee ?? 0;
  const processingFee = draft.accountType === "daily" && draft.processingFee === "" ? defaultProcessing : Number(draft.processingFee) || 0;
  const extraFees = (Number(draft.insuranceFee) || 0) + (Number(draft.notarialFee) || 0);
  const netRelease = Math.max(0, principal - processingFee - extraFees);
  const dueOn = dailyResult?.maturityDate ?? monthlyResult?.maturityDate ?? "";
  const scheduleBase: InstallmentInput[] = (() => {
    if (!principal || !termMonths || !releaseDate) return [];
    if (draft.accountType === "in_house" && monthlyResult) return monthlyResult.rows.map((row) => ({ installment_no: row.month, due_on: row.dueDate, expected_principal: Number(row.principal.toFixed(2)), expected_interest: Number(row.interest.toFixed(2)) }));
    const count = termMonths * 30;
    const dailyPrincipal = principal / count;
    const dailyInterest = totalInterest / count;
    return Array.from({ length: count }, (_, index) => ({
      installment_no: index + 1,
      due_on: toIsoDate(new Date(releaseDate.getFullYear(), releaseDate.getMonth(), releaseDate.getDate() + index + 1)),
      expected_principal: Number(dailyPrincipal.toFixed(2)), expected_interest: Number(dailyInterest.toFixed(2)),
    }));
  })();
  const schedule = scheduleBase.map((row, index) => index === scheduleBase.length - 1 ? {
    ...row,
    expected_principal: Number((principal - scheduleBase.slice(0, -1).reduce((sum, item) => sum + item.expected_principal, 0)).toFixed(2)),
    expected_interest: Number((totalInterest - scheduleBase.slice(0, -1).reduce((sum, item) => sum + item.expected_interest, 0)).toFixed(2)),
  } : row);

  const visibleLoans = loans.filter((loan) => {
    const person = borrowers.find((item) => item.id === loan.borrower_id);
    const matchesSearch = `${person?.full_name ?? loan.borrower_name} ${loan.borrower_phone ?? ""}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (filter === "all" || (filter === "overdue" ? Boolean(loan.due_on && loan.due_on < todayIso() && loan.status === "active") : loan.status === filter || loan.account_type === filter));
  });
  const editing = selectedLoan && !hasRelease && !repayments.has(selectedLoan.id) && !selectedLoan.amount_paid;
  const beginEdit = (loan: ManagedLoan) => {
    const person = borrowers.find((item) => item.id === loan.borrower_id);
    setDraft({ ...blankDraft, borrowerId: loan.borrower_id ?? "", accountType: loan.account_type, principal: String(loan.principal), term: String(loan.contract_months ?? 6), rate: String((loan.interest_rate ?? 0.05) * 100), collectorId: loan.collector_id ?? "", issuedOn: loan.issued_on ?? todayIso(), processingFee: String(loan.processing_fee), insuranceFee: String(loan.insurance_fee), notarialFee: String(loan.notarial_fee), remarks: loan.remarks ?? "", disburse: false });
    if (!person) setError("The linked borrower could not be loaded.");
    navigate("/loans/new?edit=" + loan.id);
  };

  const submitLoan = async (event: FormEvent) => {
    event.preventDefault();
    if (step < 3) { setStep(step + 1); return; }
    if (!borrower || !schedule.length) { setError("Select a borrower and complete valid loan terms."); return; }
    setBusy(true); setError(null);
    const payload: LoanInput = {
      borrower_id: borrower.id, borrower_name: borrower.full_name, borrower_phone: borrower.phone ?? "",
      principal, account_type: draft.accountType, collector_id: draft.collectorId, issued_on: draft.issuedOn,
      due_on: dueOn, interest_rate: interestRate, contract_months: termMonths,
      processing_fee: processingFee, insurance_fee: Number(draft.insuranceFee) || 0,
      notarial_fee: Number(draft.notarialFee) || 0, net_release: netRelease,
      outstanding_balance: principal + totalInterest, remarks: draft.remarks,
      installments: schedule, disburse: draft.disburse,
    };
    const editId = new URLSearchParams(window.location.search).get("edit");
    const saved = editId ? await editManagedLoan(editId, payload) : await createManagedLoan(payload);
    setBusy(false);
    if (saved.error) { setError(saved.error); return; }
    setRevision((n) => n + 1); navigate(editId ? `/loans/${editId}` : "/loans");
  };
  const changeStatus = async (status: LoanStatus) => { if (!selectedLoan) return; const result = await updateLoanStatus(selectedLoan.id, status); setError(result.error); setRevision((n) => n + 1); };
  const deleteSelected = async () => {
    if (!selectedLoan || !window.confirm("Permanently delete this unserviced loan and its schedule?")) return;
    const result = await removeLoan(selectedLoan.id); if (result.error) { setError(result.error); return; } navigate("/loans"); setRevision((n) => n + 1);
  };

  return <div className="page borrower-workspace">
    <header className="page-header workspace-heading"><div><p className="brand">Jamo Lending Corp · Portfolio</p><h1 className="page-title">{isForm ? "Create a loan" : selectedLoan ? "Loan account" : "Loans"}</h1><p className="page-subtitle">{isForm ? "Build a clear repayment plan, then review before saving." : selectedLoan ? "Terms, schedule, and account activity in one place." : "Track active accounts and keep every loan connected to its borrower."}</p></div>
      <div className="workspace-actions"><Link className="button-secondary" to="/borrowers">Borrowers</Link>{!isForm && !selectedLoan && <Link className="button-primary button-link" to="/loans/new">＋ Create loan</Link>}</div>
    </header>
    {error && <ErrorNotice message={error} />}
    {isForm ? <>
      <div className="workspace-back"><Link to="/loans">← Loan portfolio</Link><div className="wizard-progress"><span className={step >= 1 ? "wizard-active" : ""}>Borrower</span><i /><span className={step >= 2 ? "wizard-active" : ""}>Terms</span><i /><span className={step >= 3 ? "wizard-active" : ""}>Review</span></div></div>
      <form className="panel loan-wizard" onSubmit={submitLoan}>
        <div className="wizard-title"><div><p className="eyebrow">Step 0{step} · {step === 1 ? "Select borrower" : step === 2 ? "Set loan terms" : "Review and confirm"}</p><h2>{step === 1 ? "Who is this loan for?" : step === 2 ? "Build the repayment plan" : "Check everything before saving"}</h2></div><span className="step-counter">0{step} / 03</span></div>
        {step === 1 && <div className="wizard-fields"><label className="field"><span className="field-label">Borrower <b>*</b></span><select className="input" required value={draft.borrowerId} onChange={(e) => setDraft({ ...draft, borrowerId: e.target.value })}><option value="">Choose a borrower</option>{borrowers.map((person) => <option key={person.id} value={person.id}>{person.full_name}{person.phone ? ` · ${person.phone}` : ""}</option>)}</select></label><div className="inline-create"><span>New to Jamo?</span><Link to="/borrowers">Add a borrower first ↗</Link></div>{borrower && <div className="selected-borrower"><span className="profile-avatar profile-avatar-small">{borrower.full_name.slice(0, 1)}</span><span><strong>{borrower.full_name}</strong><small>{borrower.phone || "No phone number"} · {borrower.source_system === "jamo_nh" ? "Imported profile" : "Borrower profile"}</small></span><Link to={`/borrowers/${borrower.id}`}>View profile</Link></div>}</div>}
        {step === 2 && <div className="wizard-fields">
          <div className="form-pair"><label className="field"><span className="field-label">Loan product</span><select className="input" value={draft.accountType} onChange={(e) => setDraft({ ...draft, accountType: e.target.value as LoanProduct, rate: e.target.value === "daily" ? "10" : "5", term: e.target.value === "daily" ? "2" : "6", processingFee: e.target.value === "daily" ? "" : "0" })}><option value="in_house">In-house · monthly installments</option><option value="daily">Daily · short-term repayments</option></select></label><label className="field"><span className="field-label">Assigned collector <b>*</b></span><select className="input" required value={draft.collectorId} onChange={(e) => setDraft({ ...draft, collectorId: e.target.value })}><option value="">Choose an active collector</option>{collectors.filter((person) => person.active).map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label></div>
          <div className="form-pair"><label className="field"><span className="field-label">Principal amount (PHP) <b>*</b></span><input className="input" type="number" min="1" step="0.01" required value={draft.principal} onChange={(e) => setDraft({ ...draft, principal: e.target.value })} placeholder="e.g. 50,000" /></label><label className="field"><span className="field-label">Term (months)</span><input className="input" type="number" min="1" max={draft.accountType === "daily" ? 2 : 600} step="1" required value={draft.term} onChange={(e) => setDraft({ ...draft, term: e.target.value })} /></label></div>
          <div className="form-pair"><label className="field"><span className="field-label">Monthly interest (%)</span><input className="input" type="number" min="0" max="100" step="0.01" required disabled={draft.accountType === "daily"} value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} /><small className="field-hint">Daily product follows the existing 10% monthly rate.</small></label>{draft.accountType === "in_house" ? <label className="field"><span className="field-label">Interest method</span><select className="input" value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value as Draft["method"] })}><option value="flat">Flat rate</option><option value="diminishing">Diminishing balance</option></select></label> : <label className="field"><span className="field-label">Release date</span><input className="input" type="date" required value={draft.issuedOn} onChange={(e) => setDraft({ ...draft, issuedOn: e.target.value })} /></label>}</div>
          {draft.accountType === "in_house" && <label className="field"><span className="field-label">Release date</span><input className="input" type="date" required value={draft.issuedOn} onChange={(e) => setDraft({ ...draft, issuedOn: e.target.value })} /></label>}
          <div className="form-pair fee-fields"><label className="field"><span className="field-label">Processing fee (PHP)</span><input className="input" type="number" min="0" step="0.01" value={draft.accountType === "daily" && draft.processingFee === "" ? defaultProcessing : draft.processingFee} onChange={(e) => setDraft({ ...draft, processingFee: e.target.value })} /></label><label className="field"><span className="field-label">Insurance fee (PHP)</span><input className="input" type="number" min="0" step="0.01" value={draft.insuranceFee} onChange={(e) => setDraft({ ...draft, insuranceFee: e.target.value })} /></label><label className="field"><span className="field-label">Notarial fee (PHP)</span><input className="input" type="number" min="0" step="0.01" value={draft.notarialFee} onChange={(e) => setDraft({ ...draft, notarialFee: e.target.value })} /></label></div>
          <label className="field"><span className="field-label">Remarks</span><textarea className="input textarea" rows={2} value={draft.remarks} onChange={(e) => setDraft({ ...draft, remarks: e.target.value })} placeholder="Optional notes for this account" /></label>
          {principal > 0 && <div className="live-preview"><div><span>Estimated interest</span><strong>{formatCurrency(totalInterest)}</strong></div><div><span>Net release</span><strong>{formatCurrency(netRelease)}</strong></div><div><span>Maturity</span><strong>{dueOn ? formatDate(dueOn) : "—"}</strong></div></div>}
        </div>}
        {step === 3 && <div className="review-grid"><div className="review-main"><div className="review-person"><span className="profile-avatar">{borrower?.full_name.slice(0, 1) ?? "?"}</span><span><small>Borrower</small><strong>{borrower?.full_name || "Select a borrower"}</strong><small>{borrower?.phone || "No phone number"}</small></span></div><div className="review-terms"><div><span>Product</span><strong>{draft.accountType === "daily" ? "Daily loan" : "In-house loan"}</strong></div><div><span>Principal</span><strong>{formatCurrency(principal)}</strong></div><div><span>Interest</span><strong>{formatCurrency(totalInterest)} <small>({draft.rate}% / month)</small></strong></div><div><span>Term</span><strong>{termMonths} months · {draft.accountType === "daily" ? `${termMonths * 30} daily payments` : `${termMonths} monthly payments`}</strong></div><div><span>Fees</span><strong>{formatCurrency(processingFee + extraFees)}</strong></div><div><span>Net release</span><strong className="review-highlight">{formatCurrency(netRelease)}</strong></div><div><span>Collector</span><strong>{collectors.find((c) => c.id === draft.collectorId)?.name || "—"}</strong></div><div><span>First due / maturity</span><strong>{schedule[0]?.due_on ? formatDate(schedule[0].due_on) : "—"} · {dueOn ? formatDate(dueOn) : "—"}</strong></div></div></div><aside className="review-side"><p className="eyebrow">Repayment schedule</p><strong>{schedule.length} installments</strong><p>{draft.accountType === "daily" ? "Daily principal and interest are spread evenly across 30 days per month." : `Monthly ${draft.method} repayment schedule.`}</p><label className="disburse-toggle"><input type="checkbox" checked={draft.disburse} onChange={(e) => setDraft({ ...draft, disburse: e.target.checked })} /><span><strong>Record disbursement now</strong><small>Add a linked release to the cash ledger for {formatCurrency(netRelease)}.</small></span></label></aside></div>}
        <div className="wizard-footer">{step > 1 ? <button className="button-secondary" type="button" onClick={() => setStep(step - 1)}>← Back</button> : <button className="button-secondary" type="button" onClick={() => navigate("/loans")}>Cancel</button>}<button className="button-primary" type="submit" disabled={busy || (step === 1 && !draft.borrowerId) || (step === 2 && (!draft.collectorId || principal <= 0 || termMonths < 1 || termMonths > (draft.accountType === "daily" ? 2 : 600)))}>{busy ? "Saving securely…" : step < 3 ? "Continue →" : new URLSearchParams(window.location.search).has("edit") ? "Save changes" : draft.disburse ? "Confirm & record release" : "Create loan"}</button></div>
      </form>
    </> : selectedLoan ? <>
      <div className="workspace-back"><Link to="/loans">← Loan portfolio</Link><span className={`status-chip status-${selectedLoan.status}`}>{selectedLoan.status.replace("_", " ")}</span></div>
      <section className="loan-detail-hero panel"><div className="loan-detail-summary"><span className="profile-avatar">₱</span><div><p className="eyebrow">{selectedLoan.account_type === "daily" ? "Daily loan" : "In-house loan"} · {selectedLoan.id.slice(0, 8).toUpperCase()}</p><h2>{borrowers.find((person) => person.id === selectedLoan.borrower_id)?.full_name ?? selectedLoan.borrower_name}</h2><p>{selectedLoan.borrower_phone || "No phone number"} · Issued {selectedLoan.issued_on ? formatDate(selectedLoan.issued_on) : formatDate(selectedLoan.created_at.slice(0, 10))}</p></div></div><div className="loan-balance"><span>Outstanding</span><strong>{formatCurrency(selectedLoan.outstanding_balance ?? Math.max(0, selectedLoan.principal - selectedLoan.amount_paid))}</strong><small>Original principal {formatCurrency(selectedLoan.principal)}</small></div><div className="workspace-actions">{editing && <button className="button-secondary" type="button" onClick={() => beginEdit(selectedLoan)}>Edit terms</button>}{selectedLoan.status === "active" ? <button className="button-secondary" type="button" onClick={() => void changeStatus("closed")}>Mark closed</button> : selectedLoan.status === "closed" && <button className="button-secondary" type="button" onClick={() => void changeStatus("active")}>Reopen</button>}{selectedLoan.status === "active" && <button className="button-danger" type="button" onClick={() => void changeStatus("written_off")}>Write off</button>}{!hasRelease && !repayments.has(selectedLoan.id) && selectedLoan.amount_paid === 0 && <button className="button-danger" type="button" onClick={() => void deleteSelected()}>Delete</button>}</div></section>
      {(!editing || repayments.has(selectedLoan.id) || selectedLoan.amount_paid > 0 || hasRelease) && <p className="workspace-hint">Terms are locked after repayments or a cash release so the account history stays intact.</p>}
      <section className="detail-columns"><article className="panel"><div className="panel-header"><div><p className="eyebrow">Payment plan</p><h2>Installments <span className="count-pill">{installments.length}</span></h2></div></div><div className="table-scroll"><table className="workspace-table"><thead><tr><th>#</th><th>Due date</th><th>Principal</th><th>Interest</th><th>Status</th></tr></thead><tbody>{installments.map((row) => <tr key={String(row.id)}><td>{String(row.installment_no)}</td><td>{formatDate(String(row.due_on))}</td><td>{formatCurrency(Number(row.expected_principal))}</td><td>{formatCurrency(Number(row.expected_interest))}</td><td><span className={`status-chip status-${String(row.status)}`}>{String(row.status)}</span></td></tr>)}</tbody></table></div></article><article className="panel"><div className="panel-header"><div><p className="eyebrow">Account activity</p><h2>Repayments <span className="count-pill">{detailPayments.length}</span></h2></div></div>{detailPayments.length ? <div className="portfolio-list">{detailPayments.map((payment) => <div className="portfolio-row" key={String(payment.id)}><span><strong>{formatDate(String(payment.paid_on))}</strong><small>{String(payment.reference || payment.note || "Payment received")}</small></span><strong>{formatCurrency(Number(payment.amount))}</strong></div>)}</div> : <div className="workspace-empty compact-empty"><span>◷</span><h3>No repayments recorded</h3><p>Payment activity will appear here as it is recorded.</p></div>}<div className="loan-terms-mini"><span>Interest rate <b>{((selectedLoan.interest_rate ?? 0) * 100).toFixed(2)}%</b></span><span>Maturity <b>{selectedLoan.due_on ? formatDate(selectedLoan.due_on) : "—"}</b></span><span>Net release <b>{formatCurrency(selectedLoan.net_release ?? selectedLoan.principal)}</b></span></div></article></section>
    </> : <>
      <section className="portfolio-metrics"><div className="metric-card"><span>Accounts</span><strong>{loans.length}</strong><small>All products</small></div><div className="metric-card"><span>Active loans</span><strong>{loans.filter((loan) => loan.status === "active").length}</strong><small>Currently servicing</small></div><div className="metric-card"><span>Principal portfolio</span><strong>{formatCurrency(loans.filter((loan) => loan.status === "active").reduce((sum, loan) => sum + (loan.outstanding_balance ?? Math.max(0, loan.principal - loan.amount_paid)), 0))}</strong><small>Active outstanding balance</small></div></section>
      <section className="panel loan-directory"><div className="panel-header"><div><p className="eyebrow">Account management</p><h2>Loan portfolio</h2></div><div className="portfolio-controls"><input className="input directory-search" aria-label="Search loans" placeholder="Search borrower" value={search} onChange={(e) => setSearch(e.target.value)} /><select className="input filter-select" aria-label="Filter loans" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All loans</option><option value="active">Active</option><option value="closed">Closed</option><option value="written_off">Written off</option><option value="overdue">Past maturity</option><option value="daily">Daily product</option><option value="in_house">In-house product</option></select></div></div>
        {loading ? <div className="workspace-loading">Loading loan portfolio…</div> : visibleLoans.length ? <div className="table-scroll"><table className="workspace-table loan-table"><thead><tr><th>Borrower</th><th>Product</th><th>Issued</th><th>Due</th><th>Principal</th><th>Paid</th><th>Balance</th><th>Status</th><th /></tr></thead><tbody>{visibleLoans.map((loan) => { const person = borrowers.find((item) => item.id === loan.borrower_id); const overdue = loan.status === "active" && Boolean(loan.due_on && loan.due_on < todayIso()); return <tr key={loan.id}><td><Link className="table-person" to={`/loans/${loan.id}`}><strong>{person?.full_name ?? loan.borrower_name}</strong><small>{loan.borrower_phone ?? person?.phone ?? "No phone"}</small></Link></td><td><span className="product-chip">{loan.account_type === "daily" ? "Daily" : "In-house"}</span></td><td>{loan.issued_on ? formatDate(loan.issued_on) : "—"}</td><td className={overdue ? "overdue-text" : ""}>{loan.due_on ? formatDate(loan.due_on) : "—"}</td><td>{formatCurrency(loan.principal)}</td><td>{formatCurrency(Math.max(loan.amount_paid, repayments.get(loan.id) ?? 0))}</td><td>{formatCurrency(loan.outstanding_balance ?? Math.max(0, loan.principal - loan.amount_paid))}</td><td><span className={`status-chip status-${overdue ? "overdue" : loan.status}`}>{overdue ? "past due" : loan.status.replace("_", " ")}</span></td><td><Link className="row-open" aria-label={`Open loan for ${person?.full_name ?? loan.borrower_name}`} to={`/loans/${loan.id}`}>↗</Link></td></tr>; })}</tbody></table></div> : <div className="workspace-empty"><span>⌁</span><h3>{search || filter !== "all" ? "No matching loans" : "No loans in the portfolio yet"}</h3><p>Create a borrower-linked loan and its repayment schedule in one guided flow.</p><Link className="button-primary button-link" to="/loans/new">Create first loan</Link></div>}
      </section>
    </>}
  </div>;
}

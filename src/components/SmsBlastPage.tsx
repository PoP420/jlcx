import { useEffect, useMemo, useState } from "react";
import {
  fetchSmsLoans,
  fetchSmsConfig,
  fetchSmsTemplates,
  maskPhone,
  sendSmsBlast,
  updateBorrowerSmsPreference,
  type SmsDispatchResult,
  type SmsLoan,
  type SmsTemplate,
} from "../lib/smsService";

const templateFields = ["borrower_name", "amount_due", "outstanding_balance", "due_date", "collector_name", "collector_phone"];

export function SmsBlastPage() {
  const [loans, setLoans] = useState<SmsLoan[]>([]);
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [dryRun, setDryRun] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [results, setResults] = useState<SmsDispatchResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all([fetchSmsLoans(), fetchSmsTemplates(), fetchSmsConfig()]).then(([loanResult, templateResult, configResult]) => {
      if (!active) return;
      if (loanResult.error) setError(loanResult.error);
      else setLoans(loanResult.data ?? []);
      if (templateResult.error) setError(templateResult.error);
      else {
        const manualTemplates = (templateResult.data ?? []).filter((item) => item.name !== "overdue_collector");
        setTemplates(manualTemplates);
        setTemplateId(manualTemplates[0]?.id ?? "");
      }
      if (configResult.error) setError(configResult.error);
      else if (configResult.data) setDryRun(configResult.data.dry_run);
      setLoading(false);
    });
    return () => { active = false; };
  }, [revision]);

  const selectedLoans = useMemo(
    () => loans.filter((loan) => selectedIds.includes(loan.id)),
    [loans, selectedIds],
  );
  const template = templates.find((item) => item.id === templateId);
  const preview = template && selectedLoans[0]
    ? renderPreview(template.message, selectedLoans[0])
    : "Select a template and a loan to preview the message.";

  const toggleLoan = (loanId: string) => {
    setSelectedIds((current) => current.includes(loanId)
      ? current.filter((id) => id !== loanId)
      : current.length < 3 ? [...current, loanId] : current);
    setResults(null);
  };

  const handleSend = async () => {
    if (!template || selectedLoans.length === 0) return;
    setSending(true);
    setError(null);
    const result = await sendSmsBlast(selectedIds, template.name);
    if (result.error) setError(result.error);
    else setResults(result.data ?? []);
    setSending(false);
  };

  const toggleConsent = async (loan: SmsLoan) => {
    const optingOut = loan.sms_consent && !loan.sms_opted_out;
    const prompt = optingOut
      ? `Record that ${loan.borrower_name} opted out of SMS reminders?`
      : `Confirm that ${loan.borrower_name} has agreed to receive SMS reminders?`;
    if (!window.confirm(prompt)) return;
    setUpdatingId(loan.id); setError(null);
    const result = await updateBorrowerSmsPreference(loan.id, true, optingOut);
    if (result.error) setError(result.error);
    else { setSelectedIds((current) => current.filter((id) => id !== loan.id)); setRevision((current) => current + 1); }
    setUpdatingId(null);
  };

  return (
    <div className="page">
      <header className="page-header">
        <p className="brand">Jamo Lending Corp</p>
        <h1 className="page-title">Send SMS</h1>
        <p className="page-subtitle">Preview the message and recipients before requesting a send. {dryRun ? "Dry-run is active; no SMS will be sent." : "Live mode is active; confirmed sends may incur provider charges."}</p>
      </header>

      {error && <div className="alert" role="alert">{error}</div>}
      {results && <div className="sms-result" role="status">
        {results.filter((result) => result.status === "dry_run").length > 0
          ? `Dry-run complete: ${results.filter((result) => result.status === "dry_run").length} logged, no SMS sent.`
          : `Completed: ${results.filter((result) => result.status === "sent").length} accepted, ${results.filter((result) => result.status === "failed").length} failed, ${results.filter((result) => result.status === "duplicate").length} duplicates skipped.`}
        <ul>{results.map((result) => <li key={result.loanId}>
          Loan {result.loanId}: {result.status}
          {result.providerCode != null ? ` · MAXXtext code ${result.providerCode}` : ""}
          {result.providerStatus ? ` · ${result.providerStatus}` : ""}
          {result.providerDescription ? ` · ${result.providerDescription}` : result.error ? ` · ${result.error}` : ""}
        </li>)}</ul>
      </div>}

      <main className="sms-layout">
        <section className="panel">
          <div className="panel-header"><h2>Recipients</h2><span>{selectedLoans.length} selected</span></div>
          {loading ? <p className="page-status">Loading loans...</p> : loans.length === 0 ? <p className="page-empty">No active loans are available for your account.</p> : (
            <div className="sms-recipient-list">
              {loans.map((loan) => {
                const phone = loan.borrower_phone;
                const validPhone = phone != null && /^((\+?63)|0)9\d{9}$/.test(phone.replace(/[\s()-]/g, ""));
                const canReceive = validPhone && loan.sms_consent && !loan.sms_opted_out;
                return <label className="sms-recipient" key={loan.id}>
                  <input type="checkbox" checked={selectedIds.includes(loan.id)} disabled={!canReceive || (!selectedIds.includes(loan.id) && selectedIds.length >= 3)} onChange={() => toggleLoan(loan.id)} />
                  <span className="sms-recipient-main"><strong>{loan.borrower_name}</strong><small>{phone ? maskPhone(phone) : "No mobile on file"}{!loan.sms_consent ? " · consent not recorded" : loan.sms_opted_out ? " · opted out" : ""}{loan.collector_name ? ` · ${loan.collector_name}` : ""}</small></span>
                  <span className="sms-recipient-balance">PHP {(loan.outstanding_balance ?? loan.principal).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span>
                  {phone && <button className="button-secondary sms-consent-button" type="button" disabled={updatingId === loan.id} onClick={() => void toggleConsent(loan)}>{updatingId === loan.id ? "Saving..." : loan.sms_consent && !loan.sms_opted_out ? "Record opt-out" : loan.sms_opted_out ? "Record new consent" : "Record consent"}</button>}
                </label>;
              })}
            </div>
          )}
        </section>

        <section className="panel sms-compose">
          <div className="panel-header"><h2>Message</h2></div>
          <label className="field-label" htmlFor="sms-template">Template</label>
          <select id="sms-template" className="input" value={templateId} onChange={(event) => { setTemplateId(event.target.value); setResults(null); }}>
            {templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          {template && <>
            <div className="sms-preview"><p className="field-label">Preview for {selectedLoans[0]?.borrower_name ?? "selected borrower"}</p><p>{preview}</p></div>
            <p className="field-hint">Available fields: {templateFields.map((field) => `{{${field}}}`).join(", ")}</p>
          </>}
          <div className="sms-confirm-summary">
            <strong>Send summary</strong>
            <span>{selectedLoans.length} recipient{selectedLoans.length === 1 ? "" : "s"} · {template?.name ?? "No template"} · maximum 3 per request</span>
            <span>Messages with missing/invalid numbers are disabled.</span>
          </div>
          <button className="button-primary" type="button" disabled={sending || !template || selectedLoans.length === 0} onClick={() => void handleSend()}>
            {sending ? "Processing..." : dryRun ? "Confirm dry-run" : "Confirm live send"}
          </button>
        </section>
      </main>
      <footer className="footer">The server checks your access, applies the daily cap, and records each attempt.</footer>
    </div>
  );
}

function renderPreview(message: string, loan: SmsLoan): string {
  const balance = (loan.outstanding_balance ?? loan.principal).toFixed(2);
  const values: Record<string, string> = {
    borrower_name: loan.borrower_name,
    amount_due: loan.amount_due == null ? balance : loan.amount_due.toFixed(2),
    outstanding_balance: balance,
    due_date: loan.due_on ?? "(due date not set)",
    collector_name: loan.collector_name ?? "",
    collector_phone: "",
  };
  return message.replace(/{{\s*([a-z_]+)\s*}}/g, (_match, key: string) => values[key] ?? `{{${key}}}`);
}

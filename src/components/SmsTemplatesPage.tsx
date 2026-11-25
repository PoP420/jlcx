import { useEffect, useState, type FormEvent } from "react";
import { fetchMyProfile } from "../lib/cashService";
import { fetchSmsConfig, fetchSmsTemplates, saveSmsConfig, saveSmsTemplate, type SmsConfig, type SmsTemplate } from "../lib/smsService";

const allowedVariables = ["borrower_name", "amount_due", "outstanding_balance", "due_date", "collector_name", "collector_phone", "overdue_count"];

export function SmsTemplatesPage() {
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [config, setConfig] = useState<SmsConfig>({ dry_run: true, daily_limit: 200, reminder_days_before: [3, 1], escalation_days_after: [1, 3, 7] });
  const [dailyLimit, setDailyLimit] = useState("200");
  const [confirmLive, setConfirmLive] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [active, setActive] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = async () => {
    const result = await fetchSmsTemplates(true);
    if (result.error) setError(result.error);
    else setTemplates(result.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    let alive = true;
    void Promise.all([fetchMyProfile(), fetchSmsTemplates(true), fetchSmsConfig()]).then(([profile, templateResult, configResult]) => {
      if (!alive) return;
      if (profile.error) setError(profile.error);
      else setRole(profile.data?.role ?? "staff");
      if (templateResult.error) setError(templateResult.error);
      else setTemplates(templateResult.data ?? []);
      if (configResult.error) setError(configResult.error);
      else if (configResult.data) { setConfig(configResult.data); setDailyLimit(String(configResult.data.daily_limit)); }
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const reset = () => { setEditingId(null); setName(""); setMessage(""); setActive(true); };
  const edit = (template: SmsTemplate) => {
    setEditingId(template.id); setName(template.name); setMessage(template.message); setActive(template.active); setNotice(null);
  };
  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(null); setNotice(null);
    const variables = [...new Set([...message.matchAll(/{{\s*([a-z_]+)\s*}}/g)].map((match) => match[1]))];
    const unsupported = variables.filter((variable) => !allowedVariables.includes(variable));
    if (unsupported.length) {
      setError(`Unsupported template fields: ${unsupported.join(", ")}`);
      setSaving(false);
      return;
    }
    const payload = { id: editingId ?? undefined, name, message, variables, active };
    const result = await saveSmsTemplate(payload);
    if (result.error) setError(result.error);
    else { setNotice("Template saved."); reset(); await refresh(); }
    setSaving(false);
  };

  const handleSaveConfig = async () => {
    const parsed = Number(dailyLimit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10000) {
      setError("Daily limit must be a whole number from 1 to 10,000.");
      return;
    }
    if (!config.dry_run && !confirmLive) {
      setError("Confirm that live mode may send billable SMS before saving.");
      return;
    }
    setSaving(true); setError(null); setNotice(null);
    const result = await saveSmsConfig({ dry_run: config.dry_run, daily_limit: parsed });
    if (result.error) setError(result.error);
    else if (result.data) { setConfig(result.data); setDailyLimit(String(result.data.daily_limit)); setConfirmLive(false); setNotice("SMS settings saved."); }
    setSaving(false);
  };

  if (!loading && role !== "admin") return <div className="page"><header className="page-header"><p className="brand">Jamo Lending Corp</p><h1 className="page-title">SMS Templates</h1></header><div className="alert" role="alert">Only administrators can manage SMS templates.</div></div>;

  return <div className="page">
    <header className="page-header"><p className="brand">Jamo Lending Corp</p><h1 className="page-title">SMS Templates</h1><p className="page-subtitle">Manage the reusable message text available to staff.</p></header>
    {error && <div className="alert" role="alert">{error}</div>}{notice && <div className="sms-result" role="status">{notice}</div>}
    <main className="sms-layout">
      <section className="panel sms-compose">
        <div className="panel-header"><h2>Dispatch settings</h2></div>
        <label className="sms-active-toggle"><input type="checkbox" checked={config.dry_run} onChange={(event) => { setConfig((current) => ({ ...current, dry_run: event.target.checked })); setConfirmLive(false); }} /> Dry-run mode (no provider request is made)</label>
        {!config.dry_run && <label className="sms-active-toggle"><input type="checkbox" checked={confirmLive} onChange={(event) => setConfirmLive(event.target.checked)} /> I understand live sends may incur provider charges.</label>}
        <div className="field"><label className="field-label" htmlFor="sms-daily-limit">Daily attempt limit</label><input id="sms-daily-limit" className="input" type="number" min="1" max="10000" step="1" value={dailyLimit} onChange={(event) => setDailyLimit(event.target.value)} /></div>
        <p className="field-hint">Scheduled reminders: {config.reminder_days_before.join(", ")} days before, {config.escalation_days_after.join(", ")} days after due date.</p>
        <button className="button-primary" type="button" disabled={saving || (!config.dry_run && !confirmLive)} onClick={() => void handleSaveConfig()}>{saving ? "Saving..." : "Save dispatch settings"}</button>
      </section>
      <section className="panel"><div className="panel-header"><h2>{editingId ? "Edit template" : "New template"}</h2></div>
        <form className="cash-form" onSubmit={(event) => void handleSave(event)}>
          <div className="field"><label className="field-label" htmlFor="sms-template-name">Template key</label><input id="sms-template-name" className="input" required pattern="[a-z][a-z0-9_]*" value={name} onChange={(event) => setName(event.target.value)} placeholder="payment_due" /></div>
          <div className="field"><label className="field-label" htmlFor="sms-template-message">Message</label><textarea id="sms-template-message" className="input sms-template-textarea" required rows={6} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Hi {{borrower_name}}, your payment of PHP {{amount_due}} is due on {{due_date}}." /></div>
          <p className="field-hint">Allowed fields: {allowedVariables.map((value) => `{{${value}}}`).join(", ")}</p>
          <label className="sms-active-toggle"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Available for staff sends</label>
          <div className="sms-button-row"><button className="button-primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save template"}</button>{editingId && <button className="button-secondary" type="button" onClick={reset}>Cancel</button>}</div>
        </form>
      </section>
      <section className="panel"><div className="panel-header"><h2>Templates</h2></div>
        {loading ? <p className="page-status">Loading templates...</p> : <ul className="sms-template-list">{templates.map((item) => <li key={item.id} className="sms-template-item"><div><strong>{item.name}</strong><span className={`tag ${item.active ? "tag-active" : "tag-inactive"}`}>{item.active ? "Active" : "Inactive"}</span><p>{item.message}</p></div><button className="button-secondary" type="button" onClick={() => edit(item)}>Edit</button></li>)}</ul>}
      </section>
    </main>
  </div>;
}

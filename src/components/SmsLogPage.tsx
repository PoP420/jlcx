import { useEffect, useState } from "react";
import { fetchSmsLogs, maskPhone, type SmsLogEntry } from "../lib/smsService";

export function SmsLogPage() {
  const [logs, setLogs] = useState<SmsLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchSmsLogs().then((result) => {
      if (!active) return;
      if (result.error) setError(result.error);
      else setLogs(result.data ?? []);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return <div className="page">
    <header className="page-header"><p className="brand">Jamo Lending Corp</p><h1 className="page-title">SMS Activity</h1><p className="page-subtitle">Recent SMS attempts visible to your account.</p></header>
    {error && <div className="alert" role="alert">{error}</div>}
    <section className="panel">
      <div className="panel-header"><h2>Recent messages</h2><span>Latest 200</span></div>
      {loading ? <p className="page-status">Loading SMS activity...</p> : logs.length === 0 ? <p className="page-empty">No SMS activity has been recorded.</p> : <div className="table-scroll"><table className="sms-log-table">
        <thead><tr><th>Date</th><th>Borrower</th><th>Mobile</th><th>Template</th><th>Message</th><th>Status</th><th>Provider ref</th></tr></thead>
        <tbody>{logs.map((log) => <tr key={log.id}>
          <td>{new Date(log.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</td>
          <td>{log.borrower_name}</td><td>{maskPhone(log.borrower_mobile)}</td><td>{log.template_name}</td>
          <td className="sms-log-message">{log.message}</td>
          <td><span className={`tag sms-status-${log.status}`}>{log.status.replace("_", " ")}</span>{log.error_message && <small className="field-error">{log.error_message}</small>}</td>
          <td>{log.provider_ref ?? (log.provider_code ? `Code ${log.provider_code}` : "—")}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </div>;
}

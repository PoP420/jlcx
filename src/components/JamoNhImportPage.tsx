import { useEffect, useState, type ChangeEvent } from "react";
import { formatCurrency } from "../lib/calculator";
import { importJamoNhActiveAccounts } from "../lib/jamoNhImportService";
import {
  parseJamoNhActiveCsv,
  type JamoNhCsvPreview,
} from "../lib/jamoNhImport";
import { fetchMyProfile } from "../lib/cashService";

export function JamoNhImportPage() {
  const [preview, setPreview] = useState<JamoNhCsvPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number } | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchMyProfile().then((result) => {
      if (!active) return;
      if (result.error) setPageError(result.error);
      else setRole(result.data?.role ?? "staff");
    });
    return () => { active = false; };
  }, []);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setPreview(null);
    setImportResult(null);
    setPageError(null);
    if (!file) return;

    setFileName(file.name);
    setLoadingFile(true);
    try {
      const parsed = parseJamoNhActiveCsv(await file.text());
      setPreview(parsed);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not read this CSV file.");
    } finally {
      setLoadingFile(false);
    }
  };

  const handleImport = async () => {
    if (!preview || preview.issues.length > 0 || preview.rows.length === 0) return;
    setPageError(null);
    setImporting(true);
    const result = await importJamoNhActiveAccounts(preview.rows);
    setImporting(false);
    if (result.error || !result.data) {
      setPageError(result.error ?? "The import did not finish.");
      return;
    }
    setImportResult(result.data);
  };

  if (role === null) {
    return (
      <div className="page">
        <section className="panel"><p>{pageError ?? "Checking account access..."}</p></section>
      </div>
    );
  }

  if (role !== "admin") {
    return (
      <div className="page">
        <header className="page-header">
          <p className="brand">Jamo Lending Corp</p>
          <h1 className="page-title">Jamo In-House Active Accounts</h1>
        </header>
        <div className="alert" role="alert">Only an administrator can import these accounts.</div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <p className="brand">Jamo Lending Corp</p>
        <h1 className="page-title">Jamo In-House Active Accounts</h1>
        <p className="page-subtitle">
          Import monthly in-house accounts separately from daily cash releases. The preview checks
          every row before anything is saved.
        </p>
      </header>

      <main className="page-grid">
        <section className="panel">
          <div className="panel-header"><h2>Upload account CSV</h2></div>
          <p className="field-hint">
            Existing account totals are stored as a snapshot. The import does not create cash
            releases, payment entries, or guessed installment history.
          </p>
          <div className="field">
            <label className="field-label" htmlFor="jamo-nh-csv">CSV file</label>
            <input
              id="jamo-nh-csv"
              className="input"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              disabled={loadingFile || importing}
            />
            {fileName && <p className="field-hint">Selected: {fileName}</p>}
          </div>
          {pageError && <div className="alert" role="alert">{pageError}</div>}
          {loadingFile && <p className="field-hint">Reading and validating the account rows...</p>}
          {importResult && (
            <div className="sms-result" role="status">
              Import complete: {importResult.inserted} new accounts added and {importResult.updated} existing accounts updated.
            </div>
          )}
        </section>

        {preview && (
          <>
            <section className="panel">
              <div className="panel-header"><h2>Import preview</h2></div>
              <div className="inhouse-import-summary">
                <span><strong>{preview.rows.length}</strong> valid accounts</span>
                <span><strong>{preview.issues.length}</strong> row errors</span>
              </div>
              {preview.issues.length > 0 && (
                <div className="alert" role="alert">
                  <strong>Fix these rows in the CSV, then upload it again.</strong>
                  <ul className="inhouse-import-issues">
                    {preview.issues.map((issue, index) => (
                      <li key={index}>Row {issue.row}: {issue.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.warnings.length > 0 && (
                <div className="inhouse-import-warning" role="status">
                  {preview.warnings.length} optional value(s) could not be read and will be left blank.
                  <ul className="inhouse-import-issues">
                    {preview.warnings.slice(0, 12).map((warning, index) => (
                      <li key={index}>Row {warning.row}: {warning.message}</li>
                    ))}
                  </ul>
                  {preview.warnings.length > 12 && <p>Showing 12 of {preview.warnings.length} warnings.</p>}
                </div>
              )}
              <div className="table-scroll">
                <table className="inhouse-import-table">
                  <thead>
                    <tr>
                      <th scope="col">CSV row</th>
                      <th scope="col">Client ID</th>
                      <th scope="col">Loan ID</th>
                      <th scope="col">Borrower</th>
                      <th scope="col">Principal</th>
                      <th scope="col">Principal balance</th>
                      <th scope="col">Total balance</th>
                      <th scope="col">Due date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.import_key}>
                        <th scope="row">{row.source_row}</th>
                        <td>{row.client_id}</td>
                        <td>{row.loan_id ?? "Generated from client and row"}</td>
                        <td>{row.full_name}</td>
                        <td>{formatCurrency(row.principal)}</td>
                        <td>{row.principal_balance == null ? "—" : formatCurrency(row.principal_balance)}</td>
                        <td>{row.total_balance == null ? "—" : formatCurrency(row.total_balance)}</td>
                        <td>{row.due_on}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="sms-button-row">
                <button
                  type="button"
                  className="button-primary"
                  onClick={handleImport}
                  disabled={importing || preview.issues.length > 0 || preview.rows.length === 0}
                >
                  {importing ? "Saving accounts..." : "Import " + preview.rows.length + " accounts"}
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}



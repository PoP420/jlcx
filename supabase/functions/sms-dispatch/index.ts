import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-sms-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;
type TemplateRow = { id: string; name: string; message: string; active: boolean };
type ConfigRow = { dry_run: boolean; daily_limit: number; reminder_days_before: number[]; escalation_days_after: number[] };

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const body = await request.json() as JsonRecord;
    const action = body.action;
    if (action === "scheduled") return await runScheduled(request);
    if (action !== "send") return json({ error: "Unsupported action." }, 400);

    const user = await authenticateUser(request);
    if (user instanceof Response) return user;
    const templateName = typeof body.templateName === "string" ? body.templateName : "";
    if (templateName === "overdue_collector") return json({ error: "Collector escalation templates run through the scheduled workflow." }, 400);
    const loanIds = Array.isArray(body.loanIds)
      ? [...new Set(body.loanIds.filter((id): id is string => typeof id === "string"))]
      : [];
    if (!templateName || loanIds.length === 0 || loanIds.length > 3) {
      return json({ error: "Choose a template and between 1 and 3 loans per request." }, 400);
    }

    const { data: profile, error: profileError } = await admin.from("profiles")
      .select("role").eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;
    const isAdmin = profile?.role === "admin";
    const [{ data: template, error: templateError }, { data: config, error: configError }, { data: loans, error: loansError }] = await Promise.all([
      admin.from("sms_templates").select("id,name,message,active").eq("name", templateName).eq("active", true).maybeSingle(),
      admin.from("sms_config").select("dry_run,daily_limit,reminder_days_before,escalation_days_after").eq("id", 1).single(),
      admin.from("loans")
        .select("id,borrower_name,borrower_phone,borrower_sms_consent,borrower_sms_opted_out,outstanding_balance,principal,due_on,collector_id,status,borrower:borrowers(full_name,phone),collector:collectors(name,phone,created_by),installments:loan_installments(id,due_on,expected_principal,expected_interest,principal_paid,interest_paid,status)")
        .in("id", loanIds).eq("status", "active"),
    ]);
    if (templateError) throw templateError;
    if (configError) throw configError;
    if (loansError) throw loansError;
    if (!template) return json({ error: "The selected SMS template is not active." }, 404);
    if (!loans || loans.length !== loanIds.length) return json({ error: "One or more loans could not be found." }, 404);
    if (loans.some((loan) => !loan.borrower_sms_consent || loan.borrower_sms_opted_out)) {
      return json({ error: "Every selected borrower must have recorded SMS consent and must not have opted out." }, 400);
    }

    const forbidden = loans.some((loan) => {
      const collector = asRecord(loan.collector);
      return !isAdmin && (!collector || collector.created_by !== user.id);
    });
    if (forbidden) return json({ error: "You do not have access to every selected loan." }, 403);

    const results = [];
    for (const loan of loans) {
      const borrower = asRecord(loan.borrower);
      const collector = asRecord(loan.collector);
      const installment = (Array.isArray(loan.installments) ? loan.installments : [])
        .filter((item) => item.status === "pending" || item.status === "partial" || item.status === "overdue")
        .sort((left, right) => String(left.due_on).localeCompare(String(right.due_on)))[0];
      const amountDue = installment
        ? Math.max(0, Number(installment.expected_principal) + Number(installment.expected_interest) - Number(installment.principal_paid) - Number(installment.interest_paid))
        : Number(loan.outstanding_balance ?? loan.principal ?? 0);
      const recipient = String(loan.borrower_phone ?? borrower?.phone ?? "");
      const rendered = renderTemplate((template as TemplateRow).message, {
        borrower_name: String(borrower?.full_name ?? loan.borrower_name ?? "Borrower"),
        amount_due: amountDue.toFixed(2),
        outstanding_balance: String(loan.outstanding_balance ?? loan.principal ?? "0.00"),
        due_date: String(installment?.due_on ?? loan.due_on ?? ""),
        collector_name: String(collector?.name ?? ""),
        collector_phone: String(collector?.phone ?? ""),
      });
      const result = await dispatch({
        loanId: String(loan.id), installmentId: installment ? String(installment.id) : null,
        borrowerName: String(borrower?.full_name ?? loan.borrower_name ?? "Borrower"),
        mobile: recipient, template: template as TemplateRow, message: rendered,
        triggeredBy: "manual", userId: user.id, scheduledFor: null,
        idempotencyKey: `manual:${crypto.randomUUID()}`, config: config as ConfigRow,
      });
      results.push(result);
    }
    return json({ results });
  } catch (error) {
    console.error("SMS dispatch failed:", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "The SMS request could not be completed." }, 500);
  }
});

async function runScheduled(request: Request): Promise<Response> {
  const expectedSecret = Deno.env.get("SMS_CRON_SECRET");
  if (!expectedSecret || request.headers.get("x-sms-cron-secret") !== expectedSecret) {
    return json({ error: "Unauthorized scheduled request." }, 401);
  }
  const { data: config, error: configError } = await admin.from("sms_config")
    .select("dry_run,daily_limit,reminder_days_before,escalation_days_after").eq("id", 1).single();
  if (configError) throw configError;
  const today = manilaDate();
  const currentHour = manilaHour();
  if (currentHour < 8 || currentHour >= 17) return json({ results: [], skipped: "Outside the scheduled SMS window." });
  const settings = config as ConfigRow;
  const results = [];
  const batchLimit = 3;

  const windows = [
    ...settings.reminder_days_before.map((days) => ({ days, direction: "before", templateName: "payment_due" })),
    ...settings.escalation_days_after.map((days) => ({ days, direction: "after", templateName: "payment_overdue" })),
  ];
  for (const window of windows) {
    const dueDate = addDays(today, window.direction === "before" ? window.days : -window.days);
    const { data: template, error: templateError } = await admin.from("sms_templates")
      .select("id,name,message,active").eq("name", window.templateName).eq("active", true).maybeSingle();
    if (templateError) throw templateError;
    if (!template) continue;
    const { data: installments, error } = await admin.from("loan_installments")
      .select("id,loan_id,due_on,expected_principal,expected_interest,principal_paid,interest_paid,status,loan:loans!inner(id,borrower_name,borrower_phone,borrower_sms_consent,borrower_sms_opted_out,outstanding_balance,principal,status,borrower:borrowers(full_name,phone),collector:collectors(id,name,phone,sms_enabled))")
      .eq("due_on", dueDate).in("status", ["pending", "partial", "overdue"])
      .eq("loan.status", "active").eq("loan.borrower_sms_consent", true).eq("loan.borrower_sms_opted_out", false);
    if (error) throw error;
    const dueKeys = (installments ?? []).map((row) => `${window.direction === "before" ? "due" : "overdue"}:${row.id}:${window.days}:${today}`);
    const { data: priorLogs, error: priorError } = dueKeys.length
      ? await admin.from("sms_send_log").select("idempotency_key").in("idempotency_key", dueKeys)
      : { data: [], error: null };
    if (priorError) throw priorError;
    const completedKeys = new Set((priorLogs ?? []).map((row) => String(row.idempotency_key)));

    const collectors = new Map<string, { loanId: string; name: string; phone: string; loans: Set<string> }>();
    for (const row of installments ?? []) {
      if (results.length >= batchLimit) break;
      const idempotencyKey = `${window.direction === "before" ? "due" : "overdue"}:${row.id}:${window.days}:${today}`;
      if (completedKeys.has(idempotencyKey)) continue;
      const loan = asRecord(row.loan) ?? {};
      const borrower = asRecord(loan.borrower);
      const due = Math.max(0,
        Number(row.expected_principal) + Number(row.expected_interest)
        - Number(row.principal_paid) - Number(row.interest_paid));
      const mobile = String(loan.borrower_phone ?? borrower?.phone ?? "");
      const name = String(borrower?.full_name ?? loan.borrower_name ?? "Borrower");
      const loanCollector = asRecord(loan.collector);
      if (window.direction === "after" && loanCollector?.id && loanCollector.phone && loanCollector.sms_enabled) {
        const collectorId = String(loanCollector.id);
        const group = collectors.get(collectorId) ?? {
          loanId: String(row.loan_id), name: String(loanCollector.name ?? "Collector"),
          phone: String(loanCollector.phone), loans: new Set<string>(),
        };
        group.loans.add(String(row.loan_id));
        collectors.set(collectorId, group);
      }
      const message = renderTemplate((template as TemplateRow).message, {
        borrower_name: name,
        amount_due: due.toFixed(2),
        outstanding_balance: String(loan.outstanding_balance ?? loan.principal ?? "0.00"),
        due_date: String(row.due_on),
        collector_name: String(loanCollector?.name ?? ""),
        collector_phone: String(loanCollector?.phone ?? ""),
      });
      results.push(await dispatch({
        loanId: String(row.loan_id), installmentId: String(row.id), borrowerName: name,
        mobile, template: template as TemplateRow, message, triggeredBy: "scheduled",
        userId: null, scheduledFor: today,
        idempotencyKey,
        config: config as ConfigRow,
      }));
    }
    if (window.direction === "after" && collectors.size > 0) {
      const { data: collectorTemplate, error: collectorTemplateError } = await admin.from("sms_templates")
        .select("id,name,message,active").eq("name", "overdue_collector").eq("active", true).maybeSingle();
      if (collectorTemplateError) throw collectorTemplateError;
      if (collectorTemplate) for (const [collectorId, group] of collectors) {
        if (results.length >= batchLimit) break;
        const idempotencyKey = `collector-overdue:${collectorId}:${window.days}:${today}`;
        const { data: prior, error: priorCollectorError } = await admin.from("sms_send_log")
          .select("id").eq("idempotency_key", idempotencyKey).maybeSingle();
        if (priorCollectorError) throw priorCollectorError;
        if (prior) continue;
        const message = renderTemplate(collectorTemplate.message, {
          collector_name: group.name, overdue_count: String(group.loans.size),
          borrower_name: "", amount_due: "", outstanding_balance: "", due_date: "", collector_phone: group.phone,
        });
        results.push(await dispatch({
          loanId: group.loanId, installmentId: null, borrowerName: group.name,
          mobile: group.phone, template: collectorTemplate as TemplateRow, message,
          triggeredBy: "scheduled", userId: null, scheduledFor: today,
          idempotencyKey,
          config: config as ConfigRow,
        }));
      }
    }
  }

  const maturityDate = addDays(today, 1);
  const [{ data: maturityTemplate, error: maturityTemplateError }, { data: loans, error: maturityError }] = await Promise.all([
    admin.from("sms_templates").select("id,name,message,active").eq("name", "loan_maturity").eq("active", true).maybeSingle(),
    admin.from("loans").select("id,borrower_name,borrower_phone,borrower_sms_consent,borrower_sms_opted_out,outstanding_balance,principal,due_on,status,borrower:borrowers(full_name,phone),collector:collectors(name,phone)")
      .eq("due_on", maturityDate).eq("status", "active").eq("borrower_sms_consent", true).eq("borrower_sms_opted_out", false),
  ]);
  if (maturityTemplateError) throw maturityTemplateError;
  if (maturityError) throw maturityError;
  const maturityKeys = (loans ?? []).map((loan) => `maturity:${loan.id}:${maturityDate}`);
  const { data: priorMaturityLogs, error: priorMaturityError } = maturityKeys.length
    ? await admin.from("sms_send_log").select("idempotency_key").in("idempotency_key", maturityKeys)
    : { data: [], error: null };
  if (priorMaturityError) throw priorMaturityError;
  const completedMaturities = new Set((priorMaturityLogs ?? []).map((row) => String(row.idempotency_key)));
  if (maturityTemplate) for (const loan of loans ?? []) {
    if (results.length >= batchLimit) break;
    const idempotencyKey = `maturity:${loan.id}:${maturityDate}`;
    if (completedMaturities.has(idempotencyKey)) continue;
    const borrower = asRecord(loan.borrower);
    const name = String(borrower?.full_name ?? loan.borrower_name ?? "Borrower");
    const balance = Number(loan.outstanding_balance ?? loan.principal ?? 0);
    if (balance <= 0) continue;
    const message = renderTemplate(maturityTemplate.message, {
      borrower_name: name, amount_due: balance.toFixed(2), outstanding_balance: balance.toFixed(2),
      due_date: String(loan.due_on), collector_name: String(asRecord(loan.collector)?.name ?? ""),
      collector_phone: String(asRecord(loan.collector)?.phone ?? ""),
    });
    results.push(await dispatch({
      loanId: String(loan.id), installmentId: null, borrowerName: name,
      mobile: String(loan.borrower_phone ?? borrower?.phone ?? ""),
      template: maturityTemplate as TemplateRow, message, triggeredBy: "scheduled", userId: null,
      scheduledFor: today, idempotencyKey,
      config: config as ConfigRow,
    }));
  }
  return json({ results });
}

interface DispatchInput {
  loanId: string;
  installmentId: string | null;
  borrowerName: string;
  mobile: string;
  template: TemplateRow;
  message: string;
  triggeredBy: "manual" | "scheduled";
  userId: string | null;
  scheduledFor: string | null;
  idempotencyKey: string;
  config: ConfigRow;
}

async function dispatch(input: DispatchInput): Promise<JsonRecord> {
  const mobile = normalizePhone(input.mobile);
  const { data: reservation, error: reserveError } = await admin.rpc("reserve_sms_dispatch", {
    p_loan_id: input.loanId,
    p_installment_id: input.installmentId,
    p_borrower_name: input.borrowerName,
    p_borrower_mobile: mobile ?? (input.mobile || "(missing)"),
    p_template_name: input.template.name,
    p_message: input.message,
    p_triggered_by: input.triggeredBy,
    p_triggered_by_user: input.userId,
    p_idempotency_key: input.idempotencyKey,
    p_scheduled_for: input.scheduledFor,
    p_daily_limit: input.config.daily_limit,
  });
  if (reserveError) throw reserveError;
  const reservationRow = Array.isArray(reservation) ? reservation[0] : null;
  if (!reservationRow) return { loanId: input.loanId, status: "failed", error: "Daily SMS limit reached." };
  if (reservationRow.inserted === false) return { loanId: input.loanId, status: "duplicate" };

  if (!mobile) {
    const message = "Borrower phone is missing or invalid.";
    await admin.from("sms_send_log").update({ status: "failed", error_message: message }).eq("id", reservationRow.log_id);
    return { loanId: input.loanId, status: "failed", error: message };
  }
  if (!input.message || /{{\s*[\w]+\s*}}/.test(input.message)) {
    const message = "The SMS template has missing or unsupported variables.";
    await admin.from("sms_send_log").update({ status: "failed", error_message: message }).eq("id", reservationRow.log_id);
    return { loanId: input.loanId, status: "failed", error: message };
  }

  if (input.config.dry_run) {
    await admin.from("sms_send_log").update({ status: "dry_run" }).eq("id", reservationRow.log_id);
    return { loanId: input.loanId, status: "dry_run" };
  }

  try {
    const apiKey = Deno.env.get("MAXXTEXT_APPKEY");
    const originator = Deno.env.get("MAXXTEXT_ORIGINATOR");
    if (!apiKey || !originator) throw new Error("SMS provider is not configured.");
    const response = await fetch(Deno.env.get("MAXXTEXT_API_URL") ?? "https://svr36.synermaxx.asia/api/sendmsg.php", {
      method: "POST",
      headers: { "Content-Type": "application/json", appkey: apiKey },
      body: JSON.stringify({
        mobilenum: mobile,
        originator,
        fullmesq: encodeURIComponent(input.message),
        blackhole: 0,
        client_outboxnum: String(reservationRow.log_id),
        format: "json",
      }),
      signal: AbortSignal.timeout(15000),
    });
    const provider = await response.json() as JsonRecord;
    const accepted = response.ok && Number(provider.code) === 200 && provider.status === "ACK";
    const status = accepted ? "sent" : "failed";
    const errorMessage = accepted ? null : String(provider.desc ?? `MAXXtext returned ${provider.status ?? response.status}.`);
    const { error: updateError } = await admin.from("sms_send_log").update({
      status,
      provider_ref: accepted && provider.transid != null ? String(provider.transid) : null,
      provider_code: Number.isFinite(Number(provider.code)) ? Number(provider.code) : response.status,
      error_message: errorMessage,
      sent_at: accepted ? new Date().toISOString() : null,
    }).eq("id", reservationRow.log_id);
    if (updateError) throw updateError;
    return { loanId: input.loanId, status, providerRef: accepted ? provider.transid : undefined, error: errorMessage };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider request failed.";
    await admin.from("sms_send_log").update({ status: "failed", error_message: message.slice(0, 300) })
      .eq("id", reservationRow.log_id);
    return { loanId: input.loanId, status: "failed", error: message };
  }
}

async function authenticateUser(request: Request): Promise<{ id: string } | Response> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in to send SMS." }, 401);
  const client = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await client.auth.getUser(token);
  return error || !data.user ? json({ error: "Your session is invalid or expired." }, 401) : { id: data.user.id };
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/{{\s*([a-z_]+)\s*}}/g, (_match, key: string) => values[key] ?? "");
}

function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (/^09\d{9}$/.test(digits)) return `63${digits.slice(1)}`;
  if (/^639\d{9}$/.test(digits)) return digits;
  return null;
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function manilaDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function manilaHour(): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function json(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

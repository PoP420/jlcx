import { supabase } from "./supabase";
import { todayIso } from "./calculator";
import {
  countsTotal,
  emptyDenominationCounts,
  type DenominationCounts,
} from "./denominations";

export type { DenominationCounts };

export interface Profile {
  id: string;
  full_name: string | null;
  role: string;
  created_at: string;
}

export interface Collector {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  created_by: string;
  created_at: string;
}

export interface CashLedgerEntry {
  id: string;
  collector_id: string | null;
  loan_id: string | null;
  type: "release" | "collection" | "expense" | "transfer_in" | "transfer_out";
  amount: number;
  note: string | null;
  category: string | null;
  reference: string | null;
  counterparty: string | null;
  denominations: DenominationCounts | null;
  occurred_on: string;
  created_at: string;
}

export interface CashOpening {
  collector_id: string | null;
  occurred_on: string;
  amount: number;
  denominations: DenominationCounts;
  updated_at: string;
}

export type PositionMode = "bank" | "digital";
export type PositionAccount = "metrobank" | "eastwest" | "jamo_savings" | "gcash" | "cebuana";
export type PositionDirection = "inflow" | "outflow";

export interface PositionOpening {
  id: string;
  created_by: string;
  mode: PositionMode;
  account_code: PositionAccount;
  occurred_on: string;
  amount: number;
}

export interface PositionEntry {
  id: string;
  mode: PositionMode;
  account_code: PositionAccount;
  direction: PositionDirection;
  category: string;
  reference: string | null;
  counterparty: string | null;
  amount: number;
  note: string | null;
  occurred_on: string;
  created_at: string;
}

export interface PhysicalCashCount {
  occurred_on: string;
  amount: number;
  denominations: DenominationCounts;
  ownDenominations: DenominationCounts;
}

export interface DashboardStats {
  cashOnHand: number;
  activeLoans: number;
  outstandingBalance: number;
  collectionsToday: number;
}

export interface ServiceResult<T> {
  data: T | null;
  error: string | null;
}

/** Reads bank and digital openings and movements for one report date. */
export async function fetchPositionData(occurredOn: string): Promise<ServiceResult<{
  openings: PositionOpening[];
  ownOpenings: Partial<Record<PositionAccount, number>>;
  entries: PositionEntry[];
}>> {
  const userId = await currentUserId();
  if (!userId) return { data: null, error: "Not signed in." };
  const [openingsResult, entriesResult] = await Promise.all([
    supabase.from("cash_position_openings")
      .select("id, created_by, mode, account_code, occurred_on, amount")
      .eq("occurred_on", occurredOn),
    supabase.from("cash_position_ledger")
      .select("id, mode, account_code, direction, category, reference, counterparty, amount, note, occurred_on, created_at")
      .eq("occurred_on", occurredOn)
      .order("created_at", { ascending: true }),
  ]);
  if (openingsResult.error) return { data: null, error: openingsResult.error.message };
  if (entriesResult.error) return { data: null, error: entriesResult.error.message };
  return {
    data: {
      openings: (openingsResult.data ?? []).map((row) => ({
        id: String(row.id), created_by: String(row.created_by), mode: row.mode as PositionMode, account_code: row.account_code as PositionAccount,
        occurred_on: String(row.occurred_on), amount: Number(row.amount),
      })),
      ownOpenings: Object.fromEntries((openingsResult.data ?? [])
        .filter((row) => row.created_by === userId)
        .map((row) => [row.account_code, Number(row.amount)])) as Partial<Record<PositionAccount, number>>,
      entries: (entriesResult.data ?? []).map((row) => ({
        id: String(row.id), mode: row.mode as PositionMode, account_code: row.account_code as PositionAccount,
        direction: row.direction as PositionDirection, category: String(row.category),
        reference: row.reference == null ? null : String(row.reference),
        counterparty: row.counterparty == null ? null : String(row.counterparty), amount: Number(row.amount),
        note: row.note == null ? null : String(row.note),
        occurred_on: String(row.occurred_on), created_at: String(row.created_at),
      })),
    },
    error: null,
  };
}

export async function setPositionOpening(
  mode: PositionMode, accountCode: PositionAccount, occurredOn: string, amount: number,
): Promise<ServiceResult<PositionOpening>> {
  const userId = await currentUserId();
  if (!userId) return { data: null, error: "Not signed in." };
  const { data, error } = await supabase.from("cash_position_openings")
    .upsert({ mode, account_code: accountCode, occurred_on: occurredOn, amount, created_by: userId },
      { onConflict: "created_by,account_code,occurred_on" })
    .select("id, created_by, mode, account_code, occurred_on, amount")
    .single();
  if (error) return { data: null, error: error.message };
  return { data: {
    id: String(data.id), created_by: String(data.created_by), mode: data.mode as PositionMode, account_code: data.account_code as PositionAccount,
    occurred_on: String(data.occurred_on), amount: Number(data.amount),
  }, error: null };
}

export async function recordPositionEntry(
  mode: PositionMode, accountCode: PositionAccount, direction: PositionDirection, amount: number,
  occurredOn: string, category: string, note: string, reference: string, counterparty: string,
): Promise<ServiceResult<PositionEntry>> {
  const userId = await currentUserId();
  if (!userId) return { data: null, error: "Not signed in." };
  if (category === "Cash deposit" || category === "Cash withdrawal") {
    const expected = category === "Cash deposit" ? "inflow" : "outflow";
    if (direction !== expected) {
      return { data: null, error: `${category} must be recorded as an ${expected}.` };
    }
    const { error } = await supabase.rpc("record_cash_position_transfer", {
      p_mode: mode, p_account_code: accountCode, p_direction: direction,
      p_amount: amount, p_occurred_on: occurredOn, p_category: category,
      p_reference: reference.trim() || null,
      p_counterparty: counterparty.trim() || null,
      p_note: note.trim() || null,
    });
    return error ? { data: null, error: error.message } : { data: null, error: null };
  }
  const { data, error } = await supabase.from("cash_position_ledger")
    .insert({ mode, account_code: accountCode, direction, amount, occurred_on: occurredOn,
      category, reference: reference.trim() || null, counterparty: counterparty.trim() || null,
      note: note.trim() || null, created_by: userId })
    .select("id, mode, account_code, direction, category, reference, counterparty, amount, note, occurred_on, created_at")
    .single();
  if (error) return { data: null, error: error.message };
  return { data: {
    id: String(data.id), mode: data.mode as PositionMode, account_code: data.account_code as PositionAccount,
    direction: data.direction as PositionDirection, category: String(data.category),
    reference: data.reference == null ? null : String(data.reference),
    counterparty: data.counterparty == null ? null : String(data.counterparty), amount: Number(data.amount),
    note: data.note == null ? null : String(data.note),
    occurred_on: String(data.occurred_on), created_at: String(data.created_at),
  }, error: null };
}

export async function fetchPhysicalCashCount(
  occurredOn: string,
): Promise<ServiceResult<PhysicalCashCount | null>> {
  const userId = await currentUserId();
  if (!userId) return { data: null, error: "Not signed in." };
  const { data, error } = await supabase.from("cash_position_counts")
    .select("created_by, occurred_on, amount, denominations")
    .eq("occurred_on", occurredOn);
  if (error) return { data: null, error: error.message };
  const combined = emptyDenominationCounts();
  let ownDenominations = emptyDenominationCounts();
  for (const row of data ?? []) {
    const rowCounts = asDenominations(row.denominations);
    if (row.created_by === userId) ownDenominations = rowCounts;
    for (const [denomination, count] of Object.entries(rowCounts)) {
      combined[denomination] = (combined[denomination] ?? 0) + count;
    }
  }
  return { data: data?.length ? {
    occurred_on: occurredOn, amount: countsTotal(combined), denominations: combined, ownDenominations,
  } : { occurred_on: occurredOn, amount: 0, denominations: combined, ownDenominations }, error: null };
}

export async function setPhysicalCashCount(
  occurredOn: string, denominations: DenominationCounts,
): Promise<ServiceResult<PhysicalCashCount>> {
  const userId = await currentUserId();
  if (!userId) return { data: null, error: "Not signed in." };
  const amount = countsTotal(denominations);
  const { data, error } = await supabase.from("cash_position_counts")
    .upsert({ occurred_on: occurredOn, amount, denominations, created_by: userId },
      { onConflict: "created_by,occurred_on" })
    .select("created_by, occurred_on, amount, denominations")
    .single();
  if (error) return { data: null, error: error.message };
  return { data: { occurred_on: String(data.occurred_on), amount: Number(data.amount),
    denominations: asDenominations(data.denominations), ownDenominations: asDenominations(data.denominations) }, error: null };
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function asDenominations(value: unknown): DenominationCounts {
  if (value == null || typeof value !== "object") {
    return emptyDenominationCounts();
  }
  const counts: DenominationCounts = {};
  for (const [key, count] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const parsed = Number(count);
    if (Number.isFinite(parsed) && parsed > 0) {
      counts[key] = parsed;
    }
  }
  return counts;
}

function asCollector(row: unknown): Collector {
  const value = row as Record<string, unknown>;
  return {
    id: String(value.id),
    name: String(value.name),
    phone: value.phone == null ? null : String(value.phone),
    active: Boolean(value.active),
    created_by: String(value.created_by),
    created_at: String(value.created_at),
  };
}

function asLedgerEntry(row: unknown): CashLedgerEntry {
  const value = row as Record<string, unknown>;
  return {
    id: String(value.id),
    collector_id: value.collector_id == null ? null : String(value.collector_id),
    loan_id: value.loan_id == null ? null : String(value.loan_id),
    type: value.type === "collection" ? "collection" : value.type === "expense" ? "expense" : value.type === "transfer_in" ? "transfer_in" : value.type === "transfer_out" ? "transfer_out" : "release",
    amount: Number(value.amount),
    note: value.note == null ? null : String(value.note),
    category: value.category == null ? null : String(value.category),
    reference: value.reference == null ? null : String(value.reference),
    counterparty: value.counterparty == null ? null : String(value.counterparty),
    denominations:
      value.denominations == null
        ? null
        : asDenominations(value.denominations),
    occurred_on: String(value.occurred_on),
    created_at: String(value.created_at),
  };
}

function asOpening(row: unknown): CashOpening {
  const value = row as Record<string, unknown>;
  return {
    collector_id: String(value.collector_id),
    occurred_on: String(value.occurred_on),
    amount: Number(value.amount),
    denominations: asDenominations(value.denominations),
    updated_at: String(value.updated_at),
  };
}

/** Reads (or lazily creates) the signed-in user's profile row. */
export async function fetchMyProfile(): Promise<ServiceResult<Profile | null>> {
  const userId = await currentUserId();
  if (!userId) return { data: null, error: "Not signed in." };

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at")
    .eq("id", userId)
    .single();

  if (error) {
    if (error.code !== "PGRST116") {
      return { data: null, error: error.message };
    }
    // No profile row yet (user existed before the migration/backfill).
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    const fallbackName =
      (user?.user_metadata?.full_name as string | undefined) ??
      user?.email?.split("@")[0] ??
      "Staff";
    const { data: created, error: insertError } = await supabase
      .from("profiles")
      .insert({ id: userId, full_name: fallbackName })
      .select("id, full_name, role, created_at")
      .single();
    if (insertError) return { data: null, error: insertError.message };
    return { data: created as unknown as Profile, error: null };
  }

  return { data: data as unknown as Profile, error: null };
}

export async function fetchCollectors(): Promise<ServiceResult<Collector[]>> {
  const { data, error } = await supabase
    .from("collectors")
    .select("id, name, phone, active, created_by, created_at")
    .order("name", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []).map(asCollector), error: null };
}

export async function createCollector(
  name: string,
  phone: string,
): Promise<ServiceResult<Collector>> {
  const userId = await currentUserId();
  if (!userId) return { data: null, error: "Not signed in." };

  const { data, error } = await supabase
    .from("collectors")
    .insert({ name, phone: phone.length > 0 ? phone : null, created_by: userId })
    .select("id, name, phone, active, created_by, created_at")
    .single();

  if (error) return { data: null, error: error.message };
  return { data: asCollector(data), error: null };
}

/** Sum of starting cash for the given collector (or every collector) on a date. */
export async function fetchOpeningTotal(
  collectorId: string | null,
  occurredOn: string,
): Promise<ServiceResult<number>> {
  let query = supabase
    .from("cash_opening")
    .select("amount")
    .eq("occurred_on", occurredOn);
  if (collectorId) query = query.eq("collector_id", collectorId);

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };

  const total = (data ?? []).reduce(
    (sum, row) => sum + Number((row as Record<string, unknown>).amount),
    0,
  );
  return { data: total, error: null };
}

/** Reads the starting cash for a collector, or the shared pool (null). */
export async function fetchOpening(
  collectorId: string | null,
  occurredOn: string,
): Promise<ServiceResult<CashOpening | null>> {
  let query = supabase
    .from("cash_opening")
    .select("collector_id, occurred_on, amount, denominations, updated_at")
    .eq("occurred_on", occurredOn);

  query = collectorId
    ? query.eq("collector_id", collectorId)
    : query.is("collector_id", null);

  const { data, error } = await query.maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: data ? asOpening(data) : null, error: null };
}

/**
 * Sets (or replaces) the starting cash for a date.
 * A null collectorId writes the shared pool that all
 * collectors release from.
 */
export async function setCashOpening(
  occurredOn: string,
  denominations: DenominationCounts,
  collectorId: string | null = null,
): Promise<ServiceResult<CashOpening>> {
  const userId = await currentUserId();
  if (!userId) return { data: null, error: "Not signed in." };

  const amount = countsTotal(denominations);
  const columns =
    "collector_id, occurred_on, amount, denominations, updated_at";

  if (collectorId) {
    const { data, error } = await supabase
      .from("cash_opening")
      .upsert(
        {
          collector_id: collectorId,
          occurred_on: occurredOn,
          amount,
          denominations,
          created_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "collector_id,occurred_on" },
      )
      .select(columns)
      .single();

    if (error) return { data: null, error: error.message };
    return { data: asOpening(data), error: null };
  }

  // The shared pool row has a null collector_id, which ON CONFLICT
  // cannot match, so update the existing row or insert explicitly.
  const { data: existing, error: selectError } = await supabase
    .from("cash_opening")
    .select(columns)
    .is("collector_id", null)
    .eq("occurred_on", occurredOn)
    .maybeSingle();

  if (selectError) return { data: null, error: selectError.message };

  if (existing) {
    const { data, error } = await supabase
      .from("cash_opening")
      .update({
        amount,
        denominations,
        updated_at: new Date().toISOString(),
      })
      .is("collector_id", null)
      .eq("occurred_on", occurredOn)
      .select(columns)
      .single();

    if (error) return { data: null, error: error.message };
    return { data: asOpening(data), error: null };
  }

  const { data, error } = await supabase
    .from("cash_opening")
    .insert({
      collector_id: null,
      occurred_on: occurredOn,
      amount,
      denominations,
      created_by: userId,
      updated_at: new Date().toISOString(),
    })
    .select(columns)
    .single();

  if (error) return { data: null, error: error.message };
  return { data: asOpening(data), error: null };
}

/**
 * Records a cash release to a borrower. A loan row is created implicitly so
 * the disbursement is traceable and feeds the dashboard loan statistics.
 */
export async function recordCashRelease(
  collectorId: string,
  borrowerName: string,
  amount: number,
  reference: string,
  note: string,
  occurredOn: string,
  denominations: DenominationCounts,
): Promise<ServiceResult<{ loanId: string; entryId: string }>> {
  const userId = await currentUserId();
  if (!userId) return { data: null, error: "Not signed in." };

  const { data: loan, error: loanError } = await supabase
    .from("loans")
    .insert({
      borrower_name: borrowerName,
      principal: amount,
      collector_id: collectorId,
      status: "active",
    })
    .select("id")
    .single();

  if (loanError) return { data: null, error: loanError.message };

  const { data: entry, error: entryError } = await supabase
    .from("cash_ledger")
    .insert({
      collector_id: collectorId,
      loan_id: loan.id,
      type: "release",
      amount,
      category: "Loan disbursement",
      reference: reference.trim() || null,
      counterparty: borrowerName,
      denominations,
      note: note.trim() || null,
      occurred_on: occurredOn,
      created_by: userId,
    })
    .select("id")
    .single();

  if (entryError) return { data: null, error: entryError.message };
  return { data: { loanId: loan.id, entryId: entry.id }, error: null };
}

export async function recordCashCollection(
  collectorId: string,
  amount: number,
  payerName: string,
  note: string,
  occurredOn: string,
  reference = "",
): Promise<ServiceResult<CashLedgerEntry>> {
  const userId = await currentUserId();
  if (!userId) return { data: null, error: "Not signed in." };

  const { data, error } = await supabase
    .from("cash_ledger")
    .insert({
      collector_id: collectorId,
      type: "collection",
      amount,
      category: "Cash collection",
      counterparty: payerName.trim() || null,
      reference: reference.trim() || null,
      note: note.trim() || null,
      occurred_on: occurredOn,
      created_by: userId,
    })
    .select(
      "id, collector_id, loan_id, type, amount, note, category, reference, counterparty, occurred_on, created_at",
    )
    .single();

  if (error) return { data: null, error: error.message };
  return { data: asLedgerEntry(data), error: null };
}

export async function recordCashExpense(
  amount: number, occurredOn: string, category: string, payee: string,
  reference: string, note: string,
): Promise<ServiceResult<CashLedgerEntry>> {
  const userId = await currentUserId();
  if (!userId) return { data: null, error: "Not signed in." };
  const { data, error } = await supabase.from("cash_ledger")
    .insert({
      type: "expense", amount, occurred_on: occurredOn, category,
      counterparty: payee.trim() || null, reference: reference.trim() || null,
      note: note.trim() || null, created_by: userId,
    })
    .select("id, collector_id, loan_id, type, amount, note, category, reference, counterparty, denominations, occurred_on, created_at")
    .single();
  if (error) return { data: null, error: error.message };
  return { data: asLedgerEntry(data), error: null };
}

/** Ledger entries for a collector (or every collector) on a date, oldest first. */
export async function fetchLedger(
  collectorId: string | null,
  occurredOn: string,
): Promise<ServiceResult<CashLedgerEntry[]>> {
  let query = supabase
    .from("cash_ledger")
    .select(
      "id, collector_id, loan_id, type, amount, note, category, reference, counterparty, denominations, occurred_on, created_at",
    )
    .eq("occurred_on", occurredOn)
    .order("created_at", { ascending: true });
  if (collectorId) query = query.eq("collector_id", collectorId);

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []).map(asLedgerEntry), error: null };
}

/** Cash on hand = opening cash - releases + collections. */
export async function fetchCashOnHand(
  collectorId: string | null,
  occurredOn: string = todayIso(),
): Promise<ServiceResult<number>> {
  const [openingResult, ledgerResult] = await Promise.all([
    fetchOpeningTotal(collectorId, occurredOn),
    fetchLedger(collectorId, occurredOn),
  ]);

  if (openingResult.error) return { data: null, error: openingResult.error };
  if (ledgerResult.error) return { data: null, error: ledgerResult.error };

  const entries = ledgerResult.data ?? [];
  const released = entries
    .filter((entry) => entry.type === "release" || entry.type === "expense" || entry.type === "transfer_out")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const collected = entries
    .filter((entry) => entry.type === "collection" || entry.type === "transfer_in")
    .reduce((sum, entry) => sum + entry.amount, 0);

  return {
    data: (openingResult.data ?? 0) - released + collected,
    error: null,
  };
}

/** Aggregates used by the dashboard. */
export async function fetchDashboardStats(
  occurredOn: string = todayIso(),
): Promise<ServiceResult<DashboardStats>> {
  const [cashResult, loansResult, allCollectionsResult, todayCollectionsResult] =
    await Promise.all([
      fetchCashOnHand(null, occurredOn),
      supabase.from("loans").select("principal").eq("status", "active"),
      supabase.from("cash_ledger").select("amount").eq("type", "collection"),
      supabase
        .from("cash_ledger")
        .select("amount")
        .eq("type", "collection")
        .eq("occurred_on", occurredOn),
    ]);

  if (cashResult.error) return { data: null, error: cashResult.error };
  if (loansResult.error) {
    return { data: null, error: loansResult.error.message };
  }
  if (allCollectionsResult.error) {
    return { data: null, error: allCollectionsResult.error.message };
  }
  if (todayCollectionsResult.error) {
    return { data: null, error: todayCollectionsResult.error.message };
  }

  const outstanding =
    (loansResult.data ?? []).reduce(
      (sum, row) => sum + Number((row as Record<string, unknown>).principal),
      0,
    ) -
    (allCollectionsResult.data ?? []).reduce(
      (sum, row) => sum + Number((row as Record<string, unknown>).amount),
      0,
    );

  const collectionsToday = (todayCollectionsResult.data ?? []).reduce(
    (sum, row) => sum + Number((row as Record<string, unknown>).amount),
    0,
  );

  const activeLoans = loansResult.data?.length ?? 0;

  return {
    data: {
      cashOnHand: cashResult.data ?? 0,
      activeLoans,
      outstandingBalance: outstanding,
      collectionsToday,
    },
    error: null,
  };
}

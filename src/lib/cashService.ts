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
  type: "release" | "collection";
  amount: number;
  note: string | null;
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
    type: value.type === "collection" ? "collection" : "release",
    amount: Number(value.amount),
    note: value.note == null ? null : String(value.note),
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

  const details = [
    reference.trim() ? `Ref ${reference.trim()}` : "",
    note.trim(),
  ]
    .filter(Boolean)
    .join(" - ");

  const { data: entry, error: entryError } = await supabase
    .from("cash_ledger")
    .insert({
      collector_id: collectorId,
      loan_id: loan.id,
      type: "release",
      amount,
      denominations,
      note: details.length > 0 ? details : null,
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
): Promise<ServiceResult<CashLedgerEntry>> {
  const userId = await currentUserId();
  if (!userId) return { data: null, error: "Not signed in." };

  const details = [
    payerName.trim() ? `From ${payerName.trim()}` : "",
    note.trim(),
  ]
    .filter(Boolean)
    .join(" - ");

  const { data, error } = await supabase
    .from("cash_ledger")
    .insert({
      collector_id: collectorId,
      type: "collection",
      amount,
      note: details.length > 0 ? details : null,
      occurred_on: occurredOn,
      created_by: userId,
    })
    .select(
      "id, collector_id, loan_id, type, amount, note, occurred_on, created_at",
    )
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
      "id, collector_id, loan_id, type, amount, note, denominations, occurred_on, created_at",
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
    .filter((entry) => entry.type === "release")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const collected = entries
    .filter((entry) => entry.type === "collection")
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

import { supabase } from "./supabase";
import type { JamoNhImportRow } from "./jamoNhImport";

export interface JamoNhImportResult {
  inserted: number;
  updated: number;
}

export async function importJamoNhActiveAccounts(
  rows: JamoNhImportRow[],
): Promise<{ data: JamoNhImportResult | null; error: string | null }> {
  if (rows.length === 0) return { data: null, error: "There are no valid accounts to import." };
  const { data, error } = await supabase.rpc("import_jamo_nh_active_accounts", { p_rows: rows });
  if (error) return { data: null, error: error.message };

  const summary = Array.isArray(data) ? data[0] : data;
  if (!summary || typeof summary !== "object") {
    return { data: null, error: "Supabase completed the import but did not return a summary." };
  }
  const result = summary as Record<string, unknown>;
  return {
    data: {
      inserted: Number(result.inserted_count ?? 0),
      updated: Number(result.updated_count ?? 0),
    },
    error: null,
  };
}


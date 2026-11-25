-- Preserve source workbook labels and row numbers for imported portfolio records.
alter table public.loans
  add column if not exists source_status text,
  add column if not exists source_row integer;

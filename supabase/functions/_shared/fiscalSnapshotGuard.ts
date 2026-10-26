/**
 * Fail-closed fiscal snapshot guard for derived economy recomputes.
 * An unavailable snapshot must never be mistaken for an unchanged treasury.
 * This module is pure and does not read or write the database.
 */
export interface FiscalSnapshot {
  data: readonly Record<string, unknown>[] | null;
  error?: unknown;
}

export function isReadableFiscalSnapshot(snapshot: FiscalSnapshot): boolean {
  if (snapshot.error || !Array.isArray(snapshot.data) || snapshot.data.length === 0) return false;
  const names = snapshot.data.map(row => row && row.player_name);
  return names.every(name => typeof name === "string" && name.length > 0)
    && new Set(names).size === names.length;
}

export function fiscalSnapshotsEqual(before: FiscalSnapshot, after: FiscalSnapshot): boolean {
  if (!isReadableFiscalSnapshot(before) || !isReadableFiscalSnapshot(after)) return false;
  const stable = (rows: readonly Record<string, unknown>[]) =>
    JSON.stringify([...rows].sort((a, b) => String(a.player_name).localeCompare(String(b.player_name))));
  return stable(before.data!) === stable(after.data!);
}

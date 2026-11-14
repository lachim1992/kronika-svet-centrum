/** Every number in Atlas carries exactly one of these states. */
export type Provenance = "confirmed" | "actual" | "potential" | "derived" | "unavailable";

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  confirmed: "Potvrzeno",
  actual: "Skutečný provoz",
  potential: "Potenciál",
  derived: "Odvozeno",
  unavailable: "Nedostupná data",
};

export const PROVENANCE_HINT: Record<Provenance, string> = {
  confirmed: "Uloženo v databázi hry nebo ve vašem průzkumu.",
  actual: "Výsledek posledního uzavřeného tahu.",
  potential: "Co by místo mohlo dát, pokud bude obsazeno a obslouženo prací. Není to výroba.",
  derived: "Spočteno z uvedených zdrojů jednoduchým, popsaným postupem.",
  unavailable: "Data chybí, jsou neúplná nebo ještě nevznikla. Neznamená nulu.",
};

/** Formats a number or returns the unavailable marker — never coerces missing to 0. */
export function fmt(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("cs-CZ", { maximumFractionDigits: digits });
}

export function snapshotAge(snapshotTurn: number | null, currentTurn: number): { age: number | null; stale: boolean; label: string } {
  if (snapshotTurn == null) return { age: null, stale: true, label: "Žádný snapshot" };
  const age = Math.max(0, currentTurn - snapshotTurn);
  return { age, stale: age > 1, label: age === 0 ? `Tah ${snapshotTurn} (aktuální)` : `Tah ${snapshotTurn} · stáří ${age} ${age === 1 ? "tah" : age < 5 ? "tahy" : "tahů"}` };
}

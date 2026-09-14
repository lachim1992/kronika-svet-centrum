type RealmTurnData = {
  last_processed_turn?: number | null;
  computed_modifiers?: unknown;
};

/** Only display a balance recorded by the ledger writer for its latest turn. */
export function getResourceTurnDisplay(realm: RealmTurnData) {
  const modifiers = realm.computed_modifiers as { resource_turn?: Record<string, unknown> } | null;
  const snapshot = modifiers?.resource_turn;
  if (!snapshot || typeof snapshot.turn !== "number" || snapshot.turn !== realm.last_processed_turn) return null;
  const { production, gold, grain } = snapshot;
  if (![production, gold, grain].every(v => typeof v === "number" && Number.isFinite(v))) return null;
  return { turn: snapshot.turn, production: production as number, gold: gold as number, grain: grain as number };
}

export const formatResource = (value: number) => new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 }).format(value);
export const formatResourceDelta = (value: number) => `${value > 0 ? "+" : ""}${formatResource(value)}`;

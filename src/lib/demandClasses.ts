// Client mirror of supabase/functions/_shared/demandModel.ts presentation metadata.
// The backend remains the single canonical demand solver; this file only labels it.

export type DemandClass =
  | "critical_need" | "basic_need" | "operational" | "civic"
  | "development" | "military" | "discretionary" | "luxury" | "intermediate_only";

export type AlertPriority = "P0" | "P1" | "P2" | "P3" | "info" | "none";

export const BASKET_GROUP_ORDER = [
  "ZÁKLADNÍ POTŘEBY",
  "PROVOZNÍ EKONOMIKA",
  "ROZVOJ",
  "VOJENSTVÍ",
  "VOLITELNÁ SPOTŘEBA / LUXUS",
  "PRŮMYSLOVÉ POLOTOVARY",
] as const;

/** Fallback group for a basket when the backend detail is missing. */
export const BASKET_GROUP_FALLBACK: Record<string, string> = {
  staple_food: "ZÁKLADNÍ POTŘEBY",
  drinking_water: "ZÁKLADNÍ POTŘEBY",
  fuel: "ZÁKLADNÍ POTŘEBY",
  basic_clothing: "ZÁKLADNÍ POTŘEBY",
  tools: "PROVOZNÍ EKONOMIKA",
  storage_logistics: "PROVOZNÍ EKONOMIKA",
  admin_supplies: "PROVOZNÍ EKONOMIKA",
  construction: "ROZVOJ",
  military_supply: "VOJENSTVÍ",
  variety: "VOLITELNÁ SPOTŘEBA / LUXUS",
  feast: "VOLITELNÁ SPOTŘEBA / LUXUS",
  luxury_clothing: "VOLITELNÁ SPOTŘEBA / LUXUS",
  metalwork: "PRŮMYSLOVÉ POLOTOVARY",
};

export const CLASS_LABEL: Record<DemandClass, string> = {
  critical_need: "kritická potřeba",
  basic_need: "základní potřeba",
  operational: "provozní",
  civic: "civilní správa",
  development: "rozvoj",
  military: "vojenské",
  discretionary: "volitelné",
  luxury: "luxus",
  intermediate_only: "polotovar",
};

export const CLASS_COLOR: Record<DemandClass, string> = {
  critical_need: "text-destructive",
  basic_need: "text-amber-500",
  operational: "text-sky-500",
  civic: "text-emerald-500",
  development: "text-indigo-400",
  military: "text-red-700",
  discretionary: "text-blue-400",
  luxury: "text-purple-400",
  intermediate_only: "text-muted-foreground",
};

/** Human labels for demand provenance channels emitted by the backend. */
export const CHANNEL_LABEL: Record<string, string> = {
  household_need: "domácnosti (potřeba)",
  household_discretionary: "domácnosti (volitelné)",
  household_luxury: "domácnosti (luxus)",
  industrial_operational: "obsazená výroba",
  construction_active: "rozestavěné projekty",
  institution_civic: "instituce a správa",
  logistics_civic: "sklady a logistika",
  military_active: "aktivní vojsko",
  recipe_intermediate: "vstupy receptur",
};

export const ALERT_ORDER: AlertPriority[] = ["P0", "P1", "P2", "P3", "info", "none"];

export function worseAlert(a: AlertPriority, b: AlertPriority): AlertPriority {
  return ALERT_ORDER.indexOf(a) <= ALERT_ORDER.indexOf(b) ? a : b;
}

export const ALERT_BADGE: Record<AlertPriority, string> = {
  P0: "bg-destructive/15 text-destructive border-destructive/40",
  P1: "bg-amber-500/15 text-amber-600 border-amber-500/40",
  P2: "bg-sky-500/15 text-sky-600 border-sky-500/40",
  P3: "bg-emerald-500/15 text-emerald-600 border-emerald-500/40",
  info: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  none: "bg-muted/40 text-muted-foreground border-border/40",
};

export function coverageColor(coverage: number, cls: DemandClass): string {
  if (cls === "discretionary" || cls === "luxury" || cls === "intermediate_only") {
    return "text-muted-foreground";
  }
  if (coverage >= 0.95) return "text-primary";
  if (coverage >= 0.8) return "text-amber-500";
  return "text-destructive";
}

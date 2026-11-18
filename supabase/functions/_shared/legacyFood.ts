/**
 * Legacy realm/city grain columns are derived projections, not a second stock.
 * Manual food movement stays disabled until one canonical Goods transaction can
 * debit and credit physical lots atomically.
 */
export const LEGACY_FOOD_TRANSFER_ERROR =
  "Přesun potravin přes starý sklad je vypnutý; fyzické zboží zatím nemá bezpečnou transakční akci";

const FOOD_RESOURCES = new Set([
  "food",
  "grain",
  "supplies",
  "raw_grain",
  "flour",
  "baked_staples",
]);

export function isLegacyFoodResource(value: unknown): boolean {
  return FOOD_RESOURCES.has(String(value || "").trim().toLowerCase());
}

export function legacyFoodTradeProblem(
  offered: unknown,
  requested: unknown,
): string | null {
  const keys = [offered, requested]
    .filter(value => value && typeof value === "object")
    .flatMap(value => Object.keys(value as Record<string, unknown>));
  return keys.some(isLegacyFoodResource) ? LEGACY_FOOD_TRANSFER_ERROR : null;
}

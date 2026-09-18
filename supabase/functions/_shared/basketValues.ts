// Canonical basket unit of account (Layer B).
// ONE accounting scale for every realized-production and consumption valuation:
//   value = basket quantity × BASKET_VALUE[basket]
// goods.base_price_numeric is a DIFFERENT scale (goods-level UI / trade) and must
// never be summed together with these values.
export const BASKET_VALUE: Record<string, number> = {
  staple_food: 8,
  basic_clothing: 10,
  tools: 10,
  fuel: 6,
  drinking_water: 5,
  storage_logistics: 14,
  admin_supplies: 12,
  construction: 12,
  metalwork: 6,
  military_supply: 15,
  luxury_clothing: 25,
  feast: 20,
};

export const DEFAULT_BASKET_VALUE = 8;

export function basketValueFor(basket: string): number {
  return BASKET_VALUE[basket] ?? DEFAULT_BASKET_VALUE;
}

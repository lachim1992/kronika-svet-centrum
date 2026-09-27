/** Exact treasury reconciliation. Legacy trade delta already includes its tolls. */
export function treasuryBreakdown(i: {
  opening: number; closingBeforeRounding: number; taxRevenue: number; creditedTax: number;
  tradeNet: number; tradeTolls: number; prestigeBonus: number;
  army: number; sport: number; roads: number; insolvencyRelief: number;
}) {
  const closing = Math.round(i.closingBeforeRounding);
  const rounding = closing - i.closingBeforeRounding + i.creditedTax - i.taxRevenue;
  const total = i.taxRevenue + i.tradeNet + i.prestigeBonus
    - i.army - i.sport - i.roads + i.insolvencyRelief + rounding;
  if (Math.abs(total - (closing - i.opening)) > 1e-7) throw new Error('Unreconciled treasury change');
  return {
    treasury_opening: i.opening, treasury_closing: closing,
    fiscal_revenue: i.taxRevenue, total_income: i.taxRevenue + i.tradeNet + i.tradeTolls + i.prestigeBonus,
    legacy_trade_gross: i.tradeNet + i.tradeTolls, legacy_trade_net: i.tradeNet,
    prestige_bonus: i.prestigeBonus, army_upkeep: i.army, sport_funding: i.sport,
    route_upkeep: i.roads, tolls: i.tradeTolls,
    recurring_expenses: i.army + i.sport + i.roads,
    total_expenses: i.army + i.sport + i.roads + i.tradeTolls,
    insolvency_relief: i.insolvencyRelief, rounding_adjustment: rounding,
    turn_fiscal_delta: closing - i.opening,
  };
}

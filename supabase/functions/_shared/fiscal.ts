/** Shared turn-resolution and action-preview arithmetic. */
export const TAX_MAX={domestic:0.5,market:0.4,transit:0.3,extraction:0.5,poll:0.02} as const;
export type TaxPillar=keyof typeof TAX_MAX;
export const laffer=(rate:number,max:number)=>Math.max(0,1-Math.pow(Math.max(0,rate)/max,2));
export const governance=(legitimacy:number)=>0.5+0.5*Math.max(0,Math.min(100,legitimacy))/100;
export function taxRevenue(base:number,rate:number,pillar:TaxPillar,governanceFactor:number,multiplier=1){
  return Math.round(Math.max(0,base)*laffer(rate,TAX_MAX[pillar])*Math.max(0,rate)*governanceFactor*multiplier*10)/10;
}
export function fiscalSummary(realm:any){
  const wb=realm?.computed_modifiers?.wealth_breakdown||{};
  const income=Number(realm?.wealth_pop_tax||0)+Number(realm?.wealth_domestic_market||0)+Number(realm?.goods_wealth_fiscal||0);
  const expenses=Number(wb.army_upkeep||0)+Number(wb.tolls||0)+Number(wb.sport_funding||0);
  return {income,expenses,net:income-expenses};
}

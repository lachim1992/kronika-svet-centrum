/**
 * ECONOMY FIELD CONTRACT — the single mapping of canonical engine output fields (productMarket.cityAccounts,
 * written by goodsEconomy into economy_turn_ledgers.result.cityAccounts) to labels shown in BOTH the
 * Economy tab (owner-scoped management report) and Economy Dev Mode (economy-dev-snapshot).
 * UIs only format these values; they never recompute them. A regression test fails when the engine emits a
 * field that is neither mapped here nor listed in CITY_ACCOUNT_UNMAPPED_OK.
 */
export type FieldKind = "money" | "ratio" | "index" | "basis" | "count";
export interface EconomyField { key: string; label: string; tip: string; kind: FieldKind; source: string }

const SRC = "cityAccounts";
export const CITY_ACCOUNT_FIELDS: EconomyField[] = [
  { key: "labor_income_basis", label: "Základ příjmu z práce", kind: "basis", source: SRC,
    tip: "Vyplacené mzdy = skutečné mzdy z minulé uzávěrky tahu. Odhad = podíl HDP (žádné vyúčtování mezd zatím neproběhlo)." },
  { key: "settled_wage_income", label: "Vyplacené mzdy (min. tah)", kind: "money", source: SRC + " ← wage_settlement.wages_paid",
    tip: "Peníze, které výrobci skutečně vyplatili domácnostem při minulé uzávěrce tahu. Chybí = vyúčtování ještě neproběhlo." },
  { key: "settled_wage_ratio", label: "Krytí mzdového odhadu", kind: "ratio", source: SRC,
    tip: "Vyplacené mzdy ÷ odhadovaný mzdový objem (přidaná hodnota × podíl práce). 100 % = odhad plně krytý skutečnými mzdami." },
  { key: "labor_income", label: "Příjem z práce", kind: "money", source: SRC, tip: "Mzdový příjem domácností převedený globálním faktorem; podle základu výše." },
  { key: "capital_income", label: "Příjem z majetku", kind: "money", source: SRC, tip: "Zatím odhad z HDP (podíl místního kapitálu), ne rozdělený zisk výrobců." },
  { key: "household_income", label: "Hrubý příjem domácností", kind: "money", source: SRC, tip: "Příjem z práce + příjem z majetku." },
  { key: "household_taxes", label: "Daně domácností", kind: "money", source: SRC, tip: "Daňový klín z hrubého příjmu." },
  { key: "disposable_income", label: "Příjem po daních", kind: "money", source: SRC, tip: "Hrubý příjem − daně." },
  { key: "purchasing_power", label: "Kupní síla", kind: "money", source: SRC, tip: "Utracená část příjmu po daních." },
  { key: "real_purchasing_power", label: "Reálná kupní síla", kind: "money", source: SRC, tip: "Kupní síla ÷ místní cenová hladina." },
  { key: "producer_payroll", label: "Mzdy výrobců (odhad)", kind: "money", source: SRC, tip: "Mzdová sazba × zaměstnaní. Odhad nákladů, ne vyplacená hotovost." },
  { key: "producer_operating_surplus", label: "Provozní přebytek výrobců", kind: "money", source: SRC, tip: "Přidaná hodnota − mzdy − opotřebení (odhad)." },
  { key: "wage_rate", label: "Mzdová sazba", kind: "index", source: SRC, tip: "Místní mzda za pracovníka a tah z trhu práce." },
];

/** Engine fields intentionally shown elsewhere (main table / drilldown text) or internal. */
export const CITY_ACCOUNT_UNMAPPED_OK = new Set([
  "city", "city_gdp", "basic_basket_cost", "price_index", "nominal_gdp", "price_level", "income_unit_factor",
  "discretionary_budget", "discretionary_wish", "discretionary_funded", "discretionary_ratio", "physical_need_coverage",
  "affordability_gap", "affordability", "diversity", "proxy", "private_wealth",
]);

export const BASIS_LABEL: Record<string, string> = { settled_wages: "vyplacené mzdy", imputed_proxy: "odhad z HDP" };

/** null/undefined = field missing (older ledger or not yet settled) — never shown as 0. */
export function formatField(field: EconomyField, row: Record<string, unknown> | null | undefined): { text: string; missing: boolean } {
  const v = row?.[field.key];
  if (v === undefined) return { text: "chybí", missing: true };
  if (v === null) return { text: "zatím není", missing: true };
  if (field.kind === "basis") return { text: BASIS_LABEL[String(v)] ?? String(v), missing: false };
  const x = Number(v);
  if (!Number.isFinite(x)) return { text: "chybí", missing: true };
  if (field.kind === "ratio") return { text: `${Math.round(x * 100)} %`, missing: false };
  return { text: x.toFixed(field.kind === "index" ? 3 : 1), missing: false };
}

export const fieldByKey = (key: string): EconomyField => {
  const f = CITY_ACCOUNT_FIELDS.find(x => x.key === key);
  if (!f) throw new Error(`Unknown economy field ${key}`);
  return f;
};

/**
 * ECONOMY FIELD CONTRACT — the single mapping of canonical engine output fields (productMarket.cityAccounts,
 * written by goodsEconomy into economy_turn_ledgers.result.cityAccounts) to labels shown in BOTH the
 * Economy tab (owner-scoped management report) and Economy Dev Mode (economy-dev-snapshot).
 * UIs only format these values; they never recompute them. A regression test fails when the engine emits a
 * field that is neither mapped here nor listed in CITY_ACCOUNT_UNMAPPED_OK.
 */
export type FieldKind = "money" | "ratio" | "index" | "basis" | "count" | "boolean";
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
  { key: "settled_wage_arrears", label: "Dlužné mzdy (uzávěrka)", kind: "money", source: "realm_resources.computed_modifiers.wage_settlement", tip: "Mzdy, které výrobci při poslední uzávěrce tahu nezaplatili; přenáší se do dalšího tahu." },
  { key: "settled_producer_retained", label: "Ponechaná hotovost výrobců", kind: "money", source: "realm_resources.computed_modifiers.wage_settlement", tip: "Přidaná hodnota, která výrobcům zůstala po skutečné výplatě mezd při poslední uzávěrce." },
  { key: "settled_producer_cash", label: "Hotovost výrobců (zásoba)", kind: "money", source: "realm_resources.computed_modifiers.wage_settlement", tip: "Trvalá hotovost výrobců po poslední uzávěrce: počáteční stav + přidaná hodnota − vyplacené mzdy. Nikdy záporná." },
];

/** Engine fields intentionally shown elsewhere (main table / drilldown text) or internal. */
export const CITY_ACCOUNT_UNMAPPED_OK = new Set([
  "city", "city_gdp", "basic_basket_cost", "price_index", "nominal_gdp", "price_level", "income_unit_factor",
  "discretionary_budget", "discretionary_wish", "discretionary_funded", "discretionary_ratio", "physical_need_coverage",
  "affordability_gap", "affordability", "diversity", "proxy", "private_wealth",
  // goodsEconomy extras rendered in the main table / drilldown text
  "goods_value_added", "service_value_added", "trade_services", "prosperity", "prosperity_parts", "discretionary_cap",
  "capital_stock", "capital_candidate",
]);

/** Direct paths in diagnostics[].margin, not sums of Dev Mode component rows (B wear is already an input). */
export const PRODUCER_COST_FIELDS: EconomyField[] = [
  ...[ ["material", "A · materiál", "Fyzicky spotřebovaný BOM"],
    ["factor_wear", "B · opotřebení faktorů", "Pouze spotřebované opotřebení, nikoli celý kapitál"],
    ["operating", "C · provozní vstupy", "Skutečně spotřebované podpůrné vstupy"],
    ["payroll_imputed", "Mzdy · odhad", "Mzdová sazba × zaměstnaní; nikoli vyplacená hotovost"]
  ].flatMap(([key, label, tip]): EconomyField[] => [
    { key: `cost_breakdown.${key}`, label, tip: `${tip}. Ocenění za tah z kanonického účtu výrobce.`, kind: "money", source: "diagnostics[].margin" },
    { key: `cost_breakdown.unit.${key}`, label: `${label} / ks`, tip: `${tip}. Jednotkový náklad uložený enginem; bez výroby není definován.`, kind: "money", source: "diagnostics[].margin" },
  ]),
  { key: "full_cost", label: "Náklad včetně odhadu mezd", tip: "A + C + B opotřebení + odhad mezd. Nejde o úplný hotovostní náklad: odpisy budov, režie a daně výrobce zatím nejsou modelovány.", kind: "money", source: "diagnostics[].margin" },
  { key: "unit_full_cost", label: "Náklad včetně odhadu / ks", tip: "Jednotkový náklad přímo z účtu výrobce, ne součet dalších diagnostických rozpadů.", kind: "money", source: "diagnostics[].margin" },
  { key: "labor_per_unit", label: "Práce / ks", tip: "Pracovní náročnost podle skutečného obsazení výroby; bez výstupu není definována.", kind: "index", source: "diagnostics[].margin" },
  { key: "wage_rate", label: "Mzdová sazba", tip: "Místní sazba za pracovníka a tah.", kind: "index", source: "diagnostics[].margin" },
  { key: "operating_surplus", label: "Přebytek po odhadu mezd", tip: "Oceněný výstup minus spotřebované vstupy a odhad mezd; nikoli hotovostní zisk.", kind: "money", source: "diagnostics[].margin" },
  { key: "payroll_basis", label: "Základ mezd", tip: "Účet výrobce obsahuje odhad. Skutečné mzdy vyúčtovává odděleně pouze uzávěrka tahu.", kind: "basis", source: "diagnostics[].margin" },
  { key: "cash_settled", label: "Hotovost vyúčtovaná v kalkulaci", tip: "Tato kalkulace nepřevádí peníze. Výplaty z uzávěrky nejsou touto hodnotou nahrazovány.", kind: "boolean", source: "diagnostics[].margin" },
];

/** Existing aliases/accounting identities deliberately not repeated in the cost drilldown. */
export const PRODUCER_COST_UNMAPPED_OK = new Set(["payroll", "capital_wear", "value_added"]);
export type ProducerCostRecord = Record<string, unknown>;

export const BASIS_LABEL: Record<string, string> = { settled_wages: "vyplacené mzdy", imputed_proxy: "odhad z HDP", imputed: "odhad, nikoli výplata" };

/** null/undefined = field missing (older ledger or not yet settled) — never shown as 0. */
export function formatField(field: EconomyField, row: Record<string, unknown> | null | undefined): { text: string; missing: boolean } {
  const v = field.key.split(".").reduce<unknown>((value, key) =>
    value != null && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, row);
  if (v === undefined) return { text: "chybí", missing: true };
  if (v === null) return { text: "zatím není", missing: true };
  if (field.kind === "basis") return { text: BASIS_LABEL[String(v)] ?? String(v), missing: false };
  if (field.kind === "boolean") return typeof v === "boolean"
    ? { text: v ? "ano" : "ne", missing: false } : { text: "chybí", missing: true };
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

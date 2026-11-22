import { regionalSettlements, buildingReserveReport } from '../../../supabase/functions/_shared/regionalSettlementEconomy';
const f = (v: number | null | undefined) => v == null ? '—' : Number(v).toLocaleString('cs-CZ', { maximumFractionDigits: 1 });
const avail: Record<string, string> = { connected: 'napojeno', partial: 'částečně', blocked: 'blokováno', unknown: 'neznámá' };
export default function RegionalSettlementsPanel({ report, cities, name, city }: { report: any; cities: any[]; name: (id: string) => string; city?: string }) {
  const rows = regionalSettlements(report, cities).filter(s => !city || s.cities.includes(city));
  const balances = (report.cities || []).flatMap((c: any) => c.balances || []).filter((b: any) => !city || b.city === city);
  const reserve = buildingReserveReport(balances, report.metrics?.find((m: any) => m.key === 'construction_stock')?.value ?? null);
  return <details open className="border-t pt-2">
    <summary className="font-semibold cursor-pointer">Regionální osady (odvozený přehled) a stavební rezerva</summary>
    <p className="text-xs text-muted-foreground">Osady jsou výpočet z venkovského obyvatelstva a venkovských výrobních míst uzavřeného tahu, ne uložené vesnice. Novou výrobu osady založíte stavbou venkovského místa na obdělávané parcele.</p>
    {!rows.length ? <p className="text-xs">— Žádná venkovská výrobní místa: venkované zatím nikde nepracují, proto osady nemají výrobu ani daňovou základnu.</p> :
    <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr>{['Pole / město','Venkované','Pracovní síla','Zaměstnaní','Místa','Výroba (j.)','Tržby','Přidaná hodnota','Poptávka (podíl, j.)','Daňová základna','Doprava'].map(h => <th key={h} className="p-2 text-right">{h}</th>)}</tr></thead>
      <tbody>{rows.map(s => <tr key={s.id} className="border-t align-top"><td className="p-2">{s.cell} · {s.cities.map(name).join(', ')}<ul className="text-muted-foreground">{s.reasons.map(r => <li key={r}>{r}</li>)}</ul></td>
        {[s.rural_population, s.workforce, s.employed, s.jobs, s.gross_output_units, s.revenue, s.value_added, s.attributed_demand_units, s.tax_base].map((v, i) => <td key={i} className="p-2 text-right">{f(v)}</td>)}
        <td className="p-2 text-right">{avail[s.logistics]}</td></tr>)}</tbody></table></div>}
    <h4 className="font-semibold mt-2 text-xs">Stavební materiál na skladě</h4>
    {!reserve.lines.length ? <p className="text-xs">— Žádné dřevo ani kámen na skladě.</p> : <table className="w-full text-xs"><thead><tr>{['Město / materiál','Fyzicky (j.)','Body za j.','Bodový ekvivalent','Mimo město'].map(h => <th key={h} className="p-2 text-right">{h}</th>)}</tr></thead>
      <tbody>{reserve.lines.map(l => <tr key={l.city + l.good} className="border-t"><td className="p-2">{name(l.city)} / {l.good}</td><td className="p-2 text-right">{f(l.stored)}</td><td className="p-2 text-right">{f(l.efficiency)}</td><td className="p-2 text-right">{f(l.point_equivalent)}</td><td className="p-2 text-right">{avail[l.availability]}</td></tr>)}</tbody></table>}
    <p className="text-xs">Převedená stavební rezerva: {f(reserve.converted_reserve)} bodů · přeměnitelné ze skladu: {f(reserve.convertible_points)} bodů (nesčítá se).</p>
    <p className="text-xs text-muted-foreground">{reserve.note}</p>
  </details>;
}

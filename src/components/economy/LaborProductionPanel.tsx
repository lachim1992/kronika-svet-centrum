import { useState } from 'react';
import { useManagementReport } from '@/hooks/useManagementReport';

/**
 * LABOR & PRODUCTION (read-only).
 * Population supplies labour, not goods. Structures create jobs, capacity and input demand;
 * realized output needs both staffed jobs and delivered physical inputs.
 */
const fmt = (n: unknown, digits = 0) => Number(n || 0).toLocaleString('cs-CZ', { maximumFractionDigits: digits });
const pct = (n: unknown) => `${(Number(n || 0) * 100).toFixed(0)} %`;
const SECTORS: Record<string, string> = { farming: 'Zemědělství', crafting: 'Řemesla', logistics: 'Doprava a sklady', admin: 'Správa', extraction: 'Těžba' };
const BLOCKED: Record<string, string> = {
  no_workers: 'Chybí pracovníci', missing_inputs: 'Vstupní zboží nikde není',
  missing_input_route: 'Vstupy existují, chybí cesta', missing_inputs_or_route: 'Chybí vstupy nebo cesta',
  missing_local_delivery_route: 'Chybí cesta do města',
  missing_recipe_inputs: 'Chybí zadané vstupy', capacity_labor_or_staffing: 'Chybí kapacita nebo lidé',
};


export default function LaborProductionPanel({ sessionId, cities, playerName, currentTurn }:
  { sessionId: string; cities: any[]; playerName: string; currentTurn: number }) {
  const [cityId, setCityId] = useState('');
  const { data, error, isLoading } = useManagementReport(sessionId, playerName, currentTurn);
  const report: any = data?.report ?? null;
  if (error) return <p role="alert" className="text-sm text-destructive">{String(error)}</p>;
  if (isLoading) return <p className="text-sm">Načítám práci a výrobu…</p>;
  if (!report) return <p className="text-sm">Přehled práce a výroby bude k dispozici po uzavření tahu {currentTurn}.</p>;

  const name = (id: string) => cities.find(c => c.id === id)?.name || report.cities?.find((c: any) => c.id === id)?.name || id;
  const labor: any[] = (report.labor || []).filter((l: any) => !cityId || l.city === cityId);
  const producers: any[] = (report.producers || []).filter((p: any) => !cityId || p.city === cityId);
  /**
   * One row per structure, not per recipe line. Producer ids are `structure:recipe`, so a mill
   * running four recipes is one building with one crew — summing the lines keeps the headcount,
   * capacity and output honest instead of showing fractional crews.
   */
  const structures = Object.values(producers.reduce((acc: Record<string, any>, p: any) => {
    const id = String(p.producer).split(':')[0];
    const s = acc[id] ||= { id, city: p.city, goods: [] as string[], jobs_capacity: 0, employed: 0,
      capacity: 0, potential_output: 0, realized: 0, inputs: [] as any[], reasons: [] as string[] };
    if (!s.goods.includes(p.good)) s.goods.push(p.good);
    s.jobs_capacity += Number(p.jobs_capacity || 0);
    s.employed += Number(p.employed || 0);
    s.capacity = Math.max(s.capacity, Number(p.capacity || 0));
    s.potential_output += Number(p.potential_output || 0);
    s.realized += Number(p.realized || 0);
    for (const i of p.inputs || []) {
      const found = s.inputs.find((x: any) => x.good === i.good);
      if (found) { found.required += Number(i.required || 0); found.supplied += Number(i.supplied || 0); }
      else s.inputs.push({ good: i.good, required: Number(i.required || 0), supplied: Number(i.supplied || 0) });
    }
    if (p.margin) {
      s.revenue = (s.revenue || 0) + Number(p.margin.revenue || 0);
      s.cost = (s.cost || 0) + Number(p.margin.cost || 0);
      for (const i of p.margin.inputs || []) if (i.cheaper_supplier && !s.reasons.includes('levnější dodavatel existuje')) s.reasons.push('levnější dodavatel existuje');
      if (p.margin.loss_warning && p.margin.order !== 'auto') { const w = p.margin.order === 'lock' ? 'ZAMČENO se ztrátou' : 'preferováno se ztrátou'; if (!s.reasons.includes(w)) s.reasons.push(w); }
    }
    const reason = p.bottleneck ? `úzké místo: ${p.bottleneck}` : BLOCKED[p.blocked] || p.blocked || '';
    if (reason && !s.reasons.includes(reason)) s.reasons.push(reason);
    return acc;
  }, {})) as any[];

  const realm = (report.labor || []).reduce((acc: any, l: any) => ({
    workforce: acc.workforce + l.available_workforce, employed: acc.employed + l.employed_total,
    unemployed: acc.unemployed + l.unemployed_total, jobs: acc.jobs + l.jobs_capacity, vacancies: acc.vacancies + l.vacancies_total,
  }), { workforce: 0, employed: 0, unemployed: 0, jobs: 0, vacancies: 0 });

  return <section className="space-y-4 rounded-xl border p-4">
    <header className="space-y-1">
      <h3 className="font-semibold">Práce a výroba</h3>
      <p className="text-xs text-muted-foreground">
        Obyvatelstvo dodává pracovní sílu a poptávku. Zboží vyrábějí stavby, čtvrti a uzly — a jen tehdy,
        když mají lidi i dodané vstupy. Data z uzavřeného tahu {report.turn}.
      </p>
    </header>
    <div className="grid gap-2 sm:grid-cols-5 text-sm">
      {[['Pracovní síla', realm.workforce], ['Zaměstnaní', realm.employed], ['Nezaměstnaní', realm.unemployed],
        ['Pracovní místa', realm.jobs], ['Neobsazená místa', realm.vacancies]].map(([label, value]) =>
        <div key={String(label)} className="rounded-lg border p-2">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="font-semibold">{fmt(value)}</div>
        </div>)}
    </div>
    <label className="text-sm">Město <select className="bg-background border rounded p-1" value={cityId} onChange={e => setCityId(e.target.value)}>
      <option value="">Všechna</option>
      {(report.labor || []).map((l: any) => <option key={l.city} value={l.city}>{name(l.city)}</option>)}
    </select></label>

    {labor.map(l => <div key={l.city} className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-medium">{name(l.city)}</span>
        <span className="text-xs text-muted-foreground">
          obyvatel {fmt(l.population)} · práceschopných {fmt(l.economically_active)} · pracovní síla {fmt(l.available_workforce)} ·
          zaměstnaní {fmt(l.employed_total)} ({pct(l.employment_rate)}) · nezaměstnaní {fmt(l.unemployed_total)} ·
          místa {fmt(l.jobs_capacity)} · neobsazená {fmt(l.vacancies_total)}
        </span>
      </div>
      <div className="overflow-auto"><table className="w-full text-xs">
        <caption className="text-left text-muted-foreground mb-1">Podle odvětví</caption>
        <thead><tr>{['Odvětví', 'Nabídka práce', 'Místa', 'Zaměstnaní', 'Neobsazená', 'Nedostatek lidí'].map(h =>
          <th key={h} className="p-1 text-right first:text-left">{h}</th>)}</tr></thead>
        <tbody>{Object.entries(l.sectors || {}).map(([sector, s]: any) => <tr key={sector} className="border-t">
          <td className="p-1">{SECTORS[sector] || sector}</td>
          {[s.labor_supply, s.jobs_capacity, s.employed, s.vacancies, s.labor_shortage].map((v, i) =>
            <td key={i} className="p-1 text-right">{fmt(v)}</td>)}
        </tr>)}</tbody>
      </table></div>
    </div>)}

    <div className="overflow-auto"><table className="w-full text-xs">
      <caption className="text-left mb-1">Jednotlivé stavby: obsazenost, možná výroba, vstupy a skutečná výroba</caption>
      <thead><tr>{['Město', 'Stavba vyrábí', 'Místa obsazená / celkem', 'Obsazenost', 'Kapacita', 'Možná výroba', 'Vstupy (dodáno / potřeba)', 'Skutečná výroba', 'Co brání'].map(h =>
        <th key={h} className="p-2 text-right first:text-left">{h}</th>)}</tr></thead>
      <tbody>{structures.map(s => <tr key={s.id} className="border-t align-top">
        <td className="p-2">{name(s.city)}</td>
        <td className="p-2">{s.goods.join(', ')}</td>
        <td className="p-2 text-right">{fmt(s.employed)} / {fmt(s.jobs_capacity)}</td>
        <td className="p-2 text-right">{pct(s.jobs_capacity > 0 ? s.employed / s.jobs_capacity : 0)}</td>
        <td className="p-2 text-right">{fmt(s.capacity, 2)}</td>
        <td className="p-2 text-right">{fmt(s.potential_output, 2)}</td>
        <td className="p-2 text-right">{s.inputs.length
          ? s.inputs.map(i => <div key={i.good}>{i.good}: {fmt(i.supplied, 2)} / {fmt(i.required, 2)}</div>)
          : '—'}</td>
        <td className="p-2 text-right">{fmt(s.realized, 2)}</td>
        <td className={`p-2 text-right ${s.revenue != null && s.revenue - s.cost < 0 ? 'text-destructive' : ''}`}
          title="Tržba v místních cenách − náklad vstupů (dovoz v ceně na místě dodání)">
          {s.revenue ? `${(s.revenue - s.cost).toFixed(1)} (${Math.round((s.revenue - s.cost) / s.revenue * 100)} %)` : '—'}
        </td>
        <td className="p-2 text-right">{s.reasons.length ? s.reasons.join(', ') : '—'}</td>
      </tr>)}</tbody>
    </table></div>
    {!structures.length && <p className="text-sm text-muted-foreground">Žádné výrobní stavby — bez nich nevzniká žádné zboží, jen poptávka.</p>}

  </section>;
}

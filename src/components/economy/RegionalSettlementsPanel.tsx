import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { dispatchCommand } from '@/lib/commands';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { regionalSettlements, buildingReserveReport, withPersistedVillages } from '../../../supabase/functions/_shared/regionalSettlementEconomy';
import { RURAL_SETTLEMENT_COST, RURAL_SETTLEMENT_UPGRADE_COST, RURAL_SETTLEMENT_MAX_LEVEL, VILLAGE_FOOTPATH_STEP, villageFootpathFactor } from '../../../supabase/functions/_shared/ruralSettlement';
import { FOOTPATH_FACTOR } from '../../../supabase/functions/_shared/ruralSites';
const pct = (x: number) => `${Math.round(x * 100)} %`;
const f = (v: number | null | undefined) => v == null ? '—' : Number(v).toLocaleString('cs-CZ', { maximumFractionDigits: 1 });
const avail: Record<string, string> = { connected: 'napojeno', partial: 'částečně', blocked: 'blokováno', unknown: 'neznámá' };
export default function RegionalSettlementsPanel({ report, cities, name, city, sessionId, playerName, currentTurn }: { report: any; cities: any[]; name: (id: string) => string; city?: string; sessionId?: string; playerName?: string; currentTurn?: number }) {
  const qc = useQueryClient();
  const [names, setNames] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  // Persisted villages (read-only, member RLS). Missing table before the migration = empty, shown as such.
  const { data: villages, error: vErr } = useQuery({ queryKey: ['rural_settlements', sessionId], enabled: !!sessionId, queryFn: async () => {
    const { data, error } = await (supabase.from as any)('rural_settlements').select('id, city_id, parcel_id, grid_x, grid_y, name, level, founded_turn, owner_player').eq('session_id', sessionId);
    if (error) throw error; return (data || []) as any[]; } });
  const mine = (villages || []).filter(v => v.owner_player === playerName);
  const rows = withPersistedVillages(regionalSettlements(report, cities), mine).filter(s => !city || s.cities.includes(city));
  const found = async (cell: string, parcelId: string) => {
    if (!sessionId || !playerName || currentTurn == null) return;
    if (vErr) { setMsg('Vesnici nelze založit: uložené vesnice nejsou v databázi dostupné.'); return; }
    const res: any = await dispatchCommand({ sessionId, turnNumber: currentTurn, actor: { name: playerName }, commandType: 'CREATE_RURAL_SETTLEMENT', commandPayload: { parcelId, name: names[cell] || '' } });
    if (!res?.ok || res?.error) { setMsg(`Vesnici nelze založit: ${res?.error || 'server příkaz odmítl'}`); return; }
    setMsg('Vesnice založena.');
    qc.invalidateQueries({ queryKey: ['rural_settlements', sessionId] });
  };
  const upgrade = async (id: string, level: number) => {
    if (!sessionId || !playerName || currentTurn == null || vErr) return;
    const res: any = await dispatchCommand({ sessionId, turnNumber: currentTurn, actor: { name: playerName }, commandType: 'UPGRADE_RURAL_SETTLEMENT', commandPayload: { settlementId: id, targetLevel: level + 1 } });
    if (!res?.ok || res?.error) { setMsg(`Vesnici nelze povýšit: ${res?.error || 'server příkaz odmítl'}`); return; }
    setMsg(`Vesnice povýšena na úroveň ${level + 1}. Účinek se projeví ve výrobě až po uzavření příštího tahu.`);
    qc.invalidateQueries({ queryKey: ['rural_settlements', sessionId] });
  };
  const balances = (report.cities || []).flatMap((c: any) => c.balances || []).filter((b: any) => !city || b.city === city);
  const reserve = buildingReserveReport(balances, report.metrics?.find((m: any) => m.key === 'construction_stock')?.value ?? null);
  return <details open className="border-t pt-2">
    <summary className="font-semibold cursor-pointer">Vesnice, regionální osady a stavební rezerva</summary>
    <p className="text-xs text-muted-foreground">„Vesnice“ = uložená vesnice; „odvozená“ = jen výpočet z venkovanů a venkovských míst uzavřeného tahu. Vesnice nepřidává obyvatele: jsou to venkované daného pole. Založení stojí {RURAL_SETTLEMENT_COST} zlata ze státní pokladny. Daň z vesnic se zatím nevybírá. Jediný účinek vesnice: lepší odvoz po stezce ze sousedního pole bez cesty.</p>
    {vErr && <p className="text-xs">Uložené vesnice zatím nejsou k dispozici.</p>}
    {msg && <p className="text-xs">{msg}</p>}
    {!rows.length ? <p className="text-xs">— Žádná venkovská výrobní místa: venkované zatím nikde nepracují, proto osady nemají výrobu ani daňovou základnu.</p> :
    <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr>{['Pole / město','Venkované','Pracovní síla','Zaměstnaní','Místa','Výroba (j.)','Tržby','Přidaná hodnota','Poptávka (podíl, j.)','Daňová základna','Doprava'].map(h => <th key={h} className="p-2 text-right">{h}</th>)}</tr></thead>
      <tbody>{rows.map(s => <tr key={s.id} className="border-t align-top"><td className="p-2">{s.kind === 'village' ? <b>Vesnice {s.village!.name}</b> : <span>Odvozená osada</span>} · {s.cell} · {s.cities.map(name).join(', ')}
          {s.kind === 'projection' && sessionId && s.producers[0] && (() => { const pid = report.producers?.find((p: any) => p.producer === s.producers[0].producer)?.parcel?.id;
            return pid ? <div className="flex gap-1 mt-1"><Input className="h-7 text-xs" placeholder="Název vesnice" value={names[s.cell] || ''} onChange={e => setNames({ ...names, [s.cell]: e.target.value })} />
              <Button size="sm" variant="outline" onClick={() => found(s.cell, pid)}>Založit vesnici</Button></div> : null; })()}
          {s.kind === 'village' && (() => { const lv = s.village!.level, applied = s.producers.filter(p => p.village_level != null);
            return <div className="text-xs mt-1">Úroveň {lv}: odvoz po stezce do sousedního pole města {pct(FOOTPATH_FACTOR)} → {pct(villageFootpathFactor(FOOTPATH_FACTOR, lv))} (cesta = 100 %, bez cesty a dál od města zůstává 0 %).
              <div className="text-muted-foreground">{applied.length ? `Uzavřený tah: bonus použit u ${applied.length} míst, navíc odvezeno ${f(s.village_freight_gain_units)} j.` : 'Uzavřený tah: bonus nebyl použit (místo leží u města, má cestu, nebo je bez spojení).'}</div>
              {!vErr && lv < RURAL_SETTLEMENT_MAX_LEVEL && sessionId && <Button size="sm" variant="outline" className="mt-1" onClick={() => upgrade(s.village!.id, lv)}>Povýšit na {lv + 1} ({RURAL_SETTLEMENT_UPGRADE_COST[lv + 1]} zlata, stezka +{pct(VILLAGE_FOOTPATH_STEP)})</Button>}</div>; })()}
          <ul className="text-muted-foreground">{s.reasons.map(r => <li key={r}>{r}</li>)}</ul></td>
        {[s.rural_population, s.workforce, s.employed, s.jobs, s.gross_output_units, s.revenue, s.value_added, s.attributed_demand_units, s.tax_base].map((v, i) => <td key={i} className="p-2 text-right">{f(v)}</td>)}
        <td className="p-2 text-right">{avail[s.logistics]}</td></tr>)}</tbody></table></div>}
    <h4 className="font-semibold mt-2 text-xs">Stavební materiál na skladě</h4>
    {!reserve.lines.length ? <p className="text-xs">— Žádné dřevo ani kámen na skladě.</p> : <table className="w-full text-xs"><thead><tr>{['Město / materiál','Fyzicky (j.)','Body za j.','Bodový ekvivalent','Mimo město'].map(h => <th key={h} className="p-2 text-right">{h}</th>)}</tr></thead>
      <tbody>{reserve.lines.map(l => <tr key={l.city + l.good} className="border-t"><td className="p-2">{name(l.city)} / {l.good}</td><td className="p-2 text-right">{f(l.stored)}</td><td className="p-2 text-right">{f(l.efficiency)}</td><td className="p-2 text-right">{f(l.point_equivalent)}</td><td className="p-2 text-right">{avail[l.availability]}</td></tr>)}</tbody></table>}
    <p className="text-xs">Převedená stavební rezerva: {f(reserve.converted_reserve)} bodů · přeměnitelné ze skladu: {f(reserve.convertible_points)} bodů (nesčítá se).</p>
    <p className="text-xs text-muted-foreground">{reserve.note}</p>
  </details>;
}

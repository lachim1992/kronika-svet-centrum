import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { accountKindLabel, fetchFinancialSectors, municipalStateFlows, SECTOR_ROWS, sectorBalance } from '@/lib/financialSectors';
import { reconcileWageSettlement } from '@/lib/privateSettlement';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const money = (value: number | null | undefined) => value == null ? 'Nedostupné' : value.toLocaleString('cs-CZ', { maximumFractionDigits: 3 });

/** Same current cash/account view in Economy and Dev; no actions, funding or economy recompute. */
export default function FinancialSectorsPanel({ sessionId }: { sessionId: string }) {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['financial-sectors', sessionId, user?.id], enabled: !!sessionId && !!user,
    queryFn: () => {
      if (!user) throw new Error('Přihlášení není dostupné.');
      return fetchFinancialSectors(sessionId, user.id);
    }, staleTime: 15_000, retry: false, refetchOnWindowFocus: false });
  const data = query.data;
  return <section className="space-y-3 border-t border-border pt-4" aria-label="Finanční sektory">
    <div><h3 className="text-sm font-display font-semibold">Finanční sektory</h3>
      <p className="text-xs text-muted-foreground">Aktuální účty pod vaší správou · zlato · pouze ke čtení</p></div>
    {query.isLoading ? <p className="text-xs text-muted-foreground">Načítám účty…</p> : query.error ?
      <p className="text-xs text-destructive">Účty nedostupné: {query.error.message}</p> : !data ?
        <p className="text-xs text-muted-foreground">Účty nedostupné</p> : <>
      <Table><TableHeader><TableRow><TableHead>Sektor</TableHead><TableHead className="text-right">Hotovost</TableHead><TableHead>Stav</TableHead></TableRow></TableHeader>
        <TableBody><TableRow><TableCell>Státní pokladna · STATE</TableCell>
          <TableCell className="text-right font-mono">{data.state.error ? 'Nedostupné' : money(data.state.data?.gold_reserve)}</TableCell>
          <TableCell className="text-xs text-muted-foreground">Jen explicitní převody s městy</TableCell></TableRow>
          {SECTOR_ROWS.map(row => {
            const summary = sectorBalance(data.accounts.data ?? [], row.sector, row.kind, 'org' in row ? row.org : undefined);
            return <TableRow key={row.label}><TableCell>{row.label}</TableCell>
              <TableCell className="text-right font-mono">{data.accounts.error ? 'Nedostupné' : summary.count ? money(summary.balance) : 'Žádný účet'}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{data.accounts.error ? 'Chyba načtení' : `${summary.count} účtů`}</TableCell></TableRow>;
          })}</TableBody></Table>
      <p className="text-xs text-muted-foreground">Fiskální příjem / kolo: {data.state.error ? 'Nedostupné' : money(data.state.data?.total_wealth)} · není majetek</p>
      {data.accounts.error && <p className="text-xs text-destructive">{data.accounts.error.message}</p>}
      {!!data.accounts.data?.length && <Table><TableHeader><TableRow><TableHead>Účet</TableHead><TableHead>Vlastník</TableHead><TableHead className="text-right">Hotovost nyní</TableHead><TableHead className="text-right">Ze státu / do státu</TableHead></TableRow></TableHeader>
        <TableBody>{data.accounts.data.map(a => {
          const flows = (a.sector === 'MUNICIPAL' || a.sector === 'PRIVATE') && !data.stateTransfers.error ? municipalStateFlows(data.stateTransfers.data ?? [], a.id) : null;
          return <TableRow key={a.id}><TableCell className="break-words">{a.label}</TableCell><TableCell>{accountKindLabel(a)}</TableCell><TableCell className="text-right font-mono">{money(a.balance)}</TableCell>
            <TableCell className="text-right font-mono text-xs">{a.sector === 'PRIVATE' ? (flows ? (flows.funded > 0 ? `státní dotace ${money(flows.funded)}` : '—') : 'Nedostupné') : a.sector !== 'MUNICIPAL' ? '—' : flows ? `${money(flows.funded)} / ${money(flows.remitted)}` : 'Nedostupné'}</TableCell></TableRow>;
        })}</TableBody></Table>}
      <p className="text-xs text-muted-foreground">Hotovost nyní = skutečný účetní zůstatek. Ze státu / do státu = skutečně provedené převody se státní pokladnou; u soukromých účtů jde o explicitní státní dotaci (pilotní likviditu), jediný legální zdroj jejich hotovosti. Fiskální příjem je modelovaný tok, kapitálová zásoba níže není hotovost.</p>
      <div className="border-t border-border pt-3 space-y-2"><h4 className="text-sm font-semibold">Soukromý peněžní oběh</h4>
        <p className="text-xs text-muted-foreground">Režim: {data.session.error ? 'Nedostupné' : (data.session.data?.private_cash_version ?? 0) >= 1 ? 'cash backed (mzdy a vlastnické výnosy jen ze skutečného zůstatku podniků)' : 'legacy/model (platby jsou jen modelované)'}</p>
        <p className="text-xs text-muted-foreground">Oběh NENÍ uzavřený: nákupy domácností se platí jen u zboží s doloženým místním prodávajícím; dovoz, zásoby z dřívějška a smíšený původ jsou neověřitelné a neplatí se. Daně nezapojeny. Účty začínají na nule, takže bez skutečné hotovosti zůstávají platby nezaplacené.</p>
        {!!data.turnFlows.data?.length && <Table><TableHeader><TableRow><TableHead>Tah</TableHead><TableHead>Město</TableHead><TableHead>Tok</TableHead><TableHead className="text-right">Požadováno</TableHead><TableHead className="text-right">Zaplaceno</TableHead><TableHead>Stav</TableHead></TableRow></TableHeader><TableBody>
          {data.turnFlows.data.map(f => <TableRow key={`${f.turn_number}-${f.city_id}-${f.flow_type}`}><TableCell>{f.turn_number}</TableCell><TableCell className="text-xs">{(data.capital.data ?? []).find(c => c.city_id === f.city_id)?.city_name ?? f.city_id}</TableCell>
            <TableCell>{f.flow_type === 'WAGES' ? 'Mzdy' : 'Vlastnický výnos'}</TableCell><TableCell className="text-right font-mono">{money(Number(f.requested))}</TableCell><TableCell className="text-right font-mono">{money(Number(f.settled))}</TableCell>
            <TableCell className="text-xs">{f.status === 'unfunded' ? 'nezafinancované' : f.status === 'partial' ? 'částečně' : f.status === 'no_controller' ? 'bez správce' : 'uhrazeno'}</TableCell></TableRow>)}
        </TableBody></Table>}
      </div>
      {!!data.purchases.data?.length && <div className="space-y-1"><h4 className="text-sm font-semibold">Nákupy domácností</h4>
        <Table><TableHeader><TableRow><TableHead>Tah</TableHead><TableHead>Město · zboží</TableHead><TableHead className="text-right">Fyzicky spotřebováno</TableHead><TableHead className="text-right">K úhradě</TableHead><TableHead className="text-right">Zaplaceno</TableHead><TableHead className="text-right">Nezaplaceno</TableHead><TableHead>Stav</TableHead></TableRow></TableHeader><TableBody>
          {data.purchases.data.map(f => <TableRow key={`${f.turn_number}-${f.city_id}-${f.good_key}`}><TableCell>{f.turn_number}</TableCell>
            <TableCell className="text-xs">{(data.capital.data ?? []).find(c => c.city_id === f.city_id)?.city_name ?? f.city_id} · {f.good_key}</TableCell>
            <TableCell className="text-right font-mono">{money(Number(f.consumed))}</TableCell>
            <TableCell className="text-right font-mono">{f.status === 'unmatched' || f.status === 'no_price' ? 'Nedostupné' : money(Number(f.bill))}</TableCell>
            <TableCell className="text-right font-mono">{money(Number(f.settled))}</TableCell>
            <TableCell className="text-right font-mono">{f.status === 'unmatched' || f.status === 'no_price' ? '—' : money(Number(f.unpaid))}</TableCell>
            <TableCell className="text-xs">{({ settled: 'zaplaceno', partial: 'částečně', unfunded: 'nezafinancované', unmatched: 'neověřitelný prodávající', no_price: 'bez ceny', no_controller: 'bez správce' } as Record<string, string>)[f.status] ?? f.status}</TableCell></TableRow>)}
        </TableBody></Table></div>}
      <PrivateSettlementSection snapshot={data.state.error ? undefined : (data.state.data?.computed_modifiers as any)?.wage_settlement}
        stateError={!!data.state.error} privateBalance={data.accounts.error ? null : (data.accounts.data ?? []).filter(a => a.sector === 'PRIVATE').reduce((t, a) => t + Number(a.balance), 0)}
        privateCount={data.accounts.data?.filter(a => a.sector === 'PRIVATE').length ?? 0} cityNames={new Map((data.capital.data ?? []).map(c => [c.city_id, c.city_name]))} />
      <div className="border-t border-border pt-3 space-y-2"><h4 className="text-sm font-semibold">Městský výrobní kapitál · ne pokladna</h4>
        {data.capital.error ? <p className="text-xs text-destructive">Kapitál nedostupný: {data.capital.error.message}</p> : !data.capital.data?.length ?
          <p className="text-xs text-muted-foreground">Žádný uložený kapitálový záznam</p> :
          <Table><TableHeader><TableRow><TableHead>Město</TableHead><TableHead className="text-right">Kapitálová zásoba</TableHead><TableHead>Tah</TableHead></TableRow></TableHeader><TableBody>
            {data.capital.data.map(c => <TableRow key={c.city_id}><TableCell>{c.city_name}</TableCell><TableCell className="text-right font-mono">{money(c.stock)}</TableCell><TableCell>{c.last_turn}</TableCell></TableRow>)}
          </TableBody></Table>}
      </div>
    </>}
  </section>;
}

/** Modelled producer settlement from the committed turn snapshot; read-only, never part of ledger cash. */
function PrivateSettlementSection({ snapshot, stateError, privateBalance, privateCount, cityNames }: {
  snapshot: unknown; stateError: boolean; privateBalance: number | null; privateCount: number; cityNames: Map<string, string>;
}) {
  const rec = stateError ? null : reconcileWageSettlement(snapshot);
  const t = rec?.totals;
  return <div className="border-t border-border pt-3 space-y-2">
    <h4 className="text-sm font-semibold">Dosavadní vypořádání soukromého sektoru (model, nikoli disponibilní účty)</h4>
    <p className="text-xs text-muted-foreground">Hotovost výrobců je již existující modelový stav z uzávěrky tahu, ne nově vytvořené peníze. Není započtena do účetní hotovosti výše — nesčítejte ji se soukromými účty, šlo by o dvojí započtení.</p>
    {!rec ? <p className="text-xs text-muted-foreground">Nedostupné</p> : <>
      <p className="text-xs text-muted-foreground">Tah {rec.turn ?? 'Nedostupné'} · základ {rec.basis ?? 'Nedostupné'}</p>
      <Table><TableBody>
        <TableRow><TableCell>Hotovost výrobců (model, konec tahu)</TableCell><TableCell className="text-right font-mono">{money(t?.producer_cash_closing)}</TableCell></TableRow>
        <TableRow><TableCell>Peněžní fond výrobců v tahu</TableCell><TableCell className="text-right font-mono">{money(t?.producer_cash_pool)}</TableCell></TableRow>
        <TableRow><TableCell>Vyplacené mzdy</TableCell><TableCell className="text-right font-mono">{money(t?.wages_paid)}</TableCell></TableRow>
        <TableRow><TableCell>Vyplacený výnos vlastníkům</TableCell><TableCell className="text-right font-mono">{money(t?.ownership_income_paid)}</TableCell></TableRow>
        <TableRow><TableCell>Mzdové nedoplatky</TableCell><TableCell className="text-right font-mono">{money(t?.arrears_closing)}</TableCell></TableRow>
        <TableRow><TableCell>Skutečné soukromé účty (ledger, {privateCount})</TableCell><TableCell className="text-right font-mono">{money(privateBalance)}</TableCell></TableRow>
        <TableRow><TableCell>Modelová hotovost nezapočtená do účetní hotovosti</TableCell><TableCell className="text-right font-mono">{t?.producer_cash_closing == null ? 'Nedostupné' : money(t.producer_cash_closing)}</TableCell></TableRow>
      </TableBody></Table>
      {!rec.cities.length ? <p className="text-xs text-muted-foreground">Žádné městské záznamy</p> :
        <Table><TableHeader><TableRow><TableHead>Město (klíč)</TableHead><TableHead className="text-right">Hotovost výrobců</TableHead><TableHead className="text-right">Mzdy</TableHead><TableHead className="text-right">Nedoplatky</TableHead><TableHead>Kontrola</TableHead></TableRow></TableHeader><TableBody>
          {rec.cities.map((c, i) => <TableRow key={c.city ?? i}>
            <TableCell className="break-all text-xs">{(c.city && cityNames.get(c.city)) || 'Město'}<br /><span className="font-mono text-muted-foreground">{c.city ?? 'Nedostupné'}</span></TableCell>
            <TableCell className="text-right font-mono">{money(c.values.producer_cash_closing)}</TableCell>
            <TableCell className="text-right font-mono">{money(c.values.wages_paid)}</TableCell>
            <TableCell className="text-right font-mono">{money(c.values.arrears_closing)}</TableCell>
            <TableCell className={c.status === 'ok' ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
              {c.status === 'ok' ? 'Sedí' : c.status === 'mismatch' ? `Nesouhlasí o ${c.residual}` : `Chybí: ${c.missing.join(', ') || 'klíč města'}`}</TableCell>
          </TableRow>)}
        </TableBody></Table>}
    </>}
  </div>;
}

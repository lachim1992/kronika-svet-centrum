import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { accountKindLabel, fetchFinancialSectors, municipalStateFlows, SECTOR_ROWS, sectorBalance } from '@/lib/financialSectors';
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
          const flows = a.sector === 'MUNICIPAL' && !data.stateTransfers.error ? municipalStateFlows(data.stateTransfers.data ?? [], a.id) : null;
          return <TableRow key={a.id}><TableCell className="break-words">{a.label}</TableCell><TableCell>{accountKindLabel(a)}</TableCell><TableCell className="text-right font-mono">{money(a.balance)}</TableCell>
            <TableCell className="text-right font-mono text-xs">{a.sector !== 'MUNICIPAL' ? '—' : flows ? `${money(flows.funded)} / ${money(flows.remitted)}` : 'Nedostupné'}</TableCell></TableRow>;
        })}</TableBody></Table>}
      <p className="text-xs text-muted-foreground">Hotovost nyní = skutečný účetní zůstatek. Ze státu / do státu = skutečně provedené převody se státní pokladnou. Fiskální příjem je modelovaný tok, kapitálová zásoba níže není hotovost.</p>
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
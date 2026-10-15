import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import { useManagementReport } from "@/hooks/useManagementReport";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InfoTip } from "@/components/ui/info-tip";
import { Badge } from "@/components/ui/badge";
import EconomyFieldList from "./EconomyFieldList";
import { BASIS_LABEL } from "@/lib/economyFieldContract";

/**
 * Read-only view of the canonical city accounts and product choice written by the goods engine.
 * No formula is recomputed here — every number comes from the ledger projection.
 */
interface Props { sessionId: string; currentTurn: number; cities: any[]; currentPlayerName: string }

const f = (x: number | undefined, d = 1) => (Number.isFinite(x) ? Number(x).toFixed(d) : "—");
const pct = (x: number | undefined) => (Number.isFinite(x) ? `${Math.round(Number(x) * 100)} %` : "—");

export default function CityAccountsPanel({ sessionId, currentTurn, cities, currentPlayerName }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  // Authorized owner-scoped read model only (read_economy_management RPC); raw ledgers are not readable.
  // react-query keys by session/player/turn, so a stale response for an older turn never overwrites.
  const { data, error, isLoading, refetch } = useManagementReport(sessionId, currentPlayerName, currentTurn);
  const report: any = data?.report;
  const accounts: any[] = report?.cityAccounts || [];
  const choice: any[] = report?.productChoice || [];
  const mode = String(report?.budgetMode || "");

  const mine = cities.filter(c => c.owner_player === currentPlayerName);
  const rows = mine.map(c => ({ city: c, a: accounts.find(a => a.city === c.id) })).filter(r => r.a);
  if (error) return (
    <Card><CardContent className="p-4 text-sm space-y-2" role="alert">
      <p className="text-destructive">Městské účty se nepodařilo načíst: {String((error as any)?.message || error)}</p>
      <Button size="sm" variant="outline" onClick={() => refetch()}>Zkusit znovu</Button>
    </CardContent></Card>);
  if (isLoading) return null;
  if (!rows.length) return (
    <Card><CardContent className="p-4 text-sm text-muted-foreground">
      Městské účty zatím nejsou k dispozici{report ? " — tento uložený přehled je ze starší verze ekonomiky a objeví se po další uzávěrce tahu." : " — přehled vzniká až po uzavření tahu."}
    </CardContent></Card>);

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Městské účty
          <InfoTip>
            HDP města = přidaná hodnota (výstup − vstupy). Příjem z práce = mzdy skutečně vyplacené při minulé uzávěrce tahu, nebo odhad z HDP, dokud vyúčtování neproběhlo (viz sloupec Základ). Příjem z majetku je zatím odhad. Obojí minus daně. Kupní síla = utracená část příjmu. Cenový index = cena základního koše
            v místních cenách vůči základním cenám. Mezera dostupnosti = kolik peněz chybí na základní koš,
            i když zboží fyzicky je. Rozmanitost jen zvyšuje spokojenost, nikdy nevytváří hlad.
            Městský kapitál je zásoba produktivního majetku města — není to kupní síla domácností ani pokladna. Soukromé bohatství domácností se zatím nemodeluje.
          </InfoTip>
          {mode === "bootstrap_unconstrained" && <Badge variant="outline" className="text-[10px]">první výpočet — rozpočet z minulého tahu chybí</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Město</TableHead><TableHead>HDP</TableHead><TableHead>Příjem po daních</TableHead>
              <TableHead>Kupní síla</TableHead><TableHead title="Zda příjem z práce vychází ze skutečně vyplacených mezd, nebo z odhadu">Základ</TableHead><TableHead>Základní koš</TableHead><TableHead>Cenový index</TableHead>
              <TableHead>Reálná kupní síla</TableHead><TableHead>Volný rozpočet</TableHead>
              <TableHead>Pokrytí potřeb</TableHead><TableHead>Mezera dostupnosti</TableHead><TableHead>Rozmanitost jídla</TableHead><TableHead>Prosperita</TableHead><TableHead title="Akumulovaná zásoba produktivního majetku města (odhad). NENÍ kupní síla domácností a NENÍ státní pokladna.">Městský kapitál</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ city, a }) => (
              <Fragment key={city.id}>
                <TableRow key={city.id} className="cursor-pointer" onClick={() => setOpen(open === city.id ? null : city.id)}>
                  <TableCell className="font-medium">{city.name}</TableCell>
                  <TableCell>{f(a.city_gdp)}</TableCell>
                  <TableCell>{f(a.disposable_income)}</TableCell>
                  <TableCell>{f(a.purchasing_power)}</TableCell>
                  <TableCell><Badge variant={a.labor_income_basis === 'settled_wages' ? 'secondary' : 'outline'} className="text-[10px]">{a.labor_income_basis ? BASIS_LABEL[a.labor_income_basis] ?? a.labor_income_basis : 'chybí'}</Badge></TableCell>
                  <TableCell>{f(a.basic_basket_cost)}</TableCell>
                  <TableCell>{f(a.price_index, 2)}</TableCell>
                  <TableCell>{f(a.real_purchasing_power)}</TableCell>
                  <TableCell>{f(a.discretionary_budget)}</TableCell>
                  <TableCell>{pct(a.physical_need_coverage)}</TableCell>
                  <TableCell className={a.affordability_gap > 0 ? "text-destructive" : ""}>{f(a.affordability_gap)}</TableCell>
                  <TableCell>{f(a.diversity?.staple_food?.effective, 1)} druhů</TableCell>
                  <TableCell>{a.prosperity != null ? pct(a.prosperity) : "—"}</TableCell>
                  <TableCell title="Kapitálová zásoba: akumulovaný produktivní/majetkový kapitál města (odhad). Není kupní síla domácností ani státní pokladna; mění se jen uzavřením tahu.">{f(a.capital_stock ?? 0)}{a.capital_candidate ? ` (${a.capital_candidate.delta >= 0 ? "+" : ""}${f(a.capital_candidate.delta, 1)})` : ""}</TableCell>
                </TableRow>
                {open === city.id && (
                  <TableRow key={`${city.id}-d`}>
                    <TableCell colSpan={14} className="text-xs bg-muted/30">
                      <div className="mb-1 text-muted-foreground">
                        Příčiny: daně {f(a.household_taxes)} · ceny index {f(a.price_index, 2)} · přání volných nákupů {f(a.discretionary_wish)},
                        zaplaceno {pct(a.discretionary_ratio)}{a.discretionary_cap ? ` · strop rozpočtu: plán ${f(a.discretionary_cap.planned_spend)} → ${pct(a.discretionary_cap.scale)}${a.discretionary_cap.mode === 'bootstrap_unconstrained' ? ' (bez omezení, první výpočet)' : ''}` : ''}
                      </div>
                      <div className="mb-1 text-muted-foreground">
                        HDP v místních cenách {f(a.nominal_gdp)} (jen informativně; příjem se počítá ze stálých cen) ·
                        výroba {f(a.goods_value_added ?? a.city_gdp)} + obchodní služby {f(a.service_value_added ?? 0)} (zachyceno {pct(a.trade_services?.capture ?? 0)}; obchodní zázemí {f(a.trade_services?.infrastructure ?? 0)}, obsazenost služeb {pct(a.trade_services?.staffing ?? 0)}) ·
                        příjem práce {f(a.labor_income)} · příjem z majetku {f(a.capital_income)} · dostupnost {pct(a.affordability)}
                        <span className="block text-muted-foreground">HDP = přidaná hodnota ve stálých cenách; kupní síla = peněžní tok (× globální faktor {f(a.income_unit_factor, 3)}); dostupnost = kupní síla / cena základního koše.</span>
                      </div>
                      <div className="font-medium mb-1">Mzdy a příjmy domácností</div>
                      <div className="mb-2"><EconomyFieldList row={a} /></div>
                      <div className="font-medium mb-1">Proč lidé volí dané zboží (násobky, 1 = neutrální)</div>
                      <div className="grid grid-cols-12 gap-1">
                        <span>zboží</span><span>podkoš</span><span>podíl podkoše</span><span>v podkoši</span><span>podíl</span><span>obliba</span><span>region</span><span>zvyk</span><span>novost</span><span>kvalita</span><span>věhlas</span><span>cena</span>
                        {choice.filter(c => c.city === city.id).map(c => (
                          <Fragment key={c.good}>
                            <span>{c.good}</span><span>{c.subbasket}</span><span>{pct(c.subbasket_share)}</span><span>{pct(c.within_subbasket_share)}</span><span>{pct(c.share)}</span><span>{f(c.preference, 2)}</span><span>{f(c.region, 2)}</span>
                            <span>{f(c.familiarity, 2)}</span><span>{f(c.novelty, 2)}</span><span>{f(c.quality, 2)}</span><span>{f(c.fame, 2)}</span><span>{f(c.price, 2)}</span>
                          </Fragment>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

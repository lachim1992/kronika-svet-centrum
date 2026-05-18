import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getBasketMeta, getBasketTierClass } from "@/lib/goodsCatalog";
import type { BasketAgg } from "./types";

interface Props {
  rows: BasketAgg[];
  importAvailable: boolean;
  onPick: (basketKey: string) => void;
}

const tierColor: Record<string, string> = {
  need: "text-destructive",
  civic: "text-emerald-500",
  upgrade: "text-amber-500",
  military: "text-red-700",
  luxury: "text-blue-500",
  prestige: "text-purple-500",
};

const BasketMatrix = ({ rows, importAvailable, onPick }: Props) => {
  return (
    <div className="rounded-xl border border-border/40 bg-card/50 overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <h3 className="text-sm font-display font-semibold">📊 Matice košů</h3>
        <span className="text-[10px] text-muted-foreground">Seřazeno dle saturace ↑</span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] px-2">Koš</TableHead>
              <TableHead className="text-[10px] px-2 text-right">Demand</TableHead>
              <TableHead className="text-[10px] px-2 text-right">Local</TableHead>
              <TableHead className="text-[10px] px-2 text-right">Auto</TableHead>
              <TableHead className="text-[10px] px-2 text-right">Recipe</TableHead>
              <TableHead className="text-[10px] px-2 text-right">Building</TableHead>
              <TableHead className="text-[10px] px-2 text-right">Import</TableHead>
              <TableHead className="text-[10px] px-2 text-right">Unmet</TableHead>
              <TableHead className="text-[10px] px-2 text-right">Sat%</TableHead>
              <TableHead className="text-[10px] px-2 text-right">Měst</TableHead>
              <TableHead className="text-[10px] px-2"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(b => {
              const m = getBasketMeta(b.key);
              const tier = getBasketTierClass(b.key);
              const satPct = Math.round(b.sat * 100);
              const satCls = satPct < 50 ? "text-destructive" : satPct < 80 ? "text-amber-500" : "text-primary";
              return (
                <TableRow key={b.key} className="hover:bg-muted/30">
                  <TableCell className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span>{m.icon}</span>
                      <span className="text-xs font-semibold truncate">{m.label}</span>
                      <Badge variant="outline" className={`text-[8px] ${tierColor[tier] || ""}`}>
                        {tier.toUpperCase()}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-right font-mono text-xs">{b.demand.toFixed(0)}</TableCell>
                  <TableCell className="px-2 py-1.5 text-right font-mono text-xs">{b.supply.toFixed(0)}</TableCell>
                  <TableCell className="px-2 py-1.5 text-right font-mono text-[10px] text-muted-foreground">{b.auto.toFixed(1)}</TableCell>
                  <TableCell className="px-2 py-1.5 text-right font-mono text-[10px] text-muted-foreground">{b.recipe.toFixed(1)}</TableCell>
                  <TableCell className="px-2 py-1.5 text-right font-mono text-[10px] text-emerald-600">{b.building.toFixed(1)}</TableCell>
                  <TableCell className="px-2 py-1.5 text-right font-mono text-[10px] text-blue-500">
                    {importAvailable ? b.importVol.toFixed(1) : "—"}
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-right font-mono text-xs text-destructive">
                    {b.unmet > 0 ? `−${b.unmet.toFixed(0)}` : "0"}
                  </TableCell>
                  <TableCell className={`px-2 py-1.5 text-right font-mono text-xs font-bold ${satCls}`}>{satPct}%</TableCell>
                  <TableCell className="px-2 py-1.5 text-right font-mono text-[10px] text-muted-foreground">{b.cityCount}</TableCell>
                  <TableCell className="px-2 py-1.5">
                    <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => onPick(b.key)}>
                      Řešit
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default BasketMatrix;

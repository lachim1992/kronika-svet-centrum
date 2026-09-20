// Read-only detail of one physical trade corridor on the map: which goods and
// basket deliveries actually travel along it, between which settlements, and
// how much value each movement carries. No writes, no derived economy logic.

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { getBasketMeta } from "@/lib/goodsCatalog";

export type CorridorFlow = {
  id: string; corridor: string; layer: "goods" | "baskets"; label: string;
  sourceCityId: string | null; targetCityId: string | null; sourcePlayer: string | null; targetPlayer: string | null;
  volume: number; value: number; modes: string[];
};

const MODE_LABEL: Record<string, string> = { road: "po cestě", river: "po řece", sea: "po moři", land: "po zemi" };
const fmt = (value: number) => Number(value || 0).toLocaleString("cs-CZ", { maximumFractionDigits: 2 });

interface Props {
  corridor: string | null;
  flows: CorridorFlow[];
  cityName: (id: string | null) => string;
  onClose: () => void;
}

const TradeCorridorSheet = ({ corridor, flows, cityName, onClose }: Props) => {
  const rows = corridor ? flows.filter(flow => flow.corridor === corridor) : [];
  const goods = rows.filter(row => row.layer === "goods");
  const baskets = rows.filter(row => row.layer === "baskets");
  const totalValue = rows.reduce((sum, row) => sum + row.value, 0);
  const modes = [...new Set(rows.flatMap(row => row.modes))];

  const group = (list: CorridorFlow[]) => {
    const map = new Map<string, CorridorFlow & { count: number }>();
    list.forEach(row => {
      const key = `${row.label}:${row.sourceCityId}:${row.targetCityId}`;
      const existing = map.get(key);
      if (existing) { existing.volume += row.volume; existing.value += row.value; existing.count += 1; }
      else map.set(key, { ...row, count: 1 });
    });
    return [...map.values()].sort((a, b) => b.value - a.value || b.volume - a.volume);
  };

  const label = (row: CorridorFlow) =>
    row.layer === "baskets" ? `${getBasketMeta(row.label).icon} ${getBasketMeta(row.label).label}` : `📦 ${row.label}`;

  return (
    <Sheet open={!!corridor} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">Obchodní trasa</SheetTitle>
        </SheetHeader>
        <div className="mt-3 space-y-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{rows.length} zásilek</Badge>
            <Badge variant="secondary">hodnota {fmt(totalValue)}</Badge>
            {modes.map(mode => <Badge key={mode} variant="outline">{MODE_LABEL[mode] || mode}</Badge>)}
          </div>

          {[{ title: "Hotové zboží a koše poptávky", list: baskets }, { title: "Suroviny a polotovary", list: goods }].map(section => (
            <section key={section.title} className="space-y-2">
              <h4 className="font-display text-xs uppercase tracking-wide text-muted-foreground">{section.title}</h4>
              {section.list.length === 0
                ? <p className="text-xs text-muted-foreground">Po této trase nic z této skupiny neputuje.</p>
                : group(section.list).map(row => (
                  <div key={row.id} className="rounded-lg border border-border p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{label(row)}</span>
                      <span className="text-xs text-muted-foreground">{fmt(row.value)} 💰</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {cityName(row.sourceCityId)} → {cityName(row.targetCityId)} · {fmt(row.volume)} jednotek
                      {row.sourcePlayer && row.targetPlayer && row.sourcePlayer !== row.targetPlayer
                        ? ` · ${row.sourcePlayer} → ${row.targetPlayer}` : ""}
                    </p>
                  </div>
                ))}
            </section>
          ))}

          <p className="text-[11px] text-muted-foreground">
            Zobrazené zásilky pocházejí z posledního přepočtu ekonomiky. Přerušení trasy je zastaví i s navazující výrobou.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default TradeCorridorSheet;

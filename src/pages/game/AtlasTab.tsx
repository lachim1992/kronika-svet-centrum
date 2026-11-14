import { useMemo, useState } from "react";
import { BookMarked } from "lucide-react";
import AtlasOverview from "@/components/atlas/AtlasOverview";
import AtlasGoods from "@/components/atlas/AtlasGoods";
import AtlasBaskets from "@/components/atlas/AtlasBaskets";
import AtlasChains from "@/components/atlas/AtlasChains";
import AtlasMarkets from "@/components/atlas/AtlasMarkets";
import AtlasTerritory from "@/components/atlas/AtlasTerritory";
import { useAtlasCatalog, useAtlasTerritory, useWorldMarket } from "@/hooks/useAtlasData";
import { useManagementReport } from "@/hooks/useManagementReport";
import { aggregateWorldMarket } from "@/lib/atlas/market";

const SECTIONS = [["overview", "Jak funguje svět"], ["goods", "Suroviny a zboží"], ["baskets", "Spotřební koše"], ["chains", "Výrobní řetězce"], ["markets", "Světové trhy"], ["territory", "Moje území"]] as const;
type Section = typeof SECTIONS[number][0];

/** Read-only encyclopedia of the actual game economy. Never triggers refresh, turns or commands. */
export default function AtlasTab({ sessionId, currentPlayerName, currentTurn }: { sessionId: string; currentPlayerName: string; currentTurn: number }) {
  const [section, setSection] = useState<Section>("overview");
  const [focus, setFocus] = useState<string | null>(null);
  const catalog = useAtlasCatalog();
  const marketQ = useWorldMarket(sessionId);
  const territory = useAtlasTerritory(sessionId, currentPlayerName);
  const mgmt = useManagementReport(sessionId, currentPlayerName, currentTurn);
  const goods = catalog.data?.goods.rows || []; const recipes = catalog.data?.recipes.rows || [];
  const market = useMemo(() => marketQ.data ? aggregateWorldMarket(marketQ.data.rows, { complete: marketQ.data.complete, error: marketQ.data.error, snapshotTurn: marketQ.data.snapshotTurn, currentTurn })
    : marketQ.error ? aggregateWorldMarket([], { complete: false, error: String(marketQ.error), snapshotTurn: null, currentTurn }) : null, [marketQ.data, marketQ.error, currentTurn]);
  const openChain = (g: string) => { setFocus(g); setSection("chains"); };
  const catalogIncomplete = catalog.data && (!catalog.data.goods.complete || !catalog.data.recipes.complete);
  return <div className="mx-auto max-w-7xl space-y-4 p-3 pb-24 md:p-6" data-testid="atlas-tab">
    <header className="flex items-center gap-3">
      <BookMarked className="h-6 w-6 text-primary" />
      <div><h1 className="font-display text-2xl">Atlas</h1><p className="text-xs text-muted-foreground">Encyklopedie skutečné herní reality · pouze čtení · tah {currentTurn}</p></div>
    </header>
    <nav aria-label="Sekce Atlasu" className="flex gap-1 overflow-x-auto rounded-lg border border-border/70 bg-card/50 p-1">
      {SECTIONS.map(([id, label]) => <button key={id} type="button" aria-pressed={section === id} onClick={() => setSection(id)}
        className={`whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium md:text-sm ${section === id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}>{label}</button>)}
    </nav>
    {catalog.isLoading && <p className="text-sm text-muted-foreground">Načítám katalog…</p>}
    {(catalog.error || catalogIncomplete) && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">Katalog zboží nebo receptů se nenačetl úplně. Údaje mohou chybět.</p>}
    {section === "overview" && <AtlasOverview />}
    {section === "goods" && <AtlasGoods goods={goods} recipes={recipes} market={market} onOpenChain={openChain} />}
    {section === "baskets" && <AtlasBaskets goods={goods} onOpenChain={openChain} />}
    {section === "chains" && <AtlasChains goods={goods} recipes={recipes} focus={focus} onFocus={setFocus} />}
    {section === "markets" && <AtlasMarkets market={market} goods={goods} report={mgmt.data?.report ?? null} reportTurn={mgmt.data?.reportTurn ?? null} />}
    {section === "territory" && <AtlasTerritory territory={territory.data} report={mgmt.data?.report ?? null} reportTurn={mgmt.data?.reportTurn ?? null} recipes={recipes} goods={goods} />}
  </div>;
}

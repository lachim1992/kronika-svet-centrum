import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InfoTip } from "@/components/ui/info-tip";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  sessionId: string;
  playerName?: string;
}

interface SystemRow {
  id: string;
  system_key: string;
  node_count: number;
  route_count: number;
  total_capacity: number;
  member_players: string[];
  computed_turn: number | null;
}
interface BasketRow {
  trade_system_id: string;
  basket_key: string;
  total_supply: number;
  total_demand: number;
  surplus: number;
  shortage: number;
  price_index: number;
  avg_quality: number;
}
interface AccessRow {
  trade_system_id: string;
  player_name: string;
  access_level: string;
  tariff_factor: number;
}

const TradeSystemsSubTab = ({ sessionId, playerName }: Props) => {
  const [systems, setSystems] = useState<SystemRow[]>([]);
  const [baskets, setBaskets] = useState<BasketRow[]>([]);
  const [access, setAccess] = useState<AccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);

  const loadData = async () => {
    const [sRes, bRes, aRes] = await Promise.all([
      supabase.from("trade_systems").select("*").eq("session_id", sessionId).order("node_count", { ascending: false }),
      supabase.from("trade_system_basket_supply").select("*").eq("session_id", sessionId),
      supabase.from("player_trade_system_access").select("*").eq("session_id", sessionId),
    ]);
    setSystems((sRes.data as SystemRow[]) || []);
    setBaskets((bRes.data as BasketRow[]) || []);
    setAccess((aRes.data as AccessRow[]) || []);
  };

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      const { data, error } = await supabase.functions.invoke("compute-trade-flows", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
      toast({
        title: "Obchodní toky přepočítány",
        description: `${data?.flows_computed ?? "?"} toků, ${data?.systems_updated ?? "?"} systémů aktualizováno.`,
      });
      await loadData();
    } catch (e: any) {
      toast({ title: "Chyba při přepočtu", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setRecomputing(false);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      await loadData();
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [sessionId]);

  if (loading) return <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>;

  // Filter out micro-systems (1-node islands) for headline list
  const networked = systems.filter(s => s.node_count > 1);
  const islands = systems.filter(s => s.node_count <= 1);

  const renderSystem = (s: SystemRow) => {
    const myAccess = playerName ? access.find(a => a.trade_system_id === s.id && a.player_name === playerName) : undefined;
    const memberOf = playerName && s.member_players.includes(playerName);
    const sysBaskets = baskets.filter(b => b.trade_system_id === s.id).sort((a, b) => b.total_supply - a.total_supply);
    const totalSupply = sysBaskets.reduce((sum, b) => sum + Number(b.total_supply), 0);
    const totalDemand = sysBaskets.reduce((sum, b) => sum + Number(b.total_demand), 0);
    const totalShortage = sysBaskets.reduce((sum, b) => sum + Number(b.shortage), 0);

    return (
      <AccordionItem key={s.id} value={s.id} className="border border-border/40 rounded-lg px-3">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-2 flex-1 text-left">
            <span className="font-mono text-[10px] text-muted-foreground">{s.system_key.slice(0, 8)}</span>
            {memberOf && <Badge variant="default" className="text-[10px] h-5">člen</Badge>}
            {myAccess && !memberOf && <Badge variant="secondary" className="text-[10px] h-5">{myAccess.access_level}</Badge>}
            <span className="text-xs text-muted-foreground ml-auto flex gap-3">
              <span>🏘 {s.node_count}</span>
              <span>🛤 {s.route_count}</span>
              <span>📦 {sysBaskets.length}</span>
            </span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 pb-3">
          <div className="grid grid-cols-4 gap-2 text-[11px]">
            <div className="bg-muted/40 rounded p-2 text-center">
              <div className="text-muted-foreground text-[9px] uppercase">Kapacita</div>
              <div className="font-mono font-bold">{Number(s.total_capacity).toFixed(0)}</div>
            </div>
            <div className="bg-muted/40 rounded p-2 text-center">
              <div className="text-muted-foreground text-[9px] uppercase">Supply</div>
              <div className="font-mono font-bold">{totalSupply.toFixed(0)}</div>
            </div>
            <div className="bg-muted/40 rounded p-2 text-center">
              <div className="text-muted-foreground text-[9px] uppercase">Demand</div>
              <div className="font-mono font-bold">{totalDemand.toFixed(0)}</div>
            </div>
            <div className="bg-muted/40 rounded p-2 text-center">
              <div className="text-muted-foreground text-[9px] uppercase">Shortage</div>
              <div className={`font-mono font-bold ${totalShortage > 0 ? "text-destructive" : ""}`}>{totalShortage.toFixed(0)}</div>
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Členové ({s.member_players.length})</div>
            <div className="flex flex-wrap gap-1">
              {s.member_players.length === 0 && <span className="text-[11px] text-muted-foreground italic">žádný hráč (neutrální)</span>}
              {s.member_players.map(p => (
                <Badge key={p} variant={p === playerName ? "default" : "outline"} className="text-[10px] h-5">{p}</Badge>
              ))}
            </div>
          </div>

          {myAccess && (
            <div className="bg-primary/5 border border-primary/20 rounded p-2 text-[11px]">
              <span className="font-semibold">Tvůj přístup:</span> {myAccess.access_level}
              <span className="ml-2 text-muted-foreground">tariff × {Number(myAccess.tariff_factor).toFixed(2)}</span>
              <span className="ml-2 text-[9px] text-muted-foreground">({(myAccess as any).access_source})</span>
            </div>
          )}

          {sysBaskets.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Košíky</div>
              <div className="space-y-1">
                {sysBaskets.slice(0, 12).map(b => {
                  const fill = b.total_demand > 0 ? Math.min(1, Number(b.total_supply) / Number(b.total_demand)) : 1;
                  return (
                    <div key={b.basket_key} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-[11px] items-center">
                      <span className="truncate">{b.basket_key}</span>
                      <span className="font-mono text-muted-foreground">S {Number(b.total_supply).toFixed(0)}</span>
                      <span className="font-mono text-muted-foreground">D {Number(b.total_demand).toFixed(0)}</span>
                      <span className={`font-mono ${fill < 0.5 ? "text-destructive" : fill < 0.9 ? "text-yellow-500" : "text-primary"}`}>
                        {(fill * 100).toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            🌐 Obchodní systémy
            <InfoTip>Sítě propojených uzlů sdílející trh. Každý systém má vlastní supply/demand, kapacitu a členy.</InfoTip>
            <span className="ml-auto text-xs text-muted-foreground">{networked.length} aktivních / {islands.length} izolovaných</span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRecompute}
              disabled={recomputing}
              className="h-7 text-xs gap-1"
            >
              <RefreshCw className={`h-3 w-3 ${recomputing ? "animate-spin" : ""}`} />
              {recomputing ? "Počítám…" : "Přepočítat toky"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <ScrollArea className="max-h-[60vh]">
            <Accordion type="multiple" className="space-y-2">
              {networked.map(renderSystem)}
            </Accordion>
            {islands.length > 0 && (
              <div className="pt-3 mt-3 border-t border-border/30">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Izolované uzly ({islands.length}) — bez napojení na cestu
                </div>
                <div className="flex flex-wrap gap-1">
                  {islands.map(s => (
                    <span key={s.id} className="text-[10px] font-mono bg-muted/30 rounded px-1.5 py-0.5">
                      {s.system_key.slice(0, 8)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default TradeSystemsSubTab;

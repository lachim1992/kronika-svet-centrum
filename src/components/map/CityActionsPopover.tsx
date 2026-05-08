import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Eye, EyeOff, Handshake, ArrowLeftRight, Swords, Crown,
  ScrollText, Send, Loader2, Network, Shield, Users, MapPin,
} from "lucide-react";
import { discoverEntity, canAutoDiscover } from "@/lib/cityDiscovery";

interface Props {
  open: boolean;
  cityId: string | null;
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  knownCoords?: Set<string>;
  onClose: () => void;
  onOpenWiki: (cityId: string) => void;
  onOpenTrade: () => void;
  onOpenDiplomacy: () => void;
  onOpenArmy: () => void;
}

interface CityRow {
  id: string; name: string; owner_player: string | null;
  population: number | null; level: string | null;
  hex_q?: number | null; hex_r?: number | null;
  is_neutral?: boolean | null;
}

interface Treaty {
  id: string; treaty_type: string; status: string;
  player_a: string; player_b: string; signed_turn: number | null;
}

const RELATIONSHIP_LABEL: Record<string, { label: string; color: string }> = {
  own:      { label: "Vlastní město",   color: "bg-primary/15 text-primary border-primary/30" },
  neutral:  { label: "Neutrální",       color: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  foreign:  { label: "Cizí říše",       color: "bg-muted text-muted-foreground border-border" },
};

const CityActionsPopover = ({
  open, cityId, sessionId, currentPlayerName, currentTurn,
  knownCoords, onClose, onOpenWiki, onOpenTrade, onOpenDiplomacy, onOpenArmy,
}: Props) => {
  const [city, setCity] = useState<CityRow | null>(null);
  const [discovered, setDiscovered] = useState<boolean>(false);
  const [treaties, setTreaties] = useState<Treaty[]>([]);
  const [tradeAccess, setTradeAccess] = useState<{ access_level: string; tariff_factor: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!cityId) return;
    setLoading(true);
    // City + its hex via the linked province_node
    const [cityRes, nodeRes] = await Promise.all([
      supabase.from("cities")
        .select("id, name, owner_player, population_total, settlement_level")
        .eq("id", cityId).maybeSingle(),
      supabase.from("province_nodes")
        .select("hex_q, hex_r, trade_system_id")
        .eq("session_id", sessionId).eq("city_id", cityId).maybeSingle(),
    ]);
    const c = cityRes.data;
    const node = nodeRes.data;
    setCity(c ? { ...(c as any), hex_q: node?.hex_q ?? null, hex_r: node?.hex_r ?? null } : null);

    const { data: disc } = await supabase
      .from("discoveries")
      .select("id")
      .eq("session_id", sessionId).eq("player_name", currentPlayerName)
      .eq("entity_type", "city").eq("entity_id", cityId).maybeSingle();
    setDiscovered(!!disc);

    if (c?.owner_player && c.owner_player !== currentPlayerName) {
      const owner = c.owner_player;
      const { data: t } = await supabase
        .from("diplomatic_treaties")
        .select("id, treaty_type, status, player_a, player_b, signed_turn")
        .eq("session_id", sessionId)
        .or(`and(player_a.eq.${currentPlayerName},player_b.eq.${owner}),and(player_a.eq.${owner},player_b.eq.${currentPlayerName})`);
      setTreaties((t as Treaty[]) || []);

      if (node?.trade_system_id) {
        const { data: acc } = await supabase
          .from("player_trade_system_access")
          .select("access_level, tariff_factor")
          .eq("session_id", sessionId).eq("player_name", currentPlayerName)
          .eq("trade_system_id", node.trade_system_id).maybeSingle();
        setTradeAccess(acc as any || null);
      } else setTradeAccess(null);
    } else { setTreaties([]); setTradeAccess(null); }
    setLoading(false);
  }, [cityId, sessionId, currentPlayerName]);

  useEffect(() => { if (open && cityId) load(); }, [open, cityId, load]);

  if (!open || !cityId) return null;

  const isOwn = city?.owner_player === currentPlayerName;
  const isNeutral = !!city?.is_neutral || !city?.owner_player;
  const relKey = isOwn ? "own" : isNeutral ? "neutral" : "foreign";
  const rel = RELATIONSHIP_LABEL[relKey];

  const canAutoDisc = city?.hex_q != null && city?.hex_r != null
    && canAutoDiscover(city.hex_q, city.hex_r, knownCoords);

  const activeTreaty = treaties.find(t => t.status === "active");
  const pendingTreaty = treaties.find(t => t.status === "pending");
  const hasTradeAccess = !!tradeAccess && (tradeAccess.access_level === "direct"
    || tradeAccess.access_level === "treaty" || tradeAccess.access_level === "open");

  // ─── Actions ───
  const doAutoDiscover = async () => {
    if (!cityId) return;
    setBusy("discover");
    try {
      await discoverEntity(sessionId, currentPlayerName, "city", cityId, "auto_proximity");
      setDiscovered(true);
      toast.success(`${city?.name} bylo objeveno`);
    } catch (e: any) { toast.error("Discovery selhal: " + e.message); }
    finally { setBusy(null); }
  };

  const sendEnvoy = async () => {
    if (!cityId) return;
    setBusy("envoy");
    try {
      const completesAt = new Date(Date.now() + 60_000).toISOString();
      await supabase.from("action_queue").insert({
        session_id: sessionId,
        player_name: currentPlayerName,
        action_type: "envoy",
        completes_at: completesAt,
        execute_on_turn: currentTurn + 1,
        action_data: { target_entity: "city", target_id: cityId, target_name: city?.name, cost: 20 },
        status: "pending",
      });
      await discoverEntity(sessionId, currentPlayerName, "city", cityId, "envoy");
      setDiscovered(true);
      toast.success("Poselstvo vysláno — město objeveno (akce vyřízena v dalším tahu)");
    } catch (e: any) { toast.error("Poselstvo selhalo: " + e.message); }
    finally { setBusy(null); }
  };

  const requestTradeAccess = async () => {
    if (!city?.owner_player) return;
    setBusy("treaty");
    try {
      const { error } = await supabase.from("diplomatic_treaties").insert({
        session_id: sessionId,
        treaty_type: "trade_access",
        player_a: currentPlayerName,
        player_b: city.owner_player,
        status: "pending",
        metadata: { requested_for_city: cityId, requested_at_turn: currentTurn },
      });
      if (error) throw error;
      await supabase.from("game_events").insert({
        session_id: sessionId,
        turn_number: currentTurn,
        event_type: "trade_access_requested",
        importance: "important",
        player: currentPlayerName,
        actor_type: "player",
        note: `${currentPlayerName} žádá o obchodní přístup k městu ${city.name} (vlastník ${city.owner_player}).`,
        city_id: cityId,
        reference: { from: currentPlayerName, to: city.owner_player, city_id: cityId },
      });
      toast.success(`Žádost odeslána ${city.owner_player}`);
      await load();
    } catch (e: any) { toast.error("Žádost selhala: " + e.message); }
    finally { setBusy(null); }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <MapPin className="h-4 w-4 text-primary" />
            <SheetTitle className="font-display">{city?.name || "…"}</SheetTitle>
            <Badge variant="outline" className={`text-[10px] ${rel.color}`}>{rel.label}</Badge>
          </div>
          <SheetDescription className="text-xs">
            {city?.owner_player ? `Vládce: ${city.owner_player}` : "Bez vládce"}
            {(city as any)?.population_total ? ` · 👥 ${((city as any).population_total as number).toLocaleString()}` : ""}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* ─── Status ─── */}
            <div className="rounded-lg border border-border bg-card/50 p-3 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                {discovered ? (
                  <><Eye className="h-3.5 w-3.5 text-primary" /><span>Objeveno</span></>
                ) : (
                  <><EyeOff className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-muted-foreground">Neobjeveno</span></>
                )}
              </div>
              {!isOwn && !isNeutral && (
                <div className="flex items-center gap-2">
                  <Network className="h-3.5 w-3.5 text-primary" />
                  {hasTradeAccess ? (
                    <span>Obchodní přístup: <Badge variant="secondary" className="text-[9px] ml-1">{tradeAccess?.access_level}</Badge></span>
                  ) : pendingTreaty ? (
                    <span className="text-amber-600 dark:text-amber-400">Žádost o přístup čeká…</span>
                  ) : (
                    <span className="text-muted-foreground">Bez obchodního přístupu</span>
                  )}
                </div>
              )}
              {activeTreaty && (
                <div className="flex items-center gap-2">
                  <Handshake className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Smlouva: <Badge variant="outline" className="text-[9px] ml-1">{activeTreaty.treaty_type}</Badge></span>
                </div>
              )}
            </div>

            <Separator />

            {/* ─── Actions ─── */}
            <div className="space-y-2">
              {!discovered && (
                canAutoDisc ? (
                  <Button onClick={doAutoDiscover} disabled={busy !== null} className="w-full justify-start gap-2" size="sm">
                    {busy === "discover" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                    Auto-objevit (sousedí s tvým územím)
                  </Button>
                ) : (
                  <Button onClick={sendEnvoy} disabled={busy !== null} className="w-full justify-start gap-2" size="sm">
                    {busy === "envoy" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Vyslat poselstvo (20 zlata, 1 tah)
                  </Button>
                )
              )}

              {discovered && !isOwn && !isNeutral && !hasTradeAccess && !pendingTreaty && (
                <Button onClick={requestTradeAccess} disabled={busy !== null} className="w-full justify-start gap-2" size="sm" variant="default">
                  {busy === "treaty" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Network className="h-3.5 w-3.5" />}
                  Žádost o obchodní přístup
                </Button>
              )}

              {discovered && (
                <Button onClick={() => { onOpenTrade(); onClose(); }} variant="outline" size="sm" className="w-full justify-start gap-2">
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  Vytvořit obchodní route
                </Button>
              )}

              {discovered && !isOwn && !isNeutral && (
                <Button onClick={() => { onOpenDiplomacy(); onClose(); }} variant="outline" size="sm" className="w-full justify-start gap-2">
                  <Handshake className="h-3.5 w-3.5" />
                  Diplomacie ({city?.owner_player})
                </Button>
              )}

              {discovered && !isOwn && (
                <Button onClick={() => { onOpenArmy(); onClose(); }} variant="outline" size="sm" className="w-full justify-start gap-2">
                  <Swords className="h-3.5 w-3.5" />
                  Vyslat armádu / Útok
                </Button>
              )}

              {discovered && !isOwn && (
                <Button disabled variant="outline" size="sm" className="w-full justify-start gap-2 opacity-50">
                  <Shield className="h-3.5 w-3.5" />
                  Špionáž <span className="ml-auto text-[9px]">brzy</span>
                </Button>
              )}

              {isOwn && (
                <Button onClick={() => { onOpenWiki(cityId); onClose(); }} variant="outline" size="sm" className="w-full justify-start gap-2">
                  <Crown className="h-3.5 w-3.5" />
                  Spravovat město
                </Button>
              )}
            </div>

            <Separator />

            <Button
              onClick={() => { onOpenWiki(cityId); onClose(); }}
              variant="ghost" size="sm"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
            >
              <ScrollText className="h-3.5 w-3.5" />
              Otevřít wiki
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default CityActionsPopover;

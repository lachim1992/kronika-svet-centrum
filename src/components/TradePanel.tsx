import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InfoTip } from "@/components/ui/info-tip";
import { toast } from "sonner";
import {
  ArrowLeftRight, Loader2, Plus, X, Check, Ban,
  TrendingUp, Ship, HandshakeIcon, AlertTriangle,
} from "lucide-react";
import { dispatchCommand } from "@/lib/commands";
import {
  TRADEABLE_RESOURCES, TRADE_RESOURCE_META, TRADE_STATUS_LABELS,
  MAX_TRADE_ROUTES, computeTradeEfficiency,
} from "@/lib/tradeConstants";

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  myCities: any[];
  allCities: any[];
  realm: any;
  onRefetch?: () => void;
}

const TradePanel = ({ sessionId, currentPlayerName, currentTurn, myCities, allCities, realm, onRefetch }: Props) => {
  const [routes, setRoutes] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewOffer, setShowNewOffer] = useState(false);
  const [saving, setSaving] = useState(false);

  // New offer form state
  const [fromCityId, setFromCityId] = useState("");
  const [toCityId, setToCityId] = useState("");
  const [offerRes, setOfferRes] = useState<string>("gold");
  const [offerAmt, setOfferAmt] = useState(5);
  const [requestRes, setRequestRes] = useState<string>("grain");
  const [requestAmt, setRequestAmt] = useState(5);
  const [duration, setDuration] = useState(5);
  const [message, setMessage] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [routeRes, offerRes] = await Promise.all([
      supabase.from("trade_routes").select("*")
        .eq("session_id", sessionId)
        .or(`from_player.eq.${currentPlayerName},to_player.eq.${currentPlayerName}`)
        .order("created_at", { ascending: false }),
      supabase.from("trade_offers").select("*")
        .eq("session_id", sessionId)
        .or(`from_player.eq.${currentPlayerName},to_player.eq.${currentPlayerName}`)
        .order("created_at", { ascending: false }),
    ]);
    setRoutes(routeRes.data || []);
    setOffers(offerRes.data || []);
    setLoading(false);
  }, [sessionId, currentPlayerName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime for incoming offers
  useEffect(() => {
    const channel = supabase
      .channel("trade-offers")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "trade_offers",
        filter: `to_player=eq.${currentPlayerName}`,
      }, () => { fetchData(); toast.info("📨 Nová obchodní nabídka!"); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentPlayerName, fetchData]);

  const otherCities = allCities.filter(c => c.owner_player !== currentPlayerName);
  const myCityIds = new Set(myCities.map(c => c.id));
  const cityNameMap: Record<string, string> = {};
  allCities.forEach(c => { cityNameMap[c.id] = c.name; });

  const activeRoutes = routes.filter(r => r.status === "active");
  const pendingIncoming = offers.filter(o => o.status === "pending" && o.to_player === currentPlayerName);
  const pendingOutgoing = offers.filter(o => o.status === "pending" && o.from_player === currentPlayerName);

  // Calculate trade income/expense summary
  const tradeIncome: Record<string, number> = {};
  const tradeExpense: Record<string, number> = {};
  for (const r of activeRoutes) {
    if (r.from_player === currentPlayerName) {
      tradeExpense[r.resource_type] = (tradeExpense[r.resource_type] || 0) + r.amount_per_turn;
      if (r.return_resource_type && r.return_amount > 0) {
        tradeIncome[r.return_resource_type] = (tradeIncome[r.return_resource_type] || 0) + r.return_amount;
      }
    } else {
      tradeIncome[r.resource_type] = (tradeIncome[r.resource_type] || 0) + r.amount_per_turn;
      if (r.return_resource_type && r.return_amount > 0) {
        tradeExpense[r.return_resource_type] = (tradeExpense[r.return_resource_type] || 0) + r.return_amount;
      }
    }
  }

  const handleCreateOffer = async () => {
    if (!fromCityId || !toCityId) { toast.error("Vyberte obě města"); return; }
    if (offerAmt <= 0 && requestAmt <= 0) { toast.error("Zadejte množství"); return; }
    const targetCity = allCities.find(c => c.id === toCityId);
    if (!targetCity) return;

    setSaving(true);
    const { error } = await supabase.from("trade_offers").insert({
      session_id: sessionId,
      from_player: currentPlayerName,
      to_player: targetCity.owner_player,
      from_city_id: fromCityId,
      to_city_id: toCityId,
      offer_resources: { [offerRes]: offerAmt },
      request_resources: { [requestRes]: requestAmt },
      duration_turns: duration,
      message: message || null,
      turn_number: currentTurn,
    });

    if (error) { toast.error("Chyba při vytváření nabídky"); }
    else {
      toast.success("📨 Obchodní nabídka odeslána!");
      const chronicleText = `**${currentPlayerName}** odeslal obchodní nabídku hráči **${targetCity.owner_player}**: ${TRADE_RESOURCE_META[offerRes as keyof typeof TRADE_RESOURCE_META]?.icon || ""}${offerAmt} ${TRADE_RESOURCE_META[offerRes as keyof typeof TRADE_RESOURCE_META]?.label || offerRes} za ${TRADE_RESOURCE_META[requestRes as keyof typeof TRADE_RESOURCE_META]?.icon || ""}${requestAmt} ${TRADE_RESOURCE_META[requestRes as keyof typeof TRADE_RESOURCE_META]?.label || requestRes}.`;
      await dispatchCommand({
        sessionId, turnNumber: currentTurn,
        actor: { name: currentPlayerName, type: "player" },
        commandType: "CREATE_TRADE_OFFER",
        commandPayload: { chronicleText, toPlayer: targetCity.owner_player },
      });
      setShowNewOffer(false);
      setMessage("");
      fetchData();
    }
    setSaving(false);
  };

  const handleAcceptOffer = async (offer: any) => {
    setSaving(true);
    // Create trade route from this offer
    const offerR = offer.offer_resources || {};
    const reqR = offer.request_resources || {};
    const resType = Object.keys(offerR)[0] || "gold";
    const resAmt = offerR[resType] || 0;
    const retType = Object.keys(reqR)[0] || null;
    const retAmt = reqR[retType || ""] || 0;

    await supabase.from("trade_routes").insert({
      session_id: sessionId,
      from_city_id: offer.from_city_id,
      to_city_id: offer.to_city_id,
      from_player: offer.from_player,
      to_player: offer.to_player,
      resource_type: resType,
      amount_per_turn: resAmt,
      return_resource_type: retType,
      return_amount: retAmt,
      duration_turns: offer.duration_turns,
      started_turn: currentTurn,
      expires_turn: offer.duration_turns ? currentTurn + offer.duration_turns : null,
      status: "active",
    });

    await supabase.from("trade_offers").update({
      status: "accepted",
      responded_at: new Date().toISOString(),
    }).eq("id", offer.id);

    const chronicleText = `Obchodní dohoda uzavřena mezi **${offer.from_player}** a **${offer.to_player}**: trasa ${cityNameMap[offer.from_city_id] || "?"} ↔ ${cityNameMap[offer.to_city_id] || "?"}.`;
    await dispatchCommand({
      sessionId, turnNumber: currentTurn,
      actor: { name: currentPlayerName, type: "player" },
      commandType: "ACCEPT_TRADE_OFFER",
      commandPayload: { chronicleText, fromPlayer: offer.from_player, toPlayer: offer.to_player },
    });

    toast.success("✅ Obchodní dohoda uzavřena!");
    // Propagate the new route to flows / wealth immediately so the player sees
    // the impact in HUD and economy panel without waiting for next turn.
    try {
      await supabase.functions.invoke("refresh-economy", { body: { session_id: sessionId } });
    } catch (e) {
      console.warn("refresh-economy after trade accept failed:", e);
    }
    setSaving(false);
    onRefetch?.();
    fetchData();
  };

  const handleRejectOffer = async (offerId: string) => {
    await supabase.from("trade_offers").update({
      status: "rejected",
      responded_at: new Date().toISOString(),
    }).eq("id", offerId);
    toast.info("Nabídka odmítnuta");
    fetchData();
  };

  const handleCancelRoute = async (routeId: string) => {
    await supabase.from("trade_routes").update({ status: "cancelled" }).eq("id", routeId);
    toast.info("Obchodní trasa zrušena");
    fetchData();
    onRefetch?.();
  };

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* ─── TRADE SUMMARY ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-primary" />Obchodní přehled
            <Badge variant="secondary" className="text-[10px] ml-auto">{activeRoutes.length} tras</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeRoutes.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-3">
              Žádné aktivní obchodní trasy. Vytvořte nabídku níže.
            </p>
          ) : (
            <div className="space-y-2">
              {/* Net trade flows */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="p-2 rounded bg-muted/30">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase mb-1">Příjmy z obchodu</p>
                  {Object.entries(tradeIncome).length > 0 ? (
                    Object.entries(tradeIncome).map(([res, amt]) => (
                      <div key={res} className="flex justify-between text-xs">
                        <span>{TRADE_RESOURCE_META[res as keyof typeof TRADE_RESOURCE_META]?.icon} {TRADE_RESOURCE_META[res as keyof typeof TRADE_RESOURCE_META]?.label || res}</span>
                        <span className="text-primary font-semibold">+{amt}/kolo</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[10px] text-muted-foreground italic">—</p>
                  )}
                </div>
                <div className="p-2 rounded bg-muted/30">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase mb-1">Výdaje obchodu</p>
                  {Object.entries(tradeExpense).length > 0 ? (
                    Object.entries(tradeExpense).map(([res, amt]) => (
                      <div key={res} className="flex justify-between text-xs">
                        <span>{TRADE_RESOURCE_META[res as keyof typeof TRADE_RESOURCE_META]?.icon} {TRADE_RESOURCE_META[res as keyof typeof TRADE_RESOURCE_META]?.label || res}</span>
                        <span className="text-destructive font-semibold">-{amt}/kolo</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[10px] text-muted-foreground italic">—</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── INCOMING OFFERS ─── */}
      {pendingIncoming.length > 0 && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <HandshakeIcon className="h-4 w-4 text-primary" />Příchozí nabídky
              <Badge variant="default" className="text-[10px] ml-auto">{pendingIncoming.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingIncoming.map(o => {
              const offerR = o.offer_resources || {};
              const reqR = o.request_resources || {};
              return (
                <div key={o.id} className="p-3 rounded-lg border border-primary/20 bg-primary/5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Ship className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-display font-semibold">Od: {o.from_player}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {cityNameMap[o.from_city_id] || "?"} → {cityNameMap[o.to_city_id] || "?"}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{o.duration_turns} kol</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs mb-2">
                    <span className="text-primary font-semibold">Nabízí:</span>
                    {Object.entries(offerR).map(([r, a]) => (
                      <span key={r}>{TRADE_RESOURCE_META[r as keyof typeof TRADE_RESOURCE_META]?.icon}{String(a)}</span>
                    ))}
                    <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                    <span className="text-destructive font-semibold">Žádá:</span>
                    {Object.entries(reqR).map(([r, a]) => (
                      <span key={r}>{TRADE_RESOURCE_META[r as keyof typeof TRADE_RESOURCE_META]?.icon}{String(a)}</span>
                    ))}
                  </div>
                  {o.message && (
                    <p className="text-[10px] text-muted-foreground italic mb-2">„{o.message}"</p>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" className="h-6 text-[10px] gap-1" onClick={() => handleAcceptOffer(o)} disabled={saving}>
                      <Check className="h-3 w-3" />Přijmout
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => handleRejectOffer(o.id)} disabled={saving}>
                      <Ban className="h-3 w-3" />Odmítnout
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ─── ACTIVE ROUTES ─── */}
      {activeRoutes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <Ship className="h-4 w-4 text-primary" />Aktivní trasy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeRoutes.map(r => {
              const isSender = r.from_player === currentPlayerName;
              const turnsLeft = r.expires_turn ? Math.max(0, r.expires_turn - currentTurn) : null;
              return (
                <div key={r.id} className="p-3 rounded-lg border border-border">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-display font-semibold">
                        {cityNameMap[r.from_city_id] || "?"} → {cityNameMap[r.to_city_id] || "?"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {isSender ? `Partner: ${r.to_player}` : `Partner: ${r.from_player}`}
                      </p>
                    </div>
                    {turnsLeft !== null && (
                      <Badge variant="outline" className="text-[10px]">{turnsLeft > 0 ? `${turnsLeft} kol` : "Poslední kolo"}</Badge>
                    )}
                    <Button
                      size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive"
                      onClick={() => handleCancelRoute(r.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span>{TRADE_RESOURCE_META[r.resource_type as keyof typeof TRADE_RESOURCE_META]?.icon}{r.amount_per_turn}/kolo</span>
                    {r.return_resource_type && (
                      <>
                        <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                        <span>{TRADE_RESOURCE_META[r.return_resource_type as keyof typeof TRADE_RESOURCE_META]?.icon}{r.return_amount}/kolo</span>
                      </>
                    )}
                    {r.route_safety < 0.8 && (
                      <Badge variant="destructive" className="text-[8px] gap-0.5">
                        <AlertTriangle className="h-2.5 w-2.5" />Nebezpečná
                      </Badge>
                    )}
                  </div>
                  {r.narrative && (
                    <p className="text-[10px] text-muted-foreground/70 italic mt-1">„{r.narrative}"</p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ─── PENDING OUTGOING ─── */}
      {pendingOutgoing.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />Odeslané nabídky
              <Badge variant="outline" className="text-[10px] ml-auto">{pendingOutgoing.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingOutgoing.map(o => (
              <div key={o.id} className="p-2 rounded-lg border border-muted text-xs flex items-center gap-2">
                <span className="flex-1">{cityNameMap[o.from_city_id]} → {cityNameMap[o.to_city_id]} ({o.to_player})</span>
                <Badge variant="secondary" className="text-[9px]">Čeká</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ─── CREATE OFFER ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />Nová obchodní nabídka
            <InfoTip>Vytvořte nabídku obchodní trasy s jiným hráčem. Po přijetí se suroviny automaticky převádí každé kolo.</InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!showNewOffer ? (
            <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => setShowNewOffer(true)}>
              <HandshakeIcon className="h-3 w-3 mr-1" />Vytvořit nabídku
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold">Vaše město</label>
                  <Select value={fromCityId} onValueChange={setFromCityId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Vyberte" /></SelectTrigger>
                    <SelectContent>
                      {myCities.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold">Cílové město</label>
                  <Select value={toCityId} onValueChange={setToCityId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Vyberte" /></SelectTrigger>
                    <SelectContent>
                      {otherCities.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name} ({c.owner_player})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold">Nabízíte</label>
                  <div className="flex gap-1">
                    <Select value={offerRes} onValueChange={setOfferRes}>
                      <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRADEABLE_RESOURCES.map(r => (
                          <SelectItem key={r} value={r}>{TRADE_RESOURCE_META[r].icon} {TRADE_RESOURCE_META[r].label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="number" value={offerAmt} onChange={e => setOfferAmt(Number(e.target.value))} min={1} max={100} className="h-8 w-16 text-xs" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold">Požadujete</label>
                  <div className="flex gap-1">
                    <Select value={requestRes} onValueChange={setRequestRes}>
                      <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRADEABLE_RESOURCES.map(r => (
                          <SelectItem key={r} value={r}>{TRADE_RESOURCE_META[r].icon} {TRADE_RESOURCE_META[r].label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="number" value={requestAmt} onChange={e => setRequestAmt(Number(e.target.value))} min={1} max={100} className="h-8 w-16 text-xs" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold">Doba trvání (kol)</label>
                  <Input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} min={1} max={50} className="h-8 text-xs" />
                </div>
              </div>

              <Textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Diplomatická zpráva (nepovinné)..."
                rows={2}
                className="text-xs"
              />

              <div className="flex flex-col sm:flex-row gap-2">
                <Button size="sm" className="text-xs gap-1 w-full sm:w-auto" onClick={handleCreateOffer} disabled={saving}>
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ship className="h-3 w-3" />}
                  Odeslat nabídku
                </Button>
                <Button size="sm" variant="outline" className="text-xs w-full sm:w-auto" onClick={() => setShowNewOffer(false)}>
                  Zrušit
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TradePanel;

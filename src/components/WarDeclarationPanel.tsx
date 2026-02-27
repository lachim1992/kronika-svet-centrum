import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dispatchCommand } from "@/lib/commands";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Swords, Flag, Handshake, AlertTriangle, Scroll, Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface WarDeclaration {
  id: string;
  session_id: string;
  declaring_player: string;
  target_player: string;
  status: string;
  manifest_text: string | null;
  epic_text: string | null;
  declared_turn: number;
  ended_turn: number | null;
  peace_conditions: any;
  peace_offered_by: string | null;
  peace_offer_text: string | null;
  stability_penalty_applied: boolean;
  diplomatic_effects: any;
  created_at: string;
}

interface Props {
  sessionId: string;
  currentPlayerName: string;
  currentTurn: number;
  players: any[];
  cities: any[];
  gameMode?: string;
  onRefetch: () => void;
}

const PEACE_CONDITION_TYPES = [
  { key: "tribute", label: "Tribut (zlato)", desc: "Poražený platí zlato vítězi po X kol" },
  { key: "territory", label: "Postoupení území", desc: "Předání konkrétních měst" },
  { key: "vassalage", label: "Vazalství", desc: "Poražený se stává vazalem" },
  { key: "white_peace", label: "Bílý mír", desc: "Bez podmínek, status quo" },
];

const WarDeclarationPanel = ({
  sessionId, currentPlayerName, currentTurn, players, cities, gameMode, onRefetch,
}: Props) => {
  const [wars, setWars] = useState<WarDeclaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeclare, setShowDeclare] = useState(false);
  const [showPeace, setShowPeace] = useState<WarDeclaration | null>(null);
  const [targetPlayer, setTargetPlayer] = useState("");
  const [manifestText, setManifestText] = useState("");
  const [declaring, setDeclaring] = useState(false);
  const [peaceType, setPeaceType] = useState("white_peace");
  const [peaceText, setPeaceText] = useState("");
  const [offeringPeace, setOfferingPeace] = useState(false);

  const fetchWars = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("war_declarations")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });
    setWars((data || []) as WarDeclaration[]);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { fetchWars(); }, [fetchWars]);

  const activeWars = wars.filter(w => w.status === "active" || w.status === "peace_offered");
  const pastWars = wars.filter(w => w.status === "peace_accepted" || w.status === "ended");

  const isAtWarWith = (player: string) =>
    activeWars.some(w =>
      (w.declaring_player === currentPlayerName && w.target_player === player) ||
      (w.target_player === currentPlayerName && w.declaring_player === player)
    );

  const otherPlayers = players
    .filter(p => p.player_name !== currentPlayerName)
    .map(p => p.player_name);

  const availableTargets = otherPlayers.filter(p => !isAtWarWith(p));

  const handleDeclareWar = async () => {
    if (!targetPlayer) return;
    setDeclaring(true);
    try {
      // Insert war declaration
      const { error: insertErr } = await supabase.from("war_declarations").insert({
        session_id: sessionId,
        declaring_player: currentPlayerName,
        target_player: targetPlayer,
        manifest_text: manifestText || null,
        declared_turn: currentTurn,
        status: "active",
      } as any);

      if (insertErr) throw insertErr;

      // Emit game event via command dispatch
      await dispatchCommand({
        sessionId,
        actor: { name: currentPlayerName },
        commandType: "DECLARE_WAR",
        commandPayload: {
          targetPlayer,
          manifestText: manifestText || "Válka byla vyhlášena bez formálního manifestu.",
          chronicleText: `**${currentPlayerName}** vyhlásil válku říši **${targetPlayer}**! ${manifestText || ""}`,
        },
      });

      // Apply stability penalty to both sides' cities
      const allCities = cities.filter(
        c => c.owner_player === currentPlayerName || c.owner_player === targetPlayer
      );
      for (const city of allCities) {
        const penalty = city.owner_player === currentPlayerName ? -5 : -8;
        await supabase.from("cities").update({
          city_stability: Math.max(0, (city.city_stability || 70) + penalty),
        }).eq("id", city.id);
      }

      toast.success(`Válka vyhlášena proti ${targetPlayer}!`);
      setShowDeclare(false);
      setTargetPlayer("");
      setManifestText("");
      fetchWars();
      onRefetch();
    } catch (e: any) {
      toast.error("Chyba: " + e.message);
    } finally {
      setDeclaring(false);
    }
  };

  const handleOfferPeace = async () => {
    if (!showPeace) return;
    setOfferingPeace(true);
    try {
      await supabase.from("war_declarations").update({
        status: "peace_offered",
        peace_offered_by: currentPlayerName,
        peace_offer_text: peaceText || null,
        peace_conditions: { type: peaceType },
      } as any).eq("id", showPeace.id);

      await dispatchCommand({
        sessionId,
        actor: { name: currentPlayerName },
        commandType: "OFFER_PEACE",
        commandPayload: {
          warId: showPeace.id,
          targetPlayer: showPeace.declaring_player === currentPlayerName
            ? showPeace.target_player
            : showPeace.declaring_player,
          conditionType: peaceType,
          offerText: peaceText,
          chronicleText: `**${currentPlayerName}** nabídl mír v konfliktu. Podmínky: ${PEACE_CONDITION_TYPES.find(t => t.key === peaceType)?.label || peaceType}.`,
        },
      });

      toast.success("Mírová nabídka odeslána.");
      setShowPeace(null);
      setPeaceText("");
      setPeaceType("white_peace");
      fetchWars();
    } catch (e: any) {
      toast.error("Chyba: " + e.message);
    } finally {
      setOfferingPeace(false);
    }
  };

  const handleAcceptPeace = async (war: WarDeclaration) => {
    try {
      await supabase.from("war_declarations").update({
        status: "peace_accepted",
        ended_turn: currentTurn,
      } as any).eq("id", war.id);

      // Restore some stability
      const warCities = cities.filter(
        c => c.owner_player === war.declaring_player || c.owner_player === war.target_player
      );
      for (const city of warCities) {
        await supabase.from("cities").update({
          city_stability: Math.min(100, (city.city_stability || 50) + 3),
        }).eq("id", city.id);
      }

      await dispatchCommand({
        sessionId,
        actor: { name: currentPlayerName },
        commandType: "ACCEPT_PEACE",
        commandPayload: {
          warId: war.id,
          conditionType: war.peace_conditions?.type || "white_peace",
          chronicleText: `Mír uzavřen mezi **${war.declaring_player}** a **${war.target_player}**. Podmínky: ${PEACE_CONDITION_TYPES.find(t => t.key === war.peace_conditions?.type)?.label || "Bílý mír"}.`,
        },
      });

      toast.success("Mír přijat!");
      fetchWars();
      onRefetch();
    } catch (e: any) {
      toast.error("Chyba: " + e.message);
    }
  };

  const handleRejectPeace = async (war: WarDeclaration) => {
    await supabase.from("war_declarations").update({
      status: "active",
      peace_offered_by: null,
      peace_offer_text: null,
      peace_conditions: {},
    } as any).eq("id", war.id);
    toast.info("Mírová nabídka odmítnuta. Válka pokračuje.");
    fetchWars();
  };

  const myWarInvolvement = (w: WarDeclaration) =>
    w.declaring_player === currentPlayerName || w.target_player === currentPlayerName;

  const getOpponent = (w: WarDeclaration) =>
    w.declaring_player === currentPlayerName ? w.target_player : w.declaring_player;

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Active Wars */}
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <Swords className="h-4 w-4 text-destructive" />
          Aktivní konflikty ({activeWars.length})
        </h3>
        <Button size="sm" variant="destructive" onClick={() => setShowDeclare(true)} disabled={availableTargets.length === 0}>
          <Flag className="h-3.5 w-3.5 mr-1" /> Vyhlásit válku
        </Button>
      </div>

      {activeWars.length === 0 && (
        <div className="manuscript-card p-6 text-center text-muted-foreground text-sm">
          <Shield className="h-8 w-8 mx-auto mb-2 text-accent" />
          Svět je v míru. Žádné aktivní konflikty.
        </div>
      )}

      {activeWars.map(war => {
        const isMyWar = myWarInvolvement(war);
        const opponent = getOpponent(war);
        const isPeaceOfferedToMe = war.status === "peace_offered" && war.peace_offered_by !== currentPlayerName && isMyWar;
        const isPeaceOfferedByMe = war.status === "peace_offered" && war.peace_offered_by === currentPlayerName;
        const turnsAtWar = currentTurn - war.declared_turn;

        return (
          <Card key={war.id} className="border-destructive/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display flex items-center gap-2">
                <Swords className="h-4 w-4 text-destructive" />
                {war.declaring_player} ⚔ {war.target_player}
                <Badge variant="destructive" className="ml-auto text-xs">
                  {turnsAtWar} kol
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {war.manifest_text && (
                <div className="text-xs italic text-muted-foreground bg-muted/30 rounded p-2 border-l-2 border-destructive/30">
                  <Scroll className="h-3 w-3 inline mr-1" />
                  {war.manifest_text}
                </div>
              )}

              {isPeaceOfferedToMe && (
                <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-accent flex items-center gap-1">
                    <Handshake className="h-3.5 w-3.5" />
                    {war.peace_offered_by} nabízí mír
                  </p>
                  {war.peace_offer_text && (
                    <p className="text-xs text-muted-foreground italic">{war.peace_offer_text}</p>
                  )}
                  <p className="text-xs">
                    Podmínky: <strong>{PEACE_CONDITION_TYPES.find(t => t.key === war.peace_conditions?.type)?.label || "Neznámé"}</strong>
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="default" onClick={() => handleAcceptPeace(war)}>
                      Přijmout mír
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleRejectPeace(war)}>
                      Odmítnout
                    </Button>
                  </div>
                </div>
              )}

              {isPeaceOfferedByMe && (
                <div className="text-xs text-muted-foreground bg-muted/20 rounded p-2">
                  ⏳ Čeká se na odpověď na vaši mírovou nabídku...
                </div>
              )}

              {isMyWar && war.status === "active" && (
                <Button size="sm" variant="outline" onClick={() => setShowPeace(war)}>
                  <Handshake className="h-3.5 w-3.5 mr-1" /> Nabídnout mír
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Past wars */}
      {pastWars.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wider">
            Ukončené konflikty
          </h4>
          {pastWars.map(war => (
            <div key={war.id} className="manuscript-card p-3 flex items-center gap-3 text-xs">
              <Handshake className="h-4 w-4 text-accent shrink-0" />
              <div>
                <span className="font-semibold">{war.declaring_player} vs {war.target_player}</span>
                <span className="text-muted-foreground ml-2">
                  Rok {war.declared_turn}–{war.ended_turn || "?"}
                </span>
              </div>
              <Badge variant="outline" className="ml-auto">
                {PEACE_CONDITION_TYPES.find(t => t.key === war.peace_conditions?.type)?.label || "Mír"}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* Declare War Dialog */}
      <Dialog open={showDeclare} onOpenChange={v => !v && setShowDeclare(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Flag className="h-5 w-5 text-destructive" /> Vyhlásit válku
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Cíl</label>
              <Select value={targetPlayer} onValueChange={setTargetPlayer}>
                <SelectTrigger><SelectValue placeholder="Vyber protivníka" /></SelectTrigger>
                <SelectContent>
                  {availableTargets.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Válečný manifest (volitelné)</label>
              <Textarea
                value={manifestText}
                onChange={e => setManifestText(e.target.value)}
                placeholder="Proč vyhlašujete válku? Napište formální deklaraci..."
                rows={4}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Manifest bude zaznamenán do kronik. Formální vyhlášení snižuje diplomatický dopad.
              </p>
            </div>

            {targetPlayer && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 space-y-1">
                <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Důsledky vyhlášení války
                </p>
                <ul className="text-xs text-muted-foreground space-y-0.5 list-disc ml-4">
                  <li>Vaše města: -5 stabilita</li>
                  <li>Města protivníka: -8 stabilita</li>
                  <li>Možnost útočit na cizí města a dobývat je</li>
                  <li>Diplomatická reputace utrpí</li>
                  <li>Mír vyžaduje splnění podmínek (tribut, území, vazalství)</li>
                </ul>
              </div>
            )}

            <Button
              className="w-full"
              variant="destructive"
              disabled={!targetPlayer || declaring}
              onClick={handleDeclareWar}
            >
              {declaring ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Swords className="h-4 w-4 mr-2" />}
              Vyhlásit válku
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Peace Offer Dialog */}
      <Dialog open={!!showPeace} onOpenChange={v => !v && setShowPeace(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Handshake className="h-5 w-5 text-accent" /> Nabídnout mír
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Typ mírových podmínek</label>
              <Select value={peaceType} onValueChange={setPeaceType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PEACE_CONDITION_TYPES.map(t => (
                    <SelectItem key={t.key} value={t.key}>
                      <div>
                        <span className="font-semibold">{t.label}</span>
                        <span className="text-muted-foreground ml-2 text-xs">{t.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Doprovodný text (volitelné)</label>
              <Textarea
                value={peaceText}
                onChange={e => setPeaceText(e.target.value)}
                placeholder="Vaše slova doprovázející mírovou nabídku..."
                rows={3}
              />
            </div>

            <Button className="w-full" disabled={offeringPeace} onClick={handleOfferPeace}>
              {offeringPeace ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Handshake className="h-4 w-4 mr-2" />}
              Odeslat mírovou nabídku
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WarDeclarationPanel;

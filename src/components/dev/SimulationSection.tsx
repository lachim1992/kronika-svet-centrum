import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Play, AlertTriangle, Eye } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  onRefetch?: () => void;
}

const YEAR_PRESETS = [1, 2, 3, 5, 10, 20];

const PLAYER_NAMES = ["Berr", "Protivník", "Královna", "Stratég", "Dobyvatel", "Obchodník"];
const FUNNY_NOTES = [
  "generál musel na záchod", "kronikář usnul při zápisu", "kůň odmítl poslouchat rozkazy",
  "vyjednavač zapomněl smlouvu doma", "stavitel postavil chrám obráceně",
];
const MEMORY_FACTS = [
  "zdejší studna léčí nemoci", "na náměstí žije duch starého krále",
  "místní víno je nejlepší v říši", "hradby byly postaveny za jedinou noc",
];

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

interface SimSummary {
  yearsSimulated: number;
  eventsGenerated: number;
  messagesGenerated: number;
  discoveries: number;
  entitiesCreated: number;
  warnings: string[];
}

const SimulationSection = ({ sessionId, onRefetch }: Props) => {
  const [years, setYears] = useState(5);
  const [customYears, setCustomYears] = useState("");
  const [dryRun, setDryRun] = useState(false);
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [progress, setProgress] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [summary, setSummary] = useState<SimSummary | null>(null);

  const addLog = (msg: string) => setLog(prev => [...prev.slice(-200), `[${new Date().toLocaleTimeString("cs")}] ${msg}`]);

  const effectiveYears = customYears ? parseInt(customYears) || years : years;

  const runSimulation = async () => {
    setSimulating(true);
    setLog([]);
    setSummary(null);
    const sim: SimSummary = { yearsSimulated: effectiveYears, eventsGenerated: 0, messagesGenerated: 0, discoveries: 0, entitiesCreated: 0, warnings: [] };

    addLog(`${dryRun ? "🔍 DRY RUN" : "🚀 LIVE RUN"}: Simulace ${effectiveYears} let`);

    try {
      const { data: sessionData } = await supabase.from("game_sessions").select("current_turn").eq("id", sessionId).single();
      const startYear = sessionData?.current_turn || 1;
      const endYear = startYear + effectiveYears - 1;

      const { data: cities } = await supabase.from("cities").select("*").eq("session_id", sessionId);
      const { data: players } = await supabase.from("game_players").select("*").eq("session_id", sessionId);

      if (!players?.length) { sim.warnings.push("Žádní hráči – nejprve seedujte svět"); setSummary(sim); setSimulating(false); return; }

      const playerNames = players.map(p => p.player_name);
      const cityByOwner: Record<string, typeof cities> = {};
      for (const c of (cities || [])) {
        (cityByOwner[c.owner_player] = cityByOwner[c.owner_player] || []).push(c);
      }

      // Ensure diplomacy rooms
      let roomIds: string[] = [];
      if (!dryRun) {
        const { data: rooms } = await supabase.from("diplomacy_rooms").select("id").eq("session_id", sessionId);
        roomIds = rooms?.map(r => r.id) || [];
        if (roomIds.length === 0) {
          for (let i = 0; i < playerNames.length; i++) {
            for (let j = i + 1; j < playerNames.length; j++) {
              const { data: room } = await supabase.from("diplomacy_rooms").insert({
                session_id: sessionId, participant_a: playerNames[i], participant_b: playerNames[j], room_type: "player_player",
              }).select().single();
              if (room) roomIds.push(room.id);
            }
          }
        }
      }

      for (let year = startYear; year <= endYear; year++) {
        setProgress(`Rok ${year}/${endYear}`);
        addLog(`📅 ═══ ROK ${year} ═══`);

        // Events per player
        for (const pName of playerNames) {
          const myCities = cityByOwner[pName] || cities || [];
          const numEvents = 3 + Math.floor(Math.random() * 4);

          for (let e = 0; e < numEvents; e++) {
            const evType = pick(["battle", "trade", "diplomacy", "raid", "found_settlement", "wonder", "city_state_action"]);
            const city = myCities.length ? pick(myCities) : (cities?.length ? pick(cities) : null);

            if (!dryRun && city) {
              await supabase.from("game_events").insert({
                session_id: sessionId, event_type: evType, player: pName,
                turn_number: year, city_id: city.id, location: city.name,
                note: Math.random() < 0.3 ? pick(FUNNY_NOTES) : null,
                confirmed: true, truth_state: Math.random() < 0.05 ? "rumor" : "canon",
              });
            }
            sim.eventsGenerated++;
          }

          // Diplomacy messages
          if (roomIds.length && Math.random() < 0.5) {
            if (!dryRun) {
              await supabase.from("diplomacy_messages").insert({
                room_id: pick(roomIds), sender: pName, sender_type: "player",
                message_text: `${pName} navrhuje ${pick(["mír", "obchod", "spojenectví"])} v roce ${year}.`,
                secrecy: pick(["PUBLIC", "PRIVATE"]),
              });
            }
            sim.messagesGenerated++;
          }

          // Trade
          if (Math.random() < 0.5) {
            const other = pick(playerNames.filter(p => p !== pName));
            if (!dryRun) {
              await supabase.from("trade_log").insert({
                session_id: sessionId, turn_number: year,
                from_player: pName, to_player: other,
                resource_type: pick(["food", "wood", "stone", "iron", "wealth"]),
                amount: Math.floor(Math.random() * 10) + 1,
                trade_type: pick(["Obchod", "Tribut", "Dar"]),
              });
            }
          }
        }

        // World memories
        if (!dryRun && cities?.length) {
          for (let m = 0; m < 2; m++) {
            const memCity = pick(cities);
            await supabase.from("world_memories").insert({
              session_id: sessionId,
              text: `V ${memCity.name} se traduje, že ${pick(MEMORY_FACTS)}.`,
              approved: Math.random() < 0.7,
              category: pick(["tradition", "legend", "mystery"]),
              created_round: year, city_id: memCity.id,
            });
          }
        }

        // Chronicle
        if (!dryRun) {
          const p1 = pick(playerNames);
          const p2 = pick(playerNames.filter(p => p !== p1));
          await supabase.from("chronicle_entries").insert({
            session_id: sessionId,
            text: `Rok ${year}: ${p1} a ${p2} formovali dějiny světa.`,
            turn_from: year, turn_to: year, epoch_style: "kroniky",
          });
        }

        // Intelligence
        if (!dryRun) {
          const spy = pick(playerNames);
          const target = pick(playerNames.filter(p => p !== spy));
          await supabase.from("intelligence_reports").insert({
            session_id: sessionId, visible_to: spy, target_entity: target,
            report_text: `Špioni ${spy} hlásí aktivitu ${target} v roce ${year}.`,
            source_type: pick(["merchant_gossip", "spy_network", "scout_report"]),
            created_round: year, secrecy_level: pick(["uncertain", "reliable"]),
          });
        }

        // Province discovery
        if (year % 3 === 0 && !dryRun) {
          const discoverer = pick(playerNames);
          const provName = `Provincie-${year}-${discoverer.slice(0, 3)}`;
          await supabase.from("provinces").insert({
            session_id: sessionId, name: provName, owner_player: discoverer,
          });
          sim.discoveries++;
          sim.entitiesCreated++;
        }

        // Advance turn
        if (!dryRun) {
          await supabase.from("game_sessions").update({ current_turn: year + 1 }).eq("id", sessionId);
        }
      }

      // Post-sim: world history chapter
      if (!dryRun) {
        await supabase.from("world_history_chapters").insert({
          session_id: sessionId, from_turn: startYear, to_turn: endYear,
          chapter_title: `Kapitola: Roky ${startYear}-${endYear}`,
          chapter_text: `V letech ${startYear} až ${endYear} se svět dramaticky proměnil. Civilizace bojovaly, obchodovaly a budovaly.`,
          epoch_style: "kroniky",
        });
      }

      setSummary(sim);
      addLog(`✅ SIMULACE DOKONČENA: ${sim.eventsGenerated} událostí, ${sim.messagesGenerated} zpráv, ${sim.discoveries} objevů`);
      toast.success(`${dryRun ? "🔍 Preview" : "✅ Simulace"}: ${sim.eventsGenerated} událostí`);
      if (!dryRun) onRefetch?.();
    } catch (e: any) {
      sim.warnings.push(e?.message || "unknown");
      setSummary(sim);
      addLog("❌ " + (e?.message || "unknown"));
      toast.error("Simulace selhala");
    }
    setSimulating(false);
    setProgress("");
  };

  return (
    <div className="bg-card border-2 border-accent/30 rounded-lg p-4 space-y-4">
      <h3 className="font-display font-semibold text-sm flex items-center gap-2">
        <Play className="h-4 w-4 text-accent" />
        Simulace & Debug
      </h3>

      {/* Year presets */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Délka simulace (roky)</Label>
        <div className="flex flex-wrap gap-1">
          {YEAR_PRESETS.map(y => (
            <Button key={y} size="sm" variant={years === y && !customYears ? "default" : "outline"}
              className="h-8 text-xs" onClick={() => { setYears(y); setCustomYears(""); }}>
              {y} {y === 1 ? "rok" : y < 5 ? "roky" : "let"}
            </Button>
          ))}
          <Input
            type="number" min={1} max={100} placeholder="Vlastní"
            value={customYears} onChange={e => setCustomYears(e.target.value)}
            className="w-20 h-8 text-xs text-center"
          />
        </div>
      </div>

      {/* Toggles */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 p-2 rounded border bg-muted/20">
          <Eye className="h-4 w-4 text-primary shrink-0" />
          <Label htmlFor="dry-run" className="text-xs flex-1 cursor-pointer">
            Dry Run — pouze preview, nezapisuje do DB
          </Label>
          <Switch id="dry-run" checked={dryRun} onCheckedChange={setDryRun} disabled={simulating} />
        </div>
        <div className="flex items-center gap-3 p-2 rounded border border-destructive/30 bg-destructive/5">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <Label htmlFor="sim-overwrite" className="text-xs flex-1 cursor-pointer">
            Povolit přepisování (nebezpečné)
          </Label>
          <Switch id="sim-overwrite" checked={allowOverwrite} onCheckedChange={setAllowOverwrite} disabled={simulating} />
        </div>
      </div>

      {/* Run button */}
      <Button onClick={runSimulation} disabled={simulating} className="w-full h-12 font-display text-base gap-2">
        {simulating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
        {simulating ? `Simuluji... ${progress}` : `${dryRun ? "🔍 Preview" : "🚀 Spustit"} simulaci (${effectiveYears} let)`}
      </Button>

      {/* Summary */}
      {summary && (
        <div className="p-3 bg-muted/30 rounded border space-y-2">
          <h4 className="font-display font-semibold text-sm flex items-center gap-2">
            📊 Výsledek simulace
            {dryRun && <Badge variant="outline" className="text-[10px]">DRY RUN</Badge>}
          </h4>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {[
              ["Simulováno let", summary.yearsSimulated],
              ["Události", summary.eventsGenerated],
              ["Zprávy mezi hráči", summary.messagesGenerated],
              ["Objevy", summary.discoveries],
              ["Vytvořené entity", summary.entitiesCreated],
            ].map(([label, val]) => (
              <div key={label as string} className="flex justify-between border-b border-border pb-1">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-bold">{val}</span>
              </div>
            ))}
          </div>
          {summary.warnings.length > 0 && (
            <div className="text-xs text-destructive">
              {summary.warnings.map((w, i) => <p key={i}>⚠️ {w}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Log */}
      {log.length > 0 && (
        <ScrollArea className="h-40 border rounded p-2 bg-muted/30">
          <div className="font-mono text-[11px] space-y-0.5">
            {log.map((line, i) => (
              <p key={i} className={line.includes("❌") ? "text-destructive" : "text-muted-foreground"}>{line}</p>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default SimulationSection;

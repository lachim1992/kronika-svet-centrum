import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bug, Database, Play, CheckCircle2, XCircle, Loader2, FlaskConical, Sparkles, Trash2,
} from "lucide-react";
import { toast } from "sonner";

interface DevModePanelProps {
  sessionId: string;
  currentPlayerName: string;
  onRefetch?: () => void;
  // Debug stats
  citiesCount: number;
  eventsCount: number;
  wondersCount: number;
  memoriesCount: number;
  playersCount: number;
}

interface QAResult {
  name: string;
  pass: boolean;
  detail?: string;
}

const CZECH_CITY_NAMES_P1 = ["Petra", "Tharros", "Sardara", "Nuraghe"];
const CZECH_CITY_NAMES_P2 = ["Cabras", "Oristano", "Barumini", "Cornus"];
const PROVINCES_P1 = ["Údolí Králů", "Severní marky"];
const PROVINCES_P2 = ["Jižní pláně", "Přímořská provincie"];

const EVENT_TYPES_SIM = [
  "found_settlement", "upgrade_city", "raid", "repair", "battle",
  "diplomacy", "city_state_action", "trade", "wonder",
];

const FUNNY_NOTES = [
  "generál musel na záchod",
  "kronikář usnul při zápisu",
  "kůň odmítl poslouchat rozkazy",
  "vyjednavač zapomněl smlouvu doma",
  "stavitel postavil chrám obráceně",
  "obchodník prodal vlastní koně",
  "špion se prozradil kýchnutím",
  "bitva přerušena kvůli dešti",
  "velvyslanec přišel na hostinu bez kalhot",
  "generál se ztratil v lese",
];

const DevModePanel = ({
  sessionId, currentPlayerName, onRefetch,
  citiesCount, eventsCount, wondersCount, memoriesCount, playersCount,
}: DevModePanelProps) => {
  const [seeding, setSeeding] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [running, setRunning] = useState(false);
  const [qaResults, setQaResults] = useState<QAResult[]>([]);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const log = (msg: string) => setDebugLog(prev => [...prev, `[${new Date().toLocaleTimeString("cs")}] ${msg}`]);

  // ========================
  // SEED DEMO WORLD
  // ========================
  const seedDemoWorld = async () => {
    setSeeding(true);
    log("🌱 Začínám seedování demo světa...");
    try {
      const p1 = currentPlayerName;
      const p2 = "Protivník";

      // Ensure P2 exists as player
      const { data: existingPlayers } = await supabase.from("game_players").select("*").eq("session_id", sessionId);
      if (!existingPlayers?.find(p => p.player_name === p2)) {
        await supabase.from("game_players").insert({
          session_id: sessionId, player_name: p2, player_number: 2,
        });
        // Init resources for P2
        for (const rt of ["food", "wood", "stone", "iron", "wealth"]) {
          await supabase.from("player_resources").insert({
            session_id: sessionId, player_name: p2, resource_type: rt,
            income: 3, upkeep: 1, stockpile: 5,
          });
        }
        log("✅ Hráč 2 vytvořen: " + p2);
      }

      // Create provinces
      const provinceIds: Record<string, string> = {};
      const allProvs = [...PROVINCES_P1.map(n => ({ n, o: p1 })), ...PROVINCES_P2.map(n => ({ n, o: p2 }))];
      for (const prov of allProvs) {
        const { data } = await supabase.from("provinces").insert({
          session_id: sessionId, name: prov.n, owner_player: prov.o,
        }).select().single();
        if (data) provinceIds[prov.n] = data.id;
      }
      log(`✅ ${Object.keys(provinceIds).length} provincií vytvořeno`);

      // Create cities
      const cityIds: string[] = [];
      const allCities = [
        ...CZECH_CITY_NAMES_P1.map((n, i) => ({ n, o: p1, prov: PROVINCES_P1[i < 2 ? 0 : 1] })),
        ...CZECH_CITY_NAMES_P2.map((n, i) => ({ n, o: p2, prov: PROVINCES_P2[i < 2 ? 0 : 1] })),
      ];
      for (const c of allCities) {
        const tags = i2tags(c.n);
        const { data } = await supabase.from("cities").insert({
          session_id: sessionId, name: c.n, owner_player: c.o,
          province: c.prov, province_id: provinceIds[c.prov] || null,
          level: "Osada", tags, founded_round: 1,
        }).select().single();
        if (data) cityIds.push(data.id);
      }
      log(`✅ ${cityIds.length} měst vytvořeno`);

      // City states
      for (const cs of [{ name: "Kartágo", type: "Obchodní" }, { name: "Syrakúzy", type: "Vojenský" }, { name: "Rhodos", type: "Námořní" }]) {
        await supabase.from("city_states").insert({ session_id: sessionId, name: cs.name, type: cs.type });
      }
      log("✅ 3 městské státy vytvořeny");

      // Wonders
      for (const w of [
        { name: "Velký maják Tharros", owner: p1, city: "Tharros", era: "Ancient" },
        { name: "Koloseum Oristano", owner: p2, city: "Oristano", era: "Classical" },
      ]) {
        await supabase.from("wonders").insert({
          session_id: sessionId, name: w.name, owner_player: w.owner,
          city_name: w.city, era: w.era, status: "planned",
          description: `Legendární ${w.name}, plánovaný div světa.`,
        });
      }
      log("✅ 2 divy světa naplánovány");

      toast.success("🌱 Demo svět naseedován!");
      onRefetch?.();
    } catch (e) {
      console.error(e);
      log("❌ Chyba: " + (e instanceof Error ? e.message : "unknown"));
      toast.error("Seedování selhalo");
    }
    setSeeding(false);
  };

  // ========================
  // SIMULATE 20 ROUNDS
  // ========================
  const simulate20Rounds = async () => {
    setSimulating(true);
    log("🎮 Začínám simulaci 20 kol...");
    try {
      // Fetch current state
      const { data: cities } = await supabase.from("cities").select("*").eq("session_id", sessionId);
      const { data: players } = await supabase.from("game_players").select("*").eq("session_id", sessionId);
      const { data: wonders } = await supabase.from("wonders").select("*").eq("session_id", sessionId);

      if (!cities?.length || !players?.length) {
        toast.error("Nejprve naseedujte demo svět");
        setSimulating(false);
        return;
      }

      const playerNames = players.map(p => p.player_name);
      const cityMap: Record<string, typeof cities[0][]> = {};
      for (const c of cities) {
        (cityMap[c.owner_player] = cityMap[c.owner_player] || []).push(c);
      }

      for (let round = 1; round <= 20; round++) {
        log(`📅 Kolo ${round}...`);

        for (const pName of playerNames) {
          const myCities = cityMap[pName] || [];
          const oppCities = cities.filter(c => c.owner_player !== pName);
          const eventsThisRound: any[] = [];

          // 3+ events per player per round
          const numEvents = 3 + Math.floor(Math.random() * 2);
          for (let e = 0; e < numEvents; e++) {
            const evType = pickEventType(round, e);
            const city = myCities[Math.floor(Math.random() * myCities.length)];
            const oppCity = oppCities.length ? oppCities[Math.floor(Math.random() * oppCities.length)] : null;
            const note = Math.random() < 0.4 ? FUNNY_NOTES[Math.floor(Math.random() * FUNNY_NOTES.length)] : null;

            const eventData: any = {
              session_id: sessionId,
              event_type: evType,
              player: pName,
              turn_number: round,
              city_id: city?.id || null,
              location: city?.name || "",
              note,
              confirmed: true,
              truth_state: Math.random() < 0.1 ? "rumor" : "canon",
            };

            if (evType === "battle" && oppCity) {
              eventData.attacker_city_id = city?.id;
              eventData.defender_city_id = oppCity.id;
              eventData.secondary_city_id = oppCity.id;
              eventData.result = Math.random() < 0.5 ? "vítězství" : "porážka";
              eventData.casualties = `${Math.floor(Math.random() * 500 + 50)} mužů`;
              eventData.armies_involved = [`${pName}-legion-${round}`];
            }
            if (evType === "raid" && oppCity) {
              eventData.secondary_city_id = oppCity.id;
              eventData.devastation_duration = Math.floor(Math.random() * 3) + 1;
            }
            if (evType === "diplomacy") {
              eventData.treaty_type = ["mír", "obchod", "tribut", "embargo"][Math.floor(Math.random() * 4)];
              eventData.terms_summary = "Oboustranně výhodná dohoda";
            }

            const { data: inserted } = await supabase.from("game_events").insert(eventData).select().single();
            if (inserted) eventsThisRound.push(inserted);
          }

          // Add annotations sometimes
          if (Math.random() < 0.5 && eventsThisRound.length > 0) {
            const targetEvent = eventsThisRound[Math.floor(Math.random() * eventsThisRound.length)];
            await supabase.from("event_annotations").insert({
              event_id: targetEvent.id,
              author: pName,
              note_text: FUNNY_NOTES[Math.floor(Math.random() * FUNNY_NOTES.length)],
              visibility: Math.random() < 0.2 ? "leakable" : "public",
            });
          }
        }

        // City upgrades at certain rounds
        if (round === 5 || round === 10 || round === 15) {
          const nextLevel = round === 5 ? "Městečko" : round === 10 ? "Město" : "Polis";
          const upgradeCity = cities[Math.floor(Math.random() * cities.length)];
          if (upgradeCity) {
            await supabase.from("cities").update({ level: nextLevel }).eq("id", upgradeCity.id);
          }
        }

        // Wonder progress
        if (round === 8 && wonders?.length) {
          await supabase.from("wonders").update({ status: "under construction" }).eq("id", wonders[0].id);
        }
        if (round === 14 && wonders?.length) {
          await supabase.from("wonders").update({ status: "completed" }).eq("id", wonders[0].id);
        }
        if (round === 18 && wonders && wonders.length > 1) {
          await supabase.from("wonders").update({ status: "destroyed" }).eq("id", wonders[1].id);
        }

        // World memories
        if (round % 3 === 0) {
          const memCity = cities[Math.floor(Math.random() * cities.length)];
          await supabase.from("world_memories").insert({
            session_id: sessionId,
            text: `V kole ${round} se v ${memCity?.name || "neznámém městě"} odehrály významné události.`,
            approved: true,
            category: "tradition",
            created_round: round,
            city_id: memCity?.id || null,
          });
        }

        // Intelligence reports
        if (round % 4 === 0) {
          await supabase.from("intelligence_reports").insert({
            session_id: sessionId,
            visible_to: playerNames[0],
            target_entity: playerNames[1] || "NPC",
            report_text: `Špioni hlásí podezřelou aktivitu v kole ${round}.`,
            source_type: "merchant_gossip",
            created_round: round,
            secrecy_level: "uncertain",
          });
        }

        // Chronicle entries per round
        await supabase.from("chronicle_entries").insert({
          session_id: sessionId,
          text: `Rok ${round}: Události tohoto roku budou navždy zapsány do dějin.`,
          epoch_style: "kroniky",
        });

        // Advance turn
        await supabase.from("game_sessions").update({ current_turn: round + 1 }).eq("id", sessionId);
      }

      log("✅ Simulace 20 kol dokončena!");
      toast.success("🎮 Simulace 20 kol dokončena!");
      onRefetch?.();
    } catch (e) {
      console.error(e);
      log("❌ Simulace selhala: " + (e instanceof Error ? e.message : "unknown"));
      toast.error("Simulace selhala");
    }
    setSimulating(false);
  };

  // ========================
  // RUN QA TEST
  // ========================
  const runQATest = async () => {
    setRunning(true);
    setQaResults([]);
    log("🧪 Spouštím QA test...");
    const results: QAResult[] = [];

    const check = (name: string, pass: boolean, detail?: string) => {
      results.push({ name, pass, detail });
      log(`${pass ? "✅" : "❌"} ${name}${detail ? ": " + detail : ""}`);
    };

    try {
      // 1. GameId persistence
      const storedId = localStorage.getItem("ch_lastGameId");
      check("gameId persisted in localStorage", !!storedId, storedId || "missing");

      // 2. Cities load
      const { data: cities } = await supabase.from("cities").select("*").eq("session_id", sessionId);
      check("Cities load", (cities?.length || 0) > 0, `${cities?.length || 0} měst`);

      // 3. Events load
      const { data: events } = await supabase.from("game_events").select("*").eq("session_id", sessionId);
      check("Events load", (events?.length || 0) > 0, `${events?.length || 0} událostí`);

      // 4. Wonders load
      const { data: wonders } = await supabase.from("wonders").select("*").eq("session_id", sessionId);
      check("Wonders load", (wonders?.length || 0) > 0, `${wonders?.length || 0} divů`);

      // 5. Chronicle entries exist
      const { data: chronicles } = await supabase.from("chronicle_entries").select("*").eq("session_id", sessionId);
      check("Chronicle entries exist", (chronicles?.length || 0) > 0, `${chronicles?.length || 0} zápisů`);

      // 6. World memories exist
      const { data: mems } = await supabase.from("world_memories").select("*").eq("session_id", sessionId);
      check("World memories exist", (mems?.length || 0) > 0, `${mems?.length || 0} pamětí`);

      // 7. Annotations exist
      if (events?.length) {
        const eventIds = events.map(e => e.id);
        const { data: anns } = await supabase.from("event_annotations").select("*").in("event_id", eventIds.slice(0, 100));
        check("Event annotations exist", (anns?.length || 0) > 0, `${anns?.length || 0} poznámek`);
      }

      // 8. Intelligence reports
      const { data: intel } = await supabase.from("intelligence_reports").select("*").eq("session_id", sessionId);
      check("Intelligence reports exist", (intel?.length || 0) > 0, `${intel?.length || 0} zpráv`);

      // 9. Battle events with structured data
      const battles = events?.filter(e => e.event_type === "battle" && e.attacker_city_id) || [];
      check("Battle events with attacker/defender", battles.length > 0, `${battles.length} bitev se strukturovanými daty`);

      // 10. Diplomacy events with treaty type
      const diplos = events?.filter(e => e.event_type === "diplomacy" && e.treaty_type) || [];
      check("Diplomacy events with treaty_type", diplos.length > 0, `${diplos.length} diplomatických událostí`);

      // 11. Event type coverage
      const eventTypes = new Set(events?.map(e => e.event_type) || []);
      const expectedTypes = ["battle", "raid", "diplomacy", "trade", "wonder", "found_settlement"];
      const covered = expectedTypes.filter(t => eventTypes.has(t));
      check("Event type coverage", covered.length >= 4, `${covered.length}/${expectedTypes.length} typů: ${covered.join(", ")}`);

      // 12. Provinces exist
      const { data: provs } = await supabase.from("provinces").select("*").eq("session_id", sessionId);
      check("Provinces exist", (provs?.length || 0) > 0, `${provs?.length || 0} provincií`);

      // 13. City states exist
      const { data: cs } = await supabase.from("city_states").select("*").eq("session_id", sessionId);
      check("City states exist", (cs?.length || 0) > 0, `${cs?.length || 0} městských států`);

      // 14. No page redirect (check current URL)
      check("No redirect to landing", window.location.pathname.includes("/game/"), window.location.pathname);

      // 15. Players >= 2
      const { data: plrs } = await supabase.from("game_players").select("*").eq("session_id", sessionId);
      check("At least 2 players", (plrs?.length || 0) >= 2, `${plrs?.length || 0} hráčů`);

    } catch (e) {
      log("❌ QA test error: " + (e instanceof Error ? e.message : "unknown"));
    }

    setQaResults(results);
    const passed = results.filter(r => r.pass).length;
    const total = results.length;
    log(`🏁 QA hotovo: ${passed}/${total} prošlo`);
    toast[passed === total ? "success" : "warning"](`QA: ${passed}/${total} testů prošlo`);
    setRunning(false);
  };

  const passCount = qaResults.filter(r => r.pass).length;

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <Bug className="h-6 w-6 text-primary" />
          Dev Mode
        </h1>
        <Badge variant="outline" className="font-mono text-xs">
          session: {sessionId.slice(0, 8)}...
        </Badge>
      </div>

      {/* Debug stats */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "Města", count: citiesCount },
          { label: "Události", count: eventsCount },
          { label: "Divy", count: wondersCount },
          { label: "Paměti", count: memoriesCount },
          { label: "Hráči", count: playersCount },
        ].map(s => (
          <div key={s.label} className="bg-card border rounded-lg p-3 text-center">
            <p className="text-2xl font-bold font-display">{s.count}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-3 gap-3">
        <Button
          onClick={seedDemoWorld}
          disabled={seeding}
          className="h-14 font-display"
          variant="outline"
        >
          {seeding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
          {seeding ? "Seeduji..." : "🌱 Seed Demo World"}
        </Button>
        <Button
          onClick={simulate20Rounds}
          disabled={simulating}
          className="h-14 font-display"
          variant="outline"
        >
          {simulating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          {simulating ? "Simuluji..." : "🎮 Simulate 20 Rounds"}
        </Button>
        <Button
          onClick={runQATest}
          disabled={running}
          className="h-14 font-display"
        >
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-2" />}
          {running ? "Testuji..." : "🧪 Run QA Test"}
        </Button>
      </div>

      {/* QA Results */}
      {qaResults.length > 0 && (
        <div className="bg-card border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary" />
              QA Výsledky
            </h3>
            <Badge variant={passCount === qaResults.length ? "default" : "destructive"}>
              {passCount}/{qaResults.length} prošlo
            </Badge>
          </div>
          <div className="space-y-1">
            {qaResults.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm py-1 border-b border-border last:border-0">
                {r.pass ? (
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive shrink-0" />
                )}
                <span className="font-medium">{r.name}</span>
                {r.detail && <span className="text-xs text-muted-foreground ml-auto">{r.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Debug log */}
      {debugLog.length > 0 && (
        <div className="bg-card border rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold text-sm">📋 Debug Log</h3>
            <Button size="sm" variant="ghost" onClick={() => setDebugLog([])}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          <ScrollArea className="h-48">
            <div className="font-mono text-xs space-y-0.5">
              {debugLog.map((line, i) => (
                <p key={i} className={line.includes("❌") ? "text-destructive" : "text-muted-foreground"}>
                  {line}
                </p>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
};

function i2tags(name: string): string[] {
  const m: Record<string, string[]> = {
    Petra: ["pevnost", "svaté město"],
    Tharros: ["přístav", "obchodní uzel"],
    Cabras: ["přístav"],
    Oristano: ["obchodní uzel"],
    Barumini: ["pevnost"],
    Sardara: ["hornické město"],
  };
  return m[name] || [];
}

function pickEventType(round: number, idx: number): string {
  if (round <= 3 && idx === 0) return "found_settlement";
  if (round === 5 || round === 10 || round === 15) {
    if (idx === 0) return "upgrade_city";
  }
  if (round >= 6 && round <= 8 && idx === 0) return "wonder";
  const pool = ["battle", "raid", "diplomacy", "trade", "city_state_action", "repair"];
  return pool[Math.floor(Math.random() * pool.length)];
}

export default DevModePanel;

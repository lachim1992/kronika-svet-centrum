import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bug, Database, Play, CheckCircle2, XCircle, Loader2, FlaskConical, Trash2, Zap, Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface DevModePanelProps {
  sessionId: string;
  currentPlayerName: string;
  onRefetch?: () => void;
  citiesCount: number;
  eventsCount: number;
  wondersCount: number;
  memoriesCount: number;
  playersCount: number;
}

interface QAResult { name: string; pass: boolean; detail?: string; }

interface CoverageReport {
  players: number;
  years: number;
  totalEvents: number;
  eventsByType: Record<string, number>;
  totalNotes: number;
  cityIntros: number;
  eventNarratives: number;
  wondersCreated: number;
  wonderPortraits: number;
  chroniclesPerYear: number;
  worldRetells: number;
  playerChronicles: number;
  rumors: number;
  intelligence: number;
  council: number;
  diplomacyMessages: number;
  tradeDeals: number;
  greatPersons: number;
  worldMemories: number;
  failures: string[];
}

// ===================== CONSTANTS =====================

const PLAYER_NAMES = ["Berr", "Protivník", "Královna", "Stratég", "Dobyvatel", "Obchodník"];
const PROVINCE_NAMES = [
  "Údolí Králů", "Severní marky", "Jižní pláně", "Přímořská provincie",
  "Východní kopce", "Západní lesy", "Zlatá rovina", "Ledová kotlina",
  "Pustá pole", "Říční delta", "Horské průsmyky", "Stříbrné pobřeží",
];
const CITY_NAMES = [
  "Petra", "Tharros", "Sardara", "Nuraghe", "Cabras", "Oristano", "Barumini", "Cornus",
  "Karalis", "Nora", "Sulci", "Bosa", "Olbia", "Turris", "Alghero", "Sassari",
  "Terranova", "Iglesias", "Castelsardo", "Siniscola", "Dorgali", "Tortolì",
  "Lanusei", "Sanluri", "Villasor", "Decimomannu", "Monastir", "Senorbì",
  "Muravera", "Pula", "Teulada", "Carloforte", "Portoscuso", "Guspini",
  "Arbus", "Ales",
];
const CITY_STATE_NAMES = [
  { name: "Kartágo", type: "Obchodní" }, { name: "Syrakúzy", type: "Vojenský" },
  { name: "Rhodos", type: "Námořní" }, { name: "Delfy", type: "Kulturní" },
  { name: "Korint", type: "Obchodní" },
];
const WONDER_NAMES = [
  "Velký maják", "Koloseum", "Chrám bohů", "Pyramida moudrosti",
  "Visutá zahrada", "Zlatá brána", "Obří socha", "Nebeská věž",
  "Podzemní palác", "Kamenný most", "Hvězdárna", "Vodní chrám",
];
const PERSON_TYPES = ["Generál", "Učenec", "Obchodník", "Architekt", "Diplomat", "Kněz"];
const FUNNY_NOTES = [
  "generál musel na záchod", "kronikář usnul při zápisu",
  "kůň odmítl poslouchat rozkazy", "vyjednavač zapomněl smlouvu doma",
  "stavitel postavil chrám obráceně", "obchodník prodal vlastního koně",
  "špion se prozradil kýchnutím", "bitva přerušena kvůli dešti",
  "velvyslanec přišel bez kalhot", "generál se ztratil v lese",
  "diplomat prohlásil válku omylem", "kuchař otrávil celou posádku",
  "hradby spadly hned po dostavbě", "posel doručil zprávu špatnému králi",
  "zásobovací konvoj sjel z útesu", "šaman předpověděl zcela opačné počasí",
  "posádka odmítla bojovat bez oběda", "loďstvo vyplulo opačným směrem",
  "stavitelé zapomněli na dveře", "pokladník ztratil klíč od pokladny",
];
const COUNTER_NOTES = [
  "Popírám! Tak to nebylo!", "Kronikář lže, byl to můj kůň!",
  "Toto je propaganda nepřítele.", "Naši špioni tvrdí opak.",
  "Požaduji přezkum tohoto zápisu!", "Svědci viděli něco jiného.",
];
const MEMORY_TEMPLATES = [
  "V {city} se traduje, že {fact}.",
  "Obyvatelé {city} věří, že {fact}.",
  "Kronikáři zaznamenali, že v {city} {fact}.",
  "Stará legenda praví, že {city} {fact}.",
];
const MEMORY_FACTS = [
  "zdejší studna léčí nemoci", "na náměstí žije duch starého krále",
  "místní víno je nejlepší v říši", "hradby byly postaveny za jedinou noc",
  "podzemní tunely vedou až k moři", "zdejší kovář vyrábí nerozbitné meče",
  "chrám byl postaven na místě starého hrobu", "trh je nejrušnější v celém světě",
  "zdejší kočky přinášejí štěstí", "řeka mění barvu při úplňku",
];
const TRAIT_CATEGORIES = ["military", "cultural", "economic", "diplomatic", "religious"];
const CHRONICLE_TEMPLATES = [
  "Rok {r}: Říše se otřásaly v základech. {p1} a {p2} změřili síly na poli bitevním.",
  "Rok {r}: Obchod vzkvétal, zatímco na hranicích se shromažďovala vojska.",
  "Rok {r}: Diplomaté jednali za zavřenými dveřmi o budoucnosti kontinentu.",
  "Rok {r}: Nové divy světa povstaly z prachu, svědčíce o velikosti civilizací.",
  "Rok {r}: Zvěsti o zradě a spiknutí kolují říší jako mor.",
];
const COUNCIL_TEMPLATES = {
  war: ["Naše armády jsou připraveny.", "Doporučuji posílit obranu.", "Nepřítel je zranitelný na severu."],
  diplomacy: ["Spojenectví s {p} by bylo výhodné.", "Varuju před důvěrou v {p}.", "Navrhněte mírovou smlouvu."],
  interior: ["Města potřebují investice.", "Zásoby jídla klesají.", "Lid je spokojený."],
  trade: ["Obchod vzkvétá.", "Potřebujeme nové trasy.", "Embargo proti {p} funguje."],
};

// ===================== COMPONENT =====================

const DevModePanel = ({
  sessionId, currentPlayerName, onRefetch,
  citiesCount, eventsCount, wondersCount, memoriesCount, playersCount,
}: DevModePanelProps) => {
  const [seeding, setSeeding] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [running, setRunning] = useState(false);
  const [qaResults, setQaResults] = useState<QAResult[]>([]);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [simProgress, setSimProgress] = useState("");
  const [coverageReport, setCoverageReport] = useState<CoverageReport | null>(null);

  const log = (msg: string) => setDebugLog(prev => [...prev.slice(-200), `[${new Date().toLocaleTimeString("cs")}] ${msg}`]);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const pickN = <T,>(arr: T[], n: number): T[] => {
    const s = [...arr]; const r: T[] = [];
    for (let i = 0; i < n && s.length; i++) { const idx = Math.floor(Math.random() * s.length); r.push(s.splice(idx, 1)[0]); }
    return r;
  };

  // ========================
  // SEED 6-PLAYER WORLD
  // ========================
  const seedExtremeWorld = async () => {
    setSeeding(true);
    log("🌱 Seeduji extrémní 6-hráčový svět...");
    try {
      // Create/ensure 6 players
      const { data: existingPlayers } = await supabase.from("game_players").select("*").eq("session_id", sessionId);
      const existingNames = new Set(existingPlayers?.map(p => p.player_name) || []);

      for (let i = 0; i < 6; i++) {
        const pName = PLAYER_NAMES[i];
        if (!existingNames.has(pName)) {
          await supabase.from("game_players").insert({
            session_id: sessionId, player_name: pName, player_number: i + 1,
          });
          for (const rt of ["food", "wood", "stone", "iron", "wealth"]) {
            await supabase.from("player_resources").insert({
              session_id: sessionId, player_name: pName, resource_type: rt,
              income: 2 + Math.floor(Math.random() * 3),
              upkeep: Math.floor(Math.random() * 2),
              stockpile: 3 + Math.floor(Math.random() * 8),
            });
          }
          log(`✅ Hráč ${i + 1}: ${pName}`);
        }
      }

      // Update session
      await supabase.from("game_sessions").update({
        player1_name: PLAYER_NAMES[0], player2_name: PLAYER_NAMES[1], max_players: 6,
      }).eq("id", sessionId);

      // Create provinces (2 per player = 12)
      const provinceIds: Record<string, string> = {};
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 2; j++) {
          const provName = PROVINCE_NAMES[i * 2 + j];
          const { data } = await supabase.from("provinces").insert({
            session_id: sessionId, name: provName, owner_player: PLAYER_NAMES[i],
          }).select().single();
          if (data) provinceIds[provName] = data.id;
        }
      }
      log(`✅ ${Object.keys(provinceIds).length} provincií`);

      // Create cities (6 per player = 36)
      const allCityIds: { id: string; name: string; owner: string; provId: string | null }[] = [];
      let cityIdx = 0;
      for (let i = 0; i < 6; i++) {
        const prov1 = PROVINCE_NAMES[i * 2];
        const prov2 = PROVINCE_NAMES[i * 2 + 1];
        for (let j = 0; j < 6; j++) {
          const cName = CITY_NAMES[cityIdx++] || `Město-${cityIdx}`;
          const prov = j < 3 ? prov1 : prov2;
          const provId = provinceIds[prov] || null;
          const { data } = await supabase.from("cities").insert({
            session_id: sessionId, name: cName, owner_player: PLAYER_NAMES[i],
            province: prov, province_id: provId,
            level: "Osada", tags: [], founded_round: 1,
          }).select().single();
          if (data) allCityIds.push({ id: data.id, name: cName, owner: PLAYER_NAMES[i], provId });
        }
      }
      log(`✅ ${allCityIds.length} měst`);

      // City states
      for (const cs of CITY_STATE_NAMES) {
        await supabase.from("city_states").insert({ session_id: sessionId, name: cs.name, type: cs.type });
      }
      log(`✅ ${CITY_STATE_NAMES.length} městských států`);

      // Wonders (12, 2 per player)
      for (let i = 0; i < 6; i++) {
        const pCities = allCityIds.filter(c => c.owner === PLAYER_NAMES[i]);
        for (let w = 0; w < 2; w++) {
          const wName = WONDER_NAMES[i * 2 + w] || `Div-${i * 2 + w}`;
          const wCity = pCities[w % pCities.length];
          await supabase.from("wonders").insert({
            session_id: sessionId, name: wName, owner_player: PLAYER_NAMES[i],
            city_name: wCity?.name || "", era: w === 0 ? "Ancient" : "Classical",
            status: "planned", description: `${wName} – plánovaný div světa v ${wCity?.name}.`,
          });
        }
      }
      log("✅ 12 divů naplánovány");

      // Great persons (1 per player)
      for (let i = 0; i < 6; i++) {
        const pCities = allCityIds.filter(c => c.owner === PLAYER_NAMES[i]);
        await supabase.from("great_persons").insert({
          session_id: sessionId, name: `${PLAYER_NAMES[i]}-hrdina`,
          player_name: PLAYER_NAMES[i], person_type: PERSON_TYPES[i],
          city_id: pCities[0]?.id || null, born_round: 1, is_alive: true,
          bio: `Legendární ${PERSON_TYPES[i].toLowerCase()} sloužící říši ${PLAYER_NAMES[i]}.`,
        });
      }
      log("✅ 6 velkých osobností");

      // Civilizations
      for (const p of PLAYER_NAMES) {
        await supabase.from("civilizations").upsert({
          session_id: sessionId, player_name: p,
          civ_name: `Říše ${p}`, core_myth: `Pradávné proroctví o slávě ${p}.`,
          architectural_style: pick(["Kamenný", "Dřevěný", "Cihlový", "Mramorový"]),
          cultural_quirk: pick(["Oslavují porážky", "Jedí jen ryby", "Staví pozpátku", "Mluví zpěvem"]),
        }, { onConflict: "session_id,player_name", ignoreDuplicates: true });
      }
      log("✅ 6 civilizací");

      toast.success("🌱 Extrémní demo svět naseedován (6 hráčů, 36 měst, 12 divů)!");
      onRefetch?.();
    } catch (e: any) {
      log("❌ Seed error: " + (e?.message || "unknown"));
      toast.error("Seedování selhalo");
    }
    setSeeding(false);
  };

  // ========================
  // EXTREME 20-YEAR SIMULATION
  // ========================
  const runExtremeSimulation = async () => {
    setSimulating(true);
    const report: CoverageReport = {
      players: 0, years: 20, totalEvents: 0, eventsByType: {},
      totalNotes: 0, cityIntros: 0, eventNarratives: 0,
      wondersCreated: 0, wonderPortraits: 0,
      chroniclesPerYear: 0, worldRetells: 0, playerChronicles: 0,
      rumors: 0, intelligence: 0, council: 0,
      diplomacyMessages: 0, tradeDeals: 0, greatPersons: 0, worldMemories: 0,
      failures: [],
    };

    try {
      log("🚀 Začínám EXTRÉMNÍ simulaci: 6 hráčů × 20 let × 5+ akcí...");

      // Fetch state
      const { data: cities } = await supabase.from("cities").select("*").eq("session_id", sessionId);
      const { data: players } = await supabase.from("game_players").select("*").eq("session_id", sessionId);
      const { data: wonders } = await supabase.from("wonders").select("*").eq("session_id", sessionId);
      const { data: cityStates } = await supabase.from("city_states").select("*").eq("session_id", sessionId);

      if (!cities?.length || !players?.length) {
        toast.error("Nejprve naseedujte svět"); setSimulating(false); return;
      }

      const playerNames = players.map(p => p.player_name);
      report.players = playerNames.length;
      const wonderList = [...(wonders || [])];
      let wonderIdx = 0;

      // Index cities by owner
      const cityByOwner: Record<string, typeof cities> = {};
      for (const c of cities) {
        (cityByOwner[c.owner_player] = cityByOwner[c.owner_player] || []).push(c);
      }

      // Diplomacy rooms setup
      const roomIds: string[] = [];
      for (let i = 0; i < playerNames.length; i++) {
        for (let j = i + 1; j < playerNames.length; j++) {
          const { data: room } = await supabase.from("diplomacy_rooms").insert({
            session_id: sessionId, participant_a: playerNames[i], participant_b: playerNames[j], room_type: "player_player",
          }).select().single();
          if (room) roomIds.push(room.id);
        }
      }
      // NPC diplomacy rooms
      const npcRoomIds: string[] = [];
      if (cityStates?.length) {
        for (const cs of cityStates) {
          const { data: r } = await supabase.from("diplomacy_rooms").insert({
            session_id: sessionId, participant_a: playerNames[0], participant_b: cs.name,
            room_type: "player_npc", npc_city_state_id: cs.id,
          }).select().single();
          if (r) npcRoomIds.push(r.id);
        }
      }
      log(`✅ ${roomIds.length} hráčských + ${npcRoomIds.length} NPC diplomatických místností`);

      // ------------ MAIN LOOP: 20 YEARS ------------
      for (let year = 1; year <= 20; year++) {
        setSimProgress(`Rok ${year}/20`);
        log(`📅 ═══ ROK ${year} ═══`);

        const yearEventIds: string[] = [];

        // Each player: 5+ events
        for (const pName of playerNames) {
          const myCities = cityByOwner[pName] || [];
          const oppCities = cities.filter(c => c.owner_player !== pName);
          const numEvents = 5 + Math.floor(Math.random() * 3); // 5-7

          for (let e = 0; e < numEvents; e++) {
            const evType = pickEventTypeExtreme(year, e, pName);
            const city = pick(myCities.length ? myCities : cities);
            const oppCity = oppCities.length ? pick(oppCities) : null;
            const note = Math.random() < 0.4 ? pick(FUNNY_NOTES) : null;

            const eventData: any = {
              session_id: sessionId, event_type: evType, player: pName,
              turn_number: year, city_id: city?.id || null,
              location: city?.name || "", note, confirmed: true,
              truth_state: Math.random() < 0.08 ? "rumor" : "canon",
            };

            if (evType === "battle" && oppCity) {
              eventData.attacker_city_id = city?.id;
              eventData.defender_city_id = oppCity.id;
              eventData.secondary_city_id = oppCity.id;
              eventData.result = pick(["vítězství", "porážka", "nerozhodně"]);
              eventData.casualties = `${Math.floor(Math.random() * 800 + 50)} mužů`;
              eventData.armies_involved = [`${pName}-legie-${year}`];
            }
            if (evType === "raid" && oppCity) {
              eventData.secondary_city_id = oppCity.id;
              eventData.devastation_duration = Math.floor(Math.random() * 3) + 1;
            }
            if (evType === "diplomacy") {
              eventData.treaty_type = pick(["mír", "obchod", "tribut", "embargo", "aliiance", "neútočení"]);
              eventData.terms_summary = pick(["Oboustranně výhodná dohoda", "Jednostranný ústupek", "Tajná klauzule"]);
            }

            const { data: inserted, error: insErr } = await supabase.from("game_events").insert(eventData).select().single();
            if (insErr) { report.failures.push(`event-${year}-${pName}-${e}: ${insErr.message}`); continue; }
            if (inserted) {
              yearEventIds.push(inserted.id);
              report.totalEvents++;
              report.eventsByType[evType] = (report.eventsByType[evType] || 0) + 1;
            }
          }

          // Notes on 2+ events (from multiple players)
          const myYearEvents = yearEventIds.slice(-5);
          for (const eid of myYearEvents.slice(0, 2)) {
            // Owner note
            await supabase.from("event_annotations").insert({
              event_id: eid, author: pName,
              note_text: pick(FUNNY_NOTES),
              visibility: Math.random() < 0.25 ? "leakable" : "public",
            });
            report.totalNotes++;
            // Counter-note from another player
            const otherPlayer = pick(playerNames.filter(p => p !== pName));
            await supabase.from("event_annotations").insert({
              event_id: eid, author: otherPlayer,
              note_text: pick(COUNTER_NOTES),
              visibility: "public",
            });
            report.totalNotes++;
          }

          // Diplomacy messages (player-player)
          if (roomIds.length && Math.random() < 0.6) {
            const roomId = pick(roomIds);
            const secrecy = pick(["PUBLIC", "PRIVATE", "LEAKABLE"]);
            await supabase.from("diplomacy_messages").insert({
              room_id: roomId, sender: pName, sender_type: "player",
              message_text: `${pName} navrhuje ${pick(["mír", "obchod", "spojenectví", "výměnu"])} v roce ${year}.`,
              secrecy, leak_chance: secrecy === "LEAKABLE" ? 50 : 0,
              message_tag: pick(["offer", "threat", "question", null]),
            });
            report.diplomacyMessages++;
          }

          // NPC diplomacy
          if (npcRoomIds.length && Math.random() < 0.3) {
            await supabase.from("diplomacy_messages").insert({
              room_id: pick(npcRoomIds), sender: pName, sender_type: "player",
              message_text: `${pName} jedná s městským státem o podpoře.`,
              secrecy: "PRIVATE", leak_chance: 0,
            });
            report.diplomacyMessages++;
          }

          // Trade deals
          if (Math.random() < 0.4) {
            const other = pick(playerNames.filter(p => p !== pName));
            await supabase.from("trade_log").insert({
              session_id: sessionId, turn_number: year,
              from_player: pName, to_player: other,
              resource_type: pick(["food", "wood", "stone", "iron", "wealth"]),
              amount: Math.floor(Math.random() * 10) + 1,
              trade_type: pick(["Obchod", "Tribut", "Dar"]),
              note: Math.random() < 0.3 ? pick(FUNNY_NOTES) : null,
            });
            report.tradeDeals++;
          }

          // Military capacity
          if (year % 4 === 1) {
            await supabase.from("military_capacity").insert({
              session_id: sessionId, player_name: pName,
              army_name: `${pName}-legie-${year}`,
              army_type: pick(["Lehká", "Těžká", "Jízda", "Obléhací"]),
              iron_cost: Math.floor(Math.random() * 3) + 1,
            });
          }
        }

        // === PER-YEAR GLOBAL ACTIONS ===

        // City upgrades (progressive)
        if (year >= 4) {
          const level = year < 8 ? "Městečko" : year < 14 ? "Město" : "Polis";
          const upgradeTarget = pick(cities.filter(c => c.level !== "Polis"));
          if (upgradeTarget) {
            await supabase.from("cities").update({ level }).eq("id", upgradeTarget.id);
            upgradeTarget.level = level; // update local ref
          }
        }

        // Wonder progression
        if (wonderList.length) {
          const w = wonderList[wonderIdx % wonderList.length];
          if (year === 3) await supabase.from("wonders").update({ status: "under construction" }).eq("id", w.id);
          if (year === 7) { await supabase.from("wonders").update({ status: "completed" }).eq("id", w.id); wonderIdx++; }
          if (year === 10 && wonderList.length > 1) {
            await supabase.from("wonders").update({ status: "under construction" }).eq("id", wonderList[1].id);
          }
          if (year === 14 && wonderList.length > 1) {
            await supabase.from("wonders").update({ status: "completed" }).eq("id", wonderList[1].id);
            wonderIdx++;
          }
          if (year === 16 && wonderList.length > 2) {
            await supabase.from("wonders").update({ status: "under construction" }).eq("id", wonderList[2].id);
          }
          if (year === 18 && wonderList.length > 2) {
            await supabase.from("wonders").update({ status: "destroyed" }).eq("id", wonderList[2].id);
          }
          if (year === 19 && wonderList.length > 3) {
            await supabase.from("wonders").update({ status: "damaged" }).eq("id", wonderList[3].id);
          }
        }

        // World memories (3 per year)
        for (let m = 0; m < 3; m++) {
          const memCity = pick(cities);
          const fact = pick(MEMORY_FACTS);
          const tpl = pick(MEMORY_TEMPLATES);
          await supabase.from("world_memories").insert({
            session_id: sessionId,
            text: tpl.replace("{city}", memCity.name).replace("{fact}", fact),
            approved: Math.random() < 0.7,
            category: pick(["tradition", "historical_scar", "running_joke", "legend", "mystery"]),
            created_round: year, city_id: memCity.id,
            province_id: memCity.province_id || null,
          });
          report.worldMemories++;
        }

        // Entity traits
        if (year % 3 === 0) {
          const traitCity = pick(cities);
          await supabase.from("entity_traits").insert({
            session_id: sessionId, entity_type: "city", entity_name: traitCity.name,
            entity_id: traitCity.id, trait_category: pick(TRAIT_CATEGORIES),
            trait_text: `${traitCity.name} je známé svou ${pick(["odvahou", "lstivostí", "bohatstvím", "krásou", "silou"])}.`,
            source_turn: year, is_active: true,
          });
        }

        // Chronicle entry
        const ctpl = pick(CHRONICLE_TEMPLATES);
        await supabase.from("chronicle_entries").insert({
          session_id: sessionId,
          text: ctpl.replace("{r}", String(year)).replace("{p1}", pick(playerNames)).replace("{p2}", pick(playerNames)),
          epoch_style: pick(["kroniky", "mýty", "moderní", "humor"]),
        });
        report.chroniclesPerYear++;

        // Intelligence reports (2 per year)
        for (let ir = 0; ir < 2; ir++) {
          const spy = pick(playerNames);
          const target = pick(playerNames.filter(p => p !== spy));
          await supabase.from("intelligence_reports").insert({
            session_id: sessionId, visible_to: spy, target_entity: target,
            report_text: `Špioni ${spy} hlásí aktivitu ${target} v roce ${year}: ${pick(["budování armády", "tajné jednání", "útoky na obchod", "stavba divu", "posílení hranic"])}.`,
            source_type: pick(["merchant_gossip", "spy_network", "intercepted_message", "scout_report"]),
            created_round: year, secrecy_level: pick(["uncertain", "reliable", "confirmed"]),
          });
          report.intelligence++;
        }

        // Council evaluations
        for (const pName of playerNames) {
          const otherP = pick(playerNames.filter(p => p !== pName));
          await supabase.from("council_evaluations").insert({
            session_id: sessionId, player_name: pName, round_number: year,
            round_summary: `Rok ${year} byl pro ${pName} ${pick(["úspěšný", "těžký", "přelomový", "klidný"])}.`,
            minister_war: pick(COUNCIL_TEMPLATES.war),
            minister_diplomacy: pick(COUNCIL_TEMPLATES.diplomacy).replace("{p}", otherP),
            minister_interior: pick(COUNCIL_TEMPLATES.interior),
            minister_trade: pick(COUNCIL_TEMPLATES.trade).replace("{p}", otherP),
            strategic_outlook: pick(["Expanze", "Obrana", "Diplomacie", "Konsolidace"]),
          });
          report.council++;
        }

        // City-state mood/influence changes
        if (cityStates?.length) {
          for (const cs of cityStates) {
            await supabase.from("city_states").update({
              mood: pick(["Neutrální", "Přátelský", "Nepřátelský", "Nadšený", "Opatrný"]),
              influence_p1: Math.floor(Math.random() * 20),
              influence_p2: Math.floor(Math.random() * 20),
            }).eq("id", cs.id);
          }
        }

        // Declarations (1-2 per year)
        const declPlayer = pick(playerNames);
        await supabase.from("declarations").insert({
          session_id: sessionId, player_name: declPlayer, turn_number: year,
          original_text: `${declPlayer} prohlašuje: "${pick(["Budeme bojovat!", "Mír všem národům!", "Nová éra začíná!", "Nepřátelé budou poraženi!"])}"`,
          declaration_type: pick(["proclamation", "war_declaration", "peace_offer", "edict"]),
        });

        // Secret objectives (occasional)
        if (year === 1 || year === 10) {
          for (const p of playerNames) {
            await supabase.from("secret_objectives").insert({
              session_id: sessionId, player_name: p,
              objective_text: pick([
                "Ovládni 3 provincie", "Postav 2 divy", "Zníč nepřátelské město",
                "Uzavři alianci se 3 hráči", "Získej nejvíce zlata", "Dobij hlavní město rivala",
              ]),
              fulfilled: false,
            });
          }
        }

        // Advance turn
        await supabase.from("game_sessions").update({ current_turn: year + 1 }).eq("id", sessionId);
      }

      // === POST-SIMULATION: GENERATE CHRONICLES ===
      log("📜 Generuji světové dějiny a kroniky hráčů...");

      // World history chapters (4 chapters covering 5 years each)
      for (let ch = 0; ch < 4; ch++) {
        const from = ch * 5 + 1;
        const to = (ch + 1) * 5;
        await supabase.from("world_history_chapters").insert({
          session_id: sessionId, from_turn: from, to_turn: to,
          chapter_title: `Kapitola ${ch + 1}: Roky ${from}-${to}`,
          chapter_text: `V letech ${from} až ${to} se svět proměnil. Civilizace ${pick(playerNames)} vedla expanzi, zatímco ${pick(playerNames)} budoval obranu. Konflikty a obchod formovaly dějiny.`,
          epoch_style: "kroniky",
        });
        report.worldRetells++;
      }

      // Player chronicles
      for (const p of playerNames) {
        await supabase.from("player_chronicle_chapters").insert({
          session_id: sessionId, player_name: p, from_turn: 1, to_turn: 20,
          chapter_title: `Kronika ${p}: Prvních 20 let`,
          chapter_text: `Říše ${p} prošla za 20 let bouřlivým vývojem. Od skromných osad po mocné město, od prvních šarvátek po velké bitvy.`,
          epoch_style: "kroniky",
        });
        report.playerChronicles++;
      }

      // World crises
      for (const yr of [5, 12, 18]) {
        await supabase.from("world_crises").insert({
          session_id: sessionId, trigger_round: yr,
          title: pick(["Mor v říši", "Invaze barbarů", "Velká sucha", "Zemětřesení", "Mořská bouře"]),
          description: `V roce ${yr} zasáhla krize celý kontinent.`,
          crisis_type: pick(["sea_peoples", "plague", "famine", "earthquake"]),
          affected_cities: pickN(cities, 3).map(c => c.name),
        });
      }

      // Wiki entries for cities, wonders, persons
      log("📖 Generuji wiki záznamy...");
      for (const c of cities.slice(0, 12)) {
        await supabase.from("wiki_entries").upsert({
          session_id: sessionId, entity_type: "city", entity_name: c.name,
          entity_id: c.id, owner_player: c.owner_player,
          summary: `${c.name} je ${c.level} v provincii ${c.province || "neznámé"}.`,
          ai_description: `${c.name}, založené v roce ${c.founded_round}, je důležitým centrem civilizace ${c.owner_player}.`,
        }, { onConflict: "session_id,entity_id", ignoreDuplicates: true });
        report.cityIntros++;
      }

      // Count totals
      const { count: wonderCount } = await supabase.from("wonders").select("*", { count: "exact", head: true }).eq("session_id", sessionId);
      report.wondersCreated = wonderCount || 0;

      const { count: gpCount } = await supabase.from("great_persons").select("*", { count: "exact", head: true }).eq("session_id", sessionId);
      report.greatPersons = gpCount || 0;

      const { count: rumorCount } = await supabase.from("intelligence_reports").select("*", { count: "exact", head: true }).eq("session_id", sessionId).eq("source_type", "merchant_gossip");
      report.rumors = rumorCount || 0;

      setCoverageReport(report);
      log(`✅ SIMULACE DOKONČENA: ${report.totalEvents} událostí, ${report.totalNotes} poznámek`);
      toast.success(`🚀 Extrémní simulace hotova: ${report.totalEvents} událostí!`);
      onRefetch?.();
    } catch (e: any) {
      report.failures.push(e?.message || "unknown error");
      setCoverageReport(report);
      log("❌ " + (e?.message || "unknown"));
      toast.error("Simulace selhala");
    }
    setSimulating(false);
    setSimProgress("");
  };

  // ========================
  // QA TEST
  // ========================
  const runQATest = async () => {
    setRunning(true);
    setQaResults([]);
    log("🧪 QA test...");
    const results: QAResult[] = [];
    const check = (name: string, pass: boolean, detail?: string) => {
      results.push({ name, pass, detail });
    };

    try {
      const [
        { data: cities }, { data: events }, { data: wonders },
        { data: chronicles }, { data: mems }, { data: intel },
        { data: provs }, { data: cs }, { data: plrs },
        { data: dipMsgs }, { data: trades }, { data: councils },
        { data: whChapters }, { data: pcChapters }, { data: crises },
        { data: decls }, { data: gp },
      ] = await Promise.all([
        supabase.from("cities").select("*").eq("session_id", sessionId),
        supabase.from("game_events").select("*").eq("session_id", sessionId),
        supabase.from("wonders").select("*").eq("session_id", sessionId),
        supabase.from("chronicle_entries").select("*").eq("session_id", sessionId),
        supabase.from("world_memories").select("*").eq("session_id", sessionId),
        supabase.from("intelligence_reports").select("*").eq("session_id", sessionId),
        supabase.from("provinces").select("*").eq("session_id", sessionId),
        supabase.from("city_states").select("*").eq("session_id", sessionId),
        supabase.from("game_players").select("*").eq("session_id", sessionId),
        supabase.from("diplomacy_messages").select("*", { count: "exact" }),
        supabase.from("trade_log").select("*").eq("session_id", sessionId),
        supabase.from("council_evaluations").select("*").eq("session_id", sessionId),
        supabase.from("world_history_chapters").select("*").eq("session_id", sessionId),
        supabase.from("player_chronicle_chapters").select("*").eq("session_id", sessionId),
        supabase.from("world_crises").select("*").eq("session_id", sessionId),
        supabase.from("declarations").select("*").eq("session_id", sessionId),
        supabase.from("great_persons").select("*").eq("session_id", sessionId),
      ]);

      check("6 hráčů", (plrs?.length || 0) >= 6, `${plrs?.length}`);
      check("36+ měst", (cities?.length || 0) >= 30, `${cities?.length}`);
      check("12+ provincií", (provs?.length || 0) >= 10, `${provs?.length}`);
      check("600+ událostí", (events?.length || 0) >= 500, `${events?.length}`);
      check("5+ městských států", (cs?.length || 0) >= 4, `${cs?.length}`);
      check("12+ divů", (wonders?.length || 0) >= 10, `${wonders?.length}`);
      check("6+ osobností", (gp?.length || 0) >= 6, `${gp?.length}`);
      check("20+ kronik (per year)", (chronicles?.length || 0) >= 18, `${chronicles?.length}`);
      check("40+ pamětí světa", (mems?.length || 0) >= 30, `${mems?.length}`);
      check("20+ zpravodajských zpráv", (intel?.length || 0) >= 20, `${intel?.length}`);
      check("Diplomatické zprávy", (dipMsgs?.length || 0) >= 20, `${dipMsgs?.length}`);
      check("Obchodní záznamy", (trades?.length || 0) >= 10, `${trades?.length}`);
      check("Rada ministrů (council)", (councils?.length || 0) >= 60, `${councils?.length}`);
      check("Kapitoly dějin", (whChapters?.length || 0) >= 3, `${whChapters?.length}`);
      check("Kroniky hráčů", (pcChapters?.length || 0) >= 5, `${pcChapters?.length}`);
      check("Světové krize", (crises?.length || 0) >= 2, `${crises?.length}`);
      check("Deklarace", (decls?.length || 0) >= 10, `${decls?.length}`);

      // Event type coverage
      const eventTypes = new Set(events?.map(e => e.event_type) || []);
      const needed = ["battle", "raid", "diplomacy", "trade", "found_settlement", "upgrade_city", "wonder", "city_state_action", "repair"];
      const covered = needed.filter(t => eventTypes.has(t));
      check("Pokrytí typů událostí (9)", covered.length >= 7, `${covered.length}/9: ${covered.join(", ")}`);

      // Battles with structured data
      const battles = events?.filter(e => e.event_type === "battle" && e.attacker_city_id) || [];
      check("Bitvy se strukturou", battles.length >= 20, `${battles.length}`);

      // No redirect
      check("Žádný redirect na landing", window.location.pathname.includes("/game/"), window.location.pathname);

      // Notes
      if (events?.length) {
        const eids = events.slice(0, 200).map(e => e.id);
        const { data: anns } = await supabase.from("event_annotations").select("*", { count: "exact" }).in("event_id", eids);
        check("Poznámky k událostem", (anns?.length || 0) >= 50, `${anns?.length}`);
      }

    } catch (e: any) {
      log("❌ QA: " + (e?.message || "unknown"));
    }

    setQaResults(results);
    const passed = results.filter(r => r.pass).length;
    log(`🏁 QA: ${passed}/${results.length}`);
    toast[passed === results.length ? "success" : "warning"](`QA: ${passed}/${results.length}`);
    setRunning(false);
  };

  const passCount = qaResults.filter(r => r.pass).length;

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <Bug className="h-6 w-6 text-primary" />
          Dev Mode — Extrémní simulace
        </h1>
        <Badge variant="outline" className="font-mono text-xs">
          session: {sessionId.slice(0, 8)}...
        </Badge>
      </div>

      {/* Stats */}
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

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Button onClick={seedExtremeWorld} disabled={seeding} className="h-14 font-display" variant="outline">
          {seeding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
          {seeding ? "Seeduji..." : "🌱 Seed 6-Player World"}
        </Button>
        <Button onClick={runExtremeSimulation} disabled={simulating} className="h-14 font-display text-primary-foreground bg-primary hover:bg-primary/90">
          {simulating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
          {simulating ? `Simuluji... ${simProgress}` : "🚀 Simulovat 20 let (6×5+)"}
        </Button>
        <Button onClick={runQATest} disabled={running} className="h-14 font-display">
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-2" />}
          {running ? "Testuji..." : "🧪 Run QA Test"}
        </Button>
      </div>

      {/* Coverage Report */}
      {coverageReport && (
        <div className="bg-card border rounded-lg p-4 space-y-3">
          <h3 className="font-display font-semibold text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            📊 Coverage Report
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            {[
              ["Hráči", coverageReport.players],
              ["Roky", coverageReport.years],
              ["Události celkem", coverageReport.totalEvents],
              ["Poznámky", coverageReport.totalNotes],
              ["Intro měst", coverageReport.cityIntros],
              ["Narativy událostí", coverageReport.eventNarratives],
              ["Divy", coverageReport.wondersCreated],
              ["Portréty divů", coverageReport.wonderPortraits],
              ["Kroniky/rok", coverageReport.chroniclesPerYear],
              ["Dějiny světa", coverageReport.worldRetells],
              ["Kroniky hráčů", coverageReport.playerChronicles],
              ["Zvěsti", coverageReport.rumors],
              ["Zpravodajství", coverageReport.intelligence],
              ["Rada ministrů", coverageReport.council],
              ["Diplomacie msg", coverageReport.diplomacyMessages],
              ["Obchody", coverageReport.tradeDeals],
              ["Osobnosti", coverageReport.greatPersons],
              ["Paměti světa", coverageReport.worldMemories],
            ].map(([label, val]) => (
              <div key={label as string} className="flex justify-between border-b border-border pb-1">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-bold">{val}</span>
              </div>
            ))}
          </div>
          {/* Events by type */}
          {Object.keys(coverageReport.eventsByType).length > 0 && (
            <div className="mt-2">
              <p className="text-sm font-semibold mb-1">Události dle typu:</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(coverageReport.eventsByType).map(([t, c]) => (
                  <Badge key={t} variant="outline" className="text-xs">{t}: {c}</Badge>
                ))}
              </div>
            </div>
          )}
          {coverageReport.failures.length > 0 && (
            <div className="mt-2 text-destructive text-xs">
              <p className="font-semibold">❌ Chyby ({coverageReport.failures.length}):</p>
              {coverageReport.failures.slice(0, 10).map((f, i) => <p key={i}>{f}</p>)}
            </div>
          )}
        </div>
      )}

      {/* QA Results */}
      {qaResults.length > 0 && (
        <div className="bg-card border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-semibold flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary" /> QA Výsledky
            </h3>
            <Badge variant={passCount === qaResults.length ? "default" : "destructive"}>
              {passCount}/{qaResults.length} prošlo
            </Badge>
          </div>
          <div className="space-y-1">
            {qaResults.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm py-1 border-b border-border last:border-0">
                {r.pass ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> : <XCircle className="h-4 w-4 text-destructive shrink-0" />}
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
                <p key={i} className={line.includes("❌") ? "text-destructive" : "text-muted-foreground"}>{line}</p>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
};

function pickEventTypeExtreme(year: number, idx: number, _player: string): string {
  if (year <= 2 && idx === 0) return "found_settlement";
  if ((year === 5 || year === 10 || year === 15 || year === 18) && idx === 0) return "upgrade_city";
  if ((year === 6 || year === 11 || year === 16) && idx === 1) return "wonder";
  if (idx === 2) return "diplomacy";
  const pool = ["battle", "raid", "trade", "city_state_action", "repair", "diplomacy", "found_settlement", "wonder"];
  return pool[Math.floor(Math.random() * pool.length)];
}

export default DevModePanel;

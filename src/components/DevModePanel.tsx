import { useState } from "react";
import SmartAIGenerationPanel from "@/components/SmartAIGenerationPanel";
import { Input } from "@/components/ui/input";
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
  const [generatingProfiles, setGeneratingProfiles] = useState(false);
  const [profileProgress, setProfileProgress] = useState("");
  const [appendYears, setAppendYears] = useState(10);
  const [focusedSimulating, setFocusedSimulating] = useState(false);
  const [focusedProgress, setFocusedProgress] = useState("");

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
  // SIMULATION (supports append mode)
  // ========================
  const runSimulation = async (yearsToRun: number, isAppend: boolean) => {
    setSimulating(true);
    const report: CoverageReport = {
      players: 0, years: yearsToRun, totalEvents: 0, eventsByType: {},
      totalNotes: 0, cityIntros: 0, eventNarratives: 0,
      wondersCreated: 0, wonderPortraits: 0,
      chroniclesPerYear: 0, worldRetells: 0, playerChronicles: 0,
      rumors: 0, intelligence: 0, council: 0,
      diplomacyMessages: 0, tradeDeals: 0, greatPersons: 0, worldMemories: 0,
      failures: [],
    };

    try {
      // Determine start year
      const { data: sessionData } = await supabase.from("game_sessions").select("current_turn").eq("id", sessionId).single();
      const startYear = isAppend ? (sessionData?.current_turn || 1) : 1;
      const endYear = startYear + yearsToRun - 1;

      log(`🚀 ${isAppend ? "APPEND" : "NOVÁ"} simulace: rok ${startYear}–${endYear}`);

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

      const cityByOwner: Record<string, typeof cities> = {};
      for (const c of cities) {
        (cityByOwner[c.owner_player] = cityByOwner[c.owner_player] || []).push(c);
      }

      // Ensure diplomacy rooms exist
      const { data: existingRooms } = await supabase.from("diplomacy_rooms").select("*").eq("session_id", sessionId);
      const roomIds = existingRooms?.filter(r => r.room_type === "player_player").map(r => r.id) || [];
      const npcRoomIds = existingRooms?.filter(r => r.room_type === "player_npc").map(r => r.id) || [];

      if (roomIds.length === 0) {
        for (let i = 0; i < playerNames.length; i++) {
          for (let j = i + 1; j < playerNames.length; j++) {
            const { data: room } = await supabase.from("diplomacy_rooms").insert({
              session_id: sessionId, participant_a: playerNames[i], participant_b: playerNames[j], room_type: "player_player",
            }).select().single();
            if (room) roomIds.push(room.id);
          }
        }
        if (cityStates?.length) {
          for (const cs of cityStates) {
            const { data: r } = await supabase.from("diplomacy_rooms").insert({
              session_id: sessionId, participant_a: playerNames[0], participant_b: cs.name,
              room_type: "player_npc", npc_city_state_id: cs.id,
            }).select().single();
            if (r) npcRoomIds.push(r.id);
          }
        }
      }

      // ------------ MAIN LOOP ------------
      for (let year = startYear; year <= endYear; year++) {
        setSimProgress(`Rok ${year}/${endYear}`);
        log(`📅 ═══ ROK ${year} ═══`);

        const yearEventIds: string[] = [];

        // Each player: 5-7 events (meets 600+ for 20 years × 6 players)
        for (const pName of playerNames) {
          const myCities = cityByOwner[pName] || [];
          const oppCities = cities.filter(c => c.owner_player !== pName);
          const numEvents = 5 + Math.floor(Math.random() * 3);

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

          // Notes on 2+ events
          const myYearEvents = yearEventIds.slice(-5);
          for (const eid of myYearEvents.slice(0, 2)) {
            await supabase.from("event_annotations").insert({
              event_id: eid, author: pName,
              note_text: pick(FUNNY_NOTES),
              visibility: Math.random() < 0.25 ? "leakable" : "public",
            });
            report.totalNotes++;
            const otherPlayer = pick(playerNames.filter(p => p !== pName));
            await supabase.from("event_annotations").insert({
              event_id: eid, author: otherPlayer,
              note_text: pick(COUNTER_NOTES),
              visibility: "public",
            });
            report.totalNotes++;
          }

          // Diplomacy messages
          if (roomIds.length) {
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
          if (npcRoomIds.length && Math.random() < 0.4) {
            await supabase.from("diplomacy_messages").insert({
              room_id: pick(npcRoomIds), sender: pName, sender_type: "player",
              message_text: `${pName} jedná s městským státem o podpoře.`,
              secrecy: "PRIVATE", leak_chance: 0,
            });
            report.diplomacyMessages++;
          }

          // Trade deals (higher density)
          if (Math.random() < 0.6) {
            const other = pick(playerNames.filter(p => p !== pName));
            await supabase.from("trade_log").insert({
              session_id: sessionId, turn_number: year,
              from_player: pName, to_player: other,
              resource_type: pick(["food", "wood", "stone", "iron", "wealth"]),
              amount: Math.floor(Math.random() * 10) + 1,
              trade_type: pick(["Obchod", "Tribut", "Dar", "Embargo"]),
              note: Math.random() < 0.3 ? pick(FUNNY_NOTES) : null,
            });
            report.tradeDeals++;
          }

          // Military capacity
          if ((year - startYear) % 4 === 1) {
            await supabase.from("military_capacity").insert({
              session_id: sessionId, player_name: pName,
              army_name: `${pName}-legie-${year}`,
              army_type: pick(["Lehká", "Těžká", "Jízda", "Obléhací"]),
              iron_cost: Math.floor(Math.random() * 3) + 1,
            });
          }
        }

        // === PER-YEAR GLOBAL ACTIONS ===

        // City upgrades
        if (year >= startYear + 3) {
          const relYear = year - startYear;
          const level = relYear < 7 ? "Městečko" : relYear < 13 ? "Město" : "Polis";
          const upgradeTarget = pick(cities.filter(c => c.level !== "Polis"));
          if (upgradeTarget) {
            await supabase.from("cities").update({ level }).eq("id", upgradeTarget.id);
            upgradeTarget.level = level;
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
        if (year % 2 === 0) {
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

        // Council evaluations (all players every year)
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

        // City-state mood changes
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

        // Advance turn
        await supabase.from("game_sessions").update({ current_turn: year + 1 }).eq("id", sessionId);
      }

      // === POST-SIMULATION: GENERATE GLOBAL CONTENT ===
      log("📜 Generuji světové dějiny a kroniky hráčů...");

      // World history chapters (one per 5 years)
      const chapterSize = 5;
      for (let from = startYear; from <= endYear; from += chapterSize) {
        const to = Math.min(from + chapterSize - 1, endYear);
        await supabase.from("world_history_chapters").insert({
          session_id: sessionId, from_turn: from, to_turn: to,
          chapter_title: `Kapitola: Roky ${from}-${to}`,
          chapter_text: `V letech ${from} až ${to} se svět proměnil. Civilizace ${pick(playerNames)} vedla expanzi, zatímco ${pick(playerNames)} budoval obranu. Konflikty a obchod formovaly dějiny.`,
          epoch_style: "kroniky",
        });
        report.worldRetells++;
      }

      // Player chronicles
      for (const p of playerNames) {
        await supabase.from("player_chronicle_chapters").insert({
          session_id: sessionId, player_name: p, from_turn: startYear, to_turn: endYear,
          chapter_title: `Kronika ${p}: Roky ${startYear}-${endYear}`,
          chapter_text: `Říše ${p} prošla za ${yearsToRun} let bouřlivým vývojem. Od skromných osad po mocné město, od prvních šarvátek po velké bitvy.`,
          epoch_style: "kroniky",
        });
        report.playerChronicles++;
      }

      // World crises (1 per ~7 years)
      const crisisYears: number[] = [];
      for (let y = startYear + 4; y <= endYear; y += Math.floor(Math.random() * 4) + 5) {
        crisisYears.push(y);
      }
      for (const yr of crisisYears) {
        await supabase.from("world_crises").insert({
          session_id: sessionId, trigger_round: yr,
          title: pick(["Mor v říši", "Invaze barbarů", "Velká sucha", "Zemětřesení", "Mořská bouře", "Konfederace městských států", "Kolaps obchodu"]),
          description: `V roce ${yr} zasáhla krize celý kontinent.`,
          crisis_type: pick(["sea_peoples", "plague", "famine", "earthquake", "trade_collapse"]),
          affected_cities: pickN(cities, 3).map(c => c.name),
        });
      }

      // Secret objectives
      if (!isAppend) {
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

      // Great persons (add more during append)
      for (let i = 0; i < Math.min(playerNames.length, 3); i++) {
        const p = pick(playerNames);
        const pCities = cityByOwner[p] || [];
        await supabase.from("great_persons").insert({
          session_id: sessionId, name: `${p}-hrdina-${startYear + Math.floor(Math.random() * yearsToRun)}`,
          player_name: p, person_type: pick(PERSON_TYPES),
          city_id: pCities[0]?.id || null, born_round: startYear + Math.floor(Math.random() * yearsToRun), is_alive: true,
          bio: `Legendární ${pick(PERSON_TYPES).toLowerCase()} sloužící říši ${p}.`,
        });
        report.greatPersons++;
      }

      setCoverageReport(report);
      log(`✅ SIMULACE DOKONČENA: ${report.totalEvents} událostí, ${report.totalNotes} poznámek, roky ${startYear}-${endYear}`);
      toast.success(`🚀 Simulace hotova: ${report.totalEvents} událostí (rok ${startYear}-${endYear})!`);
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

  const runExtremeSimulation = () => runSimulation(20, false);
  const runAppendSimulation = () => runSimulation(appendYears, true);

  // ========================
  // FOCUSED SIMULATION: 6 PLAYERS, YEAR 4→10
  // ========================
  const FOCUSED_PLAYERS = [
    { name: "Arvath", color: "#B58A3A", identity: "Zlatý císař pouštních říší" },
    { name: "Sélene", color: "#2F5D50", identity: "Královna severních lesů" },
    { name: "Kordak", color: "#8B2C2C", identity: "Válečník z rudých hor" },
    { name: "Ilmara", color: "#4A6FA5", identity: "Obchodní kněžna přímořských měst" },
    { name: "Zhoran", color: "#6B4E8B", identity: "Mystický vládce východních stepí" },
    { name: "Fenrik", color: "#5A6B3A", identity: "Diplomatický stratég říčních dolin" },
  ];

  const FOCUSED_CITY_TEMPLATES = [
    { name: "Solhaven", desc: "Přístav zalitý sluncem, kde se obchoduje s exotickým kořením.", level: "Osada" },
    { name: "Ironhold", desc: "Pevnost z černého kamene střežící horský průsmyk.", level: "Pevnost" },
    { name: "Willowmere", desc: "Město u jezera obklopené starými vrbami.", level: "Město" },
    { name: "Dustreach", desc: "Osada na okraji pouště, kde vítr nikdy neustává.", level: "Osada" },
    { name: "Thornwall", desc: "Opevněné městečko chráněné trnitým valem.", level: "Osada" },
    { name: "Starfall", desc: "Město postavené v kráteru pradávného meteoritu.", level: "Město" },
    { name: "Greyport", desc: "Rybářská vesnice s majákem na skalnatém útesu.", level: "Osada" },
    { name: "Embervale", desc: "Údolí sopečných pramenů s kovářskými dílnami.", level: "Osada" },
    { name: "Crystalspire", desc: "Věž z křišťálu tyčící se nad mlžnými pláněmi.", level: "Město" },
    { name: "Ravenwatch", desc: "Strážní věž na hranici divočiny.", level: "Pevnost" },
  ];

  const FOCUSED_WONDER_TEMPLATES = [
    { name: "Sloup nebes", desc: "Obelisk z bílého mramoru, jenž prý sahá až k hvězdám.", imagePrompt: "A towering white marble obelisk reaching into the clouds, fantasy art, epic scale, golden hour lighting" },
    { name: "Stříbrný most", desc: "Most překlenující bezednou propast, pokrytý stříbrnými runami.", imagePrompt: "A magnificent silver bridge spanning a vast chasm, covered in glowing runes, fantasy landscape, aerial view" },
    { name: "Zahrada věčnosti", desc: "Zahrady kde kvetou rostliny z celého světa po celý rok.", imagePrompt: "An eternal garden with exotic flowers from all seasons blooming simultaneously, fantasy botanical garden, lush, magical atmosphere" },
  ];

  const FOCUSED_RUMOR_TEMPLATES = [
    "Říká se, že v {city} se ve sklepích schovávají uprchlí otroci z {otherCity}.",
    "Šeptá se, že {player} tajně buduje armádu za hranicemi.",
    "V ulicích kolují zvěsti o pokladu ukrytém pod {city}.",
    "Obchodníci tvrdí, že {player} uzavřel tajnou dohodu s barbary.",
    "Lidé šeptají, že v {city} byl spatřen duch starého krále.",
    "Zvěsti praví, že {player} plánuje velkou výpravu za hranice známého světa.",
    "V hostincích se mluví o tom, že {city} brzy padne kvůli moru.",
    "Pocestní hlásí podivná světla nad {city} v noci.",
    "Kupci šíří zprávu, že zásoby železa v {city} docházejí.",
    "Proslýchá se, že {player} nabídl {otherPlayer} obrovský tribut za mír.",
    "Šuškanda říká, že nový div světa v {city} je ve skutečnosti prokletý.",
    "Námořníci vyprávějí o neznámém kontinentu za západním mořem.",
    "Zvědy z {city} tvrdí, že {player} verbuje žoldnéře v tajnosti.",
    "Bardové zpívají o pádu {otherCity}, ale nikdo neví, zda je to pravda.",
    "V tržnicích se šeptá, že {player} a {otherPlayer} plánují společný útok.",
  ];

  const FOCUSED_EVENT_NARRATIVES: Record<string, string[]> = {
    expedition: [
      "Výprava se vydala za úsvitu. Průzkumníci prošli nezmapované hvozdy a objevili úrodné údolí za horami.",
      "Průzkumná skupina hlásí nález starověkých ruin v hlubokém lese. Zdá se, že zde kdysi stálo velké město.",
    ],
    alliance: [
      "Smlouva byla podepsána za svitu pochodní. Oba vládci si podali ruce a přísahali věrnost.",
      "Diplomaté obou říší se setkali na neutrální půdě. Dohoda slibuje vzájemnou obranu a volný obchod.",
    ],
    war: [
      "Bitva zuřila od rána do soumraku. Pole zbarvila krev padlých a kouř z hořících stanů zastínil slunce.",
      "Obléhání trvalo tři měsíce. Obránci se nevzdali, ale hlad si nakonec vybral svou daň.",
    ],
    discovery: [
      "V hlubinách dolu byl objeven žilný systém drahých kamenů. Zpráva se rozšířila jako stepní požár.",
      "Učenci rozluštili starověký nápis na kamenné desce. Odhaluje polohu zapomenutého chrámu.",
    ],
    political: [
      "Rada starších se usnesla na nových zákonech. Lid přijal změny s nadějí na lepší časy.",
      "Převrat proběhl tiše v noci. Ráno se město probudilo pod novým vedením.",
    ],
    trade: [
      "Karavana dorazila s exotickým zbožím z dalekých zemí. Tržnice praskaly ve švech.",
      "Nová obchodní stezka přinesla prosperitu celému regionu. Ceny zboží klesly o třetinu.",
    ],
    founding: [
      "Na břehu řeky byly položeny první kameny nového města. Zakladatel prohlásil: 'Zde bude stát věčné město.'",
      "Osadníci vytyčili hranice nového sídla. Země je úrodná a voda čistá — dobré znamení.",
    ],
    wonder: [
      "Stavba divu světa byla zahájena za účasti tisíců dělníků. Architekt slibuje, že stavba bude hotova do pěti let.",
      "Div světa byl dokončen! Lid jásá a poutníci přicházejí z daleka, aby spatřili tuto nádheru.",
    ],
  };

  const FOCUSED_COMMENTS = [
    "To je propaganda! Tak to nebylo!",
    "Slyšel jsem jiné vyprávění od svědků.",
    "Impozantní čin, uznávám.",
    "Varoval jsem před tímto vývojem.",
    "Naši zvědové potvrzují tuto zprávu.",
    "Pochybuji o pravdivosti tohoto zápisu.",
    "To je znamení velké změny!",
    "Kéž by kronikář psal pravdu.",
    "Ať je to varování pro všechny.",
    "Budiž zaznamenáno pro budoucí pokolení.",
  ];

  const runFocusedSimulation = async () => {
    setFocusedSimulating(true);
    setFocusedProgress("Příprava...");
    log("🎯 ═══ FOCUSED SIMULATION: 6 hráčů, Rok 4→10 ═══");

    try {
      // ---- STEP 1: CLEAN PREVIOUS SIM DATA ----
      setFocusedProgress("Čistím předchozí data...");
      log("🧹 Mažu existující sim data...");

      const tables = [
        "game_events", "event_annotations", "chronicle_entries", "city_rumors",
        "world_feed_items", "world_events", "wonders", "wonder_draft_images",
        "great_persons", "cities", "provinces", "regions", "world_memories",
        "intelligence_reports", "council_evaluations", "diplomacy_messages",
        "diplomacy_rooms", "trade_log", "military_capacity", "declarations",
        "world_crises", "world_history_chapters", "player_chronicle_chapters",
        "secret_objectives", "entity_traits", "event_entity_links",
        "event_narratives", "event_responses", "wiki_entries", "encyclopedia_images",
        "entity_contributions", "expeditions", "world_action_log",
        "player_resources", "game_players", "civilizations", "city_states",
        "turn_summaries", "import_sources",
      ] as const;

      for (const t of tables) {
        await (supabase.from(t) as any).delete().eq("session_id", sessionId);
      }
      // diplomacy_messages don't have session_id directly, clean via rooms
      log("✅ Předchozí data smazána");

      // ---- STEP 2: CREATE 6 PLAYERS ----
      setFocusedProgress("Vytvářím hráče...");
      for (let i = 0; i < 6; i++) {
        const p = FOCUSED_PLAYERS[i];
        await supabase.from("game_players").insert({
          session_id: sessionId, player_name: p.name, player_number: i + 1,
        });
        for (const rt of ["food", "wood", "stone", "iron", "wealth"]) {
          await supabase.from("player_resources").insert({
            session_id: sessionId, player_name: p.name, resource_type: rt,
            income: 2 + Math.floor(Math.random() * 4),
            upkeep: Math.floor(Math.random() * 3),
            stockpile: 5 + Math.floor(Math.random() * 10),
          });
        }
        await supabase.from("civilizations").insert({
          session_id: sessionId, player_name: p.name,
          civ_name: `Říše ${p.name}`,
          core_myth: p.identity,
          architectural_style: pick(["Kamenný", "Dřevěný", "Mramorový", "Cihlový"]),
          cultural_quirk: pick(["Uctívají měsíc", "Jedí jen ryby", "Staví pozpátku", "Mluví zpěvem", "Nosí masky", "Tančí před bitvou"]),
        });
        log(`✅ Hráč ${i + 1}: ${p.name} — ${p.identity}`);
      }

      await supabase.from("game_sessions").update({
        player1_name: FOCUSED_PLAYERS[0].name,
        player2_name: FOCUSED_PLAYERS[1].name,
        max_players: 6,
        current_turn: 4,
      }).eq("id", sessionId);

      const playerNames = FOCUSED_PLAYERS.map(p => p.name);

      // ---- STEP 3: CREATE INITIAL CITIES (2 per player, founded before Year 4) ----
      setFocusedProgress("Zakládám města...");
      const allCities: { id: string; name: string; owner: string }[] = [];
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 2; j++) {
          const tpl = FOCUSED_CITY_TEMPLATES[i * 2 + j] || FOCUSED_CITY_TEMPLATES[j];
          const cityName = `${tpl.name}-${FOCUSED_PLAYERS[i].name.slice(0, 3)}`;
          const { data: city } = await supabase.from("cities").insert({
            session_id: sessionId,
            name: cityName,
            owner_player: FOCUSED_PLAYERS[i].name,
            level: tpl.level,
            founded_round: Math.floor(Math.random() * 3) + 1,
            flavor_prompt: tpl.desc,
            status: "ok",
            tags: [],
          }).select().single();
          if (city) {
            allCities.push({ id: city.id, name: cityName, owner: FOCUSED_PLAYERS[i].name });
          }
        }
      }
      log(`✅ ${allCities.length} měst založeno`);

      // Create diplomacy rooms
      const roomIds: string[] = [];
      for (let i = 0; i < playerNames.length; i++) {
        for (let j = i + 1; j < playerNames.length; j++) {
          const { data: room } = await supabase.from("diplomacy_rooms").insert({
            session_id: sessionId, participant_a: playerNames[i], participant_b: playerNames[j], room_type: "player_player",
          }).select().single();
          if (room) roomIds.push(room.id);
        }
      }

      // ---- STEP 4: SIMULATE YEARS 4→10 ----
      const startYear = 4;
      const endYear = 10;
      let totalEvents = 0;
      let totalRumors = 0;
      let totalComments = 0;
      let wondersCreated = 0;
      let citiesFounded = 0;

      const eventTypes: Array<{ type: string; category: string }> = [
        { type: "expedition", category: "exploration" },
        { type: "alliance", category: "diplomacy" },
        { type: "war", category: "military" },
        { type: "discovery", category: "exploration" },
        { type: "political", category: "political" },
        { type: "trade", category: "economic" },
      ];

      for (let year = startYear; year <= endYear; year++) {
        setFocusedProgress(`Rok ${year}/${endYear}...`);
        log(`📅 ═══ ROK ${year} ═══`);

        const yearEventIds: string[] = [];

        // ~8-12 events per year distributed across players
        const numEvents = 8 + Math.floor(Math.random() * 5);
        for (let e = 0; e < numEvents; e++) {
          const player = pick(playerNames);
          const playerCities = allCities.filter(c => c.owner === player);
          const otherPlayers = playerNames.filter(p => p !== player);
          const otherCities = allCities.filter(c => c.owner !== player);
          const city = playerCities.length ? pick(playerCities) : pick(allCities);
          const evtType = pick(eventTypes);

          const narratives = FOCUSED_EVENT_NARRATIVES[evtType.type] || FOCUSED_EVENT_NARRATIVES.discovery;
          const narrative = pick(narratives!);

          const eventData: any = {
            session_id: sessionId,
            event_type: evtType.type === "war" ? "battle" : evtType.type === "alliance" ? "diplomacy" : evtType.type === "political" ? "diplomacy" : evtType.type,
            player,
            turn_number: year,
            city_id: city.id,
            location: city.name,
            note: narrative,
            confirmed: true,
            truth_state: "canon",
            importance: Math.random() < 0.2 ? "legendary" : "normal",
          };

          if (evtType.type === "war" && otherCities.length) {
            const target = pick(otherCities);
            eventData.attacker_city_id = city.id;
            eventData.defender_city_id = target.id;
            eventData.result = pick(["vítězství", "porážka", "nerozhodně", "taktický ústup"]);
            eventData.casualties = `${Math.floor(Math.random() * 500 + 50)} padlých`;
            eventData.armies_involved = [`${player}-legie-${year}`];
          }

          if (evtType.type === "alliance") {
            eventData.treaty_type = pick(["mír", "obchod", "obranný pakt", "neútočení"]);
            eventData.terms_summary = pick(["Vzájemná obrana po 5 let", "Volný obchod a výměna znalostí", "Sdílení zpravodajství"]);
          }

          const { data: inserted } = await supabase.from("game_events").insert(eventData).select().single();
          if (inserted) {
            yearEventIds.push(inserted.id);
            totalEvents++;

            // Create world_event for each
            const slug = `${evtType.type}-${year}-${e}`;
            await supabase.from("world_events").insert({
              session_id: sessionId,
              title: `${evtType.type === "war" ? "Bitva" : evtType.type === "alliance" ? "Spojenectví" : evtType.type === "trade" ? "Obchod" : evtType.type === "expedition" ? "Výprava" : evtType.type === "discovery" ? "Objev" : "Událost"} — Rok ${year}`,
              slug,
              description: narrative,
              event_category: evtType.category,
              status: "published",
              created_turn: year,
              created_by_type: "system",
              affected_players: [player],
              participants: [{ type: "player", name: player }],
            });

            // World feed item
            await supabase.from("world_feed_items").insert({
              session_id: sessionId,
              turn_number: year,
              content: `${player}: ${narrative.slice(0, 120)}`,
              feed_type: Math.random() < 0.3 ? "gossip" : "news",
              importance: eventData.importance === "legendary" ? "high" : "normal",
              linked_event_id: null,
            });
          }
        }

        // ---- COMMENTS on ~30% of events ----
        for (const eid of yearEventIds) {
          if (Math.random() < 0.3) {
            const commentsCount = Math.random() < 0.5 ? 1 : 2;
            for (let c = 0; c < commentsCount; c++) {
              const commenter = pick(playerNames);
              await supabase.from("event_annotations").insert({
                event_id: eid, author: commenter,
                note_text: pick(FOCUSED_COMMENTS),
                visibility: Math.random() < 0.2 ? "leakable" : "public",
              });
              totalComments++;
            }
          }
        }

        // ---- CITY FOUNDING (1 new city every 2 years, different players) ----
        if (year % 2 === 0) {
          const founder = playerNames[(year - startYear) / 2 % playerNames.length];
          const newCityTpl = pick(FOCUSED_CITY_TEMPLATES);
          const newCityName = `${newCityTpl.name}-${founder.slice(0, 3)}-Y${year}`;
          const { data: newCity } = await supabase.from("cities").insert({
            session_id: sessionId,
            name: newCityName,
            owner_player: founder,
            level: "Osada",
            founded_round: year,
            flavor_prompt: newCityTpl.desc,
            status: "ok",
            tags: ["nově založeno"],
          }).select().single();

          if (newCity) {
            allCities.push({ id: newCity.id, name: newCityName, owner: founder });
            citiesFounded++;
            log(`🏙️ ${founder} založil ${newCityName}`);

            // Chronicle entry for founding
            await supabase.from("chronicle_entries").insert({
              session_id: sessionId,
              text: `V roce ${year} položil ${founder} základní kameny nového města ${newCityName}. ${newCityTpl.desc}`,
              turn_from: year, turn_to: year,
              epoch_style: "kroniky",
            });

            // Game event for founding
            await supabase.from("game_events").insert({
              session_id: sessionId, event_type: "found_settlement",
              player: founder, turn_number: year, city_id: newCity.id,
              location: newCityName, note: pick(FOCUSED_EVENT_NARRATIVES.founding!),
              confirmed: true, truth_state: "canon",
            });
          }
        }

        // ---- RUMORS (3 per year) ----
        for (let r = 0; r < 3; r++) {
          const rumorCity = pick(allCities);
          const otherCity = pick(allCities.filter(c => c.id !== rumorCity.id));
          const rumorPlayer = pick(playerNames);
          const otherPlayer = pick(playerNames.filter(p => p !== rumorPlayer));
          const tpl = pick(FOCUSED_RUMOR_TEMPLATES);
          const text = tpl
            .replace("{city}", rumorCity.name)
            .replace("{otherCity}", otherCity?.name || "vzdáleného města")
            .replace("{player}", rumorPlayer)
            .replace("{otherPlayer}", otherPlayer);

          await supabase.from("city_rumors").insert({
            session_id: sessionId,
            city_id: rumorCity.id,
            city_name: rumorCity.name,
            text,
            turn_number: year,
            tone_tag: pick(["mysterious", "threatening", "hopeful", "neutral", "dramatic"]),
            is_draft: Math.random() < 0.15,
            entity_refs: [
              { type: "city", id: rumorCity.id, label: rumorCity.name },
              ...(otherCity ? [{ type: "city", id: otherCity.id, label: otherCity.name }] : []),
            ],
          });
          totalRumors++;
        }

        // ---- WONDERS (Year 6, 8, 10) ----
        if ([6, 8, 10].includes(year) && wondersCreated < 3) {
          const wTpl = FOCUSED_WONDER_TEMPLATES[wondersCreated];
          const wonderOwner = playerNames[wondersCreated * 2 % playerNames.length];
          const wonderCity = pick(allCities.filter(c => c.owner === wonderOwner));

          const { data: wonder } = await supabase.from("wonders").insert({
            session_id: sessionId,
            name: wTpl.name,
            owner_player: wonderOwner,
            city_name: wonderCity?.name || "",
            era: year <= 7 ? "Ancient" : "Classical",
            status: "completed",
            description: wTpl.desc,
            image_prompt: wTpl.imagePrompt,
            memory_fact: `${wTpl.name} stojí v ${wonderCity?.name || "neznámém městě"} jako symbol moci ${wonderOwner}.`,
          }).select().single();

          if (wonder) {
            wondersCreated++;
            log(`🏛️ Div světa: ${wTpl.name} (${wonderOwner})`);

            // Chronicle for wonder
            await supabase.from("chronicle_entries").insert({
              session_id: sessionId,
              text: `Rok ${year}: ${wTpl.name} byl dokončen v ${wonderCity?.name}. ${wTpl.desc} Stavba je považována za jeden z divů světa.`,
              turn_from: year, turn_to: year,
              epoch_style: "kroniky",
            });

            // World event for wonder
            await supabase.from("world_events").insert({
              session_id: sessionId,
              title: `Dokončení ${wTpl.name}`,
              slug: `wonder-${wTpl.name.toLowerCase().replace(/\s+/g, "-")}-y${year}`,
              description: `${wonderOwner} dokončil stavbu ${wTpl.name} v ${wonderCity?.name}. ${wTpl.desc}`,
              event_category: "cultural",
              status: "published",
              created_turn: year,
              created_by_type: "system",
              affected_players: [wonderOwner],
              participants: [{ type: "player", name: wonderOwner }, { type: "city", name: wonderCity?.name || "" }],
            });
          }
        }

        // ---- CHRONICLE ENTRY per year ----
        const p1 = pick(playerNames);
        const p2 = pick(playerNames.filter(p => p !== p1));
        await supabase.from("chronicle_entries").insert({
          session_id: sessionId,
          text: pick(CHRONICLE_TEMPLATES).replace("{r}", String(year)).replace("{p1}", p1).replace("{p2}", p2),
          turn_from: year, turn_to: year,
          epoch_style: pick(["kroniky", "mýty", "moderní"]),
        });

        // ---- INTELLIGENCE REPORTS (1 per year) ----
        const spy = pick(playerNames);
        const target = pick(playerNames.filter(p => p !== spy));
        await supabase.from("intelligence_reports").insert({
          session_id: sessionId, visible_to: spy, target_entity: target,
          report_text: `Špioni ${spy} hlásí aktivitu ${target} v roce ${year}: ${pick(["budování armády", "tajné jednání", "stavba opevnění", "verbování žoldnéřů"])}.`,
          source_type: pick(["merchant_gossip", "spy_network", "scout_report"]),
          created_round: year, secrecy_level: pick(["uncertain", "reliable", "confirmed"]),
        });

        // ---- DIPLOMACY MESSAGE (1 per year) ----
        if (roomIds.length) {
          await supabase.from("diplomacy_messages").insert({
            room_id: pick(roomIds), sender: pick(playerNames), sender_type: "player",
            message_text: `Rok ${year}: ${pick(["Nabízím mír.", "Potřebujeme obchodní dohodu.", "Varuju vás před útokem ze severu.", "Navrhujeme spojenectví."])}`,
            secrecy: pick(["PUBLIC", "PRIVATE"]),
          });
        }

        // ---- TRADE (1-2 per year) ----
        const tradeCount = 1 + Math.floor(Math.random() * 2);
        for (let t = 0; t < tradeCount; t++) {
          const from = pick(playerNames);
          const to = pick(playerNames.filter(p => p !== from));
          await supabase.from("trade_log").insert({
            session_id: sessionId, turn_number: year,
            from_player: from, to_player: to,
            resource_type: pick(["food", "wood", "stone", "iron", "wealth"]),
            amount: Math.floor(Math.random() * 8) + 1,
            trade_type: pick(["Obchod", "Tribut", "Dar"]),
          });
        }

        // ---- WORLD MEMORIES (2 per year) ----
        for (let m = 0; m < 2; m++) {
          const memCity = pick(allCities);
          await supabase.from("world_memories").insert({
            session_id: sessionId,
            text: pick(MEMORY_TEMPLATES).replace("{city}", memCity.name).replace("{fact}", pick(MEMORY_FACTS)),
            approved: Math.random() < 0.7,
            category: pick(["tradition", "historical_scar", "legend", "mystery"]),
            created_round: year, city_id: memCity.id,
          });
        }

        // Advance turn
        await supabase.from("game_sessions").update({ current_turn: year + 1 }).eq("id", sessionId);
      }

      // ---- STEP 5: FINAL SUMMARY ----
      await supabase.from("chronicle_entries").insert({
        session_id: sessionId,
        text: "Rok 10 — První věk Kroniky je dovršen. Šest říší formovalo svůj osud skrze války, diplomacii a zázraky. Kronikář pokládá pero, ale příběh nekončí.",
        turn_from: 10, turn_to: 10,
        epoch_style: "kroniky",
      });

      // World history chapter
      await supabase.from("world_history_chapters").insert({
        session_id: sessionId, from_turn: 4, to_turn: 10,
        chapter_title: "Kapitola I: Počátky šesti říší",
        chapter_text: `V letech 4 až 10 se z šesti osad staly mocné říše. ${FOCUSED_PLAYERS.map(p => p.name).join(", ")} — každý šel svou cestou, ale jejich osudy se neustále propletávaly. Války, spojenectví a divy světa formovaly první epochu známého světa.`,
        epoch_style: "kroniky",
      });

      // Great persons
      for (let i = 0; i < 3; i++) {
        const p = FOCUSED_PLAYERS[i * 2];
        const pCity = allCities.find(c => c.owner === p.name);
        await supabase.from("great_persons").insert({
          session_id: sessionId,
          name: `${p.name}-hrdina`,
          player_name: p.name,
          person_type: pick(PERSON_TYPES),
          city_id: pCity?.id || null,
          born_round: 4 + Math.floor(Math.random() * 4),
          is_alive: true,
          bio: `Legendární osobnost sloužící říši ${p.name}. ${p.identity}`,
          image_prompt: `Fantasy portrait of a ${pick(["general", "scholar", "diplomat", "priest"])} from a ${pick(["desert", "forest", "mountain", "coastal"])} civilization, detailed, epic lighting`,
        });
      }

      log(`✅ ═══ SIMULACE DOKONČENA ═══`);
      log(`📊 Události: ${totalEvents} | Zvěsti: ${totalRumors} | Komentáře: ${totalComments} | Divy: ${wondersCreated} | Nová města: ${citiesFounded}`);
      toast.success(`🎯 Simulace hotova! ${totalEvents} událostí, roky 4→10, 6 hráčů`);
      onRefetch?.();
    } catch (e: any) {
      log("❌ Focused sim error: " + (e?.message || "unknown"));
      toast.error("Simulace selhala: " + (e?.message || "unknown"));
    }

    setFocusedSimulating(false);
    setFocusedProgress("");
  };

  // ========================
  // GENERATE AI CITY PROFILES + ILLUSTRATIONS FOR ALL CITIES
  // ========================
  const generateAllCityProfiles = async () => {
    setGeneratingProfiles(true);
    log("🎨 Generuji AI profily a ilustrace pro VŠECHNA města...");
    let successCount = 0;
    let failCount = 0;

    try {
      const { data: cities } = await supabase.from("cities").select("*").eq("session_id", sessionId);
      const { data: allEvents } = await supabase.from("game_events").select("*").eq("session_id", sessionId).eq("confirmed", true);
      const { data: allMemories } = await supabase.from("world_memories").select("*").eq("session_id", sessionId).eq("approved", true);

      if (!cities?.length) {
        toast.error("Žádná města k generování");
        setGeneratingProfiles(false);
        return;
      }

      for (let i = 0; i < cities.length; i++) {
        const city = cities[i];
        setProfileProgress(`${i + 1}/${cities.length}: ${city.name}`);
        log(`🏙️ [${i + 1}/${cities.length}] Generuji profil pro ${city.name} (vlastník: ${city.owner_player})...`);

        // 1) Generate AI city profile (intro + history)
        try {
          const cityEvents = (allEvents || []).filter(e => e.city_id === city.id);
          const cityMems = (allMemories || []).filter(m => m.city_id === city.id).map(m => ({ text: m.text, category: m.category }));
          const provMems = city.province_id
            ? (allMemories || []).filter(m => m.province_id === city.province_id).map(m => ({ text: m.text, category: m.category }))
            : [];
          const approvedFacts = (allMemories || []).filter(m => !m.city_id).map(m => m.text);

          const { data: profileData, error: profileErr } = await supabase.functions.invoke("cityprofile", {
            body: {
              city: {
                name: city.name,
                ownerName: city.owner_player,
                level: city.level,
                province: city.province || "",
                tags: city.tags || [],
                foundedRound: city.founded_round || 1,
                status: city.status || "ok",
                ownerFlavorPrompt: city.flavor_prompt || null,
              },
              confirmedCityEvents: cityEvents,
              approvedWorldFacts: approvedFacts.slice(0, 20),
              cityMemories: cityMems,
              provinceMemories: provMems,
            },
          });

          if (profileErr) throw profileErr;
          log(`  ✅ Profil ${city.name}: intro ${(profileData?.introduction || "").length} znaků, sága ${(profileData?.historyRetelling || "").length} znaků`);
        } catch (e: any) {
          log(`  ⚠️ Profil ${city.name} selhal: ${e?.message || "unknown"}`);
        }

        // 2) Generate wiki entry with AI illustration
        try {
          const { data: wikiData, error: wikiErr } = await supabase.functions.invoke("wiki-generate", {
            body: {
              entityType: "city",
              entityName: city.name,
              entityId: city.id,
              sessionId: sessionId,
              ownerPlayer: city.owner_player,
              context: {
                level: city.level,
                province: city.province,
                status: city.status,
                tags: city.tags,
                foundedRound: city.founded_round,
              },
            },
          });

          if (wikiErr) throw wikiErr;

          const hasImage = !!wikiData?.imageUrl;
          log(`  ✅ Wiki ${city.name}: ${hasImage ? "🖼️ ilustrace OK" : "⚠️ bez ilustrace"}, popis ${(wikiData?.aiDescription || "").length} znaků`);
          if (hasImage) successCount++;
          else failCount++;
        } catch (e: any) {
          log(`  ⚠️ Wiki/ilustrace ${city.name} selhala: ${e?.message || "unknown"}`);
          failCount++;
        }

        // Small delay to avoid rate limiting
        if (i < cities.length - 1) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      toast.success(`🎨 Profily hotovy: ${successCount} s ilustrací, ${failCount} bez`);
      log(`🏁 Generování dokončeno: ${successCount} ilustrací OK, ${failCount} selhalo`);
      onRefetch?.();
    } catch (e: any) {
      log("❌ " + (e?.message || "unknown"));
      toast.error("Generování profilů selhalo");
    }
    setGeneratingProfiles(false);
    setProfileProgress("");
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
      check("600+ událostí", (events?.length || 0) >= 600, `${events?.length}`);
      check("5+ městských států", (cs?.length || 0) >= 4, `${cs?.length}`);
      check("12+ divů", (wonders?.length || 0) >= 10, `${wonders?.length}`);
      check("6+ osobností", (gp?.length || 0) >= 6, `${gp?.length}`);
      check("20+ kronik (per year)", (chronicles?.length || 0) >= 20, `${chronicles?.length}`);
      check("40+ pamětí světa", (mems?.length || 0) >= 40, `${mems?.length}`);
      check("20+ zpravodajských zpráv", (intel?.length || 0) >= 20, `${intel?.length}`);
      check("Diplomatické zprávy (20+)", (dipMsgs?.length || 0) >= 20, `${dipMsgs?.length}`);
      check("Obchodní záznamy (20+)", (trades?.length || 0) >= 20, `${trades?.length}`);
      check("Rada ministrů (council 60+)", (councils?.length || 0) >= 60, `${councils?.length}`);
      check("Kapitoly dějin (4+)", (whChapters?.length || 0) >= 4, `${whChapters?.length}`);
      check("Kroniky hráčů (6+)", (pcChapters?.length || 0) >= 6, `${pcChapters?.length}`);
      check("Světové krize (3+)", (crises?.length || 0) >= 3, `${crises?.length}`);
      check("Deklarace (10+)", (decls?.length || 0) >= 10, `${decls?.length}`);

      // Event type coverage
      const eventTypes = new Set(events?.map(e => e.event_type) || []);
      const needed = ["battle", "raid", "diplomacy", "trade", "found_settlement", "upgrade_city", "wonder", "city_state_action", "repair"];
      const covered = needed.filter(t => eventTypes.has(t));
      check("Pokrytí typů událostí (9)", covered.length >= 7, `${covered.length}/9: ${covered.join(", ")}`);

      // Battles with structured data
      const battles = events?.filter(e => e.event_type === "battle" && e.attacker_city_id) || [];
      check("Bitvy se strukturou (20+)", battles.length >= 20, `${battles.length}`);

      // No redirect
      check("Žádný redirect na landing", window.location.pathname.includes("/game/"), window.location.pathname);

      // Permissions check
      check("localStorage gameId", !!localStorage.getItem("ch_lastGameId"), localStorage.getItem("ch_lastGameId")?.slice(0, 8) || "chybí");

      // Notes
      if (events?.length) {
        const eids = events.slice(0, 200).map(e => e.id);
        const { data: anns } = await supabase.from("event_annotations").select("*", { count: "exact" }).in("event_id", eids);
        check("Poznámky k událostem (50+)", (anns?.length || 0) >= 50, `${anns?.length}`);
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

      {/* Smart AI Generation */}
      <SmartAIGenerationPanel sessionId={sessionId} onRefetch={onRefetch} />

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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Focused Simulation - Primary */}
        <Button onClick={runFocusedSimulation} disabled={focusedSimulating || simulating || seeding}
          className="h-14 font-display col-span-1 md:col-span-2 bg-primary text-primary-foreground hover:bg-primary/90 text-base">
          {focusedSimulating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-5 w-5 mr-2" />}
          {focusedSimulating ? `Simuluji... ${focusedProgress}` : "🎯 Run World Simulation (6 players, Year 4→10)"}
        </Button>

        <Button onClick={seedExtremeWorld} disabled={seeding} className="h-14 font-display" variant="outline">
          {seeding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
          {seeding ? "Seeduji..." : "🌱 Seed 6-Player World"}
        </Button>
        <Button onClick={runExtremeSimulation} disabled={simulating} className="h-14 font-display" variant="outline">
          {simulating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
          {simulating ? `Simuluji... ${simProgress}` : "🚀 Simulovat 20 let (nová)"}
        </Button>
        <div className="flex gap-2 col-span-1 md:col-span-2">
          <Input
            type="number" min={1} max={50} value={appendYears}
            onChange={(e) => setAppendYears(Math.max(1, Math.min(50, parseInt(e.target.value) || 10)))}
            className="w-24 h-14 text-center font-display text-lg"
          />
          <Button onClick={runAppendSimulation} disabled={simulating} className="flex-1 h-14 font-display" variant="outline">
            {simulating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            {simulating ? `Simuluji... ${simProgress}` : `➕ Append ${appendYears} let`}
          </Button>
        </div>
        <Button onClick={generateAllCityProfiles} disabled={generatingProfiles} className="h-14 font-display" variant="outline">
          {generatingProfiles ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          {generatingProfiles ? `Generuji... ${profileProgress}` : "🎨 AI Profily + Ilustrace měst"}
        </Button>
        <Button onClick={runQATest} disabled={running} className="h-14 font-display" variant="outline">
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

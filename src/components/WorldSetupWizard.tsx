import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Globe, Sparkles, Swords, Users, X, Plus, Mountain, TreePine, Waves, Sun, Snowflake, Flame, Bot, Pen, UserPlus, Loader2, Server, RotateCcw, Clock, Check, AlertCircle, Shield, Handshake, Store, Eye, Expand, Map as MapIcon, Settings } from "lucide-react";
import { toast } from "sonner";
import WorldCreationOverlay from "./WorldCreationOverlay";
import CivIdentityPreview from "./CivIdentityPreview";

const GAME_MODE_CATEGORIES = [
  {
    category: "Turn-Based",
    description: "Tahové hry — svět se posune, když odehrajete kolo.",
    icon: RotateCcw,
    modes: [
      { value: "tb_single_ai", label: "🤖 AI Svět", desc: "AI vygeneruje svět, frakce, historii a reaguje na vaše rozhodnutí.", icon: Bot, badge: "Solo" },
      { value: "tb_single_manual", label: "✍️ Ruční svět", desc: "Vytvořte svět ručně — ideální pro DnD, RPG, storytelling.", icon: Pen, badge: "Solo" },
      { value: "tb_multi", label: "👥 Multiplayer", desc: "Turn-based hra pro 2–10 hráčů. AI slouží jako kronikář.", icon: UserPlus, badge: "2–10 hráčů" },
    ],
  },
  {
    category: "Time-Based",
    description: "Persistentní svět v reálném čase — svět žije i bez vás.",
    icon: Clock,
    modes: [
      { value: "time_persistent", label: "🌐 Persistentní server", desc: "Reálný čas. Akce mají trvání, armády cestují, svět se vyvíjí sám.", icon: Server, badge: "Real-time" },
    ],
  },
];

const ALL_MODES = GAME_MODE_CATEGORIES.flatMap(c => c.modes);

// ═══ DnD/RPG WORLD TEMPLATES ═══
const WORLD_TEMPLATES = [
  {
    id: "blank",
    label: "🗺️ Prázdný svět",
    desc: "Začněte s čistým listem — vše nastavíte ručně.",
    worldName: "",
    premise: "",
    tone: "mythic",
    victoryStyle: "story",
    biome: "plains",
    homelandName: "",
    factions: [""],
  },
  {
    id: "classic_fantasy",
    label: "⚔️ Klasické Fantasy",
    desc: "Středověký svět s elfími lesy, trpasličími horami a lidskými královstvími.",
    worldName: "Středosvět",
    premise: "Dávná spojenectví se hroutí, nová království povstávají z prachu starých říší. Elfové se stahují do lesů, trpaslíci brání horské průsmyky a lidská královská se přetahují o úrodné nížiny. Stará magie slábne, ale nová proroctví se šíří od chrámu k chrámu.",
    tone: "mythic",
    victoryStyle: "story",
    biome: "forest",
    homelandName: "Královské hvozdy",
    factions: ["Elfí spojenectví", "Trpasličí klan", "Jižní království"],
  },
  {
    id: "dark_ages",
    label: "🏰 Temný středověk",
    desc: "Realistický politický thriller — feudální intriky, mor, křížové výpravy.",
    worldName: "Starý kontinent",
    premise: "Rok 1247. Papežský stolec je prázdný, císař je slabý a provinční vévodové se chystají rozdělit říši. Mor decimuje vesnice, obchodní gildy získávají politickou moc a na východě se formuje nová hrozba. Kdo ovládne trůn?",
    tone: "realistic",
    victoryStyle: "domination",
    biome: "plains",
    homelandName: "Vévodství západní marky",
    factions: ["Korunní vévodství", "Církevní stát", "Obchodní liga"],
  },
  {
    id: "horror_gothic",
    label: "🌑 Gotický horor",
    desc: "Temné síly, prokletá území, přežití v nepřátelském světě.",
    worldName: "Stínosvět",
    premise: "Mlhy pohltily staré cesty a stíny oživly. Prokletí se šíří z opuštěných hradů, vlkodlaci řádí v lesích a upíří rody ovládají noční města. Přeživší se opevňují v posledních bezpečných osadách a hledají způsob, jak zlomit pradávnou kletbu.",
    tone: "dark_fantasy",
    victoryStyle: "survival",
    biome: "forest",
    homelandName: "Poslední útočiště",
    factions: ["Lovci nestvůr", "Upíří dvůr", "Církev světla"],
  },
  {
    id: "sci_fi_colony",
    label: "🚀 Sci-Fi kolonie",
    desc: "Kolonizace nové planety — frakce, zdroje, technologie, mimozemský terén.",
    worldName: "Nova Terra",
    premise: "Koloniální loď Aurora přistála na planetě designované jako NT-7. Tři tisíce kolonistů se rozptýlilo do osad dle svých ideologií. Planeta ukrývá mimozemské ruiny, nestabilní biosféru a zdroje, o které se rozpoutá boj. Komunikace se Zemí trvá 4 roky.",
    tone: "sci_fi",
    victoryStyle: "survival",
    biome: "desert",
    homelandName: "Přistávací zóna Alpha",
    factions: ["Korporátní sektor", "Techno-utopisté", "Separatisté"],
  },
  {
    id: "dnd_campaign",
    label: "🐉 DnD kampaň",
    desc: "Optimalizováno pro herní skupiny — dungeon master + hráči, quest-based.",
    worldName: "Země draků",
    premise: "Dračí proroctvá se naplňují — starý drak Vorthax se probudil pod Šedými horami. Gildy dobrodruhů se sjíždějí do královského města, aby přijaly královskou výzvu. Osud světa závisí na hrdinech, kteří se odváží vstoupit do temných jeskyní. Kdo získá Korunu draků?",
    tone: "mythic",
    victoryStyle: "story",
    biome: "mountains",
    homelandName: "Dragonspire valley",
    factions: ["Gilda dobrodruhů", "Královská stráž", "Temný kult"],
  },
  {
    id: "ancient_empires",
    label: "🏛️ Starověké říše",
    desc: "Řím, Řecko, Egypt, Persie — klasické civilizační drama.",
    worldName: "Středomoří",
    premise: "Velké civilizace se střetávají na březích Vnitřního moře. Faraonové budují pyramidy, řečtí filozofové debatují o demokracii a římští legionáři pochodují na sever. Obchodní cesty propojují kontinent, ale ambice vládců hrozí vším otřást.",
    tone: "realistic",
    victoryStyle: "domination",
    biome: "coast",
    homelandName: "Pobřežní polis",
    factions: ["Nilská říše", "Městské státy", "Severní legie"],
  },
];

const WORLD_SIZES = [
  { value: "small", label: "Malý", desc: "5 měst, 2 regiony · 21×21 hexů", cities: 5, regions: 2, mapW: 21, mapH: 21 },
  { value: "medium", label: "Střední", desc: "12 měst, 4 regiony · 35×35 hexů", cities: 12, regions: 4, mapW: 35, mapH: 35 },
  { value: "large", label: "Velký", desc: "20 měst, 6 regionů · 51×51 hexů", cities: 20, regions: 6, mapW: 51, mapH: 51 },
];

const TONES = [
  { value: "mythic", label: "🏛️ Mýtický", desc: "Bohové, proroctví, epická vyprávění" },
  { value: "realistic", label: "📜 Realistický", desc: "Historicky věrný, pragmatický" },
  { value: "dark_fantasy", label: "🌑 Dark Fantasy", desc: "Temné síly, intriky, magie" },
  { value: "sci_fi", label: "🚀 Sci-Fi", desc: "Technologie, vesmír, futurismus" },
];

const VICTORY_STYLES = [
  { value: "domination", label: "⚔️ Dominace", desc: "Vojenská nadvláda" },
  { value: "survival", label: "🛡️ Přežití", desc: "Přežijte krize a katastrofy" },
  { value: "cultural", label: "🏛️ Kultura", desc: "Dosáhni 100 kulturní prestiže" },
  { value: "story", label: "📖 Příběh", desc: "Nejlepší příběh vyhrává" },
];

const BIOMES = [
  { value: "plains", label: "🌾 Pláně", desc: "Úrodné roviny", icon: Sun },
  { value: "coast", label: "🌊 Pobřeží", desc: "Námořní síla, obchod", icon: Waves },
  { value: "mountains", label: "⛰️ Hory", desc: "Nedobytné pevnosti", icon: Mountain },
  { value: "forest", label: "🌲 Lesy", desc: "Dřevo, lovci", icon: TreePine },
  { value: "desert", label: "🏜️ Poušť", desc: "Karavany, oázy", icon: Sun },
  { value: "tundra", label: "❄️ Tundra", desc: "Mráz, odolnost", icon: Snowflake },
  { value: "volcanic", label: "🌋 Vulkanický", desc: "Nebezpečná území", icon: Flame },
];

const AI_PERSONALITIES = [
  { value: "aggressive", label: "⚔️ Agresivní", desc: "Vojenská expanze, dobývání", icon: Swords },
  { value: "diplomatic", label: "🤝 Diplomatická", desc: "Aliance, smlouvy, mír", icon: Handshake },
  { value: "mercantile", label: "💰 Obchodní", desc: "Obchod, bohatství, gildy", icon: Store },
  { value: "isolationist", label: "🛡️ Izolacionistická", desc: "Obrana, soběstačnost", icon: Shield },
  { value: "expansionist", label: "🌍 Expanzivní", desc: "Kolonizace, osídlování", icon: Expand },
];

const AI_FOCUSES = [
  { value: "military", label: "Vojenství" },
  { value: "economy", label: "Ekonomika" },
  { value: "culture", label: "Kultura" },
  { value: "religion", label: "Náboženství" },
  { value: "science", label: "Technologie" },
];

interface FactionConfig {
  name: string;
  personality: string;
  focus: string;
  description: string;
}

interface Props {
  userId: string;
  defaultPlayerName: string;
  onCreated: (sessionId: string) => void;
  onCancel: () => void;
}

interface ProgressStep {
  label: string;
  status: "pending" | "active" | "done" | "error";
  error?: string;
}

const WorldSetupWizard = ({ userId, defaultPlayerName, onCreated, onCancel }: Props) => {
  const [step, setStep] = useState(0);
  const [gameMode, setGameMode] = useState<string>("tb_multi");
  const [worldSize, setWorldSize] = useState("small");
  const [worldName, setWorldName] = useState("");
  const [premise, setPremise] = useState("");
  const [tone, setTone] = useState("mythic");
  const [victoryStyle, setVictoryStyle] = useState("story");
  const [factions, setFactions] = useState<string[]>([""]);
  const [factionConfigs, setFactionConfigs] = useState<FactionConfig[]>([
    { name: "", personality: "aggressive", focus: "military", description: "" },
    { name: "", personality: "diplomatic", focus: "economy", description: "" },
    { name: "", personality: "mercantile", focus: "culture", description: "" },
  ]);
  const [playerName, setPlayerName] = useState(defaultPlayerName);
  const [creating, setCreating] = useState(false);
  const [generatingWorld, setGeneratingWorld] = useState(false);

  // New fields
  const [realmName, setRealmName] = useState("");
  const [settlementName, setSettlementName] = useState("");
  const [peopleName, setPeopleName] = useState("");
  const [cultureName, setCultureName] = useState("");
  const [languageName, setLanguageName] = useState("");
  const [civDescription, setCivDescription] = useState("");

  // Homeland fields
  const [homelandName, setHomelandName] = useState("");
  const [homelandBiome, setHomelandBiome] = useState("plains");
  const [homelandDesc, setHomelandDesc] = useState("");

  // Map configuration
  const [mapWidth, setMapWidth] = useState(21);
  const [mapHeight, setMapHeight] = useState(21);
  const [landRatio, setLandRatio] = useState(55);
  const [mountainDensity, setMountainDensity] = useState(50);
  const [continentShape, setContinentShape] = useState<string>("pangaea");
  const [biomeWeights, setBiomeWeights] = useState<Record<string, number>>({
    plains: 100, forest: 100, hills: 80, desert: 50, swamp: 30, tundra: 40,
  });

  // AI Identity preview
  const [identityData, setIdentityData] = useState<any>(null);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);

  // Progress tracking
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [creationFailed, setCreationFailed] = useState(false);
  const [failedSessionId, setFailedSessionId] = useState<string | null>(null);

  const addFaction = () => { if (factions.length < 6) setFactions([...factions, ""]); };
  const removeFaction = (i: number) => setFactions(factions.filter((_, idx) => idx !== i));
  const updateFaction = (i: number, v: string) => {
    const n = [...factions]; n[i] = v; setFactions(n);
  };

  const addFactionConfig = () => {
    if (factionConfigs.length < 7) {
      setFactionConfigs([...factionConfigs, { name: "", personality: "diplomatic", focus: "economy", description: "" }]);
    }
  };
  const removeFactionConfig = (i: number) => {
    if (factionConfigs.length > 1) setFactionConfigs(factionConfigs.filter((_, idx) => idx !== i));
  };
  const updateFactionConfig = (i: number, field: keyof FactionConfig, value: string) => {
    const updated = [...factionConfigs];
    updated[i] = { ...updated[i], [field]: value };
    setFactionConfigs(updated);
  };

  const isAIMode = gameMode === "tb_single_ai";
  const isManualMode = gameMode === "tb_single_manual";
  const isMultiMode = gameMode === "tb_multi";
  const isPersistentMode = gameMode === "time_persistent";

  const totalSteps = 10; // 0-9: mode, player, world, tone, victory, AI/homeland, MAP CONFIG, factions, identity, final

  const handleExtractIdentity = async () => {
    if (!civDescription.trim()) {
      // No description → skip with neutral modifiers
      setIdentityData(null);
      setStep(8);
      return;
    }
    setIdentityLoading(true);
    setIdentityError(null);
    try {
      const { data, error } = await supabase.functions.invoke("extract-civ-identity", {
        body: {
          sessionId: "preview", // temporary — will be re-extracted during creation
          playerName: playerName.trim(),
          civDescription: civDescription.trim(),
        },
      });
      if (error) throw new Error(typeof error === "string" ? error : error.message || "AI extrakce selhala");
      if (data?.ai_error) throw new Error(data.ai_error);
      setIdentityData(data);
    } catch (e: any) {
      setIdentityError(e.message || "Neznámá chyba");
    } finally {
      setIdentityLoading(false);
    }
  };

  const updateProgress = (steps: ProgressStep[]) => setProgressSteps([...steps]);

  const setStepStatus = (steps: ProgressStep[], idx: number, status: ProgressStep["status"], error?: string) => {
    steps[idx] = { ...steps[idx], status, error };
    updateProgress(steps);
  };

  const handleCreate = async () => {
    if (!worldName.trim() || !premise.trim()) { toast.error("Vyplňte název a premisu světa"); return; }
    if (!isMultiMode && !playerName.trim()) { toast.error("Zadejte jméno hráče"); return; }
    if (!isMultiMode && !settlementName.trim()) { toast.error("Zadejte název startovního sídla"); return; }

    // ── MULTIPLAYER LOBBY MODE ──
    // For tb_multi, create only world settings + session, host configures civ in lobby like everyone else
    if (isMultiMode) {
      if (!playerName.trim()) { toast.error("Zadejte jméno hráče"); return; }
      setCreating(true);
      try {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const { data: session, error: sessErr } = await supabase.from("game_sessions").insert({
          room_code: roomCode,
          player1_name: playerName.trim(),
          max_players: 10,
          created_by: userId,
          game_mode: "tb_multi",
          tier: "premium",
          init_status: "lobby",
        } as any).select().single();
        if (sessErr || !session) throw sessErr || new Error("Session creation failed");

        // World foundation
        const sizeConfig = WORLD_SIZES.find(s => s.value === worldSize) || WORLD_SIZES[0];
        await supabase.from("world_foundations").insert({
          session_id: session.id,
          world_name: worldName.trim(),
          premise: premise.trim(),
          tone,
          victory_style: victoryStyle,
          initial_factions: factionConfigs.map(fc => fc.name || `AI-${fc.personality}`).filter(f => f.trim()),
          created_by: userId,
          map_width: sizeConfig.mapW,
          map_height: sizeConfig.mapH,
        } as any);

        // Game player record
        await supabase.from("game_players").insert({
          session_id: session.id,
          player_name: playerName.trim(),
          player_number: 1,
          user_id: userId,
        } as any);

        // Membership (admin + PENDING — host configures civ in lobby like everyone else)
        await supabase.from("game_memberships").insert({
          user_id: userId,
          session_id: session.id,
          player_name: playerName.trim(),
          role: "admin",
          setup_status: "pending",
        });

        toast.success(`Lobby vytvořena! Kód: ${roomCode}`);
        onCreated(session.id);
        return;
      } catch (err: any) {
        toast.error("Vytvoření lobby selhalo: " + (err.message || "Neznámá chyba"));
        setCreating(false);
        return;
      }
    }
    if (!isAIMode && !homelandName.trim()) { toast.error("Zadejte název domovského regionu"); return; }

    setCreating(true);
    setCreationFailed(false);

    const progress: ProgressStep[] = [
      { label: "Vytváření relace…", status: "active" },
      { label: "Vytváření hráče…", status: "pending" },
      { label: "Zakládání kultury a jazyka…", status: "pending" },
      { label: "AI generování civilizace…", status: "pending" },
      { label: "Generování mapy…", status: "pending" },
      { label: "Zakládání sídla…", status: "pending" },
      { label: "Inicializace zdrojů…", status: "pending" },
      { label: "Dokončování…", status: "pending" },
    ];
    updateProgress(progress);

    // civStartData removed — all starting resources use neutral defaults
    // civ_identity modifiers are applied at runtime (process-turn/commit-turn)

    let sessionId: string | null = null;

    try {
      // ── STEP 1: Create session ──
      const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { data: session, error: sessErr } = await supabase.from("game_sessions").insert({
        room_code: roomCode,
        player1_name: playerName.trim(),
        max_players: isPersistentMode ? 50 : isMultiMode ? 10 : 1,
        created_by: userId,
        game_mode: gameMode,
        tier: "premium",
        init_status: "creating",
      } as any).select().single();

      if (sessErr || !session) throw sessErr || new Error("Failed to create session");
      sessionId = session.id;
      setFailedSessionId(session.id);
      setStepStatus(progress, 0, "done");

      // ── STEP 2: Create player records ──
      setStepStatus(progress, 1, "active");
        const sizeConfig = WORLD_SIZES.find(s => s.value === worldSize) || WORLD_SIZES[0];
        await supabase.from("world_foundations").insert({
          session_id: session.id,
          world_name: worldName.trim(),
          premise: premise.trim(),
          tone,
          victory_style: victoryStyle,
          initial_factions: factionConfigs.map(fc => fc.name || `AI-${fc.personality}`).filter(f => f.trim()),
          created_by: userId,
          map_width: sizeConfig.mapW,
          map_height: sizeConfig.mapH,
        } as any);

      await supabase.from("game_players").insert({
        session_id: session.id,
        player_name: playerName.trim(),
        player_number: 1,
        user_id: userId,
      } as any);

      await supabase.from("game_memberships").insert({
        user_id: userId,
        session_id: session.id,
        player_name: playerName.trim(),
        role: "admin",
      });
      setStepStatus(progress, 1, "done");

      // ── STEP 3: Create culture & language ──
      setStepStatus(progress, 2, "active");
      let cultureId: string | null = null;
      let languageId: string | null = null;

      if (cultureName.trim()) {
        const { data: cultureData } = await supabase.from("cultures").insert({
          session_id: session.id,
          name: cultureName.trim(),
          description: `Kultura národa ${peopleName.trim() || playerName.trim()}`,
        }).select("id").single();
        if (cultureData) cultureId = cultureData.id;
      }

      if (languageName.trim()) {
        const { data: langData } = await supabase.from("languages").insert({
          session_id: session.id,
          name: languageName.trim(),
        }).select("id").single();
        if (langData) languageId = langData.id;
      }

      // Create civilization record (will be updated with AI traits)
      const { data: civRecord } = await supabase.from("civilizations").insert({
        session_id: session.id,
        player_name: playerName.trim(),
        civ_name: realmName.trim() || peopleName.trim() || playerName.trim(),
        is_ai: false,
      }).select("id").single();
      setStepStatus(progress, 2, "done");

      // ── STEP 3.5: Extract Civ Identity (unified modifiers) ──
      setStepStatus(progress, 3, "active");
      if (civDescription.trim()) {
        try {
          // Re-extract with real session ID (preview used temporary "preview" ID)
          const { data: freshIdentity, error: identityErr } = await supabase.functions.invoke("extract-civ-identity", {
            body: {
              sessionId: session.id,
              playerName: playerName.trim(),
              civDescription: civDescription.trim(),
            },
          });
          const idData = (!identityErr && freshIdentity && !freshIdentity.ai_error) ? freshIdentity : identityData;
          if (idData) {
            // Update civilization record with AI-generated narrative flavor
            if (civRecord?.id) {
              const civUpdate: Record<string, string> = {};
              if (idData.core_myth) civUpdate.core_myth = idData.core_myth;
              if (idData.cultural_quirk) civUpdate.cultural_quirk = idData.cultural_quirk;
              if (idData.architectural_style) civUpdate.architectural_style = idData.architectural_style;
              if (Object.keys(civUpdate).length > 0) {
                await supabase.from("civilizations").update(civUpdate).eq("id", civRecord.id);
              }
            }
          }
        } catch (e) {
          console.warn("AI civ identity extraction failed (non-blocking):", e);
        }
      }
      setStepStatus(progress, 3, "done");

      // ── STEP 4: Generate map / homeland ──
      setStepStatus(progress, 4, "active");

      if (isAIMode) {
        // AI world generation — generates ALL cities including player's starting city
        setGeneratingWorld(true);
        try {
          const { data: genData, error: genErr } = await supabase.functions.invoke("world-generate-init", {
            body: {
              sessionId: session.id,
              playerName: playerName.trim(),
              worldName: worldName.trim(),
              premise: premise.trim(),
              tone,
              victoryStyle,
              worldSize,
              tier: "premium",
              settlementName: settlementName.trim(),
              cultureName: cultureName.trim(),
              languageName: languageName.trim(),
              realmName: realmName.trim(),
              factionConfigs: factionConfigs.filter(fc => fc.name.trim() || fc.personality || fc.description.trim()),
            },
          });
          if (genErr) {
            console.error("World generation error:", genErr);
            throw new Error("Generování AI světa selhalo: " + (typeof genErr === "string" ? genErr : genErr.message || "neznámá chyba"));
          }
          toast.success(`AI svět vygenerován! ${genData?.factionsCreated || 0} frakcí, ${genData?.citiesCreated || 0} měst, ${genData?.rumorsCreated || 0} pověstí.`);
        } catch (e: any) {
          console.error("World generation error:", e);
          throw e;
        } finally {
          setGeneratingWorld(false);
        }
      } else {
        // Manual / Multi: create homeland region
        const { data: homelandRegion } = await supabase.from("regions").insert({
          session_id: session.id,
          name: homelandName.trim(),
          description: homelandDesc.trim() || `Domovský region ${playerName.trim()}`,
          biome: homelandBiome,
          owner_player: playerName.trim(),
          is_homeland: true,
          discovered_turn: 1,
          discovered_by: playerName.trim(),
        } as any).select().single();

        if (homelandRegion) {
          const slug = `homeland-${homelandName.trim().toLowerCase().replace(/\s+/g, "-")}-founded`;
          await supabase.from("world_events").insert({
            session_id: session.id,
            title: `Založení ${homelandName.trim()}`,
            slug,
            description: `${playerName.trim()} založil svou říši v regionu ${homelandName.trim()}.`,
            event_category: "founding",
            status: "published",
            created_turn: 1,
            created_by_type: "system",
            affected_players: [playerName.trim()],
            participants: [
              { type: "player", name: playerName.trim() },
              { type: "region", name: homelandName.trim(), id: homelandRegion.id },
            ],
          } as any);

          await supabase.from("world_feed_items").insert({
            session_id: session.id,
            turn_number: 1,
            content: `Nová říše se rodí! ${playerName.trim()} buduje svou civilizaci v oblasti ${homelandName.trim()}.`,
            feed_type: "gossip",
            importance: "high",
            references: [{ type: "region", id: homelandRegion.id, label: homelandName.trim() }],
          } as any);
        }
      }
      setStepStatus(progress, 4, "done");

      // ── STEP 5: Create starting settlement (skip for AI mode — already created by world-generate-init) ──
      setStepStatus(progress, 5, "active");

      if (!isAIMode) {
        // Create a default province if we don't have one yet
        let provinceId: string | null = null;
        const { data: existingProvs } = await supabase.from("provinces").select("id").eq("session_id", session.id).eq("owner_player", playerName.trim()).limit(1);

        if (existingProvs && existingProvs.length > 0) {
          provinceId = existingProvs[0].id;
        } else {
          const { data: regions } = await supabase.from("regions").select("id").eq("session_id", session.id).eq("owner_player", playerName.trim()).limit(1);
          const regionId = regions?.[0]?.id || null;

          const { data: provData } = await supabase.from("provinces").insert({
            session_id: session.id,
            name: homelandName.trim() || `${playerName.trim()} – Provincie`,
            owner_player: playerName.trim(),
            region_id: regionId,
          }).select("id").single();
          if (provData) provinceId = provData.id;
        }

        // Neutral starting settlement params (modifiers applied at runtime)
        const { data: cityData, error: cityErr } = await supabase.from("cities").insert({
          session_id: session.id,
          owner_player: playerName.trim(),
          name: settlementName.trim(),
          province_id: provinceId,
          province: homelandName.trim() || `${playerName.trim()} – Provincie`,
          level: "Osada",
          settlement_level: "HAMLET",
          founded_round: 1,
          province_q: 0,
          province_r: 0,
          culture_id: cultureId,
          language_id: languageId,
          city_stability: 65,
          influence_score: 0,
          population_total: 1000,
          population_peasants: 800,
          population_burghers: 150,
          population_clerics: 50,
          special_resource_type: "NONE",
          flavor_prompt: civDescription.trim() || null,
        }).select("id").single();

        if (cityErr) throw cityErr;

        const discoveryRows: any[] = [
          { session_id: session.id, player_name: playerName.trim(), entity_type: "city", entity_id: cityData!.id, source: "founded" },
        ];
        if (provinceId) {
          discoveryRows.push({ session_id: session.id, player_name: playerName.trim(), entity_type: "province", entity_id: provinceId, source: "founded" });
        }
        await supabase.from("discoveries").upsert(discoveryRows, { onConflict: "session_id,player_name,entity_type,entity_id" });

        await supabase.from("game_events").insert({
          session_id: session.id,
          event_type: "founding",
          player: playerName.trim(),
          note: `${playerName.trim()} založil osadu ${settlementName.trim()}.`,
          turn_number: 1,
          confirmed: true,
          importance: "high",
          city_id: cityData!.id,
        });

        await supabase.from("world_feed_items").insert({
          session_id: session.id,
          turn_number: 1,
          content: `V zemi ${homelandName.trim() || worldName.trim()} byla založena nová osada ${settlementName.trim()}.`,
          feed_type: "gossip",
          importance: "high",
        } as any);
      } else {
        // AI mode: cities already created — auto-discover player's cities
        const { data: playerCities } = await supabase.from("cities").select("id").eq("session_id", session.id).eq("owner_player", playerName.trim());
        if (playerCities && playerCities.length > 0) {
          const discoveries = playerCities.map(c => ({
            session_id: session.id,
            player_name: playerName.trim(),
            entity_type: "city",
            entity_id: c.id,
            source: "founded",
          }));
          await supabase.from("discoveries").upsert(discoveries as any[], { onConflict: "session_id,player_name,entity_type,entity_id" });
        }
      }

      setStepStatus(progress, 5, "done");

      // ── STEP 6: Init resources (neutral defaults — modifiers at runtime) ──
      setStepStatus(progress, 6, "active");
      for (const rt of ["food", "wood", "stone", "iron", "wealth"] as const) {
        await supabase.from("player_resources").insert({
          session_id: session.id,
          player_name: playerName.trim(),
          resource_type: rt,
          income: rt === "food" ? 4 : rt === "wood" ? 3 : rt === "stone" ? 2 : rt === "iron" ? 1 : 2,
          upkeep: rt === "food" ? 2 : rt === "wood" ? 1 : rt === "wealth" ? 1 : 0,
          stockpile: rt === "food" ? 10 : rt === "wood" ? 5 : rt === "stone" ? 3 : rt === "iron" ? 2 : 5,
        });
      }

      // Create realm_resources with neutral reserves
      await supabase.from("realm_resources").insert({
        session_id: session.id,
        player_name: playerName.trim(),
        grain_reserve: 20,
        wood_reserve: 10,
        stone_reserve: 5,
        iron_reserve: 3,
        horses_reserve: 5,
        gold_reserve: 100,
        stability: 70,
        granary_capacity: 500,
        stables_capacity: 100,
      });

      setStepStatus(progress, 6, "done");

      // ── STEP 8: Finalize ──
      setStepStatus(progress, 7, "active");

      // For persistent mode, create server_config
      if (isPersistentMode) {
        await supabase.from("server_config").insert({
          session_id: session.id,
          admin_user_id: userId,
          tick_interval_seconds: 60,
          time_scale: 1.0,
          max_players: 50,
          inactivity_threshold_hours: 48,
          delegation_enabled: true,
        } as any);
      }

      // Ensure server_config exists for all modes
      const { data: existingConfig } = await supabase.from("server_config").select("id").eq("session_id", session.id).maybeSingle();
      if (!existingConfig) {
        await supabase.from("server_config").insert({
          session_id: session.id,
          admin_user_id: userId,
        } as any);
      }

      // Generate batch hex map (skip for AI mode — already done inside world-generate-init)
      if (!isAIMode) {
        const mapSizeConfig = WORLD_SIZES.find(s => s.value === worldSize) || WORLD_SIZES[0];
        try {
          await supabase.functions.invoke("generate-world-map", {
            body: { session_id: session.id, width: mapSizeConfig.mapW, height: mapSizeConfig.mapH },
          });
        } catch (e) {
          console.warn("Batch map generation warning:", e);
        }
      }

      // Bootstrap initial hex discoveries for player
      if (!isAIMode) {
        try {
          await supabase.functions.invoke("explore-hex", {
            body: { session_id: session.id, player_name: playerName.trim(), q: 0, r: 0 },
          });
        } catch (e) {
          console.warn("Hex discovery bootstrap warning:", e);
        }
      }

      // ── Upsert game_style_settings for flavor persistence ──
      const stylePayload = {
        session_id: session.id,
        lore_bible: [
          `Svět: ${worldName.trim()}`,
          `Premisa: ${premise.trim()}`,
          `Tón: ${tone}`,
          `Styl vítězství: ${victoryStyle}`,
          realmName.trim() ? `Říše hráče: ${realmName.trim()}` : "",
          peopleName.trim() ? `Národ: ${peopleName.trim()}` : "",
          cultureName.trim() ? `Kultura: ${cultureName.trim()}` : "",
          languageName.trim() ? `Jazyk: ${languageName.trim()}` : "",
          homelandName.trim() ? `Domovina: ${homelandName.trim()} (${homelandBiome})` : "",
          civDescription.trim() ? `Popis civilizace: ${civDescription.trim()}` : "",
        ].filter(Boolean).join("\n"),
        prompt_rules: JSON.stringify({
          world_vibe: tone,
          writing_style: tone === "realistic" ? "political-chronicle" : tone === "mythic" ? "epic-saga" : "narrative",
          constraints: tone === "realistic" ? "avoid random magic unless selected" : "",
          language_name: languageName.trim(),
          culture_name: cultureName.trim(),
          nation_name: peopleName.trim(),
          player_realm_name: realmName.trim(),
        }),
        updated_at: new Date().toISOString(),
      };
      await supabase.from("game_style_settings").upsert(stylePayload as any, { onConflict: "session_id" });

      // Mark init complete
      await supabase.from("game_sessions").update({ init_status: "ready" } as any).eq("id", session.id);

      // Log to simulation_log
      await supabase.from("simulation_log").insert({
        session_id: session.id,
        year_start: 1,
        year_end: 1,
        events_generated: 1,
        scope: "game_init",
        triggered_by: "wizard",
      });

      setStepStatus(progress, 7, "done");

      toast.success(`Svět „${worldName}" vytvořen!`);
      onCreated(session.id);
    } catch (err: any) {
      console.error("Game creation error:", err);
      setCreationFailed(true);

      // Mark session as failed
      if (sessionId) {
        await supabase.from("game_sessions").update({ init_status: "failed" } as any).eq("id", sessionId);
        await supabase.from("simulation_log").insert({
          session_id: sessionId,
          year_start: 1,
          year_end: 1,
          events_generated: 0,
          scope: "game_init_failed",
          triggered_by: "wizard",
        });
      }

      // Mark current active step as error
      const activeIdx = progress.findIndex(s => s.status === "active");
      if (activeIdx >= 0) setStepStatus(progress, activeIdx, "error", err.message || "Neznámá chyba");

      toast.error("Vytvoření hry selhalo: " + (err.message || "Neznámá chyba"));
    }
    setCreating(false);
  };

  const handleRetry = () => {
    setCreationFailed(false);
    setProgressSteps([]);
    handleCreate();
  };

  return (
    <div className="bg-card p-5 rounded-lg border border-border shadow-parchment space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-lg flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          Založit nový svět ({step}/{totalSteps - 1})
        </h3>
        <Button variant="ghost" size="icon" onClick={onCancel}><X className="h-4 w-4" /></Button>
      </div>

      {/* Full-screen creation overlay */}
      {(creating || creationFailed) && progressSteps.length > 0 && (
        <WorldCreationOverlay
          steps={progressSteps}
          failed={creationFailed}
          worldName={worldName}
          isAIMode={isAIMode}
          failedSessionId={failedSessionId}
          identityData={identityData}
          onRetry={handleRetry}
          onForceOpen={() => failedSessionId && onCreated(failedSessionId)}
        />
      )}

      {/* Step 0: Game Mode Selection */}
      {step === 0 && !creating && (
        <div className="space-y-4">
          <Label className="text-base font-display">Zvolte typ hry</Label>
          {GAME_MODE_CATEGORIES.map(cat => {
            const CatIcon = cat.icon;
            return (
              <div key={cat.category} className="space-y-2">
                <div className="flex items-center gap-2">
                  <CatIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wider">{cat.category}</span>
                  <span className="text-[10px] text-muted-foreground">— {cat.description}</span>
                </div>
                {cat.modes.map(m => {
                  const Icon = m.icon;
                  return (
                    <button key={m.value} onClick={() => setGameMode(m.value)}
                      className={`w-full p-4 rounded-lg border text-left transition-colors ${gameMode === m.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"}`}>
                      <div className="flex items-center gap-3">
                        <Icon className={`h-6 w-6 ${gameMode === m.value ? "text-primary" : "text-muted-foreground"}`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-display font-semibold">{m.label}</span>
                            <Badge variant="secondary" className="text-[10px]">{m.badge}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
          <Button onClick={() => setStep(1)} className="w-full">Další →</Button>
        </div>
      )}

      {/* Step 1: Player identity */}
      {step === 1 && !creating && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Vaše jméno v této hře</Label>
            <Input value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="Jméno civilizace / hráče" />
          </div>
          {/* For multiplayer, civ details are configured in lobby — skip here */}
          {!isMultiMode && (
            <>
              <div className="space-y-2">
                <Label>Název říše / státu</Label>
                <Input value={realmName} onChange={e => setRealmName(e.target.value)} placeholder="např. Království Sardos" />
              </div>
              <div className="space-y-2">
                <Label>Název startovního sídla</Label>
                <Input value={settlementName} onChange={e => setSettlementName(e.target.value)} placeholder="např. Město Sardos, Osada Dubí Háj..." />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Národ / Lid</Label>
                  <Input value={peopleName} onChange={e => setPeopleName(e.target.value)} placeholder="např. Sardové" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Kultura</Label>
                  <Input value={cultureName} onChange={e => setCultureName(e.target.value)} placeholder="např. Sardská" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Jazyk <span className="text-muted-foreground">(volitelné)</span></Label>
                <Input value={languageName} onChange={e => setLanguageName(e.target.value)} placeholder="např. Sardština" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Popis vaší civilizace
                </Label>
                <Textarea
                  value={civDescription}
                  onChange={e => setCivDescription(e.target.value)}
                  placeholder="Popište, čím je váš národ výjimečný — jsou to bojovníci, obchodníci, námořníci? Co umí? Jaká je jejich filosofie? AI z toho vygeneruje startovní zdroje, populaci a charakter vašeho sídla…"
                  rows={4}
                  maxLength={1000}
                />
                <p className="text-[10px] text-muted-foreground">{civDescription.length}/1000 · AI vygeneruje počáteční podmínky na základě tohoto popisu</p>
              </div>
            </>
          )}
          {isMultiMode && (
            <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
              ℹ️ Civilizaci, frakci a provincii nastavíte v lobby společně s ostatními hráči.
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(0)}>← Zpět</Button>
            <Button onClick={() => setStep(2)} disabled={!playerName.trim() || (!isMultiMode && !settlementName.trim())} className="flex-1">Další →</Button>
          </div>
        </div>
      )}

      {/* Step 2: World basics */}
      {step === 2 && !creating && (
        <div className="space-y-4">
          {/* Template selector */}
          <div className="space-y-2">
            <Label className="text-base font-display flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Šablona světa
            </Label>
            <p className="text-xs text-muted-foreground">Zvolte přednastavený scénář nebo začněte s prázdným světem.</p>
            <div className="grid grid-cols-2 gap-2 max-h-[280px] overflow-y-auto pr-1">
              {WORLD_TEMPLATES.map(t => (
                <button key={t.id} onClick={() => {
                  if (t.id !== "blank") {
                    setWorldName(t.worldName);
                    setPremise(t.premise);
                    setTone(t.tone);
                    setVictoryStyle(t.victoryStyle);
                    setHomelandBiome(t.biome);
                    if (t.homelandName) setHomelandName(t.homelandName);
                    if (t.factions.length > 0 && t.factions[0]) {
                      setFactions(t.factions);
                      // Also populate factionConfigs from template
                      setFactionConfigs(t.factions.filter(f => f).map((f, idx) => ({
                        name: f,
                        personality: idx === 0 ? "aggressive" : idx === 1 ? "diplomatic" : "mercantile",
                        focus: idx === 0 ? "military" : idx === 1 ? "economy" : "culture",
                        description: "",
                      })));
                    }
                    toast.success(`Šablona "${t.label}" aplikována!`);
                  } else {
                    setWorldName(""); setPremise(""); setTone("mythic"); setVictoryStyle("story");
                    setHomelandBiome("plains"); setHomelandName(""); setFactions([""]);
                    setFactionConfigs([
                      { name: "", personality: "aggressive", focus: "military", description: "" },
                      { name: "", personality: "diplomatic", focus: "economy", description: "" },
                      { name: "", personality: "mercantile", focus: "culture", description: "" },
                    ]);
                  }
                }}
                className={`p-2.5 rounded-lg border text-left text-xs transition-colors hover:border-primary/30 ${
                  worldName === t.worldName && t.id !== "blank" ? "border-primary bg-primary/10" : "border-border"
                }`}>
                  <div className="font-display font-semibold text-sm">{t.label}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Název světa</Label>
            <Input value={worldName} onChange={e => setWorldName(e.target.value)} placeholder="např. Archipelago Sardos" />
          </div>
          <div className="space-y-2">
            <Label>Premisa světa</Label>
            <Textarea value={premise} onChange={e => setPremise(e.target.value)} placeholder="Krátký popis světa..." rows={3} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>← Zpět</Button>
            <Button onClick={() => setStep(3)} disabled={!worldName.trim() || !premise.trim()} className="flex-1">Další →</Button>
          </div>
        </div>
      )}

      {/* Step 3: Tone */}
      {step === 3 && !creating && (
        <div className="space-y-3">
          <Label>Tón vyprávění</Label>
          <div className="grid grid-cols-2 gap-2">
            {TONES.map(t => (
              <button key={t.value} onClick={() => setTone(t.value)}
                className={`p-3 rounded-lg border text-left text-sm transition-colors ${tone === t.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"}`}>
                <div className="font-display font-semibold">{t.label}</div>
                <div className="text-xs text-muted-foreground">{t.desc}</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>← Zpět</Button>
            <Button onClick={() => setStep(4)} className="flex-1">Další →</Button>
          </div>
        </div>
      )}

      {/* Step 4: Victory style */}
      {step === 4 && !creating && (
        <div className="space-y-3">
          <Label>Styl vítězství</Label>
          <div className="space-y-2">
            {VICTORY_STYLES.map(v => (
              <button key={v.value} onClick={() => setVictoryStyle(v.value)}
                className={`w-full p-3 rounded-lg border text-left text-sm transition-colors ${victoryStyle === v.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"}`}>
                <div className="font-display font-semibold">{v.label}</div>
                <div className="text-xs text-muted-foreground">{v.desc}</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(3)}>← Zpět</Button>
            <Button onClick={() => setStep(5)} className="flex-1">Další →</Button>
          </div>
        </div>
      )}

      {/* Step 5: AI config or homeland */}
      {step === 5 && !creating && isAIMode && (
        <div className="space-y-3">
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <h4 className="font-display font-semibold text-sm flex items-center gap-2 mb-1">
              <Bot className="h-4 w-4 text-primary" />
              Konfigurace AI světa
            </h4>
          </div>
          <div className="space-y-2">
            <Label>Velikost světa</Label>
            <div className="space-y-2">
              {WORLD_SIZES.map(s => (
                <button key={s.value} onClick={() => setWorldSize(s.value)}
                  className={`w-full p-3 rounded-lg border text-left text-sm transition-colors ${worldSize === s.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"}`}>
                  <div className="font-display font-semibold">{s.label}</div>
                  <div className="text-xs text-muted-foreground">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(4)}>← Zpět</Button>
            <Button onClick={() => setStep(6)} className="flex-1">Další →</Button>
          </div>
        </div>
      )}

      {step === 5 && !creating && !isAIMode && (
        <div className="space-y-3">
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <h4 className="font-display font-semibold text-sm flex items-center gap-2 mb-1">
              <Mountain className="h-4 w-4 text-primary" />
              Domovský region
            </h4>
          </div>
          <div className="space-y-2">
            <Label>Název regionu</Label>
            <Input value={homelandName} onChange={e => setHomelandName(e.target.value)} placeholder="např. Údolí Sinis" />
          </div>
          <div className="space-y-2">
            <Label>Biom / Krajina</Label>
            <div className="grid grid-cols-2 gap-2">
              {BIOMES.map(b => (
                <button key={b.value} onClick={() => setHomelandBiome(b.value)}
                  className={`p-2.5 rounded-lg border text-left text-xs transition-colors ${homelandBiome === b.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"}`}>
                  <div className="font-display font-semibold">{b.label}</div>
                  <div className="text-[10px] text-muted-foreground">{b.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Popis regionu <span className="text-muted-foreground">(volitelné)</span></Label>
            <Textarea value={homelandDesc} onChange={e => setHomelandDesc(e.target.value)} placeholder="Krátký popis krajiny..." rows={2} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(4)}>← Zpět</Button>
            <Button onClick={() => setStep(6)} disabled={!homelandName.trim()} className="flex-1">Další →</Button>
          </div>
        </div>
      )}

      {/* Step 6: Map Configuration */}
      {step === 6 && !creating && (
        <div className="space-y-3">
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <h4 className="font-display font-semibold text-sm flex items-center gap-2 mb-1">
              <MapIcon className="h-4 w-4 text-primary" />
              Konfigurace mapy
            </h4>
            <p className="text-[10px] text-muted-foreground">
              Nastavte fyzické parametry herní mapy — velikost, terén, rozložení biomů.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Šířka mapy</Label>
              <div className="flex items-center gap-2">
                <Slider value={[mapWidth]} min={11} max={61} step={2} onValueChange={v => setMapWidth(v[0])} className="flex-1" />
                <Badge variant="secondary" className="text-[10px] w-10 justify-center">{mapWidth}</Badge>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Výška mapy</Label>
              <div className="flex items-center gap-2">
                <Slider value={[mapHeight]} min={11} max={61} step={2} onValueChange={v => setMapHeight(v[0])} className="flex-1" />
                <Badge variant="secondary" className="text-[10px] w-10 justify-center">{mapHeight}</Badge>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Poměr souše / moře: <strong>{landRatio}%</strong> pevnina</Label>
            <Slider value={[landRatio]} min={20} max={95} step={5} onValueChange={v => setLandRatio(v[0])} />
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>🌊 Ostrovy</span>
              <span>🌍 Kontinentální</span>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Hustota hor: <strong>{mountainDensity}%</strong></Label>
            <Slider value={[mountainDensity]} min={0} max={100} step={10} onValueChange={v => setMountainDensity(v[0])} />
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>🌾 Roviny</span>
              <span>🏔️ Hornatý</span>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Tvar kontinentu</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { value: "pangaea", label: "🌍 Pangaea", desc: "Jeden velký kontinent" },
                { value: "archipelago", label: "🏝️ Souostroví", desc: "Mnoho ostrovů" },
                { value: "two_continents", label: "🌐 Dva kontinenty", desc: "Rozdělený svět" },
                { value: "crescent", label: "🌙 Srpek", desc: "Oblouk kolem moře" },
              ].map(s => (
                <button key={s.value} onClick={() => setContinentShape(s.value)}
                  className={`p-2 rounded-lg border text-left text-xs transition-colors ${continentShape === s.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"}`}>
                  <div className="font-display font-semibold text-[11px]">{s.label}</div>
                  <div className="text-[9px] text-muted-foreground">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <details className="group">
            <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <Settings className="h-3 w-3" />
              Biomové váhy (pokročilé)
            </summary>
            <div className="mt-2 space-y-2 pl-1">
              {Object.entries(biomeWeights).map(([biome, weight]) => (
                <div key={biome} className="flex items-center gap-2">
                  <span className="text-[10px] w-14 capitalize">{
                    { plains: "🌾 Pláně", forest: "🌲 Les", hills: "⛰ Kopce", desert: "🏜 Poušť", swamp: "🌿 Bažiny", tundra: "❄ Tundra" }[biome] || biome
                  }</span>
                  <Slider value={[weight]} min={0} max={200} step={10}
                    onValueChange={v => setBiomeWeights(prev => ({ ...prev, [biome]: v[0] }))}
                    className="flex-1" />
                  <span className="text-[9px] text-muted-foreground w-8 text-right">{weight}%</span>
                </div>
              ))}
            </div>
          </details>

          <div className="bg-muted/30 rounded-lg p-2 text-[10px] text-muted-foreground">
            <p>📐 Mapa: <strong>{mapWidth}×{mapHeight}</strong> = ~{Math.round(mapWidth * mapHeight * 0.75)} hexů</p>
            <p>🗺️ Tvar: <strong>{{pangaea: "Pangaea", archipelago: "Souostroví", two_continents: "Dva kontinenty", crescent: "Srpek"}[continentShape]}</strong> · Souš: <strong>{landRatio}%</strong> · Hory: <strong>{mountainDensity}%</strong></p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(5)}>← Zpět</Button>
            <Button onClick={() => setStep(7)} className="flex-1">Další →</Button>
          </div>
        </div>
      )}

      {/* Step 7: AI Faction Configuration */}
      {step === 7 && !creating && (
        <div className="space-y-3">
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <h4 className="font-display font-semibold text-sm flex items-center gap-2 mb-1">
              <Bot className="h-4 w-4 text-primary" />
              {isMultiMode ? "NPC frakce" : "AI protihráči"}
            </h4>
            <p className="text-[10px] text-muted-foreground">
              {isMultiMode
                ? "Nastavte NPC frakce, které doplní svět vedle lidských hráčů."
                : "Nastavte AI civilizace — jejich osobnost, zaměření a východisko pro generování."}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs">Počet frakcí: <strong>{factionConfigs.length}</strong></Label>
            {factionConfigs.length < 7 && (
              <Button variant="outline" size="sm" onClick={addFactionConfig}>
                <Plus className="h-3 w-3 mr-1" />Přidat
              </Button>
            )}
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {factionConfigs.map((fc, i) => {
              const persIcon = AI_PERSONALITIES.find(p => p.value === fc.personality);
              return (
                <div key={i} className="border border-border rounded-lg p-3 space-y-2 bg-card/50">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-[10px]">Frakce {i + 1}</Badge>
                    {factionConfigs.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFactionConfig(i)}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Input
                    value={fc.name}
                    onChange={e => updateFactionConfig(i, "name", e.target.value)}
                    placeholder={`Název frakce (volitelné — AI doplní)`}
                    className="text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Osobnost</Label>
                      <Select value={fc.personality} onValueChange={v => updateFactionConfig(i, "personality", v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AI_PERSONALITIES.map(p => (
                            <SelectItem key={p.value} value={p.value} className="text-xs">
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Zaměření</Label>
                      <Select value={fc.focus} onValueChange={v => updateFactionConfig(i, "focus", v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AI_FOCUSES.map(f => (
                            <SelectItem key={f.value} value={f.value} className="text-xs">
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Textarea
                    value={fc.description}
                    onChange={e => updateFactionConfig(i, "description", e.target.value)}
                    placeholder="Krátký popis / východisko (volitelné — AI doplní)"
                    rows={2}
                    className="text-xs"
                    maxLength={300}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(6)}>← Zpět</Button>
            <Button onClick={() => {
              // Sync old factions array for backward compat
              setFactions(factionConfigs.map(fc => fc.name).filter(n => n.trim()));
              if (!isMultiMode && civDescription.trim()) {
                setStep(8);
                if (!identityData && !identityLoading) {
                  setTimeout(() => handleExtractIdentity(), 100);
                }
              } else {
                setStep(8);
              }
            }} className="flex-1">Další →</Button>
          </div>
        </div>
      )}

      {/* Step 8: Identity Preview (AI extraction) */}
      {step === 8 && !creating && (
        <div className="space-y-3">
          {!isMultiMode && civDescription.trim() ? (
            <CivIdentityPreview
              playerName={playerName}
              civDescription={civDescription}
              identityData={identityData}
              loading={identityLoading}
              error={identityError}
              onExtract={handleExtractIdentity}
              onBack={() => setStep(1)}
              onConfirm={() => setStep(9)}
            />
          ) : (
            /* For multiplayer or no civ description — show basic summary and proceed */
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground space-y-1 bg-muted/30 rounded-lg p-3">
                <p className="font-display font-semibold text-foreground">Shrnutí:</p>
                <p>🎮 <strong>{ALL_MODES.find(m => m.value === gameMode)?.label}</strong></p>
                <p>🌍 <strong>{worldName}</strong> · {TONES.find(t => t.value === tone)?.label} · {VICTORY_STYLES.find(v => v.value === victoryStyle)?.label}</p>
                <p>👤 <strong>{playerName}</strong> — {realmName || "—"}</p>
                {!isMultiMode && <p>🏘️ Sídlo: <strong>{settlementName}</strong></p>}
                {peopleName && <p>👥 Národ: <strong>{peopleName}</strong></p>}
                {cultureName && <p>🎭 Kultura: <strong>{cultureName}</strong></p>}
                {languageName && <p>🗣️ Jazyk: <strong>{languageName}</strong></p>}
                {isAIMode && <p>🤖 Velikost: <strong>{WORLD_SIZES.find(s => s.value === worldSize)?.label}</strong></p>}
                {!isAIMode && !isMultiMode && <p>🏔️ Region: <strong>{homelandName}</strong> ({BIOMES.find(b => b.value === homelandBiome)?.label})</p>}
                {factionConfigs.length > 0 && (
                  <p>🤖 AI frakce ({factionConfigs.length}): {factionConfigs.map(fc => fc.name || AI_PERSONALITIES.find(p => p.value === fc.personality)?.label || fc.personality).join(", ")}</p>
                )}
                {!civDescription.trim() && (
                  <p className="text-destructive text-[10px] mt-1">ℹ️ Nezadali jste popis civilizace — modifikátory budou neutrální.</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(6)}>← Zpět</Button>
                <Button onClick={() => setStep(8)} className="flex-1">Další →</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 8: Final Summary + Create */}
      {step === 8 && !creating && (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground space-y-1 bg-muted/30 rounded-lg p-3">
            <p className="font-display font-semibold text-foreground">Finální shrnutí:</p>
            <p>🎮 <strong>{ALL_MODES.find(m => m.value === gameMode)?.label}</strong></p>
            <p>🌍 <strong>{worldName}</strong> · {TONES.find(t => t.value === tone)?.label} · {VICTORY_STYLES.find(v => v.value === victoryStyle)?.label}</p>
            <p>👤 <strong>{playerName}</strong> — {realmName || "—"}</p>
            {!isMultiMode && <p>🏘️ Sídlo: <strong>{settlementName}</strong></p>}
            {peopleName && <p>👥 Národ: <strong>{peopleName}</strong></p>}
            {cultureName && <p>🎭 Kultura: <strong>{cultureName}</strong></p>}
            {languageName && <p>🗣️ Jazyk: <strong>{languageName}</strong></p>}
            {civDescription && <p>🧬 Civilizace: <em>{civDescription.slice(0, 80)}{civDescription.length > 80 ? "…" : ""}</em></p>}
            {isAIMode && <p>🤖 Velikost: <strong>{WORLD_SIZES.find(s => s.value === worldSize)?.label}</strong></p>}
            {!isAIMode && !isMultiMode && <p>🏔️ Region: <strong>{homelandName}</strong> ({BIOMES.find(b => b.value === homelandBiome)?.label})</p>}
            {factionConfigs.length > 0 && (
              <p>🤖 AI frakce ({factionConfigs.length}): {factionConfigs.map(fc => fc.name || AI_PERSONALITIES.find(p => p.value === fc.personality)?.label || fc.personality).join(", ")}</p>
            )}
            {identityData && (
              <>
                <hr className="border-border/30 my-1" />
                <p className="font-display font-semibold text-foreground">🧬 AI Identita: <strong>{identityData.display_name || "—"}</strong></p>
                {identityData.flavor_summary && <p className="italic">„{identityData.flavor_summary}"</p>}
                <p>📋 {identityData.society_structure} · {identityData.military_doctrine} · {identityData.economic_focus}</p>
                {identityData.building_tags?.length > 0 && <p>🏗️ Speciální budovy: {identityData.building_tags.join(", ")}</p>}
              </>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(7)}>← Zpět</Button>
            <Button onClick={handleCreate} disabled={creating} className="flex-1 font-display">
              {creating ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Vytvářím...</>
              ) : isAIMode ? (
                <><Sparkles className="mr-2 h-4 w-4" />🤖 Vygenerovat a založit svět</>
              ) : (
                <><Sparkles className="mr-2 h-4 w-4" />⚔️ Založit svět</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorldSetupWizard;

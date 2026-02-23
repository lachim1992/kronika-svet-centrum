import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Globe, Sparkles, Swords, Users, X, Plus, Mountain, TreePine, Waves, Sun, Snowflake, Flame, Bot, Pen, UserPlus, Loader2, Server, RotateCcw, Clock, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";

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

const WORLD_SIZES = [
  { value: "small", label: "Malý", desc: "5 měst, 2 regiony", cities: 5, regions: 2 },
  { value: "medium", label: "Střední", desc: "12 měst, 4 regiony", cities: 12, regions: 4 },
  { value: "large", label: "Velký", desc: "20 měst, 6 regionů", cities: 20, regions: 6 },
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

  // Progress tracking
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [creationFailed, setCreationFailed] = useState(false);
  const [failedSessionId, setFailedSessionId] = useState<string | null>(null);

  const addFaction = () => { if (factions.length < 6) setFactions([...factions, ""]); };
  const removeFaction = (i: number) => setFactions(factions.filter((_, idx) => idx !== i));
  const updateFaction = (i: number, v: string) => {
    const n = [...factions]; n[i] = v; setFactions(n);
  };

  const isAIMode = gameMode === "tb_single_ai";
  const isManualMode = gameMode === "tb_single_manual";
  const isMultiMode = gameMode === "tb_multi";
  const isPersistentMode = gameMode === "time_persistent";

  const totalSteps = 8; // Added identity + AI civ step

  const updateProgress = (steps: ProgressStep[]) => setProgressSteps([...steps]);

  const setStepStatus = (steps: ProgressStep[], idx: number, status: ProgressStep["status"], error?: string) => {
    steps[idx] = { ...steps[idx], status, error };
    updateProgress(steps);
  };

  const handleCreate = async () => {
    if (!worldName.trim() || !premise.trim()) { toast.error("Vyplňte název a premisu světa"); return; }
    if (!playerName.trim()) { toast.error("Zadejte jméno hráče"); return; }
    if (!settlementName.trim()) { toast.error("Zadejte název startovního sídla"); return; }
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

    // AI-generated civ start data (will be populated in step 3.5)
    let civStartData: any = null;

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
      await supabase.from("world_foundations").insert({
        session_id: session.id,
        world_name: worldName.trim(),
        premise: premise.trim(),
        tone,
        victory_style: victoryStyle,
        initial_factions: factions.filter(f => f.trim()),
        created_by: userId,
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

      // ── STEP 3.5: AI Civilization Generation ──
      setStepStatus(progress, 3, "active");
      if (civDescription.trim()) {
        try {
          const { data: civData, error: civErr } = await supabase.functions.invoke("generate-civ-start", {
            body: {
              sessionId: session.id,
              playerName: playerName.trim(),
              civDescription: civDescription.trim(),
              worldPremise: premise.trim(),
              tone,
              biomeName: homelandBiome,
              settlementName: settlementName.trim(),
            },
          });
          if (!civErr && civData && !civData.error) {
            civStartData = civData;
            // Update civilization record with AI-generated traits
            if (civRecord?.id && civData.civilization) {
              await supabase.from("civilizations").update({
                core_myth: civData.civilization.core_myth || null,
                cultural_quirk: civData.civilization.cultural_quirk || null,
                architectural_style: civData.civilization.architectural_style || null,
              }).eq("id", civRecord.id);
            }
          }
        } catch (e) {
          console.warn("AI civ generation failed (non-blocking):", e);
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

        // Use AI-generated settlement params if available
        const stParams = civStartData?.settlement;
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
          city_stability: stParams?.city_stability || 65,
          influence_score: 0,
          population_total: stParams?.population_total || 1000,
          population_peasants: stParams?.population_peasants || 800,
          population_burghers: stParams?.population_burghers || 150,
          population_clerics: stParams?.population_clerics || 50,
          special_resource_type: stParams?.special_resource_type || "NONE",
          flavor_prompt: stParams?.settlement_flavor || civDescription.trim() || null,
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

      // ── STEP 6: Init resources (AI-generated or defaults) ──
      setStepStatus(progress, 6, "active");
      const aiRes = civStartData?.player_resources;
      for (const rt of ["food", "wood", "stone", "iron", "wealth"] as const) {
        const aiVals = aiRes?.[rt];
        await supabase.from("player_resources").insert({
          session_id: session.id,
          player_name: playerName.trim(),
          resource_type: rt,
          income: aiVals?.income ?? (rt === "food" ? 4 : rt === "wood" ? 3 : rt === "stone" ? 2 : rt === "iron" ? 1 : 2),
          upkeep: aiVals?.upkeep ?? (rt === "food" ? 2 : rt === "wood" ? 1 : rt === "wealth" ? 1 : 0),
          stockpile: aiVals?.stockpile ?? (rt === "food" ? 10 : rt === "wood" ? 5 : rt === "stone" ? 3 : rt === "iron" ? 2 : 5),
        });
      }

      // Create realm_resources with AI-generated reserves
      const aiRealm = civStartData?.realm_resources;
      await supabase.from("realm_resources").insert({
        session_id: session.id,
        player_name: playerName.trim(),
        grain_reserve: aiRealm?.grain_reserve ?? 20,
        wood_reserve: aiRealm?.wood_reserve ?? 10,
        stone_reserve: aiRealm?.stone_reserve ?? 5,
        iron_reserve: aiRealm?.iron_reserve ?? 3,
        horses_reserve: aiRealm?.horses_reserve ?? 5,
        gold_reserve: aiRealm?.gold_reserve ?? 100,
        stability: aiRealm?.stability ?? 70,
        granary_capacity: aiRealm?.granary_capacity ?? 500,
        stables_capacity: aiRealm?.stables_capacity ?? 100,
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

      // Generate initial hexes (skip for AI mode — world-generate-init handles it)
      if (!isAIMode) {
        try {
          await supabase.functions.invoke("generate-hex", {
            body: { sessionId: session.id, q: 0, r: 0 },
          });
          const neighbors = [
            [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
          ];
          await Promise.all(neighbors.map(([q, r]) =>
            supabase.functions.invoke("generate-hex", { body: { sessionId: session.id, q, r } })
          ));
        } catch (e) {
          console.warn("Hex generation warning:", e);
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

      {/* Progress display during creation */}
      {(creating || creationFailed) && progressSteps.length > 0 && (
        <div className="space-y-2 p-4 bg-muted/30 rounded-lg border border-border">
          {progressSteps.map((ps, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              {ps.status === "done" && <Check className="h-4 w-4 text-green-500" />}
              {ps.status === "active" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              {ps.status === "error" && <AlertCircle className="h-4 w-4 text-destructive" />}
              {ps.status === "pending" && <div className="h-4 w-4 rounded-full border border-muted-foreground/30" />}
              <span className={ps.status === "error" ? "text-destructive" : ps.status === "done" ? "text-muted-foreground" : "text-foreground"}>
                {ps.label}
              </span>
              {ps.error && <span className="text-xs text-destructive ml-auto">{ps.error}</span>}
            </div>
          ))}
          {creationFailed && (
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={handleRetry}>Zkusit znovu</Button>
              {failedSessionId && (
                <Button size="sm" variant="outline" onClick={() => onCreated(failedSessionId)}>
                  Otevřít i přesto
                </Button>
              )}
            </div>
          )}
        </div>
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
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(0)}>← Zpět</Button>
            <Button onClick={() => setStep(2)} disabled={!playerName.trim() || !settlementName.trim()} className="flex-1">Další →</Button>
          </div>
        </div>
      )}

      {/* Step 2: World basics */}
      {step === 2 && !creating && (
        <div className="space-y-3">
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

      {/* Step 6: Summary + Create */}
      {step === 6 && !creating && (
        <div className="space-y-3">
          {!isAIMode && (
            <>
              <Label>Počáteční frakce / civilizace</Label>
              {factions.map((f, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={f} onChange={e => updateFaction(i, e.target.value)} placeholder={`Frakce ${i + 1}`} />
                  {factions.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeFaction(i)}><X className="h-4 w-4" /></Button>
                  )}
                </div>
              ))}
              {factions.length < 6 && (
                <Button variant="outline" size="sm" onClick={addFaction}><Plus className="h-3 w-3 mr-1" />Přidat frakci</Button>
              )}
            </>
          )}

          <div className="pt-2 space-y-2">
            <div className="text-xs text-muted-foreground space-y-1 bg-muted/30 rounded-lg p-3">
              <p className="font-display font-semibold text-foreground">Shrnutí:</p>
              <p>🎮 <strong>{ALL_MODES.find(m => m.value === gameMode)?.label}</strong></p>
              <p>🌍 <strong>{worldName}</strong> · {TONES.find(t => t.value === tone)?.label} · {VICTORY_STYLES.find(v => v.value === victoryStyle)?.label}</p>
              <p>👤 <strong>{playerName}</strong> — {realmName || "—"}</p>
              <p>🏘️ Sídlo: <strong>{settlementName}</strong></p>
              {peopleName && <p>👥 Národ: <strong>{peopleName}</strong></p>}
              {cultureName && <p>🎭 Kultura: <strong>{cultureName}</strong></p>}
              {languageName && <p>🗣️ Jazyk: <strong>{languageName}</strong></p>}
              {civDescription && <p>🧬 Civilizace: <em>{civDescription.slice(0, 80)}{civDescription.length > 80 ? "…" : ""}</em></p>}
              {isAIMode && <p>🤖 Velikost: <strong>{WORLD_SIZES.find(s => s.value === worldSize)?.label}</strong></p>}
              {!isAIMode && <p>🏔️ Region: <strong>{homelandName}</strong> ({BIOMES.find(b => b.value === homelandBiome)?.label})</p>}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(5)}>← Zpět</Button>
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
        </div>
      )}
    </div>
  );
};

export default WorldSetupWizard;

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Globe, Sparkles, Swords, Users, X, Plus, Mountain, TreePine, Waves, Sun, Snowflake, Flame, Bot, Pen, UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

const GAME_MODES = [
  {
    value: "tb_single_ai",
    label: "🤖 AI Svět",
    desc: "AI vygeneruje svět, frakce, historii a reaguje na vaše rozhodnutí.",
    icon: Bot,
    badge: "Solo",
  },
  {
    value: "tb_single_manual",
    label: "✍️ Ruční svět",
    desc: "Vytvořte svět ručně — ideální pro DnD, RPG, storytelling.",
    icon: Pen,
    badge: "Solo",
  },
  {
    value: "tb_multi",
    label: "👥 Multiplayer",
    desc: "Turn-based hra pro 2–6 hráčů. AI slouží jako kronikář.",
    icon: UserPlus,
    badge: "2–6 hráčů",
  },
];

const WORLD_SIZES = [
  { value: "small", label: "Malý", desc: "5 měst, 2 regiony", cities: 5, regions: 2 },
  { value: "medium", label: "Střední", desc: "12 měst, 4 regiony", cities: 12, regions: 4 },
  { value: "large", label: "Velký", desc: "20 měst, 6 regionů", cities: 20, regions: 6, premium: true },
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
  { value: "plains", label: "🌾 Pláně", desc: "Úrodné roviny, ideální pro zemědělství", icon: Sun },
  { value: "coast", label: "🌊 Pobřeží", desc: "Námořní síla, obchod, rybolov", icon: Waves },
  { value: "mountains", label: "⛰️ Hory", desc: "Nedobytné pevnosti, nerostné bohatství", icon: Mountain },
  { value: "forest", label: "🌲 Lesy", desc: "Dřevo, lovci, skryté osady", icon: TreePine },
  { value: "desert", label: "🏜️ Poušť", desc: "Karavany, oázy, starověká tajemství", icon: Sun },
  { value: "tundra", label: "❄️ Tundra", desc: "Mráz, odolnost, vzácné materiály", icon: Snowflake },
  { value: "volcanic", label: "🌋 Vulkanický", desc: "Nebezpečná území, mocné zdroje", icon: Flame },
];

interface Props {
  userId: string;
  defaultPlayerName: string;
  onCreated: (sessionId: string) => void;
  onCancel: () => void;
}

const WorldSetupWizard = ({ userId, defaultPlayerName, onCreated, onCancel }: Props) => {
  const [step, setStep] = useState(0); // 0 = mode selection (new!)
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
  const [generationProgress, setGenerationProgress] = useState("");

  // Homeland region fields
  const [homelandName, setHomelandName] = useState("");
  const [homelandBiome, setHomelandBiome] = useState("plains");
  const [homelandDesc, setHomelandDesc] = useState("");

  const addFaction = () => { if (factions.length < 6) setFactions([...factions, ""]); };
  const removeFaction = (i: number) => setFactions(factions.filter((_, idx) => idx !== i));
  const updateFaction = (i: number, v: string) => {
    const n = [...factions]; n[i] = v; setFactions(n);
  };

  const isAIMode = gameMode === "tb_single_ai";
  const isManualMode = gameMode === "tb_single_manual";
  const isMultiMode = gameMode === "tb_multi";

  // Steps differ by mode
  // AI: 0(mode) → 1(player+world) → 2(tone) → 3(victory) → 4(AI config: size) → 5(summary+generate)
  // Manual: 0(mode) → 1(player+world) → 2(tone) → 3(victory) → 4(homeland) → 5(factions+summary)
  // Multi: 0(mode) → 1(player+world) → 2(tone) → 3(victory) → 4(homeland) → 5(factions+summary)
  const totalSteps = 6;

  const handleCreate = async () => {
    if (!worldName.trim() || !premise.trim()) { toast.error("Vyplňte název a premisu světa"); return; }
    if (!playerName.trim()) { toast.error("Zadejte jméno hráče"); return; }
    if (!isAIMode && !homelandName.trim()) { toast.error("Zadejte název domovského regionu"); return; }
    setCreating(true);

    try {
      const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      // Create game session with game_mode
      const { data: session, error: sessErr } = await supabase.from("game_sessions").insert({
        room_code: roomCode,
        player1_name: playerName.trim(),
        max_players: isMultiMode ? 6 : 1,
        created_by: userId,
        game_mode: gameMode,
        tier: "free",
      } as any).select().single();

      if (sessErr || !session) throw sessErr || new Error("Failed to create session");

      // Create world foundation
      await supabase.from("world_foundations").insert({
        session_id: session.id,
        world_name: worldName.trim(),
        premise: premise.trim(),
        tone,
        victory_style: victoryStyle,
        initial_factions: factions.filter(f => f.trim()),
        created_by: userId,
      } as any);

      // Create game_players entry
      await supabase.from("game_players").insert({
        session_id: session.id,
        player_name: playerName.trim(),
        player_number: 1,
        user_id: userId,
      } as any);

      // Create membership (admin)
      await supabase.from("game_memberships").insert({
        user_id: userId,
        session_id: session.id,
        player_name: playerName.trim(),
        role: "admin",
      } as any);

      // Init resources
      for (const rt of ["food", "wood", "stone", "iron", "wealth"]) {
        await supabase.from("player_resources").insert({
          session_id: session.id,
          player_name: playerName.trim(),
          resource_type: rt,
          income: rt === "food" ? 4 : rt === "wood" ? 3 : rt === "stone" ? 2 : rt === "iron" ? 1 : 2,
          upkeep: rt === "food" ? 2 : rt === "wood" ? 1 : rt === "wealth" ? 1 : 0,
          stockpile: rt === "food" ? 10 : rt === "wood" ? 5 : rt === "stone" ? 3 : rt === "iron" ? 2 : 5,
        });
      }

      if (isAIMode) {
        // AI World Generation
        setGeneratingWorld(true);
        setGenerationProgress("Generuji svět...");
        
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
              tier: "free",
            },
          });

          if (genErr) {
            console.error("World generation error:", genErr);
            toast.error("Generování světa selhalo, ale hra byla vytvořena. Svět můžete doplnit ručně.");
          } else {
            const stats = genData;
            toast.success(`Svět vygenerován! ${stats?.factionsCreated || 0} frakcí, ${stats?.citiesCreated || 0} měst, ${stats?.eventsCreated || 0} historických událostí.`);
          }
        } catch (e) {
          console.error("World generation error:", e);
          toast.error("Generování světa selhalo, ale hra byla vytvořena.");
        }
        setGeneratingWorld(false);
      } else {
        // Manual / Multiplayer: Create homeland region
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

        // Create initial world event for homeland
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

      toast.success(`Svět „${worldName}" vytvořen!`);
      onCreated(session.id);
    } catch (err: any) {
      console.error(err);
      toast.error("Vytvoření hry selhalo");
    }
    setCreating(false);
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

      {/* Step 0: Game Mode Selection */}
      {step === 0 && (
        <div className="space-y-3">
          <Label className="text-base font-display">Zvolte typ hry</Label>
          <div className="space-y-2">
            {GAME_MODES.map(m => {
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
          <Button onClick={() => setStep(1)} className="w-full">Další →</Button>
        </div>
      )}

      {/* Step 1: Player name + World basics */}
      {step === 1 && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Vaše jméno v této hře</Label>
            <Input value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="Jméno civilizace / hráče" />
          </div>
          <div className="space-y-2">
            <Label>Název světa</Label>
            <Input value={worldName} onChange={e => setWorldName(e.target.value)} placeholder="např. Archipelago Sardos" />
          </div>
          <div className="space-y-2">
            <Label>Premisa světa</Label>
            <Textarea value={premise} onChange={e => setPremise(e.target.value)} placeholder="Krátký popis světa, který AI bude používat jako základ pro narativ..." rows={3} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(0)}>← Zpět</Button>
            <Button onClick={() => setStep(2)} disabled={!worldName.trim() || !premise.trim()} className="flex-1">Další →</Button>
          </div>
        </div>
      )}

      {/* Step 2: Tone */}
      {step === 2 && (
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
            <Button variant="outline" onClick={() => setStep(1)}>← Zpět</Button>
            <Button onClick={() => setStep(3)} className="flex-1">Další →</Button>
          </div>
        </div>
      )}

      {/* Step 3: Victory style */}
      {step === 3 && (
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
            <Button variant="outline" onClick={() => setStep(2)}>← Zpět</Button>
            <Button onClick={() => setStep(4)} className="flex-1">Další →</Button>
          </div>
        </div>
      )}

      {/* Step 4: AI mode = world size config; Manual/Multi = homeland */}
      {step === 4 && isAIMode && (
        <div className="space-y-3">
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <h4 className="font-display font-semibold text-sm flex items-center gap-2 mb-1">
              <Bot className="h-4 w-4 text-primary" />
              Konfigurace AI světa
            </h4>
            <p className="text-xs text-muted-foreground">
              AI vygeneruje kompletní svět — frakce, města, regiony a historii.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Velikost světa</Label>
            <div className="space-y-2">
              {WORLD_SIZES.map(s => (
                <button key={s.value} onClick={() => !s.premium && setWorldSize(s.value)}
                  className={`w-full p-3 rounded-lg border text-left text-sm transition-colors ${s.premium ? "opacity-50 cursor-not-allowed border-border" : worldSize === s.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-display font-semibold">{s.label}</div>
                      <div className="text-xs text-muted-foreground">{s.desc}</div>
                    </div>
                    {s.premium && <Badge variant="outline" className="text-[10px]">Premium</Badge>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(3)}>← Zpět</Button>
            <Button onClick={() => setStep(5)} className="flex-1">Další →</Button>
          </div>
        </div>
      )}

      {step === 4 && !isAIMode && (
        <div className="space-y-3">
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <h4 className="font-display font-semibold text-sm flex items-center gap-2 mb-1">
              <Mountain className="h-4 w-4 text-primary" />
              Domovský region
            </h4>
            <p className="text-xs text-muted-foreground">
              Váš domovský region je základnou vaší civilizace.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Název regionu</Label>
            <Input value={homelandName} onChange={e => setHomelandName(e.target.value)} placeholder="např. Údolí Sinis, Pobřeží Sardos..." />
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
            <Textarea value={homelandDesc} onChange={e => setHomelandDesc(e.target.value)}
              placeholder="Krátký popis krajiny, atmosféry..." rows={2} />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(3)}>← Zpět</Button>
            <Button onClick={() => setStep(5)} disabled={!homelandName.trim()} className="flex-1">Další →</Button>
          </div>
        </div>
      )}

      {/* Step 5: Summary + Create */}
      {step === 5 && (
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
              <p>🎮 <strong>{GAME_MODES.find(m => m.value === gameMode)?.label}</strong></p>
              <p>🌍 <strong>{worldName}</strong> · {TONES.find(t => t.value === tone)?.label} · {VICTORY_STYLES.find(v => v.value === victoryStyle)?.label}</p>
              {isAIMode && (
                <p>🤖 Velikost: <strong>{WORLD_SIZES.find(s => s.value === worldSize)?.label}</strong> ({WORLD_SIZES.find(s => s.value === worldSize)?.desc})</p>
              )}
              {!isAIMode && (
                <p>🏔️ Domovský region: <strong>{homelandName}</strong> ({BIOMES.find(b => b.value === homelandBiome)?.label})</p>
              )}
              <p>👤 Hráč: <strong>{playerName}</strong></p>
            </div>

            {generatingWorld && (
              <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
                <div>
                  <p className="text-sm font-display font-semibold">Generuji AI svět...</p>
                  <p className="text-xs text-muted-foreground">{generationProgress}</p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(4)}>← Zpět</Button>
              <Button onClick={handleCreate} disabled={creating || generatingWorld} className="flex-1 font-display">
                {generatingWorld ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generuji svět...</>
                ) : creating ? (
                  "Vytvářím..."
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

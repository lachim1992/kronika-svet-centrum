import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Crown, Users, Check, Clock, Copy, Loader2, Sparkles, Globe,
  Swords, Shield, BookOpen, Mountain, TreePine, Waves, Sun, Snowflake, Flame,
  ChevronDown, ChevronUp, Play, ArrowLeft, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import ChronicleHubLogo from "./ChronicleHubLogo";
import FactionDesigner from "./FactionDesigner";
import CivIdentityPreview from "./CivIdentityPreview";

const BIOMES = [
  { value: "plains", label: "🌾 Pláně", icon: Sun },
  { value: "coast", label: "🌊 Pobřeží", icon: Waves },
  { value: "mountains", label: "⛰️ Hory", icon: Mountain },
  { value: "forest", label: "🌲 Lesy", icon: TreePine },
  { value: "desert", label: "🏜️ Poušť", icon: Sun },
  { value: "tundra", label: "❄️ Tundra", icon: Snowflake },
  { value: "volcanic", label: "🌋 Vulkanický", icon: Flame },
];

interface LobbyPlayer {
  id: string;
  user_id: string;
  player_name: string;
  role: string;
  setup_status: string;
  joined_at: string;
}

interface CivConfig {
  realm_name: string;
  settlement_name: string;
  people_name: string;
  culture_name: string;
  language_name: string;
  civ_description: string;
  homeland_biome: string;
  homeland_name: string;
  homeland_desc: string;
}

interface Props {
  sessionId: string;
  roomCode: string;
  worldName: string;
  maxPlayers: number;
  isHost: boolean;
  myPlayerName: string;
  onGameStart: () => void;
}

const MultiplayerLobby = ({ sessionId, roomCode, worldName, maxPlayers, isHost, myPlayerName, onGameStart }: Props) => {
  const { user } = useAuth();
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [showCivWizard, setShowCivWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0); // 0=identity, 1=homeland, 2=faction
  const [mySetupStatus, setMySetupStatus] = useState("pending");
  const [generating, setGenerating] = useState(false);
  const [civConfig, setCivConfig] = useState<CivConfig>({
    realm_name: "",
    settlement_name: "",
    people_name: "",
    culture_name: "",
    language_name: "",
    civ_description: "",
    homeland_biome: "plains",
    homeland_name: "",
    homeland_desc: "",
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [showWorldSettings, setShowWorldSettings] = useState(false);
  const [worldFoundation, setWorldFoundation] = useState<any>(null);
  const [factionSaved, setFactionSaved] = useState(false);
  const [myIdentity, setMyIdentity] = useState<any>(null);

  const fetchPlayers = useCallback(async () => {
    const { data } = await supabase
      .from("game_memberships")
      .select("id, user_id, player_name, role, setup_status, joined_at")
      .eq("session_id", sessionId)
      .order("joined_at", { ascending: true });
    if (data) {
      setPlayers(data as LobbyPlayer[]);
      const me = data.find((p: any) => p.user_id === user?.id);
      if (me) setMySetupStatus((me as any).setup_status || "pending");
    }
  }, [sessionId, user?.id]);

  const fetchWorldFoundation = useCallback(async () => {
    const { data } = await supabase
      .from("world_foundations")
      .select("*")
      .eq("session_id", sessionId)
      .single();
    if (data) setWorldFoundation(data);
  }, [sessionId]);

  // Load existing civ config
  const fetchMyCivConfig = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("player_civ_configs")
      .select("*")
      .eq("session_id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setCivConfig({
        realm_name: data.realm_name || "",
        settlement_name: data.settlement_name || "",
        people_name: data.people_name || "",
        culture_name: data.culture_name || "",
        language_name: data.language_name || "",
        civ_description: data.civ_description || "",
        homeland_biome: data.homeland_biome || "plains",
        homeland_name: (data as any).homeland_name || "",
        homeland_desc: (data as any).homeland_desc || "",
      });
    }

    // Check if faction already saved and load identity data
    const { data: identity } = await supabase
      .from("civ_identity")
      .select("*")
      .eq("session_id", sessionId)
      .eq("player_name", myPlayerName)
      .maybeSingle();
    if (identity) {
      setFactionSaved(true);
      setMyIdentity(identity);
    }
  }, [sessionId, user?.id, myPlayerName]);

  useEffect(() => {
    fetchPlayers();
    fetchWorldFoundation();
    fetchMyCivConfig();
  }, [fetchPlayers, fetchWorldFoundation, fetchMyCivConfig]);

  // Realtime subscription for lobby updates — stable deps to prevent re-subscribe loops
  useEffect(() => {
    const channel = supabase
      .channel(`lobby-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_memberships", filter: `session_id=eq.${sessionId}` }, () => {
        // Inline fetch to avoid dependency on fetchPlayers callback
        supabase.from("game_memberships")
          .select("id, user_id, player_name, role, setup_status, joined_at")
          .eq("session_id", sessionId)
          .order("joined_at", { ascending: true })
          .then(({ data }) => {
            if (data) {
              setPlayers(data as LobbyPlayer[]);
              const me = data.find((p: any) => p.user_id === user?.id);
              if (me) setMySetupStatus((me as any).setup_status || "pending");
            }
          });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "game_sessions", filter: `id=eq.${sessionId}` }, async () => {
        const { data } = await supabase.from("game_sessions").select("init_status").eq("id", sessionId).single();
        if (data && (data as any).init_status === "ready") {
          onGameStart();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    toast.success("Kód zkopírován!");
  };

  // Save civ config (step 0+1) and proceed to faction designer
  const handleSaveCivConfig = async () => {
    if (!user) return;
    if (!civConfig.settlement_name.trim()) { toast.error("Zadejte název startovního sídla"); return; }
    if (!civConfig.realm_name.trim()) { toast.error("Zadejte název říše"); return; }
    if (!civConfig.homeland_name.trim()) { toast.error("Zadejte název domovské provincie"); return; }

    setSavingConfig(true);
    try {
      await supabase.from("player_civ_configs").upsert({
        session_id: sessionId,
        user_id: user.id,
        player_name: myPlayerName,
        ...civConfig,
      }, { onConflict: "session_id,user_id" });

      toast.success("Civilizace uložena! Nyní nastavte frakci.");
      setWizardStep(2); // proceed to faction designer
    } catch (e: any) {
      toast.error("Chyba při ukládání: " + e.message);
    }
    setSavingConfig(false);
  };

  // Called when FactionDesigner completes
  const handleFactionComplete = async () => {
    if (!user) return;
    setFactionSaved(true);

    // Load the saved identity data for display
    const { data: identity } = await supabase
      .from("civ_identity")
      .select("*")
      .eq("session_id", sessionId)
      .eq("player_name", myPlayerName)
      .maybeSingle();
    if (identity) setMyIdentity(identity);

    // Verify civ config exists before marking ready
    const { data: existingConfig } = await supabase
      .from("player_civ_configs")
      .select("id")
      .eq("session_id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existingConfig) {
      toast.error("Chyba: konfigurace civilizace nebyla uložena. Zkuste znovu projít nastavení.");
      setWizardStep(0);
      return;
    }

    // Now mark player as ready
    await supabase.from("game_memberships")
      .update({ setup_status: "ready" })
      .eq("session_id", sessionId)
      .eq("user_id", user.id);

    setMySetupStatus("ready");
    setShowCivWizard(false);
    setWizardStep(0);
    toast.success("Civilizace a frakce připraveny!");
    await fetchPlayers();
  };

  const allReady = players.length >= 2 && players.every(p => p.setup_status === "ready");

  const handleStartGeneration = async () => {
    if (!allReady) {
      toast.error("Všichni hráči musí být připraveni");
      return;
    }

    // Pre-flight: verify all players have civ configs
    const { data: configs } = await supabase
      .from("player_civ_configs")
      .select("player_name")
      .eq("session_id", sessionId);
    const configCount = configs?.length || 0;
    if (configCount < 2) {
      const missing = players
        .filter(p => !configs?.some(c => c.player_name === p.player_name))
        .map(p => p.player_name);
      toast.error(`Chybí konfigurace civilizace pro: ${missing.join(", ")}. Hráči musí znovu projít nastavení.`);
      // Reset those players to pending
      for (const name of missing) {
        await supabase.from("game_memberships")
          .update({ setup_status: "pending" })
          .eq("session_id", sessionId)
          .eq("player_name", name);
      }
      await fetchPlayers();
      return;
    }

    setGenerating(true);
    try {
      await supabase.from("game_sessions").update({ init_status: "generating" } as any).eq("id", sessionId);

      // Fire-and-forget — don't await the response (it can timeout on long generations)
      // The realtime listener on game_sessions will detect init_status="ready" and call onGameStart()
      supabase.functions.invoke("mp-world-generate", {
        body: { sessionId },
      }).then(({ error }) => {
        if (error) console.warn("mp-world-generate returned error (may still complete):", error.message);
      }).catch((e) => {
        console.warn("mp-world-generate fetch error (generation may still be running):", e.message);
      });

      toast.info("Generování světa spuštěno — čekáme na dokončení...");
    } catch (e: any) {
      toast.error("Generování světa selhalo: " + e.message);
      await supabase.from("game_sessions").update({ init_status: "lobby" } as any).eq("id", sessionId);
      setGenerating(false);
    }
    // Don't setGenerating(false) — wait for realtime listener to detect completion
  };

  const statusIcon = (status: string) => {
    if (status === "ready") return <Check className="h-4 w-4 text-green-500" />;
    if (status === "configuring") return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const statusLabel = (status: string) => {
    if (status === "ready") return "Připraven";
    if (status === "configuring") return "Nastavuje...";
    return "Čeká";
  };

  const canProceedToFaction = civConfig.realm_name.trim() && civConfig.settlement_name.trim() && civConfig.homeland_name.trim();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: "radial-gradient(ellipse at 50% 20%, hsl(228 38% 12%) 0%, hsl(228 38% 8%) 50%, hsl(228 40% 5%) 100%)" }}
    >
      <div className="max-w-lg w-full space-y-6 animate-fade-in">
        {/* Header */}
        <div className="text-center space-y-2">
          <ChronicleHubLogo variant="full" size="md" />
          <h1 className="font-display text-2xl font-bold text-foreground mt-4">
            {worldName || "Nový svět"}
          </h1>
          <p className="text-muted-foreground text-sm">Čekárna na hráče</p>
        </div>

        {/* Room code */}
        <div className="bg-card/80 backdrop-blur border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-display">Kód místnosti</p>
              <p className="text-3xl font-mono font-bold tracking-[0.3em] text-primary">{roomCode}</p>
            </div>
            <Button variant="outline" size="sm" onClick={copyRoomCode} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" />
              Kopírovat
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Sdílejte tento kód ostatním hráčům pro připojení.
          </p>
        </div>

        {/* World settings (collapsible) */}
        {worldFoundation && (
          <button
            onClick={() => setShowWorldSettings(!showWorldSettings)}
            className="w-full bg-card/60 backdrop-blur border border-border rounded-lg p-3 text-left hover:border-primary/30 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                <span className="font-display text-sm font-semibold">Nastavení světa</span>
              </div>
              {showWorldSettings ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
            {showWorldSettings && (
              <div className="mt-3 space-y-1.5 text-xs text-muted-foreground" onClick={e => e.stopPropagation()}>
                <p><span className="text-foreground">Premisa:</span> {worldFoundation.premise}</p>
                <p><span className="text-foreground">Tón:</span> {worldFoundation.tone}</p>
                <p><span className="text-foreground">Styl vítězství:</span> {worldFoundation.victory_style}</p>
              </div>
            )}
          </button>
        )}

        {/* Players list */}
        <div className="bg-card/80 backdrop-blur border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="font-display font-semibold text-sm">Hráči ({players.length}/{maxPlayers})</span>
            </div>
            {allReady && (
              <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-[10px]">
                Všichni připraveni
              </Badge>
            )}
          </div>
          <div className="divide-y divide-border">
            {players.map(p => (
              <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    {p.player_name[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-display font-semibold text-sm">{p.player_name}</span>
                      {p.role === "admin" && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{statusLabel(p.setup_status)}</span>
                  </div>
                </div>
                {statusIcon(p.setup_status)}
              </div>
            ))}
            {players.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Čekáme na hráče...
              </div>
            )}
          </div>
        </div>

        {/* My civilization setup */}
        {mySetupStatus !== "ready" && !showCivWizard && (
          <Button
            onClick={() => { setShowCivWizard(true); setWizardStep(0); }}
            className="w-full h-14 text-lg font-display gap-2"
            size="lg"
          >
            <Sparkles className="h-5 w-5" />
            Nastavit svou civilizaci
          </Button>
        )}

        {mySetupStatus === "ready" && !showCivWizard && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 space-y-3">
            <div className="text-center">
              <Check className="h-6 w-6 text-green-500 mx-auto mb-1" />
              <p className="font-display font-semibold text-green-600 text-sm">Vaše civilizace je připravena</p>
            </div>

            {/* Identity modifiers summary — full preview */}
            {myIdentity && (
              <CivIdentityPreview
                sessionId={sessionId}
                playerName={myPlayerName}
                civDescription={myIdentity.source_description || civConfig.civ_description || ""}
                identityData={myIdentity}
                loading={false}
                error={null}
                onExtract={() => {}}
                onBack={() => {}}
                onConfirm={() => {}}
                readOnly
              />
            )}

            <div className="text-center">
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setShowCivWizard(true); setWizardStep(0); setMySetupStatus("configuring"); }}>
                Upravit
              </Button>
            </div>
          </div>
        )}

        {/* ═══ MULTI-STEP CIV WIZARD ═══ */}
        {showCivWizard && (
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            {/* Progress indicator */}
            <div className="flex items-center gap-2 mb-2">
              {["Identita", "Provincie", "Frakce"].map((label, i) => (
                <div key={label} className="flex items-center gap-1 flex-1">
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                    wizardStep === i ? "bg-primary text-primary-foreground" :
                    wizardStep > i ? "bg-green-500 text-white" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {wizardStep > i ? <Check className="h-3 w-3" /> : i + 1}
                  </div>
                  <span className={`text-[10px] font-display ${wizardStep === i ? "text-foreground font-semibold" : "text-muted-foreground"}`}>{label}</span>
                  {i < 2 && <div className="flex-1 h-px bg-border" />}
                </div>
              ))}
            </div>

            {/* Step 0: Identity */}
            {wizardStep === 0 && (
              <div className="space-y-3">
                <h3 className="font-display font-semibold text-lg flex items-center gap-2">
                  <Swords className="h-5 w-5 text-primary" />
                  Vaše civilizace
                </h3>

                <div className="space-y-1.5">
                  <Label>Název říše / státu *</Label>
                  <Input value={civConfig.realm_name} onChange={e => setCivConfig({ ...civConfig, realm_name: e.target.value })} placeholder="např. Království Sardos" />
                </div>

                <div className="space-y-1.5">
                  <Label>Název startovního sídla *</Label>
                  <Input value={civConfig.settlement_name} onChange={e => setCivConfig({ ...civConfig, settlement_name: e.target.value })} placeholder="např. Město Sardos" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Národ / Lid</Label>
                    <Input value={civConfig.people_name} onChange={e => setCivConfig({ ...civConfig, people_name: e.target.value })} placeholder="např. Sardové" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Kultura</Label>
                    <Input value={civConfig.culture_name} onChange={e => setCivConfig({ ...civConfig, culture_name: e.target.value })} placeholder="např. Sardská" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Jazyk <span className="text-muted-foreground">(volitelné)</span></Label>
                  <Input value={civConfig.language_name} onChange={e => setCivConfig({ ...civConfig, language_name: e.target.value })} placeholder="např. Sardština" />
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Popis civilizace
                  </Label>
                  <Textarea
                    value={civConfig.civ_description}
                    onChange={e => setCivConfig({ ...civConfig, civ_description: e.target.value })}
                    placeholder="Popište, čím je váš národ výjimečný — bojovníci, obchodníci, námořníci? AI z toho vygeneruje frakční modifikátory..."
                    rows={4}
                    maxLength={1000}
                  />
                  <p className="text-[10px] text-muted-foreground">{civConfig.civ_description.length}/1000</p>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowCivWizard(false)}>Zrušit</Button>
                  <Button
                    onClick={() => setWizardStep(1)}
                    disabled={!civConfig.realm_name.trim() || !civConfig.settlement_name.trim()}
                    className="flex-1 font-display gap-1"
                  >
                    Další <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 1: Homeland / Province */}
            {wizardStep === 1 && (
              <div className="space-y-3">
                <h3 className="font-display font-semibold text-lg flex items-center gap-2">
                  <Mountain className="h-5 w-5 text-primary" />
                  Domovská provincie
                </h3>

                <div className="space-y-1.5">
                  <Label>Název provincie / domoviny *</Label>
                  <Input value={civConfig.homeland_name} onChange={e => setCivConfig({ ...civConfig, homeland_name: e.target.value })} placeholder="např. Údolí Sardos, Severní marky..." />
                </div>

                <div className="space-y-1.5">
                  <Label>Biom domoviny</Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {BIOMES.map(b => (
                      <button
                        key={b.value}
                        onClick={() => setCivConfig({ ...civConfig, homeland_biome: b.value })}
                        className={`p-2 rounded border text-xs text-center transition-colors ${civConfig.homeland_biome === b.value ? "border-primary bg-primary/10 text-foreground" : "border-border hover:border-primary/30 text-muted-foreground"}`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Popis krajiny <span className="text-muted-foreground">(volitelné)</span></Label>
                  <Textarea
                    value={civConfig.homeland_desc}
                    onChange={e => setCivConfig({ ...civConfig, homeland_desc: e.target.value })}
                    placeholder="Krátký popis krajiny vaší domoviny..."
                    rows={2}
                  />
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setWizardStep(0)} className="gap-1">
                    <ArrowLeft className="h-4 w-4" /> Zpět
                  </Button>
                  <Button
                    onClick={handleSaveCivConfig}
                    disabled={savingConfig || !canProceedToFaction}
                    className="flex-1 font-display gap-1"
                  >
                    {savingConfig ? <><Loader2 className="h-4 w-4 animate-spin" /> Ukládám...</> : <>Další <ArrowRight className="h-4 w-4" /></>}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Faction Designer */}
            {wizardStep === 2 && (
              <div className="space-y-3">
                <h3 className="font-display font-semibold text-lg flex items-center gap-2">
                  <Crown className="h-5 w-5 text-primary" />
                  Frakce & modifikátory
                </h3>
                <p className="text-xs text-muted-foreground">
                  AI vygeneruje herní modifikátory z popisu vaší civilizace. Můžete je upravit ručně.
                </p>

                <FactionDesigner
                  sessionId={sessionId}
                  playerName={myPlayerName}
                  onComplete={handleFactionComplete}
                  wizardMode
                />

                <Button variant="outline" onClick={() => setWizardStep(1)} className="gap-1">
                  <ArrowLeft className="h-4 w-4" /> Zpět na provincii
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Host: Start generation button */}
        {isHost && (
          <Button
            onClick={handleStartGeneration}
            disabled={!allReady || generating}
            className="w-full h-14 text-lg font-display gap-2"
            size="lg"
            variant={allReady ? "default" : "outline"}
          >
            {generating ? (
              <><Loader2 className="h-5 w-5 animate-spin" />Generuji svět...</>
            ) : (
              <><Play className="h-5 w-5" />Zahájit generování světa</>
            )}
          </Button>
        )}

        {!isHost && !allReady && (
          <p className="text-center text-sm text-muted-foreground">
            Čekáme, až všichni hráči nastaví svou civilizaci a frakci...
          </p>
        )}

        {generating && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-center space-y-2">
            <Loader2 className="h-8 w-8 text-primary mx-auto animate-spin" />
            <p className="font-display font-semibold text-sm">Generování světa...</p>
            <p className="text-xs text-muted-foreground">Vytváření mapy, rozmísťování civilizací, generování prahistorie...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiplayerLobby;
